import {sectionButtons} from './bot-menu.js';
import {createHash} from 'node:crypto';
import {setupPul,pulRows} from './pul-db.js';
import {remaining,money,reportText} from './pul-domain.js';
import {setupStaff,staffAccess} from './staff-auth.js';
import {todayInTashkent} from './time.js';
export async function pulDailyNotifications({db,env=process.env,send,now=()=>Date.now()}){
 await setupPul(db);await setupStaff(db,env);
 const shopId=env.PUL_SHOP_ID||'main',today=todayInTashkent(new Date(now())),records=await pulRows(db,shopId);
 const workers=(await db.execute({sql:'SELECT * FROM pul_workers WHERE shop_id=?',args:[shopId]})).rows;
 const names=Object.fromEntries(workers.map(w=>[w.user_id,w.name]));
 const users=(await db.execute('SELECT telegram_id FROM staff_users WHERE is_active=1')).rows;const allowed=new Map();for(const user of users){const access=await staffAccess(db,env,user.telegram_id);if(access?.permissions.includes('pul.read'))allowed.set(String(user.telegram_id),access);}
 const owners=[...allowed.values()].filter(a=>a.permissions.includes('admin')).map(a=>a.id),recipients=new Map();
 for(const id of owners)recipients.set(workers.find(w=>w.user_id===id)?.chat_id||id,{owner:true,userIds:new Set()});
 for(const worker of workers){if(!allowed.has(worker.user_id)||!/^\d+$/.test(worker.chat_id))continue;const existing=recipients.get(worker.chat_id)||{owner:owners.includes(worker.user_id),userIds:new Set()};existing.userIds.add(worker.user_id);recipients.set(worker.chat_id,existing);}
 let sent=0,failed=0;
 for(const [chatId,recipient] of recipients){
  const scoped=recipient.owner?records:records.filter(r=>recipient.userIds.has(r.worker_id));
  const due=scoped.filter(r=>!r.is_deleted&&['sale','debt'].includes(r.kind)&&remaining(r,records)>0&&((r.data.reminderDate||r.data.dueDate)&& (r.data.reminderDate||r.data.dueDate)<=today));
  // Owner receives daily report; workers receive only their due-debt reminders.
  if(!recipient.owner&&!due.length)continue;
  const reminder=due.length?`Qarz eslatmalari (${due.length} ta):\n`+due.slice(0,12).map(r=>`${r.data.customer||'Mijoz'} · ${money(remaining(r,records),r.data.currency)} · muddat ${r.data.dueDate||r.data.reminderDate}\nID: ${r.id}`).join('\n\n'):'Bugun eslatiladigan qarz yo‘q.';
  const text=(recipient.owner?reportText(records,{start:today,end:today,userNames:names,title:'Kunlik Pul hisoboti'})+'\n\n':'')+reminder+'\n\nTo‘lov yoki eslatma sanasini o‘zgartirish uchun Pul bo‘limini oching. Yozuv ID sini buyruqqa qo‘shing.';
  const payload={chat_id:chatId,text:text.slice(0,3900),reply_markup:sectionButtons('pul')},id=createHash('sha256').update(`${shopId}:${today}:${chatId}`).digest('hex');
  await db.execute({sql:'INSERT INTO pul_notifications(id,shop_id,local_date,chat_id,payload_json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',args:[id,shopId,today,chatId,JSON.stringify(payload)]});
  const claim=await db.execute({sql:"UPDATE pul_notifications SET status='sending' WHERE id=? AND status='pending' RETURNING payload_json",args:[id]});
  if(!claim.rows.length)continue;
  try{await send(JSON.parse(claim.rows[0].payload_json));await db.execute({sql:"UPDATE pul_notifications SET status='sent' WHERE id=?",args:[id]});sent++;}
  catch(error){
   // Lost acknowledgements are uncertain; do not resend automatically.
   const status=error.ambiguous===false?'failed':'uncertain';
   await db.execute({sql:'UPDATE pul_notifications SET status=?,error_code=? WHERE id=?',args:[status,/^\d{3}$/.test(String(error.code))?String(error.code):'delivery_failed',id]});failed++;
  }
 }
 return {sent,failed,ownersConfigured:owners.length>0};
}
