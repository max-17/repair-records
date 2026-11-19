import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setup} from '../src/db.js';
import {telegramProcessingNotice} from '../src/telegram-processing.js';
import {telegramWebhook} from '../src/telegram.js';
import {telegramDelivery,telegramSender} from '../src/delivery.js';
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'processing-notice-')),db=createClient({url:`file:${join(directory,'db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(directory,{recursive:true,force:true});}}
test('processing notice precedes work, disappears after reply and is not duplicated on webhook retry',()=>fixture(async db=>{
 const original=global.fetch,events=[];let id=10;
 try{global.fetch=async(url,opts)=>{const body=JSON.parse(opts.body),method=String(url).split('/').pop();events.push(method==='deleteMessage'?'delete':body.text==='Xabaringizni ko‘rib chiqyapman…'?'notice':'reply');return Response.json({ok:true,result:method==='deleteMessage'?true:{message_id:++id}});};
 const processingNotice=telegramProcessingNotice({db,token:'fixture'});
 const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_MASTERS:'{"7":"owner"}'},processingNotice,runMenu:async()=>({section:'money'}),runCommand:async()=>({reply:'unused'}),runPul:async()=>{events.push('work');return {text:'Qoralama'};},deliver:telegramDelivery({db,send:telegramSender('fixture')})});
 const req={get:()=> 'fixture',body:{update_id:1,message:{message_id:1,chat:{id:7,type:'private'},from:{id:7},text:'Sotuv yoz'}}};const res={setHeader(){},status(n){this.code=n;return this;},json(){events.push('ack');return this;}};
 await handler(req,res);assert.deepEqual(events,['notice','work','reply','delete','ack']);
 await handler(req,res);assert.deepEqual(events,['notice','work','reply','delete','ack','ack']);
 assert.equal((await db.execute('SELECT status FROM telegram_processing_notices')).rows[0].status,'removed');
 }finally{global.fetch=original;}
}));
test('uncertain progress send is not repeated; cosmetic errors do not affect command execution',()=>fixture(async db=>{
 let calls=0;const notice=telegramProcessingNotice({db,token:'fixture',fetcher:async()=>{calls++;throw new Error('lost acknowledgement');}});
 await notice.start({updateId:1,chatId:7});await notice.start({updateId:1,chatId:7});assert.equal(calls,1);assert.equal((await db.execute('SELECT status FROM telegram_processing_notices')).rows[0].status,'unknown');
 let ran=false;const handler=telegramWebhook({env:{TELEGRAM_WEBHOOK_SECRET:'fixture',TELEGRAM_MASTERS:'{"7":"owner"}'},processingNotice:{start:async()=>{throw new Error('cosmetic');},finish:async()=>{throw new Error('cosmetic');}},runCommand:async()=>{ran=true;return {reply:'Done',kind:'clarify'};}});
 const res={setHeader(){},status(){return this;},json(value){this.value=value;return this;}};await handler({get:()=> 'fixture',body:{update_id:2,message:{chat:{id:7,type:'private'},from:{id:7},text:'hello'}}},res);assert.equal(ran,true);assert.equal(res.value.text,'Done');
}));
test('failed notice deletion is retried without rerunning the delivered command',()=>fixture(async db=>{
 let deletes=0;const notice=telegramProcessingNotice({db,token:'fixture',fetcher:async(url)=>{if(String(url).endsWith('deleteMessage')){deletes++;if(deletes===1)return Response.json({ok:false,error_code:503},{status:503});return Response.json({ok:true,result:true});}return Response.json({ok:true,result:{message_id:99}});}});
 await notice.start({updateId:1,chatId:7});await assert.rejects(notice.finish({updateId:1,chatId:7}));
 await db.execute("INSERT INTO telegram_deliveries(update_id,conversation_id,input_hash,status,created_at) VALUES(1,'chat','hash','sent',0)");
 await notice.start({updateId:1,chatId:7});assert.equal(deletes,2);assert.equal((await db.execute('SELECT status FROM telegram_processing_notices')).rows[0].status,'removed');
}));
