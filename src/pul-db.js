import {randomUUID} from 'node:crypto';
const ready=new WeakMap();
export async function setupPul(db){
 let pending=ready.get(db);
 if(!pending){pending=createTables(db);ready.set(db,pending);}
 try{await pending;}catch(error){ready.delete(db);throw error;}
}
async function createTables(db){
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_records (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sale','debt','payment','vendor')),
  reference_id TEXT REFERENCES pul_records(id), data_json TEXT NOT NULL, worker_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 )`);
 await db.execute('CREATE INDEX IF NOT EXISTS pul_records_scope ON pul_records(shop_id,kind,is_deleted)');
 await db.execute('CREATE INDEX IF NOT EXISTS pul_records_parent ON pul_records(reference_id,is_deleted)');
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_history (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES pul_records(id),
  action TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL, occurred_at TEXT NOT NULL,
  before_json TEXT, after_json TEXT NOT NULL, reason TEXT, command_id TEXT NOT NULL
 )`);
 await db.execute("CREATE TRIGGER IF NOT EXISTS pul_history_no_update BEFORE UPDATE ON pul_history BEGIN SELECT RAISE(ABORT,'History is immutable'); END");
 await db.execute("CREATE TRIGGER IF NOT EXISTS pul_history_no_delete BEFORE DELETE ON pul_history BEGIN SELECT RAISE(ABORT,'History is immutable'); END");
 await db.execute("CREATE TRIGGER IF NOT EXISTS pul_records_no_delete BEFORE DELETE ON pul_records BEGIN SELECT RAISE(ABORT,'Use soft deletion'); END");
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_workers (
  shop_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, chat_id TEXT NOT NULL,
  PRIMARY KEY(shop_id,user_id)
 )`);
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_drafts (
  shop_id TEXT NOT NULL, conversation_id TEXT NOT NULL, token TEXT NOT NULL,
  state_json TEXT NOT NULL, PRIMARY KEY(shop_id,conversation_id)
 )`);
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_requests (
  shop_id TEXT NOT NULL, request_id TEXT NOT NULL, input_hash TEXT NOT NULL, result_json TEXT NOT NULL,
  PRIMARY KEY(shop_id,request_id)
 )`);
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_photos (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, bytes BLOB NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL
 )`);
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_notifications (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, local_date TEXT NOT NULL, chat_id TEXT NOT NULL,
  payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error_code TEXT
 )`);
}
export const decodePul=row=>row?{...row,data:JSON.parse(row.data_json),version:Number(row.version),is_deleted:Boolean(row.is_deleted)}:null;
export async function pulRows(db,shopId){return (await db.execute({sql:'SELECT * FROM pul_records WHERE shop_id=? ORDER BY created_at DESC,id',args:[shopId]})).rows.map(decodePul);}
export async function savePulRecord(tx,ctx,{before=null,kind,data,referenceId=null,deleted=false,reason=null,action}){
 const at=new Date(ctx.now).toISOString(),id=before?.id||randomUUID();
 const worker=before?.worker_id||ctx.workerId||ctx.userId;
 if(before){
  const result=await tx.execute({sql:'UPDATE pul_records SET data_json=?,is_deleted=?,version=version+1,updated_at=? WHERE id=? AND shop_id=? AND version=?',args:[JSON.stringify(data),deleted?1:0,at,id,ctx.shopId,before.version]});
  if(result.rowsAffected!==1)throw new Error('PUL_STALE');
 }else await tx.execute({sql:'INSERT INTO pul_records(id,shop_id,kind,reference_id,data_json,worker_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',args:[id,ctx.shopId,kind,referenceId,JSON.stringify(data),worker,at,at]});
 const after=decodePul((await tx.execute({sql:'SELECT * FROM pul_records WHERE id=?',args:[id]})).rows[0]);
 await tx.execute({sql:'INSERT INTO pul_history(id,shop_id,record_id,action,user_id,user_name,occurred_at,before_json,after_json,reason,command_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),ctx.shopId,id,action||(!before?'create':'edit'),ctx.userId,ctx.userName,at,before?JSON.stringify(before):null,JSON.stringify(after),reason,ctx.requestId]});
 return after;
}
