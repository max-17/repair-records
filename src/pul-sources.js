import {sealArchive} from './archive-crypto.js';
import {createHash,randomUUID} from 'node:crypto';
import {UTApi,UTFile} from 'uploadthing/server';
export async function setupSources(db){
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_sources (
 id TEXT PRIMARY KEY,shop_id TEXT NOT NULL,request_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 chat_id TEXT,message_id TEXT,sent_at TEXT NOT NULL,kind TEXT NOT NULL,
 original_text TEXT,transcription TEXT,telegram_file_id TEXT,audio_key TEXT,audio_hash TEXT,audio_bytes BLOB,
 UNIQUE(shop_id,request_id))`);
 await db.execute(`CREATE TABLE IF NOT EXISTS pul_history_sources (
 history_id TEXT NOT NULL REFERENCES pul_history(id),source_id TEXT NOT NULL REFERENCES pul_sources(id),
 position INTEGER NOT NULL,PRIMARY KEY(history_id,source_id))`);
 await db.execute(`CREATE TABLE IF NOT EXISTS repair_event_sources (event_id TEXT NOT NULL REFERENCES repair_events(id),source_id TEXT NOT NULL REFERENCES pul_sources(id),position INTEGER NOT NULL,PRIMARY KEY(event_id,source_id))`);
 for(const table of ['pul_sources','pul_history_sources','repair_event_sources'])for(const action of ['UPDATE','DELETE'])await db.execute(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Sources are immutable'); END`);
}
export function archiveFailureCode(error){
 const message=typeof error?.message==='string'?error.message:'';
 if(/acl|access.control|private.*(?:allow|permission|access)|overrid/i.test(message))return 'archive_private_access_denied';
 if(['UNAUTHORIZED','FORBIDDEN','INVALID_TOKEN','MISSING_ENV'].includes(error?.code))return 'archive_auth_failed';
 if(/quota|storage limit|insufficient.*(?:storage|credit)/i.test(message))return 'archive_quota_exceeded';
 return 'archive_upload_failed';
}
export function createArchiveClient(env,{fetcher}={}){return new UTApi({token:env.UPLOADTHING_TOKEN,logLevel:'Error',...(fetcher?{fetch:fetcher}:{})});}
function archiveError(code,message='SOURCE_UPLOAD_FAILED'){return Object.assign(new Error(message),{code});}
export function audioArchive(env,{api}={}){
 return async(bytes,requestId)=>{
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(env.NODE_ENV!=='production')return {hash,bytes};
  if(!env.UPLOADTHING_TOKEN)throw archiveError('archive_not_configured','SOURCE_STORAGE_NOT_CONFIGURED');
  const sealed=sealArchive(bytes,env);
  let result;
  try{
   const client=api||createArchiveClient(env);
   const file=new UTFile([sealed.bytes],`${createHash('sha256').update(requestId).digest('hex')}.bin`,{type:'application/octet-stream',customId:`evidence-${randomUUID()}`});
   result=await client.uploadFiles(file,{contentDisposition:'attachment'});
  }catch(error){throw archiveError(archiveFailureCode(error));}
  if(result.error)throw archiveError(archiveFailureCode(result.error));
  if(!result.data?.key)throw archiveError('archive_upload_failed');

  return {hash,key:`enc1.${sealed.keyId}.${result.data.key}`};
 };
}
export async function sourceFor(db,ctx,input,transcription,audio){
 const existing=(await db.execute({sql:'SELECT id FROM pul_sources WHERE shop_id=? AND request_id=?',args:[ctx.shopId,ctx.requestId]})).rows[0];
 if(existing)return existing.id;
 if(input.voice&&!audio)throw new Error('SOURCE_AUDIO_MISSING');
 const id=randomUUID();
 await db.execute({sql:`INSERT INTO pul_sources(id,shop_id,request_id,actor_id,chat_id,message_id,sent_at,kind,original_text,transcription,telegram_file_id,audio_key,audio_hash,audio_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(shop_id,request_id) DO NOTHING`,args:[id,ctx.shopId,ctx.requestId,ctx.userId,input.chatId==null?null:String(input.chatId),input.messageId==null?null:String(input.messageId),new Date(input.receivedAt||ctx.now).toISOString(),input.voice?'audio':input.commandData?'manual':'text',input.voice?null:input.commandData?JSON.stringify(input.commandData):input.text||null,input.voice?transcription:null,input.voice?.file_id||null,audio?.key||null,audio?.hash||null,audio?.bytes||null]});
 return (await db.execute({sql:'SELECT id FROM pul_sources WHERE shop_id=? AND request_id=?',args:[ctx.shopId,ctx.requestId]})).rows[0].id;
}
export async function sourceDetails(db,shopId,recordId){
 return (await db.execute({sql:`SELECT h.id AS history_id,s.id,s.kind,s.actor_id,s.sent_at,s.original_text,s.transcription,s.message_id,s.chat_id,s.audio_hash,CASE WHEN s.audio_key IS NOT NULL OR s.audio_bytes IS NOT NULL THEN 1 ELSE 0 END AS has_audio FROM pul_history h JOIN pul_history_sources l ON l.history_id=h.id JOIN pul_sources s ON s.id=l.source_id WHERE h.shop_id=? AND h.record_id=? ORDER BY h.occurred_at,l.position`,args:[shopId,recordId]})).rows;
}
