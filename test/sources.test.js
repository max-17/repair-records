import {test} from 'node:test';
import assert from 'node:assert/strict';
import {audioArchive} from '../src/pul-sources.js';
test('production audio uploads are private and retain a content hash, never a public URL',async()=>{
 let options,file;
 const store=audioArchive({NODE_ENV:'production',UPLOADTHING_TOKEN:'fixture'},{api:{uploadFiles:async(f,o)=>{file=f;options=o;return {data:{key:'private-key',ufsUrl:'https://public.invalid'}};}}});
 const saved=await store(Buffer.from('OggS'),'request');
 assert.equal(options.acl,'private');assert.equal(file.type,'audio/ogg');assert.equal(saved.key,'private-key');assert.match(saved.hash,/^[a-f0-9]{64}$/);assert.equal(saved.ufsUrl,undefined);
 await assert.rejects(audioArchive({NODE_ENV:'production'})(Buffer.from('OggS'),'request'),/NOT_CONFIGURED/);
 await assert.rejects(audioArchive({NODE_ENV:'production',UPLOADTHING_TOKEN:'fixture'},{api:{uploadFiles:async()=>({error:{code:'FORBIDDEN'}})}})(Buffer.from('OggS'),'request'),/UPLOAD_FAILED/);
});
