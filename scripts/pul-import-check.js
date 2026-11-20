// Import a private ledger export into an isolated local database; never writes to Turso.
import {readFile,mkdir} from 'node:fs/promises';
import {createClient} from '@libsql/client';
import {setupPul,pulRows} from '../src/pul-db.js';
import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/pul-import-check.js data/backups/export.json');
const backup=JSON.parse(await readFile(file,'utf8'));
await mkdir('data/backups',{recursive:true});
const db=createClient({url:`file:data/backups/pul-import-${Date.now()}.db`});
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try{
 // Create the legacy tables first, then replay original rows with IDs intact.
 await db.execute(`CREATE TABLE pul_records(id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','debt','payment','vendor')),reference_id TEXT REFERENCES pul_records(id),data_json TEXT NOT NULL,worker_id TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,is_deleted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
 const records=backup.tables.pul_records;
 const insert=async(name,table)=>{for(const values of table.rows)await db.execute({sql:`INSERT INTO ${quote(name)}(${table.columns.map(quote)}) VALUES(${values.map(()=>'?')})`,args:values.map(v=>v&&typeof v==='object'&&'base64'in v?Buffer.from(v.base64,'base64'):v)});};
 const tx=await db.transaction('write');try{await tx.execute('PRAGMA defer_foreign_keys=ON');for(const values of records.rows)await tx.execute({sql:`INSERT INTO pul_records(${records.columns.map(quote)}) VALUES(${values.map(()=>'?')})`,args:values});await tx.commit();}finally{if(!tx.closed)await tx.rollback();}
 await setupPul(db);
 for(const name of ['pul_history','pul_sources','pul_history_sources','pul_workers','pul_drafts','pul_requests','pul_photos','pul_notifications'])if(backup.tables[name])await insert(name,backup.tables[name]);
 for(const shop of new Set(records.rows.map(r=>r[records.columns.indexOf('shop_id')]))){const imported=await pulRows(db,shop);const originals=records.rows.map(values=>Object.fromEntries(records.columns.map((c,i)=>[c,values[i]]))).filter(r=>r.shop_id===shop);assert.equal(imported.length,originals.length);for(const row of originals){const found=imported.find(r=>r.id===row.id);assert.deepEqual(found.data,JSON.parse(row.data_json));assert.equal(found.worker_id,row.worker_id);assert.equal(found.version,row.version);assert.equal(found.reference_id,row.reference_id);}}
 assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length,0);
 const counts={};for(const name of ['pul_sales','pul_purchases','pul_debts','pul_payments','pul_vendors','pul_items','pul_history','pul_history_sources'])counts[name]=(await db.execute(`SELECT COUNT(*) AS n FROM ${name}`)).rows[0].n;
 console.log(JSON.stringify({verified:true,originalRecords:records.rows.length,counts}));
}finally{db.close();}
