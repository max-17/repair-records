import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {observe,currentTraceId,recordOperationalEvent,initializeObservability,readOperationsOverview} from '../shared/observability.js';
const quiet={info(){},warn(){}};
async function fixture(run){const folder=await mkdtemp(join(tmpdir(),'ops-test-'));const db=createClient({url:`file:${join(folder,'operations.db')}`});try{await run(db);}finally{db.close();await rm(folder,{recursive:true,force:true});}}
test('traces inherit across nested async stages and stay isolated between concurrent requests',async()=>fixture(async db=>{
 const traces=[];
 await Promise.all(['staff','customer'].map(bot=>observe({db,bot,operation:bot+'.webhook',logger:quiet},async({traceId})=>{
  traces.push(traceId);assert.equal(currentTraceId(),traceId);
  await new Promise(resolve=>setTimeout(resolve,5));
  await observe({db,bot,operation:'ai_plan',logger:quiet},async({traceId:child})=>{assert.equal(child,traceId);assert.equal(currentTraceId(),traceId);});
 })));
 assert.notEqual(traces[0],traces[1]);assert.equal(currentTraceId(),undefined);
 const result=await db.execute('SELECT trace_id,count(*) AS total FROM operational_events GROUP BY trace_id');assert.equal(result.rows.length,2);assert(result.rows.every(r=>Number(r.total)===2));
}));
test('telemetry preserves action results/errors and never records error text or caller payloads',async()=>fixture(async db=>{
 const logged=[];const logger={info:event=>logged.push(event),warn:event=>logged.push(event)};
 let stamp=1000;const now=()=>stamp+=10;
 assert.equal(await observe({db,bot:'customer',operation:'customer.plan',now,logger},async()=>42),42);
 const failure=new Error('API token=secret-value customer=1319669637');failure.name='secret-value';
 await assert.rejects(observe({db,bot:'staff',operation:'staff.webhook',now,logger},async()=>{throw failure;}),error=>error===failure);
 await recordOperationalEvent({db,bot:'secret-value',operation:'customer=1319669637',traceId:'secret-value',status:'error',errorCode:'token=secret-value',durationMs:Infinity,now,logger});
 const rows=await db.execute('SELECT * FROM operational_events');assert.equal(rows.rows.length,3);
 const serialized=JSON.stringify({rows:rows.rows,logged});assert(!serialized.includes('secret-value'));assert(!serialized.includes('1319669637'));assert.equal(rows.rows[2].bot,'system');assert.equal(rows.rows[2].operation,'request');assert.equal(rows.rows[2].duration_ms,0);
 const badDb={batch:async()=>{throw new Error('DATABASE_URL=secret-value');}};
 assert.equal(await observe({db:badDb,bot:'system',operation:'request',logger},async()=>7),7);
 const businessError=new Error('original business failure');await assert.rejects(observe({db:badDb,bot:'system',operation:'request',logger},async()=>{throw businessError;}),error=>error===businessError);
 assert(!JSON.stringify(logged).includes('DATABASE_URL'));
}));
test('retention removes old events and caps records without deleting current data',async()=>fixture(async db=>{
 await initializeObservability(db);const now=()=>2_000_000_000_000;
 await db.execute({sql:"INSERT INTO operational_events(trace_id,bot,operation,status,duration_ms,created_at) VALUES('old','system','request','ok',1,?)",args:[now()-7*86400000-1]});
 await db.execute({sql:"WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10005) INSERT INTO operational_events(trace_id,bot,operation,status,duration_ms,created_at) SELECT 'fixture','system','request','ok',1,? FROM n",args:[now()]});
 await recordOperationalEvent({db,bot:'system',operation:'request',now,logger:quiet});
 const count=await db.execute('SELECT count(*) AS total FROM operational_events');assert.equal(Number(count.rows[0].total),10000);
 assert.equal((await db.execute("SELECT id FROM operational_events WHERE trace_id='old'")).rows.length,0);
}));
test('overview computes request latency and actionable alerts using metadata only',async()=>fixture(async db=>{
 const stamp=2_000_000_000_000,now=()=>stamp;
 for(const [index,duration]of [10,20,30,40].entries())await recordOperationalEvent({db,bot:'customer',operation:'customer.webhook',status:index?'error':'ok',errorCode:'provider_unavailable',durationMs:duration,now,logger:quiet});
 await recordOperationalEvent({db,bot:'customer',operation:'semantic.index',status:'degraded',durationMs:9000,errorCode:'embedding_failed',now,logger:quiet});
 await db.batch([
  'CREATE TABLE customer_leads(status TEXT,updated_at INTEGER)',
  `INSERT INTO customer_leads VALUES ('uncertain',${stamp}),('failed',${stamp}),('pending',${stamp-600000})`,
  'CREATE TABLE customer_chat_locks(lease_until INTEGER)',
  `INSERT INTO customer_chat_locks VALUES (${stamp-1000})`,
  'CREATE TABLE telegram_locks(lease_until INTEGER)',
  `INSERT INTO telegram_locks VALUES (${stamp+1000})`,
 ],'write');
 const overview=await readOperationsOverview(db,{now});assert.equal(overview.metrics.count,4);assert.equal(overview.metrics.failures,3);assert.equal(overview.metrics.p50Ms,20);assert.equal(overview.metrics.p95Ms,40);assert.equal(overview.latest.length,5);
 const codes=new Set(overview.alerts.map(a=>a.code));for(const code of ['recent_failures','semantic_degraded','lead_delivery','stale_leads','customer_expired_locks'])assert(codes.has(code));assert(!codes.has('staff_expired_locks'));
 assert.equal(overview.alerts.find(a=>a.code==='lead_delivery').count,2);assert.equal(overview.stageMetrics.count,5);
}));
