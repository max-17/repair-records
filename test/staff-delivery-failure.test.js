import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setup} from '../src/db.js';
import {telegramDelivery} from '../src/delivery.js';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'staff-delivery-'));const db=createClient({url:`file:${join(dir,'db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
test('repeated processing failure becomes a durable notice and unblocks later commands',()=>fixture(async db=>{
 let calls=0,sends=[];const deliver=telegramDelivery({db,send:async p=>{sends.push(p);return sends.length;}});
 const input={updateId:1,conversationId:'test',chatId:7,input:'broken',process:async()=>{calls++;throw new Error('unavailable');}};
 for(let i=0;i<3;i++)await assert.rejects(deliver(input));
 assert.equal(calls,3);assert.equal(sends.length,0);
 await deliver(input);assert.equal(calls,3);assert.match(sends[0].text,/Natijani tekshira olmadim/);
 await deliver(input);assert.equal(sends.length,1);
 await deliver({updateId:2,conversationId:'test',chatId:7,input:'/pul',process:async()=>({text:'Pul bo‘limi'})});assert.equal(sends.at(-1).text,'Pul bo‘limi');
 assert.equal((await db.execute("SELECT count(*) AS n FROM telegram_deliveries WHERE status='sent'")).rows[0].n,2);
}));
test('rejected sends retry cached reply even after processing retry budget',()=>fixture(async db=>{
 let calls=0,sends=0;const deliver=telegramDelivery({db,send:async p=>{assert.equal(p.text,'Original result');if(++sends<=4)throw Object.assign(new Error('rate limited'),{code:'429',ambiguous:false});return 7;}});
 const input={updateId:1,conversationId:'test',chatId:7,input:'message',process:async()=>{calls++;return {text:'Original result'};}};
 for(let i=0;i<4;i++)await assert.rejects(deliver(input));
 await deliver(input);assert.equal(calls,1);assert.equal(sends,5);
}));

test('input error handling uses type identity even when the constructor name differs',()=>fixture(async db=>{
 const {pulService}=await import('../src/pul.js');const {SpeechInputError}=await import('../src/speech.js');
 class RenamedInputError extends SpeechInputError{}
 const message='Xabarni qayta ishlash uchun sozlamalarni tekshiring.';
 const run=pulService({db,env:{},parse:async()=>{throw new RenamedInputError(message);}});
 const result=await run({text:'Test command',requestId:'input-error-test',conversationId:'test',receivedBy:'7'});
 assert.equal(result.text,message);assert.equal((await db.execute('SELECT count(*) AS n FROM pul_records')).rows[0].n,0);
}));
