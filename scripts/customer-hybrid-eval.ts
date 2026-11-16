import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function run(){
 if(!process.argv.includes('--live'))throw new Error('Explicit --live required.');
 const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),'hybrid-live-'));let client:{close:()=>void}|undefined;
 try{
  process.chdir(folder);process.env.INVENTORY_LOCAL_ONLY='true';
  const {db,saveProduct}=await import('../src/lib/db');client=db;
  const {initializeInventory}=await import('../src/lib/inventory');await initializeInventory();
  const {refreshSemanticIndex}=await import('../src/lib/customer-semantic');
  const {retrieveProducts,defaultSearchPreferences}=await import('../src/lib/customer-retrieval');
  const base={category:'Smartfonlar',brand:'SemanticFixture',price:2000000,purchasePrice:123456,oldPrice:0,stock:2,image:'',images:[],featured:false,published:true};
  await saveProduct({...base,id:'semantic-battery',name:'Endurance Phone',description:'Smartphone with a 6000 mAh battery designed for long battery endurance.'});
  await saveProduct({...base,id:'semantic-stylus',name:'Notes Tablet',category:'Planshetlar',description:'Tablet for handwritten class notes using a stylus.'});
  const status=await refreshSemanticIndex({productIds:['semantic-battery','semantic-stylus'],includeKnowledge:false,limit:2});assert.equal(status.ready,2);
  const pref={...defaultSearchPreferences,query:'Rozetka izlab yurmasdan kun bo‘yi ishlatish',brand:'SemanticFixture',maxPrice:2500000};
  const found=await retrieveProducts(pref);assert.equal(found[0]?.id,'semantic-battery');assert(found.every(p=>!Object.hasOwn(p,'purchasePrice')));
  assert.equal((await retrieveProducts({...pref,maxPrice:1000000})).length,0);
  await db.execute("UPDATE products SET stock=0 WHERE id='semantic-battery'");
  assert(!(await retrieveProducts(pref)).some(p=>p.id==='semantic-battery'));
  console.log('PASS: live hybrid retrieval finds Uzbek meaning in English product facts, enforces budget/stock and never returns purchase cost.');
 }finally{client?.close();process.chdir(cwd);await rm(folder,{recursive:true,force:true});}
}
run().catch(error=>{console.error('Live hybrid evaluation did not complete',{name:error.name,code:error.code||null});process.exitCode=1;});
