import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telegramWebhook} from '../src/telegram.js';
import {telegramSender,telegramDelivery} from '../src/delivery.js';
import {createClient} from '@libsql/client';
import {setup} from '../src/db.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
for(const photo of [false,true])test(`confirmed ${photo?'photo caption':'text draft'} is edited in place and cached retries create no receipt`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'confirmation-edit-')),db=createClient({url:`file:${join(directory,'db')}`}),original=global.fetch;const calls=[];let commands=0;
 try{
  await setup(db);global.fetch=async(url,options)=>{calls.push({method:String(url).split('/').pop(),body:JSON.parse(options.body)});return Response.json({ok:true,result:{message_id:15}});};
  const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_MASTERS:'{"7":"owner"}'},runCommand:async()=>({reply:'unused'}),runMenu:async()=>({section:'money'}),runPul:async()=>{commands++;return {text:'iPhone 13 Pro × 1\nSaqlandi.',...(photo?{photo:'image-file'}:{})};},deliver:telegramDelivery({db,send:telegramSender('fixture')})});
  const update={update_id:1,callback_query:{id:'callback',data:'pul_confirm:'+crypto.randomUUID(),from:{id:7},message:{message_id:15,chat:{id:7,type:'private'},...(photo?{photo:[{file_id:'image-file'}]}:{})}}};
  const req={get:()=> 'fixture',body:update};const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
  await handler(req,res);assert.equal(res.code,undefined);assert.equal(calls.length,1);assert.equal(calls[0].method,photo?'editMessageCaption':'editMessageText');assert.equal(calls[0].body.message_id,15);assert.deepEqual(calls[0].body.reply_markup,{inline_keyboard:[]});assert.ok(!Object.hasOwn(calls[0].body,'photo'));assert.match(calls[0].body[photo?'caption':'text'],/Saqlandi/);
  await handler(req,res);assert.equal(commands,1);assert.equal(calls.length,1);assert.equal((await db.execute('SELECT telegram_message_id FROM telegram_deliveries')).rows[0].telegram_message_id,15);
 }finally{global.fetch=original;db.close();await rm(directory,{recursive:true,force:true});}
});
test('already applied Telegram edit is acknowledged without sending a new message',async()=>{
 const original=global.fetch;let calls=0;try{global.fetch=async()=>{calls++;return Response.json({ok:false,error_code:400,description:'Bad Request: message is not modified'},{status:400});};const send=telegramSender('fixture');assert.equal(await send({chat_id:7,text:'Saved',edit_target:{message_id:15,caption:false}}),15);assert.equal(calls,1);}finally{global.fetch=original;}
});
