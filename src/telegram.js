import {timingSafeEqual} from 'node:crypto';
export function telegramWebhook({env,runCommand}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const secret=env.TELEGRAM_WEBHOOK_SECRET;
  if(!secret||!runCommand)return res.status(503).json({error:'Telegram setup incomplete'});
  const actual=Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token')||'');const expected=Buffer.from(secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Unauthorized'});
  const update=req.body;const msg=update?.message;
  if(!Number.isSafeInteger(update?.update_id)||!msg||msg.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.from?.id)||msg.from.is_bot)return res.json({ok:true});
  let masters;
  try{masters=JSON.parse(env.TELEGRAM_MASTERS||'{}');}catch{return res.status(503).json({error:'Invalid staff configuration'});}
  const masterId=Object.hasOwn(masters,String(msg.from.id))?masters[String(msg.from.id)]:null;
  if(typeof masterId!=='string'||!masterId.trim())return res.json({ok:true});
  const reply=text=>res.json({method:'sendMessage',chat_id:msg.chat.id,text:text.slice(0,4000)});
  if(!msg.text)return reply('Hozircha faqat matn yuboring. Ovozli xabarlar hali qo‘llanmaydi.');
  if(msg.text==='/start')return reply('Salom! Buyurtmani to‘liq yozing: Bekzod akadan iPhone 14 Pro oldim, ekran almashtirish, 1 million so‘m, ertaga tayyor.\nHolat: Bekzod aka iPhone 14 Pro tayyor.\nHisobot: Bugun nechta buyurtma oldim?\nHar xabarda bitta to‘liq buyruq yozing.');
  if(msg.text.length>3000)return reply('Xabar juda uzun. 3000 belgigacha yozing.');
  try {
   const result=await runCommand({text:msg.text,requestId:`telegram:${update.update_id}`,masterId});
   return reply(result.reply);
  }catch(error){
   console.error('Telegram command failed',{name:error.name,code:error.code||error.statusCode||'command_failed'});
   return res.status(503).json({error:'Command processing unavailable; retry later'});
  }
 };
}
