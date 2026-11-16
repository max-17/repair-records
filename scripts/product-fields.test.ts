import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('product fields migrate legacy rows, retain codes, preserve omitted data and reject identity collisions atomically',async()=>{
 const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),'product-fields-'));let database:typeof import('../src/lib/db')|undefined;
 const local=process.env.INVENTORY_LOCAL_ONLY;
 try{
  process.chdir(folder);process.env.INVENTORY_LOCAL_ONLY='true';
  database=await import('../src/lib/db');
  const {initializeInventory,getInventory}=await import('../src/lib/inventory');
  await initializeInventory();
  const base={id:'phone-a',name:'Phone',category:'Smartfonlar',brand:'Test',price:100,oldPrice:0,stock:3,image:'',images:[],description:'',featured:false,published:false};
  await database.saveProduct(base);
  const oldCode=(await getInventory()).codes.find(c=>c.productId===base.id)!.code;
  const customFields=[{name:'Rang',value:'Qora'},{name:'Xotira',value:'128 GB'}];
  await database.saveProduct({...base,sku:'PHONE-128',barcode:'1234567890123',customFields});
  let saved=(await database.getProducts(true)).find(p=>p.id===base.id)!;
  assert.equal(saved.sku,'PHONE-128');assert.equal(saved.barcode,'1234567890123');assert.deepEqual(saved.customFields,customFields);
  const legacy={...base,price:200,sku:undefined,barcode:undefined,customFields:undefined};
  await database.saveProduct(legacy);
  saved=(await database.getProducts(true)).find(p=>p.id===base.id)!;
  assert.equal(saved.sku,'PHONE-128');assert.deepEqual(saved.customFields,customFields);
  await assert.rejects(database.saveProduct({...base,id:'phone-b',sku:'PHONE-128',barcode:'other'}),/PRODUCT_SKU_CONFLICT/);
  await assert.rejects(database.saveProduct({...base,id:'phone-b',sku:'OTHER',barcode:'1234567890123'}),/PRODUCT_BARCODE_CONFLICT/);
  assert(!(await database.getProducts(true)).some(p=>p.id==='phone-b'));
  await assert.rejects(database.saveProduct({...base,id:'phone-b',barcode:oldCode}),/PRODUCT_BARCODE_CONFLICT/);
  const codes=(await getInventory()).codes.filter(c=>c.productId===base.id).map(c=>c.code);
  assert(codes.includes(oldCode));assert(codes.includes('1234567890123'));
  await database.saveProduct({...base,sku:'',barcode:'',customFields:[]});
  saved=(await database.getProducts(true)).find(p=>p.id===base.id)!;assert.equal(saved.sku,'');assert.deepEqual(saved.customFields,[]);
  assert((await getInventory()).codes.some(c=>c.code===oldCode&&c.productId===base.id));
 }finally{database?.db.close();process.chdir(cwd);if(local===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=local;await rm(folder,{recursive:true,force:true});}
});
