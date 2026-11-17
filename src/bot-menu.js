import {writeTransaction} from './audit.js';
const rootMarkup={keyboard:[[{text:'Ta’mirlash'},{text:'Pul'}]],resize_keyboard:true,is_persistent:true};
const pulMarkup={keyboard:[[{text:'Sotuv / xizmat'},{text:'Qarz daftar'}],[{text:'Hisobot'},{text:'Bosh menyu'}]],resize_keyboard:true,is_persistent:true};
const repairMarkup={keyboard:[[{text:'Pul'},{text:'Bosh menyu'}]],resize_keyboard:true,is_persistent:true};
const shortcuts=new Map([['/repair','repair'],['Ta’mirlash','repair'],["Ta'mirlash",'repair'],['/pul','money'],['Pul','money'],['Sotuv / xizmat','sales'],['Qarz daftar','debts'],['Hisobot','reports']]);
export async function setupBotMenu(db){
 await db.execute('CREATE TABLE IF NOT EXISTS staff_bot_sections (master_id TEXT NOT NULL, conversation_id TEXT NOT NULL, section TEXT NOT NULL, PRIMARY KEY(master_id,conversation_id))');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_bot_menu_requests (master_id TEXT NOT NULL, request_id TEXT NOT NULL, section TEXT NOT NULL, PRIMARY KEY(master_id,request_id))');
}
export function botMenuService({db}){
 let ready;

 return async({masterId,conversationId,requestId,text})=>{
  try{await (ready??=setupBotMenu(db));}catch(error){ready=undefined;throw error;}
  const root=['/start','/menu','Bosh menyu'].includes(text);
  let target=shortcuts.get(text);
  const previous=(await db.execute({sql:'SELECT section FROM staff_bot_sections WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]})).rows[0];
  const current=previous?.section||'repair';
  if(current==='repair'&&['sales','debts','reports'].includes(target))target=undefined;
  if(root||target){
   const section=root?'menu':target;
   // A menu transition invalidates pending repair buttons and voice drafts.
   // Cache it transactionally so a duplicate Telegram update cannot switch modes again.
   await writeTransaction(db,async tx=>{
    const done=await tx.execute({sql:'SELECT section FROM staff_bot_menu_requests WHERE master_id=? AND request_id=?',args:[masterId,requestId]});
    if(done.rows.length)return;
    await tx.execute({sql:'INSERT INTO staff_bot_sections(master_id,conversation_id,section) VALUES(?,?,?) ON CONFLICT(master_id,conversation_id) DO UPDATE SET section=excluded.section',args:[masterId,conversationId,section]});
    await tx.execute({sql:"UPDATE voice_drafts SET status='cancelled' WHERE master_id=? AND conversation_id=? AND status IN ('pending','editing')",args:[masterId,conversationId]});
    await tx.execute({sql:'DELETE FROM conversation_state WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]});
    await tx.execute({sql:'INSERT INTO staff_bot_menu_requests(master_id,request_id,section) VALUES(?,?,?)',args:[masterId,requestId,section]});
   });
   return {section,payload:section==='menu'?{text:'Bo‘limni tanlang:',reply_markup:rootMarkup}:section==='repair'?{text:'Ta’mirlash bo‘limi. Buyurtma yozing yoki ovozli xabar yuboring. Ovozli buyruqni bajarishdan oldin matnni tasdiqlaysiz. Bo‘limni almashtirish uchun menyudan foydalaning.',reply_markup:repairMarkup}:moneyPage(section)};
  }
  if(current==='menu')return {section:current,payload:{text:'Avval bo‘limni tanlang:',reply_markup:rootMarkup}};
  if(current!=='repair')return {section:current,payload:moneyPage(current)};
  return {section:current,payload:null};
 };
}
function moneyPage(section){
 const text=section==='sales'?'Sotuv / xizmat. Bu yerda mahsulot sotuvlari va xizmatlar qayd etiladi. Yozuvlarni saqlash hali ishga tushirilmagan. Hozir hech qanday ma’lumot saqlanmadi.':section==='debts'?'Qarz daftar. Bu yerda qarzlar va qisman to‘lovlar yuritiladi. Yozuvlarni saqlash hali ishga tushirilmagan. Hozir hech qanday ma’lumot saqlanmadi.':section==='reports'?'Pul hisoboti hali ishga tushirilmagan. Ta’mirlash hisobotini olish uchun Ta’mirlash bo‘limiga o‘ting.':'Pul bo‘limi. Sotuv / xizmat, Qarz daftar yoki Hisobotni tanlang. Bu bo‘limdagi yozuvlarni saqlash hali ishga tushirilmagan.';
 return {text,reply_markup:pulMarkup};
}
