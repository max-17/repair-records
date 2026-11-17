import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {setup} from '../src/db.js';
import {botMenuService} from '../src/bot-menu.js';
import {telegramWebhook} from '../src/telegram.js';
test('menu persists worker scope, invalidates pending drafts, and does not route Pul into repairs',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bot-menu-'));const db=createClient({url:`file:${join(directory,'test.db')}`});
 try{
  await setup(db);const run=botMenuService({db});const base={masterId:'owner',conversationId:'chat'};let id=0;
  const send=text=>run({...base,requestId:String(++id),text});
  const start=await send('/start');assert.equal(start.section,'menu');assert.equal(start.payload.reply_markup.keyboard[0][1].text,'Pul');
  assert.equal((await send('Pul')).section,'money');assert.equal((await send('Qarz daftar')).section,'debts');
  assert.match((await send('Bekzod 100 ming qarz')).payload.text,/hali ishga tushirilmagan/);
  assert.equal((await botMenuService({db})({...base,requestId:'restart',text:'test'})).section,'debts');
  assert.equal((await run({masterId:'other',conversationId:'chat',requestId:'other',text:'test'})).payload,null);
  assert.equal((await send('Bosh menyu')).section,'menu');assert.equal((await send('Ta’mirlash')).payload.reply_markup.keyboard[0][0].text,'Pul');
  assert.equal((await send('Hisobot')).payload,null);
  const token=crypto.randomUUID();await db.execute({sql:'INSERT INTO voice_drafts VALUES(?,?,?,?,?,?)',args:['owner','chat',token,'test','pending',Date.now()]});
  await db.execute({sql:'INSERT INTO conversation_state VALUES(?,?,?,?)',args:['owner','chat','{"phase":"confirmation"}',1]});
  const transition={...base,requestId:'switch',text:'Pul'};await run(transition);
  assert.equal((await db.execute('SELECT status FROM voice_drafts')).rows[0].status,'cancelled');assert.equal((await db.execute('SELECT * FROM conversation_state')).rows.length,0);
  await send('/repair');await run(transition);assert.equal((await send('test')).section,'repair');
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
test('authorized menu navigation bypasses voice and repair AI; unauthorized users cannot switch',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'bot-menu-'));const db=createClient({url:`file:${join(directory,'test.db')}`});try{
 await setup(db);let commands=0,voices=0;const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'test',TELEGRAM_MASTERS:'{"123":"owner"}'},runMenu:botMenuService({db}),runCommand:async()=>{commands++;return {reply:'repair'};},runVoice:async()=>{voices++;return null;}});
 let id=0;async function send(text,user=123,voice){let payload;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(value){payload=value;return this;}};await handler({get:()=> 'test',body:{update_id:++id,message:{chat:{id:123,type:'private'},from:{id:user},text,voice}}},res);return payload;}
 await send('Pul',999);assert.equal((await db.execute('SELECT * FROM staff_bot_sections')).rows.length,0);
 assert.match((await send('Pul')).text,/Pul bo‘limi/);await send(undefined,123,{file_id:'voice'});assert.equal(commands,0);assert.equal(voices,0);
 await send('/repair');await send('Bekzod telefon');assert.equal(commands,1);assert.equal(voices,1);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
