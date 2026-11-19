// Cosmetic progress must never affect command execution or financial outcomes.
export function telegramProcessingNotice({db,token,fetcher=fetch,now=()=>Date.now()}){
 const request=async(method,body)=>{
  const response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
  const result=await response.json();return {response,result};
 };
 const finish=async({updateId,chatId})=>{
  const row=(await db.execute({sql:'SELECT message_id,status FROM telegram_processing_notices WHERE update_id=? AND chat_id=?',args:[updateId,String(chatId)]})).rows[0];
  if(!row?.message_id||row.status==='removed')return;
  const {response,result}=await request('deleteMessage',{chat_id:chatId,message_id:Number(row.message_id)});
  const gone=response.status===400&&/message to delete not found/i.test(result.description||'');
  if((!response.ok||!result.ok)&&!gone)throw new Error('PROCESSING_NOTICE_DELETE_FAILED');
  await db.execute({sql:"UPDATE telegram_processing_notices SET status='removed' WHERE update_id=? AND chat_id=?",args:[updateId,String(chatId)]});
 };
 return {
  async start({updateId,chatId}){
   const delivered=(await db.execute({sql:'SELECT status FROM telegram_deliveries WHERE update_id=?',args:[updateId]})).rows[0];
   if(delivered?.status==='sent'){
    await finish({updateId,chatId}).catch(()=>{});return;
   }
   // One durable claim per update: an uncertain send is never repeated on retry.
   const claim=await db.execute({sql:"INSERT INTO telegram_processing_notices(update_id,chat_id,status,created_at) VALUES(?,?,'sending',?) ON CONFLICT(update_id) DO NOTHING RETURNING update_id",args:[updateId,String(chatId),now()]});
   if(claim.rows.length){
    try{
     const {response,result}=await request('sendMessage',{chat_id:chatId,text:'Xabaringizni ko‘rib chiqyapman…',disable_notification:true});
     if(response.ok&&result.ok&&Number.isSafeInteger(result.result?.message_id))await db.execute({sql:"UPDATE telegram_processing_notices SET status='visible',message_id=? WHERE update_id=?",args:[result.result.message_id,updateId]});
     else await db.execute({sql:"UPDATE telegram_processing_notices SET status='failed' WHERE update_id=?",args:[updateId]});
    }catch{await db.execute({sql:"UPDATE telegram_processing_notices SET status='unknown' WHERE update_id=? AND status='sending'",args:[updateId]});}
   }
   // Recover a known notice whose cleanup failed after an earlier reply was delivered.
   const stale=(await db.execute({sql:"SELECT n.update_id FROM telegram_processing_notices n JOIN telegram_deliveries d ON d.update_id=n.update_id WHERE n.chat_id=? AND n.status='visible' AND d.status='sent' AND n.update_id!=? ORDER BY n.created_at LIMIT 5",args:[String(chatId),updateId]})).rows;
   for(const row of stale)await finish({updateId:Number(row.update_id),chatId}).catch(()=>{});
  },
  finish
 };
}
