import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { resolve, basename } from 'node:path';
import { unlink } from 'node:fs/promises';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3001';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local tests only');
const prefix=`inventory-test-${crypto.randomUUID()}`;
const productIds=[`${prefix}-a`,`${prefix}-b`,`${prefix}-conflict`];
const codes=[`${prefix}-code`];let imagePath;
const db=createClient({url:`file:${resolve('data/shop.db').replaceAll('\\','/')}`});
async function request(path,method='GET',data){const response=await fetch(base+path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});return {status:response.status,data:await response.json()};}
const product={id:productIds[0],name:'Inventory test laptop',category:'Noutbuklar',brand:'Test',price:100,oldPrice:0,stock:0,image:'',images:[],description:'Temporary test',featured:false,published:false};
const change=(type,quantity,extra={})=>({id:crypto.randomUUID(),productId:product.id,type,quantity,note:prefix,...extra});
try{
  assert.equal((await request('/api/inventory')).status,200);
  assert.equal((await request('/api/uploadthing')).status,403);
  const form=new FormData();form.append('files',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')],'test.png',{type:'image/png'}));
  const upload=await fetch(base+'/api/local-images',{method:'POST',body:form});assert.equal(upload.status,200);
  const images=await upload.json();imagePath=images[0].ufsUrl;assert.match(imagePath,/^\/uploads\//);assert.equal((await fetch(base+imagePath)).status,200);
  product.image=imagePath;product.images=[imagePath];
  assert.equal((await request('/api/products','POST',{...product,inventoryCode:codes[0]})).status,200);
  assert.equal((await request('/api/products','POST',{...product,id:productIds[1]})).status,200);
  const added=change('in',5);assert.equal((await request('/api/inventory','POST',added)).data.after,5);
  assert.equal((await request('/api/inventory','POST',added)).data.after,5,'Retry must not duplicate');
  assert.equal((await request('/api/inventory','POST',{...added,quantity:6})).status,409,'Idempotency key cannot change payload');
  assert.equal((await request('/api/inventory','POST',change('out',6))).status,409);
  assert.equal((await request('/api/inventory','POST',change('in',-1))).status,400);
  assert.equal((await request('/api/inventory','POST',change('in',1.5))).status,400);
  assert.equal((await request('/api/inventory','POST',change('out',1))).data.after,4);
  assert.equal((await request('/api/inventory','POST',change('count',3))).data.after,3);
  const concurrent=await Promise.all([request('/api/inventory','POST',change('out',2)),request('/api/inventory','POST',change('out',2))]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409],'Concurrent withdrawals must not oversell');
  assert.equal((await request('/api/products','POST',{...product,stock:99})).status,200);
  let inventory=(await request('/api/inventory')).data;
  assert.equal(inventory.products.find(p=>p.id===product.id).stock,1,'Catalog edits must not overwrite stock');
  assert.equal(inventory.codes.find(c=>c.code===codes[0]).productId,product.id);
  assert.equal((await request('/api/inventory/codes','POST',{code:codes[0],productId:productIds[1]})).status,409);
  assert.equal((await request('/api/products','POST',{...product,id:productIds[2],inventoryCode:codes[0]})).status,409);
  inventory=(await request('/api/inventory')).data;assert(!inventory.products.some(p=>p.id===productIds[2]),'Conflicting assignment must roll back new product');
  const generated=await request('/api/inventory/codes','POST',{action:'generate',count:2});assert.equal(generated.status,200);assert.equal(new Set(generated.data.codes).size,2);codes.push(...generated.data.codes);
  for(const code of generated.data.codes)assert.match(code,/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal((await request('/api/inventory/codes','POST',{code:codes[1],productId:productIds[1]})).status,200);
  assert.equal((await request('/api/inventory','POST',change('out',1))).data.after,0);
  assert.equal((await request('/api/inventory','POST',change('out',1))).status,409);
  assert.equal((await request(`/api/products/${product.id}`,'DELETE')).status,200);
  inventory=(await request('/api/inventory')).data;
  assert(inventory.movements.some(m=>m.productId===product.id),'Deleting a product must preserve history');
  assert.equal(inventory.codes.find(c=>c.code===codes[0]).productId,null);
  console.log('PASS: local uploads, QR creation/assignment, atomic stock changes, retry safety, concurrency, validation, edit isolation and history.');
}finally{
  for(const id of productIds){await db.execute({sql:'DELETE FROM stock_movements WHERE product_id=?',args:[id]});await db.execute({sql:'DELETE FROM products WHERE id=?',args:[id]});}
  for(const code of codes)await db.execute({sql:'DELETE FROM inventory_codes WHERE code=?',args:[code]});
  db.close();if(imagePath)await unlink(resolve('public/uploads',basename(imagePath))).catch(()=>{});
}
