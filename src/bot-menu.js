import {setupPul} from './pul-db.js';
import {writeTransaction} from './audit.js';
const removeKeyboard={remove_keyboard:true};
export function sectionButtons(section='both'){
 const pul={text:'Pul bo‘limini ochish',style:'primary',callback_data:'section:pul'};
 const repair={text:'Ta’mirlash bo‘limini ochish',style:'primary',callback_data:'section:tamirlash'};
 const buttons=['pul','money'].includes(section)?[pul]:['tamirlash','repair'].includes(section)?[repair]:[pul,repair];
 return {inline_keyboard:buttons.map(button=>[button])};
}

const commandSections={pul:'money',tamirlash:'repair',repair:'repair'};
const normalizeSection=section=>['money','sales','debts','reports'].includes(section)?'money':'repair';
export async function setupBotMenu(db){
 await setupPul(db);
 await db.execute('CREATE TABLE IF NOT EXISTS staff_bot_sections (master_id TEXT NOT NULL, conversation_id TEXT NOT NULL, section TEXT NOT NULL, PRIMARY KEY(master_id,conversation_id))');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_bot_menu_requests (master_id TEXT NOT NULL, request_id TEXT NOT NULL, section TEXT NOT NULL, PRIMARY KEY(master_id,request_id))');
}
export function botMenuService({db}){
 let ready;
 return async({masterId,conversationId,requestId,text})=>{
  try{await (ready??=setupBotMenu(db));}catch(error){ready=undefined;throw error;}
  const command=/^\/(start|menu|pul|tamirlash|repair)(?:@\w+)?$/.exec(text?.trim()||'')?.[1];
  const previous=(await db.execute({sql:'SELECT section FROM staff_bot_sections WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]})).rows[0];
  const current=normalizeSection(previous?.section);
  if(command==='start'||command==='menu')return {section:current,payload:{text:`Salom! Kerakli bo‘limga buyruq orqali o‘ting:\n/pul — sotuvlar, xizmatlar, qarzlar, to‘lovlar va hisobotlar\n/tamirlash — ta’mirlash buyurtmalari\n\nHozir: ${current==='money'?'Pul':'Ta’mirlash'}. Matn yoki ovoz yuboring.`,reply_markup:removeKeyboard}};
  const section=commandSections[command];
  if(!section)return {section:current,payload:null};
  // A section command invalidates proposals from the previous workflow. Retried
  // Telegram updates must not invalidate a newer draft or switch the user back.
  await writeTransaction(db,async tx=>{
   const done=await tx.execute({sql:'SELECT section FROM staff_bot_menu_requests WHERE master_id=? AND request_id=?',args:[masterId,requestId]});
   if(done.rows.length)return;
   await tx.execute({sql:'INSERT INTO staff_bot_sections(master_id,conversation_id,section) VALUES(?,?,?) ON CONFLICT(master_id,conversation_id) DO UPDATE SET section=excluded.section',args:[masterId,conversationId,section]});
   await tx.execute({sql:"UPDATE voice_drafts SET status='cancelled' WHERE master_id=? AND conversation_id=? AND status IN ('pending','editing')",args:[masterId,conversationId]});
   await tx.execute({sql:"UPDATE pul_drafts SET state_json=json_set(state_json,'$.phase','cancelled') WHERE conversation_id=? AND json_extract(state_json,'$.phase') IN ('pending','editing','photo','clarify')",args:[conversationId]});
   await tx.execute({sql:'DELETE FROM conversation_state WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]});
   await tx.execute({sql:'INSERT INTO staff_bot_menu_requests(master_id,request_id,section) VALUES(?,?,?)',args:[masterId,requestId,section]});
  });
  return {section,payload:{text:section==='repair'?'Ta’mirlash bo‘limi. Buyurtma yoki hisobotni matn yoki ovoz bilan ayting. Ovozdan olingan ma’lumotlar bajarishdan oldin ko‘rsatiladi. Pul bo‘limiga o‘tish: /pul.':'Pul bo‘limi. Sotuv, xizmat, qarz, to‘lov yoki hisobotni matn yoki ovoz bilan ayting. Alohida kichik bo‘lim tanlash shart emas. Har bir o‘zgarish tasdiqlanadi. Ta’mirlashga o‘tish: /tamirlash.',reply_markup:removeKeyboard}};
 };
}
