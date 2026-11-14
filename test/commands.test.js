import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from '../src/db.js';
import {commandService,todayInTashkent} from '../src/commands.js';
import {telegramWebhook} from '../src/telegram.js';
import {createApp} from '../src/app.js';
const blank={action:'clarify',customer:null,device:null,work:null,price_uzs:null,due_date:null,status:null,start_date:null,end_date:null,question:null};
test('structured commands persist safely, isolate masters, ask about ambiguity and aggregate beyond 100 rows',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'commands-'));const db=createClient({url:`file:${join(dir,'test.db')}`});await setup(db);
 let plan={...blank,action:'create',customer:'Bekzod aka',device:'iPhone 14 Pro',work:'Ekran almashtirish',price_uzs:1000000,due_date:'2026-11-15'};let calls=0;
 const run=commandService({db,parse:async()=>{calls++;return plan;}});
 const command=(text,requestId,masterId='aziz')=>run({text,requestId,masterId});
 try {
  const created=await command('new','first');assert.equal(created.kind,'created');
  const again=await command('new','first');assert.equal(again.repair.id,created.repair.id);assert.equal(calls,1);
  await assert.rejects(command('different','first'),/REQUEST_CONFLICT/);
  plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',status:'ready'};
  assert.equal((await command('ready','second')).repair.status,'ready');
  assert.equal((await command('ready','second','other')).kind,'clarify');
  plan={...blank,action:'create',customer:'Bekzod aka',device:'iPhone 14 Pro',work:'Screen'};
  await command('another','third');
  plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',status:'ready'};
  assert.equal((await command('ambiguous','fourth')).kind,'clarify');
  const sql='INSERT INTO repair_jobs(id,master_id,request_id,customer,device,work,price_uzs) VALUES(?,?,?,?,?,?,?)';
  await db.batch(Array.from({length:110},(_,i)=>({sql,args:[`test-${i}`,'aziz',`seed-${i}`,'Other','Phone','Screen',100]})),'write');
  plan={...blank,action:'analytics'};
  const report=await command('all','stats');assert.equal(report.totals.jobs,112);assert.equal(report.totals.agreed_uzs,1011000);assert.equal(report.totals.priced_jobs,111);
  const other=await command('all','stats','other');assert.equal(other.totals.jobs,0);
  plan={...blank,action:'analytics',start_date:'2099-01-01',end_date:'2099-01-02'};
  assert.equal((await command('future','future')).totals.jobs,0);
  plan={...blank,action:'create',customer:'Missing work'};
  assert.equal((await command('incomplete','incomplete')).kind,'clarify');
  plan={...blank,action:'create',customer:'Test',device:'Phone',work:'Screen',due_date:'2026-02-30'};
  await assert.rejects(command('bad date','bad-date'));
  assert.equal(todayInTashkent(new Date('2026-11-14T20:00:00Z')),'2026-11-15');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('Telegram verifies secret and sender before invoking AI and assigns master from configured identity',async()=>{
 let calls=0;let received;
 const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'test-secret',TELEGRAM_MASTERS:'{"123":"aziz"}'},runCommand:async input=>{calls++;received=input;return {reply:'Saved'};}});
 const app=createApp({telegramHandler:handler});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(sender,secret='test-secret',type='private')=>fetch(base+'/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:99,message:{text:'Ready',from:{id:sender},chat:{id:123,type}}})});
 try {
  assert.equal((await post(123,'bad')).status,401);assert.equal(calls,0);
  assert.equal((await post(456)).status,200);assert.equal(calls,0);
  assert.equal((await post(123,'test-secret','group')).status,200);assert.equal(calls,0);
  const reply=await (await post(123)).json();assert.equal(reply.method,'sendMessage');assert.equal(reply.text,'Saved');assert.equal(received.masterId,'aziz');assert.equal(received.requestId,'telegram:99');
 }finally{await new Promise(r=>server.close(r));}
});
