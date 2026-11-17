import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {pulService} from '../src/pul.js';
import {pulPlanSchema} from '../src/pul-parser.js';
import {pulRows} from '../src/pul-db.js';
import {remaining,reportText,minor} from '../src/pul-domain.js';
import {pulDailyNotifications} from '../src/pul-notifications.js';
const env={PUL_OWNER_USER_IDS:'42',PUL_OWNER_CHAT_ID:'42',TELEGRAM_MASTERS:'{"7":"worker","42":"owner"}'};
const blank=Object.fromEntries(Object.keys(pulPlanSchema.shape).map(k=>[k,k==='include_deleted'?false:null]));
const sale={action:'sale',customer:'Bekzod',items:[{name:'Redmi Note 9',type:'product',quantity:1,unit_price:500000}],currency:'UZS',payments:[{amount:200000,currency:'UZS',method:'cash',exchange_rate:null}],due_date:'2026-11-17'};
async function fixture(fn){const path=await mkdtemp(join(tmpdir(),'pul-test-'));const db=createClient({url:`file:${join(path,'test.db')}`});let plan={},counter=0,transcriptions=0;const run=pulService({db,env,parse:async()=>({...blank,...plan}),transcribeVoice:async()=>{transcriptions++;return 'recognized raw audio';},now:()=>Date.parse('2026-11-17T09:00:00Z')});const send=(args={},user='7')=>run({masterId:'shop',conversationId:`chat:${user}`,requestId:String(++counter),receivedBy:user,receivedByName:user==='42'?'Owner':'Aziz',chatId:user,text:'command',...args});const token=p=>p.reply_markup.inline_keyboard.flat().find(b=>b.callback_data.startsWith('pul_confirm:')).callback_data.split(':')[1];const confirm=(p,user)=>send({text:`/pul_confirm ${token(p)}`},user);try{await fn({db,send,confirm,token,set:p=>{plan=p;},getTranscriptions:()=>transcriptions,run});}finally{db.close();await rm(path,{recursive:true,force:true});}}
test('voice sale presents fields before saving, photo before confirmation, split debt and seller attribution',()=>fixture(async({db,send,confirm,token,set,getTranscriptions})=>{
 set(sale);const review=await send({voice:{file_id:'voice'},text:undefined});assert.match(review.text,/Mijoz: Bekzod/);assert.match(review.text,/Mahsulot: Redmi/);assert.ok(!review.text.includes('recognized raw audio'));assert.equal((await pulRows(db,'main')).length,0);assert.equal(getTranscriptions(),1);
 assert.ok(review.reply_markup.inline_keyboard.flat().some(b=>b.text==='Rasm qo‘shish'&&b.style==='primary'));
 await send({text:`/pul_photo ${token(review)}`});const photoReview=await send({photo:'telegram-file-id',text:undefined});assert.match(photoReview.text,/Rasm: biriktirilgan/);
 assert.match((await send({text:`/pul_confirm ${token(review)}`})).text,/eskirgan/);
 await confirm(photoReview);const rows=await pulRows(db,'main'),saved=rows.find(r=>r.kind==='sale');assert.equal(saved.worker_id,'7');assert.equal(saved.data.photo,'telegram-file-id');assert.equal(remaining(saved,rows),30000000);assert.equal(rows.filter(r=>r.kind==='payment').length,1);
 assert.equal((await db.execute('SELECT user_id FROM pul_history')).rows.every(r=>r.user_id==='7'),true);
}));
test('trusted customer partial payments, editing, soft deletion and restore preserve immutable history',()=>fixture(async({db,send,confirm,set})=>{
 set({action:'debt',customer:'Ali',amount:100000,currency:'UZS'});await confirm(await send());let rows=await pulRows(db,'main'),debt=rows[0];
 set({action:'pay',record_id:debt.id,amount:40000,currency:'UZS',method:'transfer'});await confirm(await send());rows=await pulRows(db,'main');assert.equal(remaining(rows.find(r=>r.id===debt.id),rows),6000000);const payment=rows.find(r=>r.kind==='payment');
 set({action:'edit',record_id:payment.id,amount:50000});await confirm(await send());rows=await pulRows(db,'main');assert.equal(remaining(rows.find(r=>r.id===debt.id),rows),5000000);
 set({action:'delete',record_id:debt.id,reason:'duplicate'});assert.match((await send()).text,/Avval/);
 set({action:'delete',record_id:payment.id,reason:'wrong payment'});await confirm(await send());rows=await pulRows(db,'main');assert.equal(remaining(rows.find(r=>r.id===debt.id),rows),10000000);
 set({action:'restore',record_id:payment.id,reason:'checked'});await confirm(await send());assert.equal((await pulRows(db,'main')).find(r=>r.id===payment.id).is_deleted,false);
 await assert.rejects(db.execute('DELETE FROM pul_records'),/soft deletion/);await assert.rejects(db.execute('DELETE FROM pul_history'),/immutable/);await assert.rejects(db.execute("UPDATE pul_history SET action='fake'"),/immutable/);
 assert.equal((await db.execute('SELECT * FROM pul_history WHERE record_id=?',[payment.id])).rows.length,4);
}));
test('USD split payments use explicit rates and overpayment is rejected',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,payments:[{amount:20,currency:'USD',method:'cash',exchange_rate:null}]});assert.match((await send()).text,/Kurs|kurs/);
 set({...sale,payments:[{amount:20,currency:'USD',method:'cash',exchange_rate:12500},{amount:250000,currency:'UZS',method:'card',exchange_rate:null}]});await confirm(await send());const rows=await pulRows(db,'main'),s=rows.find(r=>r.kind==='sale');assert.equal(remaining(s,rows),0);
 set({action:'pay',record_id:s.id,amount:1,method:'cash',currency:'UZS'});assert.match((await send()).text,/oshib/);
 assert.throws(()=>minor(0.001));
}));
test('provider financing is not customer debt and rates are snapshotted',()=>fixture(async({db,send,confirm,set})=>{
 set({action:'vendor',vendor:'Uzum Nasiya',percentage:10,rate_type:'commission'});assert.match((await send()).text,/faqat egasi/);await confirm(await send({},'42'),'42');
 set({...sale,vendor:'Uzum Nasiya',financed_amount:300000});await confirm(await send());let rows=await pulRows(db,'main'),s=rows.find(r=>r.kind==='sale');assert.equal(remaining(s,rows),0);assert.equal(s.data.expectedVendorMinor,27000000);assert.equal(rows.filter(r=>r.kind==='payment').length,1);
 set({action:'vendor_payment',record_id:s.id,amount:270000,method:'transfer',currency:'UZS'});await confirm(await send());
 set({action:'vendor',vendor:'Uzum Nasiya',percentage:15,rate_type:'commission'});await confirm(await send({},'42'),'42');rows=await pulRows(db,'main');assert.equal(rows.find(r=>r.id===s.id).data.rateSnapshot.percentage,10);
}));
test('confirmation is retry safe, double taps and stale edits cannot overwrite records',()=>fixture(async({db,send,confirm,token,set,run})=>{
 set({action:'debt',customer:'Ali',amount:100,currency:'UZS'});const review=await send();const input={masterId:'shop',conversationId:'chat:7',requestId:'fixed',receivedBy:'7',receivedByName:'Aziz',chatId:'7',text:`/pul_confirm ${token(review)}`};const saved=await run(input);assert.deepEqual(await run(input),saved);assert.match((await confirm(review)).text,/eskirgan/);let row=(await pulRows(db,'main'))[0];
 set({action:'edit',record_id:row.id,amount:200});const edit=await send();await db.execute({sql:'UPDATE pul_records SET version=version+1 WHERE id=?',args:[row.id]});assert.match((await confirm(edit)).text,/o‘zgargan/);assert.equal((await pulRows(db,'main'))[0].data.totalMinor,10000);
}));
test('workers cannot access others, owner reports separate sales and actual receipts, daily reminders dedupe',()=>fixture(async({db,send,confirm,set})=>{
 set(sale);await confirm(await send());let rows=await pulRows(db,'main'),s=rows.find(r=>r.kind==='sale');
 set({action:'pay',record_id:s.id,amount:10,method:'cash',currency:'UZS'});assert.match((await send({},'8')).text,/topilmadi/);
 set({action:'report'});assert.match((await send({},'42')).text,/Aziz/);const report=reportText(rows,{start:'2026-11-17',end:'2026-11-17'});assert.match(report,/500/);assert.match(report,/200/);
 let messages=[];const opts={db,env,now:()=>Date.parse('2026-11-17T16:00:00Z'),send:async p=>messages.push(p)};
 await pulDailyNotifications(opts);assert.equal(messages.length,2);assert.ok(messages.some(p=>p.chat_id==='42'&&p.text.includes('Kunlik')));assert.ok(messages.some(p=>p.chat_id==='7'&&p.text.includes('Bekzod')));
 await pulDailyNotifications(opts);assert.equal(messages.length,2);
}));
test('failed notification acknowledgements are not automatically resent',()=>fixture(async({db,send,confirm,set})=>{
 set({action:'debt',customer:'Ali',amount:100,currency:'UZS',due_date:'2026-11-17'});await confirm(await send());let calls=0;const opts={db,env,now:()=>Date.parse('2026-11-17T16:00:00Z'),send:async()=>{calls++;throw new Error('lost response');}};await pulDailyNotifications(opts);await pulDailyNotifications(opts);assert.equal(calls,2);assert.equal((await db.execute("SELECT * FROM pul_notifications WHERE status='uncertain'")).rows.length,2);
}));
test('owner repayment updates original worker debt balance without changing seller attribution',()=>fixture(async({db,send,confirm,set})=>{
 set(sale);await confirm(await send());const original=(await pulRows(db,'main')).find(r=>r.kind==='sale');
 set({action:'pay',record_id:original.id,amount:300000,method:'cash',currency:'UZS'});await confirm(await send({},'42'),'42');
 set({action:'list',record_id:original.id});const view=await send();assert.match(view.text,/Qarz qoldig‘i: 0 UZS/);
 set({action:'report'});const report=await send();assert.ok(!report.text.includes('Owner · qarz to‘lovi'));
 assert.equal((await pulRows(db,'main')).find(r=>r.id===original.id).worker_id,'7');
}));
test('webhook routes Pul voice, photo and confirmation without invoking repair commands',()=>fixture(async({db,set})=>{
 const {setup}=await import('../src/db.js');const {botMenuService}=await import('../src/bot-menu.js');const {telegramWebhook}=await import('../src/telegram.js');await setup(db);
 let repairs=0,typing=0,updates=0;
 const service=pulService({db,env,parse:async()=>({...blank,...sale}),transcribeVoice:async()=> 'raw recording'});
 const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_MASTERS:'{"7":"worker"}'},runMenu:botMenuService({db}),runPul:service,runCommand:async()=>{repairs++;return {reply:'repair'};},typing:async()=>{typing++;}});
 async function message(extra,callback){let payload;const base={chat:{id:7,type:'private'},from:{id:7,first_name:'Aziz'},message_id:5};const body=callback?{update_id:++updates,callback_query:{id:'callback',from:base.from,message:base,data:callback}}:{update_id:++updates,message:{...base,...extra}};await handler({get:()=> 'fixture',body},{setHeader(){},status(){return this;},json(value){payload=value;return this;}});return payload;}
 await message({text:'/pul'});const review=await message({voice:{file_id:'voice'},date:Math.floor(Date.now()/1000)});assert.match(review.text,/Mijoz/);assert.equal((await pulRows(db,'main')).length,0);
 const photoAction=review.reply_markup.inline_keyboard.flat().find(b=>b.callback_data.startsWith('pul_photo:')).callback_data;await message({},photoAction);const updated=await message({photo:[{file_id:'photo-small'},{file_id:'photo-large'}]});assert.match(updated.text,/Rasm: biriktirilgan/);
 const confirm=updated.reply_markup.inline_keyboard.flat().find(b=>b.callback_data.startsWith('pul_confirm:')).callback_data;const result=await message({},confirm);assert.match(result.text,/Saqlandi/);assert.equal((await pulRows(db,'main')).find(r=>r.kind==='sale').data.photo,'photo-large');assert.equal(repairs,0);assert.equal(typing,5);
}));
test('sale price edits retain before values in history and require confirmation again',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,payments:[{amount:500000,currency:'UZS',method:'cash',exchange_rate:null}]});await confirm(await send());const row=(await pulRows(db,'main')).find(r=>r.kind==='sale');
 set({action:'edit',record_id:row.id,amount:600000});const review=await send();assert.match(review.text,/600/);assert.equal((await pulRows(db,'main')).find(r=>r.id===row.id).data.totalMinor,50000000);await confirm(review);
 const event=(await db.execute({sql:"SELECT before_json,after_json FROM pul_history WHERE record_id=? AND action='edit'",args:[row.id]})).rows[0];assert.equal(JSON.parse(event.before_json).data.items[0].unitMinor,50000000);assert.equal(JSON.parse(event.after_json).data.items[0].unitMinor,60000000);
}));
