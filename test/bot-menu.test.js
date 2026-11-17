import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {setup} from '../src/db.js';
import {botMenuService,sectionButtons} from '../src/bot-menu.js';
import {telegramWebhook} from '../src/telegram.js';
async function withDb(fn){const directory=await mkdtemp(join(tmpdir(),'bot-commands-'));const db=createClient({url:`file:${join(directory,'test.db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(directory,{recursive:true,force:true});}}
test('slash help removes old keyboards and does not consume ordinary Pul requests or select subsections',()=>withDb(async db=>{
 const run=botMenuService({db}),base={masterId:'owner',conversationId:'chat'};let id=0;const send=text=>run({...base,requestId:String(++id),text});
 const start=await send('/start');assert.equal(start.section,'repair');assert.equal(start.payload.reply_markup.remove_keyboard,true);assert.match(start.payload.text,/\/pul/);assert.match(start.payload.text,/\/tamirlash/);assert.ok(!start.payload.reply_markup.keyboard);
 assert.equal((await send('/pul')).section,'money');
 for(const text of ['Sotuv / xizmat','Qarz daftar','Hisobot','Bekzod 100 ming qarz','Pul','Ta’mirlash']){const result=await send(text);assert.equal(result.section,'money');assert.equal(result.payload,null);}
 assert.equal((await send('/start')).section,'money');assert.equal((await send('/tamirlash')).section,'repair');assert.equal((await send('/pul@repair_bot')).section,'money');assert.equal((await send('/repair')).section,'repair');
}));
test('section commands persist per worker and cancel pending proposals once, without replaying an old switch',()=>withDb(async db=>{
 const run=botMenuService({db}),base={masterId:'owner',conversationId:'chat'};
 const token=crypto.randomUUID();await db.execute({sql:'INSERT INTO voice_drafts(master_id,conversation_id,token,transcript,status,created_at) VALUES(?,?,?,?,?,?)',args:['owner','chat',token,'test','pending',Date.now()]});
 await db.execute({sql:'INSERT INTO conversation_state VALUES(?,?,?,?)',args:['owner','chat','{"phase":"confirmation"}',1]});
 await db.execute({sql:'INSERT INTO pul_drafts(shop_id,conversation_id,token,state_json) VALUES(?,?,?,?)',args:['main','chat',token,'{"phase":"pending"}']});
 const transition={...base,requestId:'switch',text:'/pul'};await run(transition);
 assert.equal((await db.execute('SELECT status FROM voice_drafts')).rows[0].status,'cancelled');assert.equal((await db.execute('SELECT * FROM conversation_state')).rows.length,0);assert.equal(JSON.parse((await db.execute('SELECT state_json FROM pul_drafts')).rows[0].state_json).phase,'cancelled');
 assert.equal((await botMenuService({db})({...base,requestId:'restart',text:'test'})).section,'money');assert.equal((await run({masterId:'other',conversationId:'chat',requestId:'other',text:'test'})).section,'repair');
 await run({...base,requestId:'repair',text:'/tamirlash'});await db.execute({sql:"UPDATE voice_drafts SET status='pending' WHERE master_id=? AND conversation_id=?",args:['owner','chat']});await run(transition);
 assert.equal((await run({...base,requestId:'verify',text:'test'})).section,'repair');assert.equal((await db.execute('SELECT status FROM voice_drafts')).rows[0].status,'pending');
}));
test('legacy subsection rows route to unified Pul without prompting for a menu',()=>withDb(async db=>{
 const run=botMenuService({db});
 for(const section of ['money','sales','debts','reports']){await db.execute({sql:'INSERT INTO staff_bot_sections VALUES(?,?,?) ON CONFLICT(master_id,conversation_id) DO UPDATE SET section=excluded.section',args:['owner','chat',section]});const result=await run({masterId:'owner',conversationId:'chat',requestId:section,text:'Bugungi hisobot'});assert.equal(result.section,'money');assert.equal(result.payload,null);}
 await db.execute("UPDATE staff_bot_sections SET section='menu'");assert.equal((await run({masterId:'owner',conversationId:'chat',requestId:'old-menu',text:'/start'})).section,'repair');
}));
test('authorized commands bypass repair AI and Pul receives every request; unauthorized users cannot switch',()=>withDb(async db=>{
 let commands=0,voices=0;const pul=[];
 const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'test',TELEGRAM_MASTERS:'{"123":"owner"}'},runMenu:botMenuService({db}),runCommand:async()=>{commands++;return {reply:'repair'};},runVoice:async()=>{voices++;return null;},runPul:async input=>{pul.push(input);return {text:'Pul result'};}});
 let id=0;async function send(text,user=123,voice){let payload;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(value){payload=value;return this;}};await handler({get:()=> 'test',body:{update_id:++id,message:{chat:{id:123,type:'private'},from:{id:user},text,voice}}},res);return payload;}
 await send('/pul',999);assert.equal((await db.execute('SELECT * FROM staff_bot_sections')).rows.length,0);
 assert.match((await send('/pul')).text,/Pul bo‘limi/);await send('Qarz daftar');await send('Hisobot');await send(undefined,123,{file_id:'voice'});assert.equal(pul.length,3);assert.equal(pul[0].text,'Qarz daftar');assert.equal(pul[1].text,'Hisobot');assert.equal(pul[2].voice.file_id,'voice');assert.equal(commands,0);assert.equal(voices,0);
 await send('/tamirlash');await send('Bekzod telefon');assert.equal(commands,1);assert.equal(voices,1);
}));

test('section links are inline chat buttons without persistent reply-keyboard fields',()=>{
 const both=sectionButtons();assert.deepEqual(both.inline_keyboard.map(row=>row[0].callback_data),['section:pul','section:tamirlash']);
 assert.equal(both.inline_keyboard[0][0].text,'Pul bo‘limini ochish');assert.equal(both.inline_keyboard[0][0].style,'primary');
 assert.deepEqual(sectionButtons('pul').inline_keyboard.map(row=>row[0].callback_data),['section:pul']);
 assert.deepEqual(sectionButtons('tamirlash').inline_keyboard.map(row=>row[0].callback_data),['section:tamirlash']);
 assert.deepEqual(sectionButtons('money'),sectionButtons('pul'));assert.deepEqual(sectionButtons('repair'),sectionButtons('tamirlash'));
 assert.ok(!('remove_keyboard' in both));assert.ok(!('keyboard' in both));
 both.inline_keyboard[0][0].text='Changed';assert.equal(sectionButtons('pul').inline_keyboard[0][0].text,'Pul bo‘limini ochish');
});
