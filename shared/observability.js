import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const traceContext=new AsyncLocalStorage();
export function currentTraceId(){return traceContext.getStore()?.traceId;}


const bots=new Set(['staff','customer','system']);
const operations=new Set(['pul_plan','request','webhook','staff_request','customer_request','ai_plan','ai_recommend','product_retrieval','knowledge_retrieval','semantic_query','semantic_index','embedding_query','embedding_index','admin_delivery','customer_delivery','staff_delivery','voice_transcription','staff_command','customer_action','index_backfill','semantic.index','semantic.query','retrieval.products','retrieval.knowledge','customer.plan','customer.recommend','customer.send','staff.webhook','customer.webhook']);
const errors=new Set(['archive_not_configured','archive_private_access_denied','archive_auth_failed','archive_quota_exceeded','archive_upload_failed','operation_failed','timeout','rate_limited','provider_unavailable','invalid_input','busy','unauthorized','delivery_failed','delivery_uncertain','index_failed','embedding_failed','stale_index','telemetry_unavailable']);
const statuses=new Set(['ok','error','degraded']);
const initialized=new WeakMap();
const retentionMs=7*24*60*60*1000;
const maxEvents=10000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeTrace=value=>typeof value==='string'&&uuid.test(value)?value:randomUUID();
const safeBot=value=>bots.has(value)?value:'system';
const safeOperation=value=>operations.has(value)?value:'request';
function code(error){
 if(typeof error?.code==='string'&&error.code.startsWith('archive_')&&errors.has(error.code))return error.code;
 if(error?.name==='CustomerEmbeddingError')return error.code==='provider_unavailable'?'provider_unavailable':'embedding_failed';
 if(error?.name==='AbortError'||error?.name==='TimeoutError')return 'timeout';
 if(error?.statusCode===429||error?.status===429)return 'rate_limited';
 if(error?.name==='CustomerBotBusyError'||error?.code==='CHAT_BUSY')return 'busy';
 if(error?.ambiguous===true)return 'delivery_uncertain';
 if(error?.statusCode>=500||error?.status>=500)return 'provider_unavailable';
 return 'operation_failed';
}
function emit(logger,level,event){try{(logger?.[level]||(()=>{})).call(logger,event);}catch{/* Observability must never change an action's outcome. */}}
export function initializeObservability(db){
 let ready=initialized.get(db);if(ready)return ready;
 ready=db.batch([
  `CREATE TABLE IF NOT EXISTS operational_events(id INTEGER PRIMARY KEY,trace_id TEXT NOT NULL,bot TEXT NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL,duration_ms INTEGER NOT NULL,error_code TEXT,created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS operational_events_time ON operational_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS operational_events_operation ON operational_events(bot,operation,created_at)`,
 ],'write').catch(error=>{initialized.delete(db);throw error;});
 initialized.set(db,ready);return ready;
}
/** Persist only bounded enum metadata. Never pass messages, headers, prompts or IDs. */
/** @param {{db:any,bot:string,operation:string,status?:string,durationMs?:number,traceId?:string,errorCode?:string,now?:()=>number,logger?:any}} options */
export async function recordOperationalEvent({db,bot,operation,status='ok',durationMs=0,traceId,errorCode,now=Date.now,logger=console}){
 const stamp=now();
 const event={trace_id:safeTrace(traceId||currentTraceId()),bot:safeBot(bot),operation:safeOperation(operation),status:statuses.has(status)?status:'error',duration_ms:Number.isFinite(durationMs)?Math.min(3600000,Math.max(0,Math.round(durationMs))):0,error_code:status==='ok'?null:(errors.has(errorCode)?errorCode:'operation_failed'),created_at:Number.isFinite(stamp)?Math.round(stamp):Date.now()};
 emit(logger,event.status==='ok'?'info':'warn',{event:'operation',...event});
 try{
  await initializeObservability(db);
  await db.batch([
   {sql:'INSERT INTO operational_events(trace_id,bot,operation,status,duration_ms,error_code,created_at) VALUES(?,?,?,?,?,?,?)',args:[event.trace_id,event.bot,event.operation,event.status,event.duration_ms,event.error_code,event.created_at]},
   {sql:'DELETE FROM operational_events WHERE created_at<?',args:[event.created_at-retentionMs]},
   {sql:'DELETE FROM operational_events WHERE id IN (SELECT id FROM operational_events ORDER BY id DESC LIMIT -1 OFFSET ?)',args:[maxEvents]},
  ],'write');
  return true;
 }catch{emit(logger,'warn',{event:'telemetry_unavailable',trace_id:event.trace_id,bot:event.bot,operation:event.operation});return false;}
}
/** One request trace can be reused by its plan/retrieval/delivery stages. */
/** @template T @param {{db:any,bot:string,operation:string,traceId?:string,now?:()=>number,logger?:any}} options @param {(context:{traceId:string})=>Promise<T>} action @returns {Promise<T>} */
export async function observe({db,bot,operation,traceId,now=Date.now,logger=console},action){
 const id=safeTrace(traceId||currentTraceId());
 return traceContext.run({traceId:id},async()=>{
  const start=now();let status='ok',errorCode;
  try{return await action({traceId:id});}
  catch(error){status='error';errorCode=code(error);throw error;}
  finally{await recordOperationalEvent({db,bot,operation,traceId:id,status,errorCode,durationMs:now()-start,now,logger});}
 });
}

