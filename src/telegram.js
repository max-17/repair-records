import {timingSafeEqual} from 'node:crypto';
import {telegramPresentation} from './tasks.js';
export function telegramWebhook({env,runCommand,deliver,answerCallback,runVoice,clearVoice,clearButtons}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const secret=env.TELEGRAM_WEBHOOK_SECRET;
  if(!secret||!runCommand)return res.status(503).json({error:'Telegram setup incomplete'});
  const actual=Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token')||'');const expected=Buffer.from(secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Unauthorized'});
  const update=req.body;const callback=update?.callback_query;
  let msg=update?.message;
  if(callback){
   const match=/^(confirm|deny|edit|pick|voiceuse|voiceedit|voicedeny):([0-9a-f-]{36})(?::(\d{1,2}))?$/.exec(callback.data||'');
   if(!match)return res.json({ok:true});
   msg={...callback.message,from:callback.from,text:`/${match[1]} ${match[2]}${match[3]===undefined?'':' '+match[3]}`};
  }
  if(!Number.isSafeInteger(update?.update_id)||!msg||msg.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.from?.id)||msg.from.is_bot)return res.json({ok:true});
  let masters;
  try{masters=JSON.parse(env.TELEGRAM_MASTERS||'{}');}catch{return res.status(503).json({error:'Invalid staff configuration'});}
  const masterId=Object.hasOwn(masters,String(msg.from.id))?masters[String(msg.from.id)]:null;
  if(typeof masterId!=='string'||!masterId.trim())return res.json({ok:true});
  const conversationId=`telegram:${msg.chat.id}:${msg.from.id}`;
  const receivedBy=String(msg.from.id);
  const receivedByName=[msg.from.first_name,msg.from.last_name].filter(Boolean).join(' ').slice(0,300)||masterId;
  try {
   if(callback && answerCallback)await answerCallback(callback.id).catch(()=>{});
   const process=async()=>{
    if(runVoice){
     const speech=await runVoice({masterId,conversationId,requestId:`telegram:${update.update_id}`,voice:msg.voice,text:msg.text,receivedAt:Number.isFinite(msg.date)?msg.date*1000:null,receivedBy,receivedByName});
     if(speech)return telegramPresentation(speech);
    }
    if(!msg.text)return {text:'Ovozli xabar yoki matn yuboring.'};
    if(clearVoice)await clearVoice({masterId,conversationId,receivedBy,receivedByName});
    if(msg.text.length>3000)return {text:'Xabar juda uzun. 3000 belgigacha yozing.'};
    const result=await runCommand({text:['/start','/new'].includes(msg.text)?'/new':msg.text,requestId:`telegram:${update.update_id}`,masterId,conversationId,receivedBy,receivedByName});
    if(msg.text==='/start')return {text:'Salom! Buyurtma yozing yoki hisobot so‘rang. Aniqlashtiruvchi savolga qisqa javob berishingiz mumkin. Aniq buyruqlar darhol bajariladi; bir nechta buyurtma topilsa, tugmadan tanlang.\nYangi suhbat: /new. Ovozli xabarlar matnga aylantirilib, buyruq darhol bajariladi.'};
    return telegramPresentation(result);
   };
   if(deliver){
    await deliver({updateId:update.update_id,conversationId,chatId:msg.chat.id,input:msg.text||(msg.voice?`voice:${msg.voice.file_id}`:'non-text'),process});
    if(clearButtons)await clearButtons({conversationId,updateId:update.update_id,chatId:msg.chat.id,sourceMessageId:callback?.message?.message_id,onlySource:Boolean(callback)});
    return res.json({ok:true});
   }
   const payload=await process();
   if(clearButtons)await clearButtons({conversationId,updateId:update.update_id,chatId:msg.chat.id,sourceMessageId:callback?.message?.message_id,onlySource:Boolean(callback)});
   return res.json({method:'sendMessage',chat_id:msg.chat.id,...payload});
  }catch(error){
   console.error('Telegram command failed',{name:error.name,code:error.code||error.statusCode||'command_failed'});
   return res.status(503).json({error:'Command processing unavailable; retry later'});
  }
 };
}
