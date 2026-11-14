import {createHash,randomUUID} from 'node:crypto';
export function telegramSender(token){
 return async payload=>{
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok||!result.ok){const error=new Error('TELEGRAM_SEND_FAILED');error.code=String(result.error_code||response.status);throw error;}
  return result.result.message_id;
 };
}
export function telegramDelivery({db,send,now=()=>Date.now()}){
 return async({updateId,conversationId,chatId,input,process})=>{
  const hash=createHash('sha256').update(JSON.stringify({conversationId,chatId,input})).digest('hex');
  let claimed=false;const leaseToken=randomUUID();
  const tx=await db.transaction('write');
  try{
   await tx.execute({sql:'INSERT INTO telegram_deliveries(update_id,conversation_id,input_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(update_id) DO NOTHING',args:[updateId,conversationId,hash,now()]});
   const existing=(await tx.execute({sql:'SELECT * FROM telegram_deliveries WHERE update_id=?',args:[updateId]})).rows[0];
   if(existing.input_hash!==hash)throw new Error('DELIVERY_CONFLICT');
   if(existing.status==='sent'){await tx.commit();return {duplicate:true};}
   const prior=await tx.execute({sql:"SELECT update_id FROM telegram_deliveries WHERE conversation_id=? AND status!='sent' AND (created_at<? OR (created_at=? AND update_id<?)) LIMIT 1",args:[conversationId,existing.created_at,existing.created_at,updateId]});
   if(prior.rows.length)throw new Error('EARLIER_MESSAGE_PENDING');
   const lock=await tx.execute({sql:'INSERT INTO telegram_locks(conversation_id,update_id,lease_until,lease_token) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET update_id=excluded.update_id,lease_until=excluded.lease_until,lease_token=excluded.lease_token WHERE telegram_locks.lease_until<=? RETURNING update_id',args:[conversationId,updateId,now()+60000,leaseToken,now()]});
   if(!lock.rows.length)throw new Error('CONVERSATION_BUSY');
   await tx.execute({sql:"UPDATE telegram_deliveries SET status='processing',attempts=attempts+1,lease_until=? WHERE update_id=?",args:[now()+60000,updateId]});
   await tx.commit();claimed=true;
  }finally{if(!tx.closed)await tx.rollback();}
  try{
   const cached=(await db.execute({sql:'SELECT reply_text FROM telegram_deliveries WHERE update_id=?',args:[updateId]})).rows[0];
   const payload=cached.reply_text?JSON.parse(cached.reply_text):{chat_id:chatId,...await process()};
   if(!cached.reply_text)await db.execute({sql:'UPDATE telegram_deliveries SET reply_text=? WHERE update_id=?',args:[JSON.stringify(payload),updateId]});
   const owned=await db.execute({sql:'UPDATE telegram_locks SET lease_until=? WHERE conversation_id=? AND lease_token=? RETURNING update_id',args:[now()+60000,conversationId,leaseToken]});
   if(!owned.rows.length)throw new Error('DELIVERY_LEASE_LOST');
   const messageId=await send(payload);
   await db.execute({sql:"UPDATE telegram_deliveries SET status='sent',telegram_message_id=?,sent_at=?,lease_until=0,last_error_code=NULL WHERE update_id=? AND EXISTS (SELECT 1 FROM telegram_locks WHERE conversation_id=? AND lease_token=?)",args:[messageId,now(),updateId,conversationId,leaseToken]});
   return {messageId};
  }catch(error){
   await db.execute({sql:"UPDATE telegram_deliveries SET status='failed',lease_until=0,last_error_code=? WHERE update_id=? AND status!='sent' AND EXISTS (SELECT 1 FROM telegram_locks WHERE conversation_id=? AND lease_token=?)",args:[String(error.code||'processing_failed').slice(0,80),updateId,conversationId,leaseToken]});throw error;
  }finally{
   if(claimed)await db.execute({sql:'DELETE FROM telegram_locks WHERE conversation_id=? AND lease_token=?',args:[conversationId,leaseToken]});
  }
 };
}
