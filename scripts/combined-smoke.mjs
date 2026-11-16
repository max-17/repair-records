import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local tests only');
const origin=new URL(base).origin;
assert.equal((await fetch(base+'/api/repairs')).status,401);
const hook=await fetch(base+'/api/telegram/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
assert([401,403,503].includes(hook.status),'Webhook must reject unverified updates');
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({password:'integration-fixture'})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
const list=await fetch(base+'/api/repairs',{headers:{cookie}});assert.equal(list.status,200,await list.clone().text());
assert.equal((await fetch(base+'/api/repairs',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,401);
assert.equal((await fetch(base+'/api/inventory',{headers:{cookie}})).status,200);
assert.equal((await fetch(base+'/admin/repairs',{headers:{cookie}})).status,200);
const requestId=crypto.randomUUID();
const created=await fetch(base+'/api/repairs',{method:'POST',headers:{authorization:'Bearer integration-action-fixture','content-type':'application/json'},body:JSON.stringify({request_id:requestId,customer:'Integration fixture',device:'Test phone',work:'Test',price_uzs:1})});
assert.equal(created.status,201,await created.clone().text());const row=await created.json();
assert.equal((await fetch(base+'/api/repairs/'+row.id+'/events',{headers:{cookie}})).status,200);
assert.equal((await fetch(base+'/')).status,200);
assert.equal((await fetch(base+'/health')).status,200);
console.log('PASS: storefront, login, inventory, repair list/create/audit, session write denial, webhook protection, health');
// Clean only the unique fixture from the isolated local database.
const {createClient}=await import('@libsql/client');
const {resolve}=await import('node:path');
const db=createClient({url:`file:${resolve('data/development.db')}`});
try {await db.execute({sql:'DELETE FROM repair_events WHERE repair_id=?',args:[row.id]});await db.execute({sql:'DELETE FROM repair_jobs WHERE id=? AND request_id=?',args:[row.id,requestId]});} finally{db.close();}
