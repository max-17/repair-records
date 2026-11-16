import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {Client} from '@libsql/client';
import {db,initialize,getProducts,getShop,getCategoryDefinitions} from './db';
import {observe} from '../../shared/observability.js';
import {embeddingConfig,embedTexts} from './customer-embeddings';
import {productSearchDocument,knowledgeSearchDocuments,type SearchDocument} from './customer-search-documents';
export type SemanticConfig={enabled:boolean;namespace:string;dimensions:number;model?:string};
type Dependencies={db:Client;config:()=>SemanticConfig;embed:(texts:string[],task:'document'|'query')=>Promise<number[][]>;now?:()=>number};
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function vectorBytes(vector:number[],dimensions:number){if(vector.length!==dimensions||vector.some(n=>!Number.isFinite(n))||!vector.some(n=>n!==0))throw new Error('INVALID_EMBEDDING');return new Float32Array(vector).buffer;}
function readVector(blob:unknown,dimensions:number){if(!(blob instanceof ArrayBuffer)&&!ArrayBuffer.isView(blob))return null;const bytes=blob instanceof ArrayBuffer?new Uint8Array(blob):new Uint8Array(blob.buffer,blob.byteOffset,blob.byteLength);if(bytes.byteLength!==dimensions*4)return null;return Array.from(new Float32Array(bytes.slice().buffer));}
export function cosineSimilarity(a:number[],b:number[]){if(a.length!==b.length)return -1;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):-1;}
/** Exact vector scan suits a single shop and preserves SQL prefilters; no external vector store. */
export function createSemanticIndex(deps:Dependencies){
 const now=deps.now||Date.now;let ready:Promise<void>|undefined;
 const setup=()=>ready||=(async()=>{await deps.db.batch([
  `CREATE TABLE IF NOT EXISTS customer_semantic_vectors(doc_id TEXT NOT NULL,namespace TEXT NOT NULL,content_hash TEXT NOT NULL,embedding BLOB NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(doc_id,namespace))`,
  `CREATE TABLE IF NOT EXISTS customer_query_vectors(cache_key TEXT PRIMARY KEY,namespace TEXT NOT NULL,embedding BLOB NOT NULL,created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customer_semantic_locks(namespace TEXT PRIMARY KEY,token TEXT NOT NULL,lease_until INTEGER NOT NULL)`
 ],'write');})().catch(error=>{ready=undefined;throw error;});
 async function cachedDocuments(documents:SearchDocument[]){await setup();const config=deps.config();const rows=await deps.db.execute({sql:'SELECT doc_id,content_hash,embedding FROM customer_semantic_vectors WHERE namespace=?',args:[config.namespace]});const byId=new Map(rows.rows.map(row=>[String(row.doc_id),row]));return documents.flatMap(doc=>{const row=byId.get(doc.id);if(!row||row.content_hash!==hash(doc.text))return [];const vector=readVector(row.embedding,config.dimensions);return vector?[{doc,vector}]:[];});}
 async function status(documents:SearchDocument[]){const config=deps.config();const cached=await cachedDocuments(documents);return {enabled:config.enabled,model:config.model||config.namespace,dimensions:config.dimensions,total:documents.length,ready:cached.length,pending:documents.length-cached.length};}
 async function sync(documents:SearchDocument[],limit=24){
  const config=deps.config();if(!config.enabled)return {...await status(documents),processed:0,busy:false};await setup();
  const token=randomUUID(),stamp=now();
  const claimed=await deps.db.execute({sql:'INSERT INTO customer_semantic_locks(namespace,token,lease_until) VALUES(?,?,?) ON CONFLICT(namespace) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE customer_semantic_locks.lease_until<? RETURNING token',args:[config.namespace,token,stamp+120000,stamp]});
  if(!claimed.rows.length)return {...await status(documents),processed:0,busy:true};
  try{
   const known=new Set((await cachedDocuments(documents)).map(item=>item.doc.id));const missing=documents.filter(doc=>!known.has(doc.id)).slice(0,Math.max(0,Math.min(limit,32)));
   if(missing.length){const vectors=await deps.embed(missing.map(doc=>doc.text),'document');if(vectors.length!==missing.length)throw new Error('INVALID_EMBEDDING_COUNT');
    const writes=missing.map((doc,i)=>({sql:'INSERT INTO customer_semantic_vectors(doc_id,namespace,content_hash,embedding,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(doc_id,namespace) DO UPDATE SET content_hash=excluded.content_hash,embedding=excluded.embedding,updated_at=excluded.updated_at',args:[doc.id,config.namespace,hash(doc.text),vectorBytes(vectors[i],config.dimensions),now()]}));
    // Do not acknowledge an index batch after losing its lease.
    const tx=await deps.db.transaction('write');try{const lock=await tx.execute({sql:'SELECT token,lease_until FROM customer_semantic_locks WHERE namespace=?',args:[config.namespace]});if(lock.rows[0]?.token!==token||Number(lock.rows[0]?.lease_until)<now())throw new Error('INDEX_LEASE_LOST');for(const write of writes)await tx.execute(write);await tx.commit();}catch(error){await tx.rollback();throw error;}finally{tx.close();}
   }
   await deps.db.execute({sql:'DELETE FROM customer_semantic_vectors WHERE namespace<>? AND updated_at<?',args:[config.namespace,now()-7*86400000]});
   return {...await status(documents),processed:missing.length,busy:false};
  }finally{await deps.db.execute({sql:'DELETE FROM customer_semantic_locks WHERE namespace=? AND token=?',args:[config.namespace,token]});}
 }
 async function search(query:string,documents:SearchDocument[],minScore=.5){
  const config=deps.config();if(!config.enabled||!query.trim()||!documents.length)return [];
  const cached=await cachedDocuments(documents);if(!cached.length)return [];
  const key=hash(config.namespace+'\nquery\n'+query.normalize('NFKC').trim().toLocaleLowerCase('uz'));
  const row=(await deps.db.execute({sql:'SELECT embedding FROM customer_query_vectors WHERE cache_key=? AND created_at>?',args:[key,now()-86400000]})).rows[0];
  let queryVector=row?readVector(row.embedding,config.dimensions):null;
  if(!queryVector){const vectors=await deps.embed([query],'query');queryVector=vectors[0];const bytes=vectorBytes(queryVector,config.dimensions);await deps.db.execute({sql:'INSERT OR REPLACE INTO customer_query_vectors(cache_key,namespace,embedding,created_at) VALUES(?,?,?,?)',args:[key,config.namespace,bytes,now()]});await deps.db.execute({sql:'DELETE FROM customer_query_vectors WHERE created_at<? OR cache_key IN (SELECT cache_key FROM customer_query_vectors ORDER BY created_at DESC LIMIT -1 OFFSET 500)',args:[now()-86400000]});}
  return cached.map(({doc,vector})=>({id:doc.id,score:cosineSimilarity(queryVector!,vector)})).filter(item=>Number.isFinite(item.score)&&item.score>=minScore).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,20);
 }
 return {setup,status,sync,search};
}
export function reciprocalRankFusion(lexical:string[],semantic:string[],limit=12){const scores=new Map<string,number>();for(const list of [lexical,semantic])for(const [rank,id]of [...new Set(list)].entries())scores.set(id,(scores.get(id)||0)+1/(60+rank+1));return [...scores].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id])=>id);}
export const semanticIndex=createSemanticIndex({db,config:embeddingConfig,embed:embedTexts});
export async function allSemanticDocuments(options:{productIds?:string[];includeProducts?:boolean;includeKnowledge?:boolean}={}){
 await initialize();const docs:SearchDocument[]=[];
 if(options.includeProducts!==false){const [products,definitions]=await Promise.all([getProducts(),getCategoryDefinitions()]);const fields=new Map(definitions.map(d=>[d.name,d.fields]));docs.push(...products.filter(p=>!options.productIds||options.productIds.includes(p.id)).map(p=>productSearchDocument(p,fields.get(p.category))));}
 if(options.includeKnowledge!==false){await db.execute("CREATE TABLE IF NOT EXISTS customer_bot_settings(id INTEGER PRIMARY KEY CHECK(id=1),knowledge TEXT NOT NULL DEFAULT '')");const [settings,shop]=await Promise.all([db.execute('SELECT knowledge FROM customer_bot_settings WHERE id=1'),getShop()]);docs.push(...knowledgeSearchDocuments(String(settings.rows[0]?.knowledge||''),shop));}
 return docs;
}
export async function refreshSemanticIndex(options:{limit?:number;productIds?:string[];includeProducts?:boolean;includeKnowledge?:boolean}={}){const allDocs=await allSemanticDocuments(options);return observe({db,bot:'system',operation:'semantic.index'},()=>semanticIndex.sync(allDocs,options.limit??24));}
export async function semanticIndexStatus(){return semanticIndex.status(await allSemanticDocuments());}
