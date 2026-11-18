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
async function fixture(fn){const path=await mkdtemp(join(tmpdir(),'pul-test-'));const db=createClient({url:`file:${join(path,'test.db')}`});let plan={},counter=0,transcriptions=0;const run=pulService({db,env,parse:async()=>({...blank,...plan}),transcribeVoice:async(_voice,context)=>{transcriptions++;await context.archiveAudio(Buffer.from('test audio'));return 'recognized raw audio';},now:()=>Date.parse('2026-11-17T09:00:00Z')});const send=(args={},user='7')=>run({masterId:'shop',conversationId:`chat:${user}`,requestId:String(++counter),receivedBy:user,receivedByName:user==='42'?'Owner':'Aziz',chatId:user,text:'command',...args});const token=p=>p.reply_markup.inline_keyboard.flat().find(b=>b.callback_data.startsWith('pul_confirm:')).callback_data.split(':')[1];const confirm=(p,user)=>send({text:`/pul_confirm ${token(p)}`},user);try{await fn({db,send,confirm,token,set:p=>{plan=p;},getTranscriptions:()=>transcriptions,run});}finally{db.close();await rm(path,{recursive:true,force:true});}}
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
test('mixed currency payments are independent, no rates stored and explicit debt is repaid in its own currency',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,fully_paid:true,payments:[{amount:20,currency:'USD',method:'cash'},{amount:250000,currency:'UZS',method:'card'}]});await confirm(await send());let rows=await pulRows(db,'main'),saved=rows.find(r=>r.kind==='sale');assert.equal(remaining(saved,rows),0);assert.equal(saved.data.separateCurrencies,true);assert.ok(rows.filter(r=>r.kind==='payment').every(r=>!Object.hasOwn(r.data,'exchangeRate')));assert.equal(rows.find(r=>r.kind==='payment'&&r.data.currency==='USD').data.settledMinor,null);
 set({...sale,fully_paid:null,debt_amount:100000,payments:[{amount:10,currency:'USD',method:'cash'}]});await confirm(await send());rows=await pulRows(db,'main');const debt=rows.find(r=>r.kind==='sale'&&r.data.openingDebtMinor===10000000);assert.equal(remaining(debt,rows),10000000);
 set({action:'pay',record_id:debt.id,amount:5,currency:'USD',method:'cash'});assert.match((await send()).text,/qarz valyutasida/);
 set({action:'pay',record_id:debt.id,amount:50000,currency:'UZS',method:'transfer'});await confirm(await send());rows=await pulRows(db,'main');assert.equal(remaining(rows.find(r=>r.id===debt.id),rows),5000000);
 assert.throws(()=>minor(0.001));
}));
test('provider financing stores principal only, permits named vendor without setup and requires no commission',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,vendor:'Uzum Nasiya',financed_amount:300000});const review=await send();assert.ok(!review.text.includes('kutiladi'));await confirm(review);const rows=await pulRows(db,'main'),saved=rows.find(r=>r.kind==='sale');assert.equal(remaining(saved,rows),0);assert.equal(saved.data.financedMinor,30000000);assert.equal(saved.data.vendorName,'Uzum Nasiya');assert.equal(rows.filter(r=>r.kind==='payment').length,1);
 set({action:'vendor',vendor:'Exchange'});assert.match((await send()).text,/faqat egasi/);await confirm(await send({},'42'),'42');assert.deepEqual((await pulRows(db,'main')).find(r=>r.kind==='vendor').data,{vendor:'Exchange',occurredOn:'2026-11-17'});
 set({action:'vendor_payment',record_id:saved.id,amount:300000,method:'cash',currency:'UZS'});assert.match((await send()).text,/alohida kuzatilmaydi/);
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
 const service=pulService({db,env,parse:async()=>({...blank,...sale}),transcribeVoice:async(_v,c)=>{await c.archiveAudio(Buffer.from('audio'));return 'raw recording';}});
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
test('customer is optional for paid/provider sales but required for standalone and remaining shop debt',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,customer:null,phone:null,payments:[{amount:500000,currency:'UZS',method:'cash',exchange_rate:null}]});await confirm(await send());
 set({...sale,customer:null,payments:[]});assert.match((await send()).text,/mijoz ismini/);
 set({action:'debt',customer:'   ',amount:100000,currency:'UZS'});assert.match((await send()).text,/mijoz ismini/);
 set({...sale,customer:null,vendor:'Exchange',financed_amount:500000,payments:[]});await confirm(await send());
 const sales=(await pulRows(db,'main')).filter(r=>r.kind==='sale');assert.equal(sales.length,2);assert.ok(sales.every(r=>r.data.customer===null));
}));
test('explicitly clearing optional contacts is audited while omitted contacts are preserved',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,payments:[{amount:500000,currency:'UZS',method:'cash',exchange_rate:null}],phone:'+998901234567'});await confirm(await send());const saleRow=(await pulRows(db,'main')).find(r=>r.kind==='sale');
 set({action:'edit',record_id:saleRow.id,description:'Contact unchanged'});await confirm(await send());assert.equal((await pulRows(db,'main')).find(r=>r.id===saleRow.id).data.customer,'Bekzod');
 set({action:'edit',record_id:saleRow.id,customer:'',phone:''});await confirm(await send());const after=(await pulRows(db,'main')).find(r=>r.id===saleRow.id);assert.equal(after.data.customer,null);assert.equal(after.data.phone,null);
 const events=(await db.execute({sql:"SELECT before_json,after_json FROM pul_history WHERE record_id=? AND action='edit'",args:[saleRow.id]})).rows;
 assert.ok(events.some(e=>JSON.parse(e.before_json).data.customer==='Bekzod'&&JSON.parse(e.after_json).data.customer===null));
}));
test('multiple audio and text sources follow confirmation history and remain immutable after deletion',()=>fixture(async({db,send,confirm,set})=>{
 set(sale);const initial=await send({text:undefined,voice:{file_id:'original'},messageId:10});
 set({...sale,items:[{...sale.items[0],unit_price:600000}]});const corrected=await send({text:'narxi 600 ming',messageId:11});
 await confirm(corrected);
 const record=(await pulRows(db,'main')).find(r=>r.kind==='sale');
 const sources=(await db.execute(`SELECT s.* FROM pul_history h JOIN pul_history_sources l ON h.id=l.history_id JOIN pul_sources s ON s.id=l.source_id WHERE h.record_id=? ORDER BY l.position`,[record.id])).rows;
 assert.equal(sources.length,2);assert.equal(sources[0].telegram_file_id,'original');assert.ok(sources[0].audio_hash);assert.equal(sources[1].original_text,'narxi 600 ming');assert.equal(sources[1].message_id,'11');
 assert.match((await confirm(initial)).text,/eskirgan/);
 await assert.rejects(db.execute("UPDATE pul_sources SET original_text='fake'"),/immutable/);
 await assert.rejects(db.execute('DELETE FROM pul_history_sources'),/immutable/);
}));

