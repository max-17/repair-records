import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Product} from '../src/lib/types';

test('customer retrieval keeps public availability and strict filters, follows product edits and retrieves only public knowledge',async()=>{
 const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),'customer-rag-'));const local=process.env.INVENTORY_LOCAL_ONLY;let database:typeof import('../src/lib/db')|undefined;
 try{
  process.chdir(folder);process.env.INVENTORY_LOCAL_ONLY='true';process.env.CUSTOMER_SEMANTIC_SEARCH='false';
  database=await import('../src/lib/db');
  const {initializeInventory}=await import('../src/lib/inventory');await initializeInventory();
  const {retrieveProducts,retrieveKnowledge,initializeCustomerRetrieval,defaultSearchPreferences}=await import('../src/lib/customer-retrieval');
  const base:Product={purchasePrice:123456,id:'rag-phone',name:'FixturePhone Alpha',category:'Smartfonlar',brand:'Fixture',price:4000000,oldPrice:0,stock:2,image:'',images:[],description:'AMOLED ekran va kuchli kamera',featured:false,published:true,color:'Qora',ramGb:8,storageGb:256,condition:'new',sku:'RAG-A',barcode:'RAG-A'};
  // Created before the FTS index: initialization must backfill existing rows.
  await database.saveProduct(base);await initializeCustomerRetrieval();await initializeCustomerRetrieval();
  const hidden={...base,id:'rag-hidden',modelId:'',sku:'RAG-H',barcode:'RAG-H',published:false,price:1000000};await database.saveProduct(hidden);
  const empty={...base,id:'rag-empty',modelId:'',sku:'RAG-E',barcode:'RAG-E',stock:0};await database.saveProduct(empty);
  const used={...base,id:'rag-used',sku:'RAG-U',barcode:'RAG-U',price:3000000,condition:'used' as const};await database.saveProduct(used);
  const query={...defaultSearchPreferences,query:'FixturePhone'};
  const found=await retrieveProducts(query);assert(found.every(p=>!Object.hasOwn(p,'purchasePrice')));assert.deepEqual(new Set(found.map(p=>p.id)),new Set([base.id,used.id]));
  assert.deepEqual((await retrieveProducts({...query,maxPrice:3500000})).map(p=>p.id),[used.id]);
  const {semanticIndex}=await import('../src/lib/customer-semantic');const originalSearch=semanticIndex.search;const oldKey=process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  try{process.env.CUSTOMER_SEMANTIC_SEARCH='true';process.env.GOOGLE_GENERATIVE_AI_API_KEY='offline-fixture';semanticIndex.search=async()=>{throw new Error('sensitive provider detail must not escape');};assert.deepEqual((await retrieveProducts({...query,maxPrice:3500000})).map(p=>p.id),[used.id]);}
  finally{semanticIndex.search=originalSearch;process.env.CUSTOMER_SEMANTIC_SEARCH='false';if(oldKey===undefined)delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;else process.env.GOOGLE_GENERATIVE_AI_API_KEY=oldKey;}

  assert.equal((await retrieveProducts({...query,maxPrice:2000000})).length,0);
  assert.deepEqual((await retrieveProducts({...query,condition:'new',ramGb:8,storageGb:256,color:'qora'})).map(p=>p.id),[base.id]);
  assert.equal((await retrieveProducts({...query,storageGb:512})).length,0);
  assert.deepEqual((await retrieveProducts({...query,sort:'price_desc'})).map(p=>p.id),[base.id,used.id]);
  assert.equal((await retrieveProducts({...query,query:'FixturePhone kerakmikan',maxPrice:3500000}))[0].id,used.id);
  assert.equal((await retrieveProducts({...query,query:'FixturePhone 99'})).length,0);
  // Untrusted punctuation cannot become FTS syntax or SQL.
  assert.equal((await retrieveProducts({...query,query:'" OR * (NOT) ; DROP TABLE products -- FixturePhone',maxPrice:3500000}))[0].id,used.id);
  await database.saveProduct({...base,description:'Yangi kamerafokus belgisi'});
  assert.equal((await retrieveProducts({...defaultSearchPreferences,query:'kamerafokus'}))[0].id,base.id);
  await database.db.execute({sql:'UPDATE products SET stock=0 WHERE id=?',args:[base.id]});
  assert.equal((await retrieveProducts({...defaultSearchPreferences,query:'kamerafokus'})).length,0);
  await database.deleteProduct(used.id);assert.equal((await retrieveProducts(query)).length,0);
  await database.db.execute({sql:'INSERT INTO customer_bot_settings(id,knowledge) VALUES (1,?)',args:['Yetkazib berish: Toshkent ichida 25 000 so‘m.\n\nKafolat: yangi telefonlarga 12 oy kafolat.\n\nTo‘lov tafsilotlarini do‘kondan so‘rang.']});
  const knowledge=await retrieveKnowledge('yetkazib berish');assert(knowledge.some(d=>d.text.includes('25 000')));assert(knowledge.every(d=>!d.text.includes('RAG-')));
  const contact=await retrieveKnowledge('manzil telefon');assert(contact.some(d=>d.id==='shop:contact'));
  await assert.rejects(retrieveProducts({...query,maxPrice:-1}),/Invalid search filter/);
 }finally{database?.db.close();process.chdir(cwd);if(local===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=local;await rm(folder,{recursive:true,force:true});}
});
