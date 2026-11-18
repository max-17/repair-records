import {test} from 'node:test';
import assert from 'node:assert/strict';
import {audioArchive} from '../src/pul-sources.js';
import {archiveLocation,openArchive,sealArchive} from '../src/archive-crypto.js';
const env={NODE_ENV:'production',UPLOADTHING_TOKEN:'fixture',ADMIN_SESSION_SECRET:'persistent-test-secret'};
const payload=Buffer.from('synthetic confidential evidence; no real audio');
test('free storage receives ciphertext only and never requests paid private ACL',async()=>{
 let options,file;const store=audioArchive(env,{api:{uploadFiles:async(f,o)=>{file=f;options=o;return {data:{key:'stored-key',ufsUrl:'https://public.invalid'}};}}});
 const saved=await store(payload,'request');
 assert.equal(options.acl,undefined);assert.equal(file.type,'application/octet-stream');assert.ok(file.name.endsWith('.bin'));assert.match(saved.hash,/^[a-f0-9]{64}$/);assert.equal(saved.ufsUrl,undefined);
 const location=archiveLocation(saved.key),encrypted=Buffer.from(await file.arrayBuffer());assert.equal(location.key,'stored-key');assert.ok(!encrypted.includes(payload));assert.deepEqual(openArchive(encrypted,location.keyId,env,saved.hash),payload);
 await assert.rejects(audioArchive({NODE_ENV:'production'})(payload,'request'),/NOT_CONFIGURED/);
 await assert.rejects(audioArchive({NODE_ENV:'production',UPLOADTHING_TOKEN:'fixture'})(payload,'request'),/NOT_CONFIGURED/);
 await assert.rejects(audioArchive(env,{api:{uploadFiles:async()=>({error:{code:'FORBIDDEN'}})}})(payload,'request'),/UPLOAD_FAILED/);
});
test('archive encryption rejects tampering and wrong keys, supports retained rotation keys',()=>{
 const sealed=sealArchive(payload,env),again=sealArchive(payload,env);assert.notDeepEqual(sealed.bytes,again.bytes);
 const corrupted=Buffer.from(sealed.bytes);corrupted[corrupted.length-1]^=1;assert.throws(()=>openArchive(corrupted,sealed.keyId,env));
 assert.throws(()=>openArchive(sealed.bytes,sealed.keyId,{ADMIN_SESSION_SECRET:'different'}),/KEY_UNAVAILABLE/);
 assert.deepEqual(openArchive(sealed.bytes,sealed.keyId,{ADMIN_SESSION_SECRET:'different',AUDIO_ARCHIVE_PREVIOUS_KEYS:env.ADMIN_SESSION_SECRET}),payload);
 assert.deepEqual(archiveLocation('legacy-private-key'),{key:'legacy-private-key',keyId:null});assert.throws(()=>archiveLocation('enc1.broken'),/INVALID_KEY/);
});