const percentile=(values,p)=>values.length?values[Math.max(0,Math.ceil(values.length*p)-1)]:null;
function metrics(rows){
 const times=rows.map(r=>Number(r.duration_ms)).sort((a,b)=>a-b);
 return {count:rows.length,failures:rows.filter(r=>r.status==='error').length,degraded:rows.filter(r=>r.status==='degraded').length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95)};
}
/** Owner-only operational metadata; business payloads are deliberately absent. */
export async function readOperationsOverview(db,{now=Date.now}={}){
 await initializeObservability(db);const stamp=now();
 const [events,tables]=await Promise.all([
  db.execute({sql:'SELECT trace_id,bot,operation,status,duration_ms,error_code,created_at FROM operational_events WHERE created_at>=? ORDER BY created_at DESC,id DESC LIMIT 10000',args:[stamp-86400000]}),
  db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customer_leads','customer_chat_locks','telegram_locks')"),
 ]);
 const rows=events.rows;const requestRows=rows.filter(r=>['request','webhook','staff_request','customer_request','staff.webhook','customer.webhook'].includes(String(r.operation)));const tableNames=new Set(tables.rows.map(r=>String(r.name)));const alerts=[];
 const recent=rows.filter(r=>Number(r.created_at)>=stamp-15*60*1000);const recentFailures=recent.filter(r=>r.status==='error').length;
 if(recentFailures>=3)alerts.push({code:'recent_failures',severity:'error',count:recentFailures,text:`Oxirgi 15 daqiqada ${recentFailures} ta xato qayd etildi. So‘nggi izlarni tekshiring.`});
 const semanticFailures=rows.filter(r=>/semantic|embedding|index_backfill/.test(String(r.operation))&&r.status!=='ok');
 if(semanticFailures.length)alerts.push({code:'semantic_degraded',severity:'warning',count:semanticFailures.length,text:'Semantik qidiruv yoki indekslashda muammo bor. Qidiruvning kalit-so‘z rejimi va indeks holatini tekshiring.'});
 if(tableNames.has('customer_leads')){
  const leads=await db.execute("SELECT status,count(*) AS total FROM customer_leads WHERE status IN ('uncertain','failed','sending','pending') GROUP BY status");
  const uncertain=leads.rows.filter(r=>['uncertain','failed'].includes(String(r.status))).reduce((s,r)=>s+Number(r.total),0);
  if(uncertain)alerts.push({code:'lead_delivery',severity:'warning',count:uncertain,text:`${uncertain} ta xarid so‘rovining adminga yetkazilishi tasdiqlanmagan. Mijoz boti sozlamalarida ko‘rib chiqing.`});
  const waiting=await db.execute({sql:"SELECT count(*) AS total FROM customer_leads WHERE status IN ('pending','sending') AND updated_at<?",args:[stamp-5*60*1000]});
  const count=Number(waiting.rows[0]?.total||0);if(count)alerts.push({code:'stale_leads',severity:'warning',count,text:`${count} ta xarid so‘rovi 5 daqiqadan ko‘proq kutilmoqda. Yetkazish holatini tekshiring.`});
 }
 for(const table of ['customer_chat_locks','telegram_locks']){
  if(!tableNames.has(table))continue;
  const result=await db.execute({sql:`SELECT count(*) AS total FROM ${table} WHERE lease_until<?`,args:[stamp]});
  const count=Number(result.rows[0]?.total||0);if(count)alerts.push({code:table==='telegram_locks'?'staff_expired_locks':'customer_expired_locks',severity:'warning',count,text:`${table==='telegram_locks'?'Xodim':'Mijoz'} botida ${count} ta muddati o‘tgan ishlov qulfi bor. Keyingi so‘rov tiklanishini tekshiring.`});
 }
 const grouped=new Map();for(const row of rows){const key=`${row.bot}:${row.operation}`;const group=grouped.get(key)||[];group.push(row);grouped.set(key,group);}
 return {windowHours:24,retentionDays:7,maxEvents,generatedAt:stamp,metrics:metrics(requestRows.length?requestRows:rows),stageMetrics:metrics(rows),traceCount:new Set(rows.map(r=>String(r.trace_id))).size,operations:[...grouped.entries()].map(([key,group])=>{const [bot,operation]=key.split(':');return {bot,operation,...metrics(group)};}),alerts,latest:rows.slice(0,20).map(r=>({traceId:String(r.trace_id),bot:String(r.bot),operation:String(r.operation),status:String(r.status),durationMs:Number(r.duration_ms),errorCode:r.error_code===null?null:String(r.error_code),createdAt:Number(r.created_at)}))};
}

/** @template T @param {string} traceId @param {()=>Promise<T>} action @returns {Promise<T>} */
export function withTraceContext(traceId,action){return traceContext.run({traceId:safeTrace(traceId)},action);}
