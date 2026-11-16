import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from '../src/db.js';
import {commandService} from '../src/commands.js';
import {createApp} from '../src/app.js';
const blank={action:'clarify',customer:null,device:null,work:null,price_uzs:null,due_date:null,status:null,start_date:null,end_date:null,question:null};
async function withDb(fn){const dir=await mkdtemp(join(tmpdir(),'staff-'));const db=createClient({url:`file:${join(dir,'test.db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
test('intake employee and technician are separate; technician changes preserve receiver and audit history',()=>withDb(async db=>{
 let plan={...blank,action:'create',customer:'Bekzod',device:'iPhone 14 Pro',work:'Ekran',technician:'Ali'};
 const run=commandService({db,parse:async()=>plan});const send=(text,id)=>run({text,requestId:id,masterId:'owner',conversationId:'chat',receivedBy:'123',receivedByName:'Aziz'});
 const saved=await send('Aziz qabul qildi, Ali usta','1');assert.equal(saved.repair.received_by,'123');assert.equal(saved.repair.received_by_name,'Aziz');assert.equal(saved.repair.technician,'Ali');assert.match(saved.reply,/Qabul qilgan: Aziz/);assert.match(saved.reply,/Usta: Ali/);
 plan={...blank,action:'update',customer:'Bekzod',device:'iPhone 14 Pro',technician:'Vali'};
 const updated=await send('Ustasi Vali bo‘lsin','2');assert.equal(updated.kind,'updated');
 assert.equal(updated.repair.technician,'Vali');assert.equal(updated.repair.received_by,'123');assert.equal(updated.repair.received_by_name,'Aziz');assert.equal(updated.repair.master_id,'owner');
 const event=(await db.execute("SELECT * FROM repair_events WHERE event_type='updated'")).rows[0];assert.equal(JSON.parse(event.before_json).technician,'Ali');assert.equal(JSON.parse(event.after_json).technician,'Vali');assert.equal(JSON.parse(event.after_json).received_by,'123');
 plan={...blank,action:'create',customer:'Other',device:'Phone',work:'Battery'};
 const unassigned=await send('New','4');assert.equal(unassigned.repair.technician,null);assert.equal(unassigned.repair.received_by,'123');
}));
test('API receiver cannot be spoofed or edited and technician is independent',()=>withDb(async db=>{
 const server=createApp({db,apiKey:'test',masterId:'reception'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/repairs`;const call=(url,method,body)=>fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer test'},body:JSON.stringify(body)});
 const data={request_id:crypto.randomUUID(),customer:'Bekzod',device:'Samsung S23',work:'Screen',technician:'Ali'};
 try{
  assert.equal((await call(base,'POST',{...data,received_by:'someone'})).status,400);
  const saved=await (await call(base,'POST',data)).json();assert.equal(saved.received_by,'reception');assert.equal(saved.technician,'Ali');
  assert.equal((await call(base,'POST',{...data,technician:'Vali'})).status,409);
  assert.equal((await call(base+'/'+saved.id,'PATCH',{received_by:'Vali'})).status,400);
  const changed=await (await call(base+'/'+saved.id,'PATCH',{technician:'Vali'})).json();assert.equal(changed.received_by,'reception');assert.equal(changed.technician,'Vali');
 }finally{await new Promise(r=>server.close(r));}
}));
test('schema upgrade is repeatable and does not invent staff details for legacy records',()=>withDb(async db=>{
 await db.execute('DROP TABLE repair_jobs');
 await db.execute('CREATE TABLE repair_jobs(id TEXT PRIMARY KEY,master_id TEXT NOT NULL,request_id TEXT NOT NULL,customer TEXT NOT NULL,device TEXT NOT NULL,work TEXT NOT NULL,price_uzs INTEGER,due_date TEXT,status TEXT,created_at TEXT,updated_at TEXT,UNIQUE(master_id,request_id))');
 await db.execute("INSERT INTO repair_jobs(id,master_id,request_id,customer,device,work) VALUES('old','owner','old','Bekzod','Phone','Screen')");
 await setup(db);await setup(db);
 const row=(await db.execute("SELECT * FROM repair_jobs WHERE id='old'")).rows[0];assert.equal(row.received_by,null);assert.equal(row.technician,null);assert.equal(row.customer,'Bekzod');
}));
