import {claimConversationLease,releaseConversationLease,leaseOwnershipGuard,withOwnedLease,deliverWithLease,classifyDeliveryFailure} from '../shared/reliability.js';
import {createHash,randomUUID} from 'node:crypto';
export function telegramSender(token,{resolvePhoto}={}){
 return async payload=>{
  const edit=payload.edit_target;
  const method=edit?(edit.caption?'editMessageCaption':'editMessageText'):payload.photo?'sendPhoto':'sendMessage';
  const body=edit?{chat_id:payload.chat_id,message_id:edit.message_id,...(edit.caption?{caption:payload.text.slice(0,1000)}:{text:payload.text.slice(0,4000)}),reply_markup:payload.reply_markup||{inline_keyboard:[]}}:payload.photo?{...payload,caption:payload.text.slice(0,1000)}:{...payload,text:payload.text.slice(0,4000)};if(payload.photo&&!edit)delete body.text;
  if(payload.entities){if(payload.photo&&!edit||edit?.caption){body.caption_entities=payload.entities;delete body.entities;}else body.entities=payload.entities;}
  let requestBody=JSON.stringify(body),headers={'Content-Type':'application/json'};
  if(!edit&&payload.photo?.startsWith('web:')){const file=await resolvePhoto?.(payload.photo.slice(4));if(!file)throw new Error('PHOTO_UNAVAILABLE');const form=new FormData();form.set('chat_id',String(payload.chat_id));form.set('photo',new Blob([file.bytes],{type:file.contentType}),'sale-photo');form.set('caption',body.caption);if(body.caption_entities)form.set('caption_entities',JSON.stringify(body.caption_entities));if(body.reply_markup)form.set('reply_markup',JSON.stringify(body.reply_markup));requestBody=form;headers={};}
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers,body:requestBody,signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(edit&&!result.ok&&Number(result.error_code)===400&&/message is not modified/i.test(result.description||''))return edit.message_id;
  if(!response.ok||!result.ok){const error=new Error('TELEGRAM_SEND_FAILED');error.code=String(result.error_code||response.status);error.ambiguous=false;error.retryable=Number(error.code)===429||Number(error.code)>=500;throw error;}
  return result.result?.message_id||edit?.message_id;
 };
}
export function telegramDelivery({db,send,now=()=>Date.now()}){
 return async({updateId,conversationId,chatId,input,process})=>{
  const hash=createHash('sha256').update(JSON.stringify({conversationId,chatId,input})).digest('hex');
  let claimed=false,processingExhausted=false;const leaseToken=randomUUID();
  const lease=()=>({kind:'staff',scope:conversationId,requestId:updateId,token:leaseToken,now:now(),durationMs:60000});
  const tx=await db.transaction('write');
  try{
   await tx.execute({sql:'INSERT INTO telegram_deliveries(update_id,conversation_id,input_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(update_id) DO NOTHING',args:[updateId,conversationId,hash,now()]});
   const existing=(await tx.execute({sql:'SELECT * FROM telegram_deliveries WHERE update_id=?',args:[updateId]})).rows[0];
   if(existing.input_hash!==hash)throw new Error('DELIVERY_CONFLICT');
   if(existing.status==='sent'){await tx.commit();return {duplicate:true};}
   const prior=await tx.execute({sql:"SELECT update_id FROM telegram_deliveries WHERE conversation_id=? AND status!='sent' AND (created_at<? OR (created_at=? AND update_id<?)) LIMIT 1",args:[conversationId,existing.created_at,existing.created_at,updateId]});
   if(prior.rows.length)throw new Error('EARLIER_MESSAGE_PENDING');
   processingExhausted=!existing.reply_text&&Number(existing.attempts)>=3;
   const lock=await claimConversationLease(tx,lease());
   if(!lock)throw new Error('CONVERSATION_BUSY');
   await tx.execute({sql:"UPDATE telegram_deliveries SET status='processing',attempts=attempts+1,lease_until=? WHERE update_id=?",args:[now()+60000,updateId]});
   await tx.commit();claimed=true;
  }finally{if(!tx.closed)await tx.rollback();}
  try{
   const cached=(await db.execute({sql:'SELECT reply_text FROM telegram_deliveries WHERE update_id=?',args:[updateId]})).rows[0];
   // Only cap processing failures. A saved reply must keep its original delivery semantics.
   const payload=cached.reply_text?JSON.parse(cached.reply_text):processingExhausted?{chat_id:chatId,text:'Oldingi xabarni qayta ishlash yakunlanmadi. Natijani tekshira olmadim. Yangi yozuv yuborishdan oldin yozuvlarni tekshiring. Botdan foydalanishni davom ettirishingiz mumkin.'}:{chat_id:chatId,...await process()};
   if(!cached.reply_text)await withOwnedLease(db,lease(),tx=>tx.execute({sql:'UPDATE telegram_deliveries SET reply_text=? WHERE update_id=?',args:[JSON.stringify(payload),updateId]}));
   const messageId=await deliverWithLease({db,lease:lease(),payload,send,acknowledge:async(messageId,guard)=>{
    const result=await db.execute({sql:`UPDATE telegram_deliveries SET status='sent',telegram_message_id=?,sent_at=?,lease_until=0,last_error_code=NULL WHERE update_id=? AND ${guard.sql}`,args:[messageId,now(),updateId,...guard.args]});
    return result.rowsAffected>0;
   }});
   return {messageId};
  }catch(error){
   const guard=leaseOwnershipGuard(lease());
   await db.execute({sql:`UPDATE telegram_deliveries SET status='failed',lease_until=0,last_error_code=? WHERE update_id=? AND status!='sent' AND ${guard.sql}`,args:[classifyDeliveryFailure(error).code,updateId,...guard.args]});throw error;
  }finally{
   if(claimed)await releaseConversationLease(db,lease());
  }
 };
}
