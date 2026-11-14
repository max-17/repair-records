import {timingSafeEqual} from 'node:crypto';
import {telegramPresentation} from './tasks.js';
export function telegramWebhook({env,runCommand,deliver,answerCallback}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const secret=env.TELEGRAM_WEBHOOK_SECRET;
  if(!secret||!runCommand)return res.status(503).json({error:'Telegram setup incomplete'});
  const actual=Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token')||'');const expected=Buffer.from(secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Unauthorized'});
  const update=req.body;const callback=update?.callback_query;
  let msg=update?.message;
  if(callback){
   const match=/^(confirm|deny|edit|pick):([0-9a-f-]{36})(?::(\d{1,2}))?$/.exec(callback.data||'');
   if(!match)return res.json({ok:true});
   msg={...callback.message,from:callback.from,text:`/${match[1]} ${match[2]}${match[3]===undefined?'':' '+match[3]}`};
  }
  if(!Number.isSafeInteger(update?.update_id)||!msg||msg.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.from?.id)||msg.from.is_bot)return res.json({ok:true});
  let masters;
  try{masters=JSON.parse(env.TELEGRAM_MASTERS||'{}');}catch{return res.status(503).json({error:'Invalid staff configuration'});}
  const masterId=Object.hasOwn(masters,String(msg.from.id))?masters[String(msg.from.id)]:null;
  if(typeof masterId!=='string'||!masterId.trim())return res.json({ok:true});
  const conversationId=`telegram:${msg.chat.id}:${msg.from.id}`;
  try {
   if(callback && answerCallback)await answerCallback(callback.id).catch(()=>{});
   const process=async()=>{
    if(!msg.text)return {text:'Hozircha faqat matn yuboring. Ovozli xabarlar hali qo‘llanmaydi.'};
    if(msg.text.length>3000)return {text:'Xabar juda uzun. 3000 belgigacha yozing.'};
    const result=await runCommand({text:['/start','/new'].includes(msg.text)?'/new':msg.text,requestId:`telegram:${update.update_id}`,masterId,conversationId});
    if(msg.text==='/start')return {text:'Salom! Buyurtma yozing yoki hisobot so‘rang. Aniqlashtiruvchi savolga qisqa javob berishingiz mumkin. Tasdiqlash kerak bo‘lsa, tugmalardan foydalaning.\nYangi suhbat: /new. Ovozli xabarlar hali qo‘llanmaydi.'};
    return telegramPresentation(result);
   };
   if(deliver){
    await deliver({updateId:update.update_id,conversationId,chatId:msg.chat.id,input:msg.text||'non-text',process});
    return res.json({ok:true});
   }
   return res.json({method:'sendMessage',chat_id:msg.chat.id,...await process()});
  }catch(error){
   console.error('Telegram command failed',{name:error.name,code:error.code||error.statusCode||'command_failed'});
   return res.status(503).json({error:'Command processing unavailable; retry later'});
  }
 };
}