test('used-phone purchase is outgoing money, supports edits and audited soft deletion, never creates customer debt',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,action:'purchase',payments:[{amount:200000,currency:'UZS',method:'cash',exchange_rate:null},{amount:300000,currency:'UZS',method:'transfer',exchange_rate:null}]});const review=await send();assert.match(review.text,/pul chiqimi/);assert.equal((await pulRows(db,'main')).length,0);await confirm(review);
 let rows=await pulRows(db,'main');const purchase=rows.find(r=>r.kind==='purchase');assert.equal(remaining(purchase,rows),0);assert.ok(rows.filter(r=>r.kind==='payment').every(r=>r.data.source==='shop'));
 const report=reportText(rows,{start:'2026-11-17',end:'2026-11-17'});assert.match(report,/Haqiqiy pul chiqimi/);assert.ok(!report.split('Haqiqiy pul kirimi:')[1].split('Provayder orqali')[0].includes('200'));
 set({action:'edit',record_id:purchase.id,description:'Ishlatilgan telefon, IMEI tekshirildi'});await confirm(await send());assert.equal((await pulRows(db,'main')).find(r=>r.id===purchase.id).data.description,'Ishlatilgan telefon, IMEI tekshirildi');
 for(const payment of rows.filter(r=>r.kind==='payment')){set({action:'delete',record_id:payment.id,reason:'Xarid bekor qilindi'});await confirm(await send());}
 set({action:'delete',record_id:purchase.id,reason:'Xarid bekor qilindi'});await confirm(await send());rows=await pulRows(db,'main');assert.ok(rows.every(r=>r.is_deleted));assert.equal(rows.length,3);assert.ok((await db.execute("SELECT * FROM pul_history WHERE action='delete'")).rows.every(r=>r.user_id==='7'));
}));

