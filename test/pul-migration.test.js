import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupPul,pulRows} from '../src/pul-db.js';
import {setupSources} from '../src/pul-sources.js';
test('purchase migration and split import preserve legacy IDs, payment references, history and source links',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pul-migration-'));let db=createClient({url:`file:${join(directory,'db')}`});
 try{
  await db.execute(`CREATE TABLE pul_records(id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('sale','debt','payment','vendor')),reference_id TEXT REFERENCES pul_records(id),data_json TEXT NOT NULL,worker_id TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE pul_history(id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,record_id TEXT NOT NULL REFERENCES pul_records(id),action TEXT NOT NULL,user_id TEXT NOT NULL,user_name TEXT NOT NULL,occurred_at TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,reason TEXT,command_id TEXT NOT NULL)`);
  await setupSources(db);
  const sale={customer:'Ali',currency:'UZS',totalMinor:50000000,items:[{name:'Phone',type:'product',quantity:1,unitMinor:50000000}]};
  const payment={currency:'USD',amountMinor:10000,method:'cash',settledMinor:null,source:'customer'};
  for(const [id,kind,parent,data] of [['sale','sale',null,sale],['payment','payment','sale',payment]])await db.execute({sql:'INSERT INTO pul_records(id,shop_id,kind,reference_id,data_json,worker_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',args:[id,'main',kind,parent,JSON.stringify(data),'7','2026-11-17','2026-11-17']});
  await db.execute("INSERT INTO pul_history VALUES('history','main','sale','create','7','Worker','2026-11-17',null,'{}',null,'request')");
  await db.execute("INSERT INTO pul_sources(id,shop_id,request_id,actor_id,sent_at,kind,original_text) VALUES('source','main','request','7','2026-11-17','text','original')");
  await db.execute("INSERT INTO pul_history_sources VALUES('history','source',0)");
  await setupPul(db);
  const rows=await pulRows(db,'main');assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.id==='sale').data,sale);assert.deepEqual(rows.find(r=>r.id==='payment').data,payment);
  assert.equal((await db.execute('SELECT sale_id,debt_id FROM pul_payments')).rows[0].sale_id,'sale');assert.equal((await db.execute('SELECT sale_id FROM pul_debts')).rows[0].sale_id,'sale');
  assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length,0);
  assert.equal((await db.execute('SELECT * FROM pul_history_sources')).rows.length,1);
  assert.equal((await db.execute('SELECT * FROM pul_legacy_records')).rows.length,2);
  assert.ok(!(await db.execute('PRAGMA table_info(pul_records)')).rows.some(r=>r.name==='data_json'));
  await assert.rejects(db.execute('DELETE FROM pul_records'),/soft deletion/);
  await assert.rejects(db.execute('DELETE FROM pul_sales'),/soft deletion/);
  await assert.rejects(db.execute('DELETE FROM pul_legacy_records'),/immutable/);
  db.close();db=createClient({url:`file:${join(directory,'db')}`});await setupPul(db);assert.equal((await pulRows(db,'main')).length,2);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
test('split migration failure rolls back imports and preserves legacy data for retry',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pul-split-failure-')),db=createClient({url:`file:${join(directory,'db')}`});
 try{
  await db.execute(`CREATE TABLE pul_records(id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','debt','payment','vendor')),reference_id TEXT REFERENCES pul_records(id),data_json TEXT NOT NULL,worker_id TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,is_deleted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await db.execute(`INSERT INTO pul_records VALUES('vendor','main','vendor',NULL,'{"vendor":"Test"}','7',1,0,'now','now')`);
  await db.execute(`INSERT INTO pul_records VALUES('payment','main','payment','vendor','{}','7',1,0,'now','now')`);
  await assert.rejects(setupPul(db),/PUL_PAYMENT_TARGET/);
  assert.equal((await db.execute('SELECT COUNT(*) AS n FROM pul_records')).rows[0].n,2);
  assert.ok((await db.execute('PRAGMA table_info(pul_records)')).rows.some(r=>r.name==='data_json'));
  assert.equal((await db.execute("SELECT name FROM sqlite_master WHERE name IN ('pul_sales','pul_legacy_records','pul_schema_versions')")).rows.length,0);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
