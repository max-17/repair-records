import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { resolve } from 'node:path';

const base='http://localhost:3000';
const name=`Category QA ${Date.now()}`;
const id=`category-qa-${Date.now()}`;
const db=createClient({url:`file:${resolve('data/shop.db').replaceAll('\\','/')}`});
async function post(path,body){return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
try {
 assert.equal((await post('/api/categories',{name:'   '})).status,400);
 assert.equal((await post('/api/categories',{name:'x'.repeat(61)})).status,400);
 assert.equal((await post('/api/categories',{name:`  ${name}  `})).status,201);
 assert.equal((await post('/api/categories',{name:name.toUpperCase()})).status,409);
 const categories=await (await fetch(base+'/api/categories')).json();
 assert.ok(categories.includes(name));
 const product={id,name:'Temporary category test',category:name,brand:'QA',price:100,oldPrice:0,stock:0,image:'',images:[],description:'',published:true,featured:false};
 assert.equal((await post('/api/products',product)).status,200);
 const products=await (await fetch(base+'/api/products?all=1')).json();
 assert.equal(products.find(p=>p.id===id)?.category,name);
 console.log('PASS: category validation, normalization, duplicates, persistence and product assignment');
} finally {
 await db.execute({sql:'DELETE FROM products WHERE id=?',args:[id]});
 await db.execute({sql:'DELETE FROM categories WHERE key=?',args:[name.toLocaleLowerCase('uz')]});
 db.close();
}
