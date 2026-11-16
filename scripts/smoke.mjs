import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
async function request(path, method='GET', body) {
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
const id=`smoke-${Date.now()}`;
const before=await request('/api/products?all=1');
assert.equal(before.status,200);assert.ok(Array.isArray(before.data));
const shop=await request('/api/shop');assert.equal(shop.status,200);
const images=['https://example.com/first.jpg','https://example.com/second.jpg'];
const p={id,name:'Smoke test accessory',brand:'Test',category:'Aksessuarlar',price:125000,oldPrice:150000,stock:7,image:images[0],images,description:'Temporary automated verification product',featured:false,published:false};
try {
 assert.equal((await request('/api/products','POST',p)).status,200);
 assert.ok(!(await request('/api/products')).data.some(x=>x.id===id),'Hidden product leaked into catalog');
 assert.equal((await request('/api/products?all=1')).data.find(x=>x.id===id).stock,7);
 assert.deepEqual((await request('/api/products?all=1')).data.find(x=>x.id===id).images,images);
 assert.equal((await request('/api/products','POST',{...p,images:[images[1],images[0]]})).status,200);
 const reordered=(await request('/api/products?all=1')).data.find(x=>x.id===id);
 assert.deepEqual(reordered.images,[images[1],images[0]]);assert.equal(reordered.image,images[1]);
 assert.equal((await request('/api/products','POST',{...p,published:true,stock:2,price:135000})).status,200);
 const visible=(await request('/api/products')).data.find(x=>x.id===id);assert.equal(visible.price,135000);assert.equal(visible.stock,2);
 assert.equal((await request('/api/products','POST',{...p,stock:-1})).status,400);
 assert.equal((await request('/api/products','POST',{...p,price:1.5})).status,400);
 assert.equal((await request('/api/products','POST',{...p,images:['javascript:alert(1)']})).status,400);
 assert.equal((await request('/api/products','POST',{...p,images:Array(11).fill(images[0])})).status,400);
 assert.equal((await request('/api/products','POST',{...p,images:[]})).status,200);
 const cleared=(await request('/api/products?all=1')).data.find(x=>x.id===id);assert.deepEqual(cleared.images,[]);assert.equal(cleared.image,'');
 assert.equal((await request('/api/shop','PUT',shop.data)).status,200);
 assert.equal((await request('/api/shop','PUT',{...shop.data,phone:'bad'})).status,400);
 assert.equal((await request(`/api/products/${id}`,'DELETE')).status,200);
 assert.ok(!(await request('/api/products?all=1')).data.some(x=>x.id===id));
 assert.equal((await request('/api/products?all=1')).data.length,before.data.length);
 console.log('PASS: ordered image persistence, cover sync, image removal and validation, inventory CRUD, visibility, shop save, and cleanup');
} finally { await request(`/api/products/${id}`,'DELETE'); }
