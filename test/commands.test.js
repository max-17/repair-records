import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from '../src/db.js';
import {commandService,todayInTashkent,boundedHistory} from '../src/commands.js';
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

test('memory survives service restart, stays scoped, expires, resets, and does not duplicate retries',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'memory-'));const db=createClient({url:`file:${join(dir,'test.db')}`});await setup(db);
 let time=Date.parse('2026-11-14T10:00:00Z');let observed=[];let calls=0;
 const parse=async(text,{history})=>{calls++;observed=history;return {...blank,action:'clarify',question:'Qaysi davr?'};};
 let run=commandService({db,parse,now:()=>time});
 const send=(text,id,session='chat-a',master='owner')=>run({text,requestId:id,conversationId:session,masterId:master});
 try{
  await send('Menga hisobot ber','1');assert.equal(observed.length,0);
  run=commandService({db,parse,now:()=>time});
  await send('1 kun','2');assert.equal(observed.length,1);assert.equal(observed[0].user,'Menga hisobot ber');assert.equal(observed[0].assistant,'Qaysi davr?');
  const count=calls;await send('1 kun','2');assert.equal(calls,count);
  await send('new session','3','chat-b');assert.equal(observed.length,0);
  await send('other master','4','chat-a','other');assert.equal(observed.length,0);
  await assert.rejects(send('1 kun','2','chat-b'),/REQUEST_CONFLICT/);
  time+=31*60*1000;await send('old context?','5');assert.equal(observed.length,0);
  for(let i=0;i<12;i++)await send('again',`history-${i}`);assert.equal(observed.length,10);
  const beforeReset=calls;assert.equal((await send('/new','9')).kind,'reset');assert.equal(calls,beforeReset);
  await send('after reset','10');assert.equal(observed.length,0);
  await send('/new','9'); // a retried reset must not erase newer context
  await send('still here','11');assert.equal(observed.length,1);
  const rows=await db.execute('SELECT count(*) AS total FROM repair_jobs');assert.equal(rows.rows[0].total,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('concurrent turns fail safely when conversation changed during generation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'memory-race-'));const db=createClient({url:`file:${join(dir,'test.db')}`});await setup(db);
 let release,started;const ready=new Promise(r=>{started=r;});const pause=new Promise(r=>{release=r;});
 const parse=async text=>{if(text==='slow'){started();await pause;}return {...blank,question:'Qaysi davr?'};};
 const run=commandService({db,parse});
 const input=(text,id)=>({text,requestId:id,masterId:'owner',conversationId:'one'});
 try{
  const slow=run(input('slow','slow'));await ready;
  await run(input('fast','fast'));release();
  await assert.rejects(slow,/CONVERSATION_CHANGED/);
  const cache=await db.execute("SELECT count(*) AS total FROM command_requests WHERE request_id='slow'");assert.equal(cache.rows[0].total,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('history retains ten exchanges and drops oldest whole exchanges to respect context budget',()=>{
 const small=Array.from({length:15},(_,i)=>({user:String(i),assistant:'reply'}));
 const ten=boundedHistory(small);assert.equal(ten.length,10);assert.equal(ten[0].user,'5');
 const large=Array.from({length:10},(_,i)=>({user:String(i)+'x'.repeat(3000),assistant:'y'.repeat(1600)}));
 const bounded=boundedHistory(large);assert.ok(JSON.stringify(bounded).length<=16000);assert.equal(bounded.at(-1).user,large.at(-1).user);assert.ok(bounded.length<10);
});
