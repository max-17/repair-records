import {sectionButtons} from './bot-menu.js';
import {timingSafeEqual} from 'node:crypto';
import {telegramPresentation} from './tasks.js';
export function telegramWebhook({env,runCommand,deliver,answerCallback,runVoice,clearVoice,clearButtons,runMenu,runPul,typing,buttonProgress,resolveStaff,runLogin}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const secret=env.TELEGRAM_WEBHOOK_SECRET;
  if(!secret||(!runCommand&&!runLogin))return res.status(503).json({error:'Telegram setup incomplete'});
  const actual=Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token')||'');const expected=Buffer.from(secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Unauthorized'});
  const update=req.body;const callback=update?.callback_query;
  if(runLogin){const response=await runLogin(update);if(response){if(callback&&answerCallback)await answerCallback(callback.id).catch(()=>{});if(callback&&clearButtons)await clearButtons({conversationId:'staff-login',updateId:update.update_id,chatId:callback.message.chat.id,sourceMessageId:callback.message.message_id,onlySource:true}).catch(()=>{});return res.json({method:'sendMessage',chat_id:(callback?.message||update.message).chat.id,...response});}}

  if(!runCommand)return res.status(503).json({error:'Telegram setup incomplete'});
  let msg=update?.message;
  if(callback){
   const section=/^section:(pul|tamirlash)$/.exec(callback.data||'');
   const pulMatch=/^pul_(confirm|edit|cancel|photo|showphoto):([0-9a-f-]{36})$/.exec(callback.data||'');
   const match=/^(confirm|deny|edit|pick|voiceuse|voiceedit|voicedeny):([0-9a-f-]{36})(?::(\d{1,2}))?$/.exec(callback.data||'');
   if(!match&&!pulMatch&&!section)return res.json({ok:true});
   msg={...callback.message,from:callback.from,text:section?`/${section[1]}`:pulMatch?`/pul_${pulMatch[1]} ${pulMatch[2]}`:`/${match[1]} ${match[2]}${match[3]===undefined?'':' '+match[3]}`};
  }
  if(!Number.isSafeInteger(update?.update_id)||!msg||msg.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.from?.id)||msg.from.is_bot)return res.json({ok:true});
  let masters;
  try{masters=resolveStaff?{}:JSON.parse(env.TELEGRAM_MASTERS||'{}');}catch{return res.status(503).json({error:'Invalid staff configuration'});}
  const access=resolveStaff?await resolveStaff(String(msg.from.id)):null;
  const masterId=resolveStaff?access?.masterId:Object.hasOwn(masters,String(msg.from.id))?masters[String(msg.from.id)]:null;
  if(typeof masterId!=='string'||!masterId.trim())return res.json({ok:true});
  const conversationId=`telegram:${msg.chat.id}:${msg.from.id}`;
  const receivedBy=String(msg.from.id);
  const receivedByName=[msg.from.first_name,msg.from.last_name].filter(Boolean).join(' ').slice(0,300)||masterId;
  let typingTimer,restoreButtons,completed=false;
  try {
   if(typing){await typing(msg.chat.id).catch(()=>{});typingTimer=setInterval(()=>{void typing(msg.chat.id).catch(()=>{});},4000);typingTimer.unref?.();}
   if(callback && answerCallback)await answerCallback(callback.id).catch(()=>{});
   if(callback&&buttonProgress)restoreButtons=await buttonProgress(callback).catch(()=>null);
   const process=async()=>{
    if(runMenu){
     const menu=await runMenu({masterId,conversationId,requestId:`telegram:${update.update_id}`,text:msg.text});
     if(resolveStaff&&menu.section==='money'&&!access?.permissions.includes('pul.read'))return {text:'Pul bo‘limiga ruxsat yo‘q.',reply_markup:sectionButtons('tamirlash')};
     if(resolveStaff&&menu.section==='repair'&&!access?.permissions.includes('repairs'))return {text:'Ta’mirlash bo‘limiga ruxsat yo‘q.',reply_markup:sectionButtons('pul')};
     if(menu.payload){
      return menu.payload;
     }
     if(menu.section!=='repair'){
      if(callback&&!callback.data.startsWith('pul_'))return {text:'Bu tugma boshqa bo‘limga tegishli. Buyruqni qayta yuboring.'};
      if(!runPul)return {text:'Pul xizmati sozlanmagan.'};
      return runPul({masterId,conversationId,requestId:`telegram:${update.update_id}`,messageId:msg.message_id,text:msg.text,voice:msg.voice,photo:msg.photo?.at(-1)?.file_id,chatId:msg.chat.id,receivedAt:Number.isFinite(msg.date)?msg.date*1000:null,receivedBy,receivedByName});
     }
     if(callback?.data.startsWith('pul_'))return {text:'Bu tugma Pul bo‘limiga tegishli.',reply_markup:sectionButtons('pul')};
    }
    if(runVoice){
     const speech=await runVoice({messageId:msg.message_id,chatId:msg.chat.id,masterId,conversationId,requestId:`telegram:${update.update_id}`,voice:msg.voice,text:msg.text,receivedAt:Number.isFinite(msg.date)?msg.date*1000:null,receivedBy,receivedByName});
     if(speech)return telegramPresentation(speech);
    }
    if(!msg.text)return {text:'Ovozli xabar yoki matn yuboring.'};
    if(clearVoice)await clearVoice({masterId,conversationId,receivedBy,receivedByName});
    if(msg.text.length>3000)return {text:'Xabar juda uzun. 3000 belgigacha yozing.'};
    const result=await runCommand({messageId:callback?null:msg.message_id,chatId:msg.chat.id,receivedAt:Number.isFinite(msg.date)?msg.date*1000:null,text:['/start','/new'].includes(msg.text)?'/new':msg.text,requestId:`telegram:${update.update_id}`,masterId,conversationId,receivedBy,receivedByName});
    if(msg.text==='/start')return {text:'Salom! Buyurtma yozing yoki hisobot so‘rang. Aniqlashtiruvchi savolga qisqa javob berishingiz mumkin. Aniq buyruqlar darhol bajariladi; bir nechta buyurtma topilsa, tugmadan tanlang.\nYangi suhbat: /new. Ovozli xabarlar matnga aylantiriladi. Ma’lumotlarni tekshirib, Tasdiqlash tugmasini bosing; Tahrirlash yoki Bekor qilish ham mumkin.'};
    return telegramPresentation(result);
   };
   if(deliver){
    await deliver({updateId:update.update_id,conversationId,chatId:msg.chat.id,input:msg.text||(msg.voice?`voice:${msg.voice.file_id}`:msg.photo?.length?`photo:${msg.photo.at(-1).file_id}`:'non-text'),process});
    if(clearButtons)await clearButtons({conversationId,updateId:update.update_id,chatId:msg.chat.id,sourceMessageId:callback?.message?.message_id,onlySource:Boolean(callback)});
    completed=true;return res.json({ok:true});
   }
   const payload=await process();
   if(clearButtons)await clearButtons({conversationId,updateId:update.update_id,chatId:msg.chat.id,sourceMessageId:callback?.message?.message_id,onlySource:Boolean(callback)});
   completed=true;return res.json({method:payload.photo?'sendPhoto':'sendMessage',chat_id:msg.chat.id,...(payload.photo?{photo:payload.photo,caption:payload.text.slice(0,1000),...(payload.reply_markup?{reply_markup:payload.reply_markup}:{})}:payload)});
  }catch(error){
   console.error('Telegram command failed',{name:error.name,code:error.code||error.statusCode||(/^[A-Z][A-Z_]{2,80}$/.test(error.message||'')?error.message:'command_failed')});
   return res.status(503).json({error:'Command processing unavailable; retry later'});
  }finally{if(typingTimer)clearInterval(typingTimer);if(!completed&&restoreButtons)await restoreButtons().catch(()=>{});}
 };
}
