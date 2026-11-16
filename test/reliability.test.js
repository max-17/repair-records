import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from '../src/db.js';
import {commandService} from '../src/commands.js';
import {telegramPresentation,proposal} from '../src/tasks.js';
import {telegramDelivery} from '../src/delivery.js';
const blank={action:'clarify',customer:null,device:null,work:null,price_uzs:null,due_date:null,status:null,start_date:null,end_date:null,question:null};
async function withDb(fn){const dir=await mkdtemp(join(tmpdir(),'reliability-'));const db=createClient({url:`file:${join(dir,'test.db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
const create={...blank,action:'create',customer:'Bekzod',device:'iPhone 14 Pro',work:'Screen',price_uzs:1000000};
test('explicit staff updates execute once immediately and remain audited without confirmation',()=>withDb(async db=>{
 let plan=create;let parses=0;
 const run=commandService({db,parse:async()=>{parses++;return plan;}});
 const send=(text,requestId)=>run({text,requestId,masterId:'owner',conversationId:'chat'});
 const saved=await send('create','1');
 plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',price_uzs:900000};
 const updated=await send('price','2');assert.equal(updated.kind,'updated');assert.equal(updated.repair.price_uzs,900000);
 assert.ok(!telegramPresentation(updated).reply_markup);
 const count=parses;assert.deepEqual(await send('price','2'),updated);assert.equal(parses,count);
 assert.equal((await send('/confirm 11111111-1111-4111-8111-111111111111','3')).kind,'expired_button');assert.equal(parses,count);
 plan={...plan,price_uzs:null,status:'delivered'};
 const delivered=await send('Topshirdim','4');assert.equal(delivered.kind,'updated');assert.equal(delivered.repair.status,'delivered');
 const events=await db.execute('SELECT * FROM repair_events ORDER BY created_at,id');assert.equal(events.rows.length,3);
 const change=events.rows.find(r=>JSON.parse(r.after_json).price_uzs===900000&&JSON.parse(r.before_json||'null')?.price_uzs===1000000);
 assert.equal(change.actor_id,'chat');assert.equal(change.repair_id,saved.repair.id);
 const state=JSON.parse((await db.execute('SELECT state_json FROM conversation_state')).rows[0].state_json);assert.ok(!state.confirmation);
}));
test('ambiguous selection is cancellable and selecting a current snapshot executes exactly once',()=>withDb(async db=>{
 let plan=create;const run=commandService({db,parse:async()=>plan});const send=(text,requestId)=>run({text,requestId,masterId:'owner',conversationId:'chat'});
 await send('new','1');await send('new again','2');
 plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',status:'ready'};
 const selected=await send('ready','3');assert.equal(selected.kind,'selection');
 const buttons=telegramPresentation(selected).reply_markup.inline_keyboard.flat();assert.equal(buttons.length,3);assert.ok(buttons.every(b=>Buffer.byteLength(b.callback_data)<=64));
 assert.equal((await send(`/deny ${selected.selection.token}`,'4')).reply,'Amal bekor qilindi.');
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_jobs WHERE status='ready'")).rows[0].n,0);
 const again=await send('ready','5');const updated=await send(`/pick ${again.selection.token} 0`,'6');assert.equal(updated.kind,'updated');
 assert.deepEqual(await send(`/pick ${again.selection.token} 0`,'6'),updated);
 assert.equal((await send(`/pick ${again.selection.token} 0`,'7')).kind,'expired_button');
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_jobs WHERE status='ready'")).rows[0].n,1);
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_events WHERE event_type='updated'")).rows[0].n,1);
 const pending=await send('ready','8');await db.execute({sql:'UPDATE repair_jobs SET price_uzs=123 WHERE id=?',args:[pending.selection.candidates[0].id]});
 assert.equal((await send(`/pick ${pending.selection.token} 0`,'9')).kind,'cancelled_confirmation');
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_events WHERE event_type='updated'")).rows[0].n,1);
}));
test('selection buttons expire without deleting persistent conversation state',()=>withDb(async db=>{
 let time=Date.parse('2026-11-14T10:00:00Z');let plan=create;
 const run=commandService({db,parse:async()=>plan,now:()=>time});const send=(text,id)=>run({text,requestId:id,masterId:'owner',conversationId:'chat'});
 await send('new','1');await send('new again','2');plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',status:'delivered'};
 const selected=await send('delivered','3');assert.equal(selected.kind,'selection');time+=16*60*1000;
 assert.equal((await send(`/pick ${selected.selection.token} 0`,'4')).kind,'cancelled_confirmation');
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_jobs WHERE status='received'")).rows[0].n,2);
 const state=JSON.parse((await db.execute('SELECT state_json FROM conversation_state')).rows[0].state_json);assert.ok(state.active_repair);assert.ok(!state.selection);
}));
test('legacy confirmation buttons remain token-bound and reject changed snapshots',()=>withDb(async db=>{
 let plan=create;const run=commandService({db,parse:async()=>plan});const send=(text,id)=>run({text,requestId:id,masterId:'owner',conversationId:'chat'});
 const saved=await send('new','1');
 const old=proposal(saved.repair,{price_uzs:800000},Date.now());
 const setProposal=async p=>{const state=JSON.parse((await db.execute('SELECT state_json FROM conversation_state')).rows[0].state_json);state.confirmation=p;await db.execute({sql:'UPDATE conversation_state SET state_json=?,revision=revision+1',args:[JSON.stringify(state)]});};
 await setProposal(old);
 assert.equal((await send('/confirm 11111111-1111-4111-8111-111111111111','2')).kind,'expired_button');
 await db.execute({sql:'UPDATE repair_jobs SET price_uzs=123 WHERE id=?',args:[saved.repair.id]});
 assert.equal((await send(`/confirm ${old.token}`,'3')).kind,'cancelled_confirmation');
 const row=(await db.execute({sql:'SELECT * FROM repair_jobs WHERE id=?',args:[saved.repair.id]})).rows[0];const fresh=proposal(row,{price_uzs:700000},Date.now());await setProposal(fresh);
 const updated=await send(`/confirm ${fresh.token}`,'4');assert.equal(updated.kind,'updated');assert.equal(updated.repair.price_uzs,700000);
 assert.deepEqual(await send(`/confirm ${fresh.token}`,'4'),updated);
 assert.equal((await send(`/confirm ${fresh.token}`,'5')).kind,'expired_button');
}));
test('failed Telegram send retries stored reply without rerunning the command; sent updates are not resent',()=>withDb(async db=>{
 let processes=0,sends=0;
 const deliver=telegramDelivery({db,send:async payload=>{sends++;assert.equal(payload.text,'Saved');if(sends===1)throw Object.assign(new Error('network'),{code:'429'});return 99;}});
 const input={updateId:1,conversationId:'chat',chatId:123,input:'repair',process:async()=>{processes++;return {text:'Saved'};}};
 await assert.rejects(deliver(input));assert.equal(processes,1);
 const failed=(await db.execute('SELECT * FROM telegram_deliveries')).rows[0];assert.equal(failed.status,'failed');assert.equal(failed.last_error_code,'429');
 assert.equal((await deliver(input)).messageId,99);assert.equal(processes,1);assert.equal(sends,2);
 assert.equal((await deliver(input)).duplicate,true);assert.equal(sends,2);
 const sent=(await db.execute('SELECT * FROM telegram_deliveries')).rows[0];assert.equal(sent.status,'sent');assert.equal(sent.telegram_message_id,99);assert.equal(sent.attempts,2);
 await assert.rejects(deliver({...input,input:'different'}),/DELIVERY_CONFLICT/);
}));
test('Telegram serializes a conversation and lets another conversation proceed',()=>withDb(async db=>{
 let release,started;const ready=new Promise(r=>{started=r;});const pause=new Promise(r=>{release=r;});
 const deliver=telegramDelivery({db,send:async()=>99});
 const first=deliver({updateId:1,conversationId:'chat',chatId:1,input:'a',process:async()=>{started();await pause;return {text:'a'};}});await ready;
 await assert.rejects(deliver({updateId:2,conversationId:'chat',chatId:1,input:'b',process:async()=>({text:'b'})}),/EARLIER_MESSAGE_PENDING/);
 assert.equal((await deliver({updateId:3,conversationId:'other',chatId:2,input:'c',process:async()=>({text:'c'})})).messageId,99);
 release();await first;
 assert.equal((await deliver({updateId:2,conversationId:'chat',chatId:1,input:'b',process:async()=>({text:'b'})})).messageId,99);
}));

test('delivery recovers an expired processing lease after a crashed invocation',()=>withDb(async db=>{
 let time=1000;let release,started;const ready=new Promise(r=>{started=r;});const pause=new Promise(r=>{release=r;});
 const deliver=telegramDelivery({db,send:async()=>88,now:()=>time});
 const input={updateId:9,conversationId:'chat',chatId:1,input:'test',process:async()=>({text:'Recovered'})};
 // Simulate a previous dead invocation with a matching persisted update and lease.
 const {createHash}=await import('node:crypto');const hash=createHash('sha256').update(JSON.stringify({conversationId:'chat',chatId:1,input:'test'})).digest('hex');
 await db.execute({sql:"INSERT INTO telegram_deliveries(update_id,conversation_id,input_hash,status,lease_until,created_at) VALUES(?,?,?,'processing',?,?)",args:[9,'chat',hash,60000,0]});
 await db.execute({sql:'INSERT INTO telegram_locks(conversation_id,update_id,lease_until,lease_token) VALUES(?,?,?,?)',args:['chat',9,60000,'dead-worker']});
 await assert.rejects(deliver(input),/CONVERSATION_BUSY/);time=61000;
 assert.equal((await deliver(input)).messageId,88);
}));

test('audit failures roll back repair writes, state, and command cache together',()=>withDb(async db=>{
 await db.execute('DROP TABLE repair_events');
 const run=commandService({db,parse:async()=>create});
 await assert.rejects(run({text:'create',requestId:'1',masterId:'owner',conversationId:'chat'}));
 for(const table of ['repair_jobs','conversation_state','command_requests'])assert.equal((await db.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,0);
}));

test('button cleanup removes earlier keyboards and clicked message buttons but preserves the new reply keyboard',()=>withDb(async db=>{
 const {telegramButtonCleanup}=await import('../src/telegram-ui.js');
 const payload={chat_id:123,text:'Confirm?',reply_markup:{inline_keyboard:[[{text:'Yes',callback_data:'test'}]]}};
 for(const [id,conversation]of [[1,'chat'],[2,'chat'],[3,'other'],[4,'chat']])await db.execute({sql:"INSERT INTO telegram_deliveries(update_id,conversation_id,input_hash,status,reply_text,telegram_message_id,created_at) VALUES(?,?,?,'sent',?,?,?)",args:[id,conversation,'hash',JSON.stringify(payload),100+id,id]});
 const calls=[];const cleanup=telegramButtonCleanup({db,token:'test-token',fetcher:async(_url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});}});
 await cleanup({conversationId:'chat',updateId:2,chatId:123,sourceMessageId:99});
 assert.deepEqual(calls.map(r=>r.message_id).sort((a,b)=>a-b),[99,101]);assert.ok(calls.every(r=>r.reply_markup.inline_keyboard.length===0));
 const rows=(await db.execute('SELECT * FROM telegram_deliveries ORDER BY update_id')).rows;
 assert.ok(!JSON.parse(rows[0].reply_text).reply_markup);assert.ok(JSON.parse(rows[1].reply_text).reply_markup);assert.ok(JSON.parse(rows[2].reply_text).reply_markup);assert.ok(JSON.parse(rows[3].reply_text).reply_markup);
 calls.length=0;await cleanup({conversationId:'chat',updateId:2,chatId:123});assert.equal(calls.length,0);
}));
test('already removed keyboards are harmless while temporary Telegram failures remain retryable',()=>withDb(async db=>{
 const {telegramButtonCleanup}=await import('../src/telegram-ui.js');
 const harmless=telegramButtonCleanup({db,token:'test',fetcher:async()=>Response.json({ok:false,description:'Bad Request: message is not modified'},{status:400})});
 await harmless({conversationId:'chat',updateId:1,chatId:123,sourceMessageId:99});
 const failing=telegramButtonCleanup({db,token:'test',fetcher:async()=>Response.json({ok:false,error_code:429},{status:429})});
 await assert.rejects(failing({conversationId:'chat',updateId:1,chatId:123,sourceMessageId:99}),/TELEGRAM_BUTTON_CLEANUP_FAILED/);
}));
