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
import {messageTiming,resolveReportPeriod} from '../src/memory.js';
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

test('structured state survives restarts and long gaps, stays scoped and resets idempotently',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'state-'));const db=createClient({url:`file:${join(dir,'test.db')}`});await setup(db);
 let time=Date.parse('2026-11-14T10:00:00Z');let observed;let observedTiming;let calls=0;
 const parse=async(text,{state,timing})=>{calls++;observed=state;observedTiming=timing;return {...blank,question:'Qaysi davr?',memory:{topic:'continue',pending_action:'analytics',uses_active_repair:false}};};
 let run=commandService({db,parse,now:()=>time});
 const send=(text,id,conversationId='a',masterId='owner')=>run({text,requestId:id,conversationId,masterId});
 try{
  await send('Menga hisobot ber','1');assert.deepEqual(observed,{});assert.equal(observedTiming.inactivity_seconds,null);
  run=commandService({db,parse,now:()=>time});time+=7*24*60*60*1000;
  await send('1 kun','2');assert.equal(observedTiming.inactivity_seconds,604800);assert.equal(observedTiming.crossed_calendar_day,true);assert.equal(observed.pending.action,'analytics');assert.equal(observed.pending.question,'Qaysi davr?');
  const count=calls;await send('1 kun','2');assert.equal(calls,count);
  await send('other chat','3','b');assert.deepEqual(observed,{});
  await send('other master','4','a','other');assert.deepEqual(observed,{});
  await assert.rejects(send('1 kun','2','b'),/REQUEST_CONFLICT/);
  for(let i=0;i<25;i++)await send('still reporting',`state-${i}`);
  assert.equal(observed.pending.action,'analytics');assert.ok(!('history' in observed));assert.ok(JSON.stringify(observed).length<2000);
  const before=calls;assert.equal((await send('/new','reset')).kind,'reset');assert.equal(calls,before);
  await send('after reset','after');assert.deepEqual(observed,{phase:'idle'});
  await send('/new','reset');await send('still here','final');assert.equal(observed.pending.action,'analytics');
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


test('draft fields are completed across messages; confirmed IDs prevent wrong updates and stale references require clarification',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'state-repair-'));const db=createClient({url:`file:${join(dir,'test.db')}`});await setup(db);
 let time=Date.parse('2026-11-14T10:00:00Z');let plan;
 const run=commandService({db,parse:async()=>plan,now:()=>time});
 const send=(text,id)=>run({text,requestId:id,masterId:'owner',conversationId:'a'});
 const metadata=(topic,pending_action=null,uses_active_repair=false)=>({topic,pending_action,uses_active_repair});
 try{
  plan={...blank,customer:'Bekzod',device:'iPhone 14 Pro',question:'Qanday ta’mirlash?',memory:metadata('new','create')};
  await send('Bekzoddan iPhone 14 Pro oldim','draft');
  plan={...blank,action:'create',work:'Ekran almashtirish',memory:metadata('continue')};
  const created=await send('Ekran almashtirish','create');assert.equal(created.kind,'created');assert.equal(created.repair.customer,'Bekzod');
  const id=created.repair.id;
  // A completed creation must never be replayed as a new creation from context.
  plan={...blank,action:'create',customer:'Bekzod',device:'iPhone 14 Pro',work:'Screen',memory:metadata('continue')};
  assert.equal((await send('rahmat','thanks')).kind,'clarify');
  // A second matching repair must not steal a reference to the confirmed ID.
  await db.execute({sql:'INSERT INTO repair_jobs(id,master_id,request_id,customer,device,work) VALUES(?,?,?,?,?,?)',args:['other-repair','owner','other-repair','Bekzod','iPhone 14 Pro','Battery']});
  plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',status:'ready',memory:metadata('continue',null,true)};
  const updated=await send('Tayyor bo‘ldi','ready');assert.equal(updated.repair.id,id);assert.equal(updated.repair.status,'ready');
  time+=24*60*60*1000;plan={...plan,status:'delivered'};
  assert.equal((await send('Topshirdim','stale')).kind,'clarify');
  const stored=await db.execute({sql:'SELECT status FROM repair_jobs WHERE id=?',args:[id]});assert.equal(stored.rows[0].status,'ready');
  // New topics clear draft state and old entity focus.
  plan={...blank,action:'analytics',memory:metadata('new')};await send('Hisobot','report');
  const memory=await db.execute("SELECT state_json FROM conversation_state WHERE master_id='owner' AND conversation_id='a'");
  const state=JSON.parse(memory.rows[0].state_json);assert.ok(!state.active_repair);assert.ok(!state.pending);assert.ok(state.last_report);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('inactivity metadata handles short pauses, Tashkent midnight and invalid prior times',()=>{
 const state={last_exchange:{at:'2026-11-14T18:59:50Z'}};
 const short=messageTiming(state,Date.parse('2026-11-14T18:59:55Z'));assert.equal(short.inactivity_seconds,5);assert.equal(short.crossed_calendar_day,false);
 const midnight=messageTiming(state,Date.parse('2026-11-14T19:00:10Z'));assert.equal(midnight.inactivity_seconds,20);assert.equal(midnight.crossed_calendar_day,true);
 assert.equal(messageTiming({last_exchange:{at:'invalid'}},Date.now()).inactivity_seconds,null);
 assert.equal(messageTiming(state,Date.parse('2026-11-14T18:00:00Z')).inactivity_seconds,0);
});

test('one-day report follow-up uses the current Tashkent date after a pause',()=>{
 const state={pending:{action:'analytics'},last_exchange:{at:'2026-11-12T10:00:00Z'}};
 const timing=messageTiming(state,Date.parse('2026-11-14T19:01:00Z'));
 const plan={...blank,action:'analytics',start_date:'2026-11-14',end_date:'2026-11-14'};
 const resolved=resolveReportPeriod(plan,'1 kun',state,timing);assert.equal(resolved.start_date,'2026-11-15');assert.equal(resolved.end_date,'2026-11-15');
 assert.equal(resolveReportPeriod(plan,'1 kun oldin',state,timing).start_date,'2026-11-14');
 assert.equal(resolveReportPeriod(plan,'1 kun',{},timing).start_date,'2026-11-14');
});

test('Telegram callback buttons are authenticated and routed as token-bound commands',async()=>{
 const token='11111111-1111-4111-8111-111111111111';let received;let presentation;let calls=0;
 const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'test',TELEGRAM_MASTERS:'{"123":"owner"}'},runCommand:async input=>{calls++;received=input;return {kind:'updated',reply:'Updated'};},deliver:async input=>{presentation=await input.process();}});
 const server=createApp({telegramHandler:handler}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=sender=>fetch(`http://127.0.0.1:${server.address().port}/api/telegram/webhook`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test'},body:JSON.stringify({update_id:456,callback_query:{id:'callback',from:{id:sender},data:`confirm:${token}`,message:{chat:{id:123,type:'private'},from:{id:999,is_bot:true}}}})});
 try{assert.equal((await post(789)).status,200);assert.equal(calls,0);assert.equal((await post(123)).status,200);assert.equal(received.text,`/confirm ${token}`);assert.equal(received.masterId,'owner');assert.equal(presentation.text,'Updated');}finally{await new Promise(r=>server.close(r));}
});