test('essay payments: $100 cash plus 2m UZS transfer and 5m Exchange financing, with no conversion',()=>fixture(async({db,send,confirm,set})=>{
 set({...sale,items:[{name:'iPhone 15',type:'product',quantity:1,unit_price:8300000}],payments:[{amount:100,currency:'USD',method:'cash'},{amount:2000000,currency:'UZS',method:'transfer'}],vendor:'Exchange',financed_amount:5000000});const review=await send({text:'Bekzod aka bilan kelishdik, iPhone 15 narxi 8 million 300 ming. 100 dollar naqd berdi, 2 million so‘mni kartadan kartaga tashladi, qolgan 5 million Exchange orqali. Boshqa qarzi yo‘q.'});assert.ok(!review.text.includes('USD va UZS alohida saqlanadi. Konvertatsiya qilinmaydi.'));await confirm(review);
 let rows=await pulRows(db,'main');const saved=rows.find(r=>r.kind==='sale');assert.equal(saved.data.financedMinor,500000000);assert.equal(saved.data.vendorName,'Exchange');assert.equal(remaining(saved,rows),0);const pays=rows.filter(r=>r.kind==='payment');assert.equal(pays.length,2);assert.ok(pays.some(r=>r.data.currency==='USD'&&r.data.amountMinor===10000));assert.ok(pays.some(r=>r.data.currency==='UZS'&&r.data.amountMinor===200000000));assert.ok(!JSON.stringify(rows.map(r=>r.data)).includes('exchangeRate'));
 const {pulWebOverview}=await import('../src/pul-web.js');const web=await pulWebOverview(db,'main',{start:'2026-11-17',end:'2026-11-17',today:'2026-11-17',status:'active'});assert.equal(web.analytics.currencies.find(c=>c.currency==='USD').received,10000);assert.equal(web.analytics.currencies.find(c=>c.currency==='UZS').received,200000000);assert.equal(web.analytics.currencies.find(c=>c.currency==='UZS').financed,500000000);
 set({action:'delete',record_id:saved.id,reason:'Noto‘g‘ri yozuv'});await confirm(await send());rows=await pulRows(db,'main');assert.ok(rows.every(r=>r.is_deleted));assert.equal(rows.length,3);assert.equal((await db.execute("SELECT * FROM pul_history WHERE action='delete'")).rows.length,3);
}));
test('unknown total accepts explicit Ishonch remainder and USD upfront without invented prices',()=>fixture(async({db,send,confirm,set})=>{
 set({action:'sale',currency:'UZS',items:[{name:'iPhone 14 Pro',type:'product',quantity:1,unit_price:null}],payments:[{amount:200,currency:'USD',method:'cash'}],vendor:'Ishonch',financed_amount:2345000});const review=await send();assert.match(review.text,/200 USD/);assert.match(review.text,/Ishonch/);assert.ok(!review.text.includes('0 UZS ·'));await confirm(review);const rows=await pulRows(db,'main'),saved=rows.find(r=>r.kind==='sale');assert.equal(saved.data.totalMinor,null);assert.equal(saved.data.items[0].unitMinor,null);assert.deepEqual(saved.data.totalsByCurrency,{USD:20000,UZS:234500000});assert.equal(remaining(saved,rows),0);
 const {pulWebOverview}=await import('../src/pul-web.js');const overview=await pulWebOverview(db,'main',{start:'2026-11-17',end:'2026-11-17',today:'2026-11-17',status:'active'});assert.equal(overview.analytics.currencies.find(c=>c.currency==='USD').sales,20000);assert.equal(overview.analytics.currencies.find(c=>c.currency==='UZS').sales,234500000);assert.ok(!JSON.stringify(overview).includes('NaN'));
}));
test('incomplete sale returns known draft fields and question, then completes safely with source links',()=>fixture(async({db,send,confirm,set})=>{
 set({action:'sale',items:[{name:'iPhone 14 Pro',type:'product',quantity:1,unit_price:null}],vendor:'Ishonch',currency:'UZS'});let review=await send({text:'iPhone 14 Pro Ishonch orqali'});assert.match(review.text,/qoralama/);assert.match(review.text,/iPhone 14 Pro/);assert.match(review.text,/Ishonch/);assert.match(review.text,/Hali saqlanmadi/);assert.ok(!review.reply_markup.inline_keyboard.flat().some(b=>b.callback_data.startsWith('pul_confirm:')));assert.equal((await pulRows(db,'main')).length,0);
 set({action:'sale',items:[{name:'iPhone 14 Pro',type:'product',quantity:1,unit_price:null}],vendor:'Ishonch',currency:'UZS',payments:[{amount:200,currency:'USD',method:'cash'}],financed_amount:2345000});review=await send({text:'200 dollar naqd oldindan, qolgani 2345000 som'});await confirm(review);const row=(await pulRows(db,'main')).find(r=>r.kind==='sale');assert.equal((await db.execute('SELECT * FROM pul_history_sources WHERE history_id IN (SELECT id FROM pul_history WHERE record_id=?)',[row.id])).rows.length,2);
}));
test('AI clarification response still shows extracted fields and cancellation works',()=>fixture(async({db,send,set})=>{
 set({action:'clarify',items:[{name:'Samsung S23',type:'product',quantity:1,unit_price:null}],question:'Qanday usulda to‘landi?'});const draft=await send();assert.match(draft.text,/Samsung S23/);assert.match(draft.text,/Qanday usulda/);const button=draft.reply_markup.inline_keyboard.flat()[0];const cancelled=await send({text:'/pul_cancel '+button.callback_data.split(':')[1]});assert.match(cancelled.text,/bekor qilindi/);assert.equal((await pulRows(db,'main')).length,0);
}));
test('product model uses digits in draft and stored record while source wording is retained',()=>fixture(async({db,send,confirm,set})=>{
 const text="iPhone o'n uch pro ni 500 ming so'mga naqd sotdim";
 set({...sale,items:[{name:"iPhone o'n uch pro",type:'product',quantity:1,unit_price:500000}],payments:[{amount:500000,currency:'UZS',method:'cash'}]});
 const reply=await send({text});assert.match(reply.text,/iPhone 13 pro/);assert.ok(!reply.text.includes("o'n uch"));await confirm(reply);
 const row=(await pulRows(db,'main')).find(r=>r.kind==='sale');assert.equal(row.data.items[0].name,'iPhone 13 pro');assert.equal((await db.execute('SELECT original_text FROM pul_sources LIMIT 1')).rows[0].original_text,text);
}));
