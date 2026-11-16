import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSemanticIndex,reciprocalRankFusion,cosineSimilarity} from '../src/lib/customer-semantic';
import {productSearchDocument} from '../src/lib/customer-search-documents';
test('semantic index caches vectors, excludes stale facts, separates model spaces and handles concurrent indexing',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'semantic-index-'));const db=createClient({url:'file:'+join(folder,'test.db')});
 let config={enabled:true,namespace:'test-v1',dimensions:3,model:'fake'};let calls=0;let queryCalls=0;let release:(()=>void)|undefined;
 const embed=async(texts:string[],task:'document'|'query')=>{calls++;if(task==='query'){queryCalls++;return [[1,0,0]];}return texts.map(text=>text.includes('battery')?[1,0,0]:[0,1,0]);};
 const index=createSemanticIndex({db,config:()=>config,embed});const docs=[{id:'phone-battery',text:'6000mAh battery'},{id:'laptop',text:'portable computer'}];
 try{
  assert.equal((await index.sync(docs)).processed,2);assert.equal((await index.sync(docs)).processed,0);assert.equal(calls,1);
  assert.deepEqual((await index.search('kun bo‘yi quvvat',docs)).map(x=>x.id),['phone-battery']);assert.equal(queryCalls,1);
  await createSemanticIndex({db,config:()=>config,embed}).search('kun bo‘yi quvvat',docs);assert.equal(queryCalls,1,'query vectors persist across instances');
  const changed=[{id:'phone-battery',text:'changed unknown facts'},docs[1]];assert.equal((await index.search('kun bo‘yi quvvat',changed)).length,0,'stale vector must not be used');
  await index.sync(changed);assert.equal((await index.search('kun bo‘yi quvvat',changed)).length,0);
  config={...config,namespace:'test-v2'};assert.equal((await index.status(docs)).ready,0);assert.equal((await index.search('same query',docs)).length,0);
  const slow=createSemanticIndex({db,config:()=>config,embed:async texts=>{await new Promise<void>(r=>release=r);return texts.map(()=>[1,0,0]);}});
  const pending=slow.sync(docs);while(!release)await new Promise(r=>setTimeout(r,1));assert.equal((await index.sync(docs)).busy,true);release();await pending;
  config={...config,enabled:false};assert.deepEqual(await index.search('query',docs),[]);
  assert.equal(cosineSimilarity([1,0],[0,1]),0);assert(cosineSimilarity([2,0],[1,0])>.999);
  assert.deepEqual(reciprocalRankFusion(['exact','both'],['both','semantic']),['both','exact','semantic']);
 }finally{db.close();await rm(folder,{recursive:true,force:true});}
});
test('semantic documents contain category facts but never costs or stock',()=>{
 const p={id:'x',name:'Cable',category:'Aksessuarlar',brand:'Fixture',price:100,purchasePrice:10,stock:50,description:'USB-C',oldPrice:0,image:'',featured:false,published:true,categoryValues:{length:2}};
 const doc=productSearchDocument(p,[{id:'length',label:'Uzunligi, metr',type:'number'}]);assert.match(doc.text,/Uzunligi, metr: 2/);assert(!doc.text.includes('purchasePrice'));assert(!doc.text.includes('50'));assert(!doc.text.includes('100'));
});
