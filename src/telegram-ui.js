export function telegramButtonCleanup({db,token,fetcher=fetch}){
 return async({conversationId,updateId,chatId,sourceMessageId,onlySource=false})=>{
  const previous=await db.execute({sql:"SELECT update_id,telegram_message_id,reply_text FROM telegram_deliveries WHERE conversation_id=? AND update_id!=? AND status='sent' AND telegram_message_id IS NOT NULL AND (created_at<(SELECT created_at FROM telegram_deliveries WHERE update_id=?) OR (created_at=(SELECT created_at FROM telegram_deliveries WHERE update_id=?) AND update_id<?)) AND json_type(reply_text,'$.reply_markup.inline_keyboard')='array'",args:[conversationId,updateId,updateId,updateId,updateId]});
  const messages=new Set(onlySource?[]:previous.rows.map(row=>Number(row.telegram_message_id)));
  if(Number.isSafeInteger(sourceMessageId))messages.add(sourceMessageId);
  for(const messageId of messages){
   const response=await fetcher(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,message_id:messageId,reply_markup:{inline_keyboard:[]}}),signal:AbortSignal.timeout(5000)});
   const result=await response.json();
   const alreadyGone=response.status===400 && /message is not modified|message to edit not found|message can't be edited/i.test(result.description||'');
   if((!response.ok||!result.ok)&&!alreadyGone){const error=new Error('TELEGRAM_BUTTON_CLEANUP_FAILED');error.code=String(result.error_code||response.status);throw error;}
   // Sent replies never need resending; removing markup also records completed cleanup.
   for(const row of previous.rows.filter(r=>Number(r.telegram_message_id)===messageId)){
    const payload=JSON.parse(row.reply_text);delete payload.reply_markup;
    await db.execute({sql:'UPDATE telegram_deliveries SET reply_text=? WHERE update_id=?',args:[JSON.stringify(payload),row.update_id]});
   }
  }
 };
}
