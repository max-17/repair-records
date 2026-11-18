import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupPul} from '../src/pul-db.js';
test('purchase migration preserves legacy rows, payment references, history and source links',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pul-migration-'));let db=createClient({url:`file:${join(directory,'db')}`});
 try{
  await setupPul(db);db.close();db=createClient({url:`file:${join(directory,'db')}`});
  // Build the previous CHECK constraint with populated child tables.
  await db.execute('PRAGMA foreign_keys=OFF');
  const definition=(await db.execute("SELECT sql FROM sqlite_master WHERE name='pul_records'")).rows[0].sql;
  await db.execute(definition.replace('CREATE TABLE pul_records','CREATE TABLE legacy_records').replace("'purchase',",''));
  await db.execute('DROP TABLE pul_records');await db.execute('ALTER TABLE legacy_records RENAME TO pul_records');
  const values=['sale','main','sale',null,'{}','7','2026-11-17','2026-11-17'];
  await db.execute({sql:'INSERT INTO pul_records(id,shop_id,kind,reference_id,data_json,worker_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',args:values});
  await db.execute({sql:'INSERT INTO pul_records(id,shop_id,kind,reference_id,data_json,worker_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',args:['payment','main','payment','sale','{}','7','2026-11-17','2026-11-17']});
  await db.execute("INSERT INTO pul_history VALUES('history','main','sale','create','7','Worker','2026-11-17',null,'{}',null,'request')");
  await db.execute("INSERT INTO pul_sources(id,shop_id,request_id,actor_id,sent_at,kind,original_text) VALUES('source','main','request','7','2026-11-17','text','original')");
  await db.execute("INSERT INTO pul_history_sources VALUES('history','source',0)");
  await db.execute('PRAGMA foreign_keys=ON');
  await setupPul(db);
  assert.equal((await db.execute('SELECT * FROM pul_records')).rows.length,2);
  assert.equal((await db.execute('SELECT reference_id FROM pul_records WHERE id=\'payment\'')).rows[0].reference_id,'sale');
  assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length,0);
  assert.equal((await db.execute('SELECT * FROM pul_history_sources')).rows.length,1);
  await db.execute("INSERT INTO pul_records(id,shop_id,kind,data_json,worker_id,created_at,updated_at) VALUES('purchase','main','purchase','{}','7','now','now')");
  await assert.rejects(db.execute('DELETE FROM pul_records'),/soft deletion/);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
