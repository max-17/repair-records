import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {setup} from '../src/db.js';
import {createApp} from '../src/app.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('authenticated records persist, retries are safe, invalid data and cross-master access are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'repairs-'));
 const db=createClient({url:`file:${join(dir,'test.db')}`});
 await setup(db);
 const server=createApp({db,apiKey:'test-only',masterId:'aziz',dashboardKey:'view-only'}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,method='GET',body)=>fetch(base+path,{method,headers:{Authorization:'Bearer test-only','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try {
  assert.equal((await fetch(base+'/api/repairs')).status,401);
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Ishlar ro‘yxati/);
  assert.equal((await fetch(base+'/dashboard.js')).status,200);
  assert.equal((await fetch(base+'/.env')).status,404);
  const readonly={Authorization:'Bearer view-only','Content-Type':'application/json'};
  const view=await fetch(base+'/api/repairs',{headers:readonly});assert.equal(view.status,200);assert.equal(view.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/api/repairs',{method:'POST',headers:readonly,body:'{}'})).status,403);
  assert.equal((await request('/api/repairs?page=0')).status,400);

  const data={request_id:randomUUID(),customer:'Bekzod aka',device:'Samsung S23',work:'Ekran almashtirish',price_uzs:200000,due_date:'2026-11-15'};
  const saved=await request('/api/repairs','POST',data);assert.equal(saved.status,201);
  const job=await saved.json();assert.equal(job.master_id,'aziz');
  const retry=await request('/api/repairs','POST',data);assert.equal((await retry.json()).id,job.id);
  assert.equal((await request('/api/repairs','POST',{...data,price_uzs:300000})).status,409);
  assert.equal((await request('/api/repairs','POST',{...data,request_id:randomUUID(),due_date:'2026-02-30'})).status,400);
  assert.equal((await request('/api/repairs','POST',{...data,master_id:'other'})).status,400);
  assert.equal((await (await request('/api/repairs?q=Bekzod')).json()).repairs.length,1);
  assert.equal((await (await request('/api/repairs?page=2')).json()).repairs.length,0);
  const persisted=await (await fetch(base+'/api/repairs',{headers:readonly})).json();assert.equal(persisted.repairs[0].id,job.id);assert.equal(persisted.master_id,'aziz');
  const updated=await request(`/api/repairs/${job.id}`,'PATCH',{status:'ready'});assert.equal((await updated.json()).status,'ready');
  await db.execute({sql:'UPDATE repair_jobs SET master_id=? WHERE id=?',args:['other',job.id]});
  assert.equal((await request(`/api/repairs/${job.id}`,'PATCH',{status:'delivered'})).status,404);
  assert.equal((await (await request('/api/repairs')).json()).repairs.length,0);
 } finally {await new Promise(r=>server.close(r));db.close();await rm(dir,{recursive:true,force:true});}
});
