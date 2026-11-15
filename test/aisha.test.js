import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setup} from '../src/db.js';
import {aishaRecognizer,AishaInputError,AishaPendingError,speechRequestKey} from '../src/aisha.js';
import {voiceService} from '../src/speech.js';
async function withDb(fn){const dir=await mkdtemp(join(tmpdir(),'aisha-'));const db=createClient({url:`file:${join(dir,'test.db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
const audio=Buffer.from('OggS');const env={AISHA_API:'test-key'};const context={masterId:'owner',requestId:'123'};
test('Aisha uses developer gateway, Bearer auth, stable idempotency, immediate first poll, and original transcript',()=>withDb(async db=>{
 let calls=0;let uploads=0;let wait=0;
 const run=aishaRecognizer(env,{db,sleep:async()=>{wait++;},fetcher:async(url,options)=>{
  calls++;assert.equal(options.headers.Authorization,'Bearer test-key');
  if(url.endsWith('/v1/stt')){uploads++;assert.match(options.headers['Idempotency-Key'],/^[0-9a-f-]{36}$/);assert.equal(options.body.get('language'),'uz');assert.equal(options.body.get('include_speakers'),'false');return Response.json({id:'stt-job'},{status:202});}
  assert.ok(url.endsWith('/transcriptions/stt-job'));return Response.json({status:'completed',transcript:'Kechagilik analitika.'});
 }});
 assert.equal(await run(audio,context),'Kechagilik analitika.');assert.equal(calls,2);assert.equal(wait,0);assert.equal(uploads,1);
 assert.equal(await run(audio,context),'Kechagilik analitika.');assert.equal(uploads,1);assert.equal(calls,3);
 assert.equal(speechRequestKey('a'),speechRequestKey('a'));assert.notEqual(speechRequestKey('a'),speechRequestKey('b'));
}));
test('pending jobs persist and resume without reupload or command mutation',()=>withDb(async db=>{
 let time=0;let completed=false;let uploads=0;
 const run=aishaRecognizer(env,{db,now:()=>time,sleep:async ms=>{time+=ms;},fetcher:async url=>{
  if(url.endsWith('/v1/stt')){uploads++;return Response.json({id:'pending-job'},{status:202});}
  return Response.json(completed?{status:'completed',transcript:'Kechagilik analitika.'}:{status:'queued'},{headers:{'Retry-After':'10'}});
 }});
 await assert.rejects(run(audio,context),AishaPendingError);assert.equal(uploads,1);
 const service=voiceService({db,transcribeVoice:async()=>{throw new AishaPendingError('still waiting');},runCommand:async()=>{throw new Error('must not run');}});
 await assert.rejects(service({masterId:'owner',conversationId:'chat',requestId:'1',voice:{file_id:'file'}}),AishaPendingError);
 assert.equal((await db.execute('SELECT count(*) AS n FROM command_requests')).rows[0].n,0);
 completed=true;assert.equal(await run(audio,context),'Kechagilik analitika.');assert.equal(uploads,1);
}));
test('Aisha access and balance failures are actionable and do not silently use another provider',async()=>{
 for(const status of [401,402,403,422]){
  const run=aishaRecognizer(env,{fetcher:async()=>new Response('{}',{status})});await assert.rejects(run(audio,context),AishaInputError);
 }
 await assert.rejects(aishaRecognizer({})(audio,context),AishaInputError);
 const unstable=aishaRecognizer(env,{fetcher:async()=>{throw new Error('network');}});await assert.rejects(unstable(audio,context),AishaPendingError);
});
