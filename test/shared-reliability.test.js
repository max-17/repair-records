import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {claimConversationLease,renewConversationLease,releaseConversationLease,withOwnedLease,deliverWithLease,classifyDeliveryFailure} from '../shared/reliability.js';

test('both lease adapters reject overlap, protect replacement owners and prevent stale cache writes or delivery acknowledgements',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shared-lease-'));const db=createClient({url:`file:${join(dir,'test.db')}`});
 try{
  await db.batch([
   'CREATE TABLE telegram_locks(conversation_id TEXT PRIMARY KEY,update_id INTEGER,lease_until INTEGER,lease_token TEXT)',
   'CREATE TABLE customer_chat_locks(chat_id TEXT PRIMARY KEY,update_id INTEGER,lease_until INTEGER,token TEXT)',
   'CREATE TABLE marker(id TEXT PRIMARY KEY,status TEXT)',
  ],'write');
  for(const kind of ['staff','customer']){
   const a={kind,scope:'chat',requestId:1,token:'owner-a',now:1000,durationMs:100};
   const b={...a,requestId:2,token:'owner-b',now:1050};
   assert.equal(await claimConversationLease(db,a),true);
   assert.equal(await claimConversationLease(db,b),false);
   b.now=1100;assert.equal(await claimConversationLease(db,b),true);
   await releaseConversationLease(db,a);
   await assert.rejects(renewConversationLease(db,a),/DELIVERY_LEASE_LOST/);
   let changed=false;
   await assert.rejects(withOwnedLease(db,a,async()=>{changed=true;}),/DELIVERY_LEASE_LOST/);
   assert.equal(changed,false);
   await withOwnedLease(db,b,tx=>tx.execute({sql:'INSERT INTO marker(id,status) VALUES(?,?)',args:[kind,'prepared']}));
   let sends=0;const c={...b,requestId:3,token:'owner-c',now:1300};
   await assert.rejects(deliverWithLease({db,lease:{...b,now:1150},payload:{text:'prepared'},send:async()=>{sends++;assert.equal(await claimConversationLease(db,c),true);return 99;},acknowledge:async(_messageId,guard)=>{
    const result=await db.execute({sql:`UPDATE marker SET status='sent' WHERE id=? AND ${guard.sql}`,args:[kind,...guard.args]});return result.rowsAffected>0;
   }}),/DELIVERY_LEASE_LOST/);
   assert.equal(sends,1);assert.equal((await db.execute({sql:'SELECT status FROM marker WHERE id=?',args:[kind]})).rows[0].status,'prepared');
   await releaseConversationLease(db,b);await renewConversationLease(db,c);await releaseConversationLease(db,c);
  }
  await assert.rejects(claimConversationLease(db,{kind:'staff;DROP TABLE marker',scope:'x',requestId:4,token:'x',now:1,durationMs:1}),/INVALID_LEASE_STORE/);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('delivery classification distinguishes explicit rejections from unknown outcomes and sanitizes stored codes',()=>{
 assert.deepEqual(classifyDeliveryFailure(new Error('timeout')),{status:'uncertain',retryable:false,code:'processing_failed'});
 assert.deepEqual(classifyDeliveryFailure({ambiguous:false,retryable:true,code:429}),{status:'failed',retryable:true,code:'429'});
 assert.equal(classifyDeliveryFailure({ambiguous:true,code:'ENETRESET'}).status,'uncertain');
 assert.equal(classifyDeliveryFailure({code:'https://secret.example/token'}).code,'processing_failed');
});
