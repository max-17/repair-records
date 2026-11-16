import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {resolve} from 'node:path';
const base='http://127.0.0.1:3001';
const db=createClient({url:`file:${resolve('data/shop.db').replaceAll('\\','/')}`});
const prefix=`sales-test-${crypto.randomUUID()}`,ids=[prefix+'-a',prefix+'-b'];const saleIds=[];
async function req(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);return {status:r.status,data:await r.json()};}
const product={name:'POS test',category:'Noutbuklar',brand:'Test',price:100,oldPrice:0,stock:0,image:'',images:[],description:'',featured:false,published:false};
const line=(i,q=1,p=100)=>({productId:ids[i],quantity:q,unitPrice:p});
async function sell(items,id=crypto.randomUUID()){saleIds.push(id);return req('/api/sales',{id,items});}
try{
 await req('/api/sales');
 for(const id of ids){assert.equal((await req('/api/products',{...product,id})).status,200);assert.equal((await req('/api/inventory',{id:crypto.randomUUID(),productId:id,type:'in',quantity:5,note:prefix})).status,200);}
 const before=(await req('/api/analytics')).data;
 const id=crypto.randomUUID();const first=await sell([line(0,2)],id);assert.equal(first.status,200);assert.equal(first.data.total,200);
 assert.deepEqual((await sell([line(0,2)],id)).data,first.data);
 assert.equal((await sell([line(0)],id)).status,409);
 assert.equal((await sell([line(0),line(0)])).status,400);
 assert.equal((await sell([])).status,400);
 assert.equal((await sell([line(0,-1)])).status,400);
 assert.equal((await sell([line(0,1.5)])).status,400);
 assert.equal((await sell([line(0,1,101)])).status,409);
 assert.equal((await sell([line(0),line(1,6)])).status,409);
 let inventory=(await req('/api/inventory')).data;assert.equal(inventory.products.find(p=>p.id===ids[0]).stock,3);
 const concurrent=await Promise.all([sell([line(0,2)]),sell([line(0,2)])]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 await req('/api/products',{...product,id:ids[0],price:200});
 const receipts=(await req('/api/sales')).data;assert.equal(receipts.find(r=>r.id===id).total,200);
 const analytics=(await req('/api/analytics')).data;assert.equal(analytics.current.revenue-before.current.revenue,400);assert.equal(analytics.current.units-before.current.units,4);assert.equal(analytics.current.sales-before.current.sales,2);assert.equal(analytics.trend.length,30);assert(analytics.unsold.some(p=>p.productId===ids[1]));assert(!analytics.unsold.some(p=>p.productId===ids[0]));
 assert.equal((await req('/api/analytics?from=2026-02-30&to=2026-03-01')).status,400);
 console.log('PASS: checkout, retry safety, validation, atomic rollback, concurrent oversell protection, historical prices and analytics.');
}finally{
 for(const id of new Set(saleIds)){await db.execute({sql:'DELETE FROM sale_items WHERE sale_id=?',args:[id]});await db.execute({sql:'DELETE FROM sales WHERE id=?',args:[id]});}
 for(const id of ids){await db.execute({sql:'DELETE FROM stock_movements WHERE product_id=?',args:[id]});await db.execute({sql:'DELETE FROM products WHERE id=?',args:[id]});}db.close();
}
