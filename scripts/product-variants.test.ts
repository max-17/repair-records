import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {variantDescription,groupCatalog} from '../src/lib/product-variants';
import type {Product} from '../src/lib/types';
test('model variations keep separate identities and inventory, reject duplicates and preserve the selected variant in sale history',async()=>{
 const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),'variants-'));let database:typeof import('../src/lib/db')|undefined;const local=process.env.INVENTORY_LOCAL_ONLY;
 try{
  process.chdir(folder);process.env.INVENTORY_LOCAL_ONLY='true';database=await import('../src/lib/db');
  const {initializeInventory,getInventory}=await import('../src/lib/inventory');const {confirmSale}=await import('../src/lib/sales');await initializeInventory();
  const phone:Product={id:'variant-a',name:'Fixture S24',category:'Smartfonlar',brand:'Fixture',price:100,oldPrice:0,stock:3,image:'',images:[],description:'',featured:false,published:true,color:'Qora',ramGb:8,storageGb:256,condition:'new',sku:'V-A',barcode:'VARIANT-A'};
  await database.saveProduct(phone);assert(phone.modelId);
  const second:Product={...phone,id:'variant-b',sku:'V-B',barcode:'VARIANT-B',stock:2,price:80,condition:'used',inventoryCode:undefined};await database.saveProduct(second);
  const third:Product={...phone,id:'variant-c',sku:'V-C',barcode:'VARIANT-C',stock:4,price:140,storageGb:512,inventoryCode:undefined};await database.saveProduct(third);
  assert.equal(second.modelId,phone.modelId);assert.equal(variantDescription(phone),'Qora · 8/256 GB · Yangi');
  const before=(await database.getProducts()).filter(p=>p.modelId===phone.modelId);assert.equal(before.length,3);assert.equal(groupCatalog(before).length,1);
  const codes=(await getInventory()).codes;assert.notEqual(codes.find(c=>c.productId===phone.id)?.code,codes.find(c=>c.productId===second.id)?.code);
  await assert.rejects(database.saveProduct({...phone,id:'duplicate',sku:'V-D',barcode:'VARIANT-D',color:' qora '}),/PRODUCT_VARIANT_CONFLICT/);
  await assert.rejects(database.saveProduct({...phone,id:'wrong-brand',sku:'V-E',barcode:'VARIANT-E',brand:'Other',color:'Oq'}),/PRODUCT_MODEL_MISMATCH/);
  await assert.rejects(database.saveProduct({...phone,id:'missing-model',modelId:'nonexistent',sku:'V-F',barcode:'VARIANT-F'}),/PRODUCT_MODEL_NOT_FOUND/);
  const receipt=await confirmSale('variant-sale',[{productId:second.id,quantity:1,unitPrice:80}]);assert.match(receipt.items[0].name,/8\/256 GB.*Ishlatilgan/);
  const after=await database.getProducts(true);assert.equal(after.find(p=>p.id===phone.id)!.stock,3);assert.equal(after.find(p=>p.id===second.id)!.stock,1);assert.equal(after.find(p=>p.id===third.id)!.stock,4);
  await database.deleteProduct(phone.id);assert.equal((await database.getProducts(true)).filter(p=>p.modelId===second.modelId).length,2);
  await database.saveProduct({...second,price:90});assert.equal((await database.getProducts(true)).find(p=>p.id===second.id)!.price,90);
 }finally{database?.db.close();process.chdir(cwd);if(local===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=local;await rm(folder,{recursive:true,force:true});}
});
