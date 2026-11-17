import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telegramWebhook} from '../src/telegram.js';
import {telegramButtonProgress} from '../src/telegram-ui.js';
test('loading replaces the keyboard and restores original controls on failure',async()=>{
 const calls=[];const callback={data:'pul_confirm:'+crypto.randomUUID(),message:{message_id:10,chat:{id:7},reply_markup:{inline_keyboard:[[{text:'Tasdiqlash',style:'success',callback_data:'original'}]]}}};
 const progress=telegramButtonProgress({token:'fixture',fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({ok:true});}});
 const restore=await progress(callback);assert.equal(calls[0].reply_markup.inline_keyboard[0][0].text,'Bajarilmoqda…');await restore();assert.deepEqual(calls[1].reply_markup,callback.message.reply_markup);
});
test('authorized callbacks show processing and typing; failures restore controls',async()=>{
 let typing=0,progress=0,restored=0;const env={TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_MASTERS:'{"7":"owner"}'};
 const handler=telegramWebhook({env,runCommand:async()=>{throw new Error('fixture');},typing:async()=>{typing++;},buttonProgress:async()=>{progress++;return async()=>{restored++;};}});
 const res={setHeader(){},status(n){this.code=n;return this;},json(){}};
 const update={update_id:1,callback_query:{id:'callback',from:{id:7},data:'confirm:'+crypto.randomUUID(),message:{message_id:4,chat:{id:7,type:'private'}}}};
 await handler({body:update,get:()=> 'fixture'},res);assert.equal(res.code,503);assert.equal(typing,1);assert.equal(progress,1);assert.equal(restored,1);
 update.callback_query.from.id=8;await handler({body:update,get:()=> 'fixture'},res);assert.equal(typing,1);assert.equal(progress,1);
});
