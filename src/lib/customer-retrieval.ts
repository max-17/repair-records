import 'server-only';
import {db,initialize,getShop,getCategoryDefinitions} from './db';
import type {Product} from './types';
import {semanticIndex,reciprocalRankFusion} from './customer-semantic';
import {embeddingConfig} from './customer-embeddings';
import {productSearchDocument,knowledgeSearchDocuments} from './customer-search-documents';
import {recordOperationalEvent} from '../../shared/observability.js';
import type {InValue} from '@libsql/client';

export type SearchPreferences={query:string;maxPrice:number|null;minPrice:number|null;category:string|null;brand:string|null;condition:'new'|'used'|null;ramGb:number|null;storageGb:number|null;color:string|null;sort:'recommended'|'price_asc'|'price_desc'};
export const defaultSearchPreferences:SearchPreferences={query:'',maxPrice:null,minPrice:null,category:null,brand:null,condition:null,ramGb:null,storageGb:null,color:null,sort:'recommended'};

let ready:Promise<void>|undefined;
const categoryExpression=(prefix:string)=>`${prefix}category || CASE WHEN lower(${prefix}category) LIKE '%smartfon%' THEN ' telefon phone smartphone смартфон' WHEN lower(${prefix}category) LIKE '%planshet%' THEN ' planshet tablet планшет' WHEN lower(${prefix}category) LIKE '%noutbuk%' THEN ' laptop notebook ноутбук' ELSE '' END`;
const attributesExpression=(prefix:string)=>`coalesce(${prefix}color,'') || ' ' || coalesce(${prefix}ramGb,'') || ' GB RAM ' || coalesce(${prefix}storageGb,'') || ' GB ' || coalesce(${prefix}condition,'') || CASE ${prefix}condition WHEN 'new' THEN ' yangi brand new новый' WHEN 'used' THEN ' ishlatilgan used бу' ELSE '' END || ' ' || coalesce(${prefix}customFields,'') || ' ' || coalesce(${prefix}categoryValues,'')`;
/** Transactional triggers keep lexical retrieval fresh after every product edit or sale. */
export function initializeCustomerRetrieval(){
 return ready||=(async()=>{
  await initialize();
  await db.batch([
   `CREATE TABLE IF NOT EXISTS customer_bot_settings (id INTEGER PRIMARY KEY CHECK(id=1),knowledge TEXT NOT NULL DEFAULT '')`,
   `CREATE VIRTUAL TABLE IF NOT EXISTS customer_product_search USING fts5(product_id UNINDEXED,name,brand,category,description,attributes,tokenize='unicode61 remove_diacritics 2')`,
   `DROP TRIGGER IF EXISTS customer_product_search_insert`,
   `DROP TRIGGER IF EXISTS customer_product_search_update`,
   `DROP TRIGGER IF EXISTS customer_product_search_delete`,
   `CREATE TRIGGER IF NOT EXISTS customer_product_search_insert_v2 AFTER INSERT ON products BEGIN INSERT INTO customer_product_search(rowid,product_id,name,brand,category,description,attributes) VALUES (new.rowid,new.id,new.name,new.brand,${categoryExpression('new.')},new.description,${attributesExpression('new.')}); END`,
   `CREATE TRIGGER IF NOT EXISTS customer_product_search_update_v2 AFTER UPDATE ON products BEGIN DELETE FROM customer_product_search WHERE rowid=old.rowid; INSERT INTO customer_product_search(rowid,product_id,name,brand,category,description,attributes) VALUES (new.rowid,new.id,new.name,new.brand,${categoryExpression('new.')},new.description,${attributesExpression('new.')}); END`,
   `CREATE TRIGGER IF NOT EXISTS customer_product_search_delete_v2 AFTER DELETE ON products BEGIN DELETE FROM customer_product_search WHERE rowid=old.rowid; END`,
   `INSERT INTO customer_product_search(rowid,product_id,name,brand,category,description,attributes) SELECT rowid,id,name,brand,${categoryExpression('')},description,${attributesExpression('')} FROM products WHERE rowid NOT IN (SELECT rowid FROM customer_product_search)`,
  ],'write');
  const version=await db.execute("SELECT value FROM metadata WHERE key='customer-fts-v2'");
  if(!version.rows.length)await db.batch([`DELETE FROM customer_product_search`,`INSERT INTO customer_product_search(rowid,product_id,name,brand,category,description,attributes) SELECT rowid,id,name,brand,${categoryExpression('')},description,${attributesExpression('')} FROM products`,"INSERT OR IGNORE INTO metadata(key,value) VALUES('customer-fts-v2','1')"],'write');
 })().catch(error=>{ready=undefined;throw error;});
}
const stopWords=new Set(['menga','men','uchun','kerak','bor','bormi','ber','bering','qanday','qaysi','iltimos','tavsiya','qiling','qil','narxi','narx','qancha','salom','assalomu','alaykum','the','a','an','is','do','you','have','please','recommend','для','мне','есть','какой','какие']);
function terms(query:string){return [...new Set((query.normalize('NFKC').toLocaleLowerCase('uz').match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>1&&!stopWords.has(word)).map(word=>word.slice(0,48)))].slice(0,12);}
function ftsExpression(tokens:string[],join:'AND'|'OR'){return tokens.map(token=>'"'+token+'"*').join(` ${join} `);}
function parseProduct(row:Record<string,unknown>):Product{
 const {purchasePrice:_privateCost,...publicRow}=row;
 return {...publicRow,categoryValues:JSON.parse(String(row.categoryValues||'{}')),images:JSON.parse(String(row.images||'[]')),customFields:JSON.parse(String(row.customFields||'[]')),featured:!!row.featured,published:!!row.published} as unknown as Product;
}
async function semanticScores(query:string,documents:ReturnType<typeof productSearchDocument>[]){
 const start=Date.now();
 try{const scores=await semanticIndex.search(query,documents);await recordOperationalEvent({db,bot:'customer',operation:'semantic.query',status:'ok',durationMs:Date.now()-start});return scores;}
 catch(error){await recordOperationalEvent({db,bot:'customer',operation:'semantic.query',status:'degraded',durationMs:Date.now()-start,errorCode:'embedding_failed'});throw error;}
}
/** Public, in-stock products only. Filters are never dropped when search is broadened. */
async function retrieveProductsRaw(preferences:SearchPreferences):Promise<Product[]>{
 await initializeCustomerRetrieval();
 const where=['p.published=1','p.stock>0'];const values:InValue[]=[];
 const numericFields=[['maxPrice','price','<='],['minPrice','price','>='],['ramGb','ramGb','='],['storageGb','storageGb','=']] as const;
 for(const [key,column,operator] of numericFields){const value=preferences[key];if(value!==null){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid search filter');where.push(`p.${column}${operator}?`);values.push(value);}}
 for(const key of ['category','brand','condition','color'] as const){const value=preferences[key];if(value!==null){if(typeof value!=='string'||!value.trim()||value.length>120)throw new Error('Invalid search filter');where.push(`lower(trim(p.${key}))=lower(?)`);values.push(value.trim());}}
 if(preferences.condition!==null&&!['new','used'].includes(preferences.condition))throw new Error('Invalid condition filter');
 if(typeof preferences.query!=='string'||preferences.query.length>2000)throw new Error('Invalid search query');
 const order=preferences.sort==='price_asc'?'p.price ASC':preferences.sort==='price_desc'?'p.price DESC':'p.featured DESC,p.price ASC';
 const tokens=terms(preferences.query);
 const search=async(expression?:string)=>{
  const result=await db.execute({sql:`SELECT p.* FROM products p ${expression?'JOIN customer_product_search ON customer_product_search.rowid=p.rowid':''} WHERE ${where.join(' AND ')} ${expression?'AND customer_product_search MATCH ?':''} ORDER BY ${expression&&preferences.sort==='recommended'?'bm25(customer_product_search,0,8,6,2,1,3),':''}${order},p.id LIMIT 12`,args:expression?[...values,expression]:values});
  return result.rows.map(row=>parseProduct(row));
 };
 if(!tokens.length)return search();
 const exact=await search(ftsExpression(tokens,'AND'));
 // Inflected conversational words may be absent from the catalog. Retain the
 // explicit structured filters while broadening only lexical relevance.
 const anchors=tokens.filter(token=>/\d/.test(token));
 const fallback=anchors.length?`(${ftsExpression(anchors,'AND')}) AND (${ftsExpression(tokens,'OR')})`:ftsExpression(tokens,'OR');
 const lexical=exact.length||tokens.length===1?exact:await search(fallback);
 if(!embeddingConfig().enabled)return lexical;
 try{
  const eligible=(await db.execute({sql:`SELECT p.* FROM products p WHERE ${where.join(' AND ')} ORDER BY ${order},p.id`,args:values})).rows.map(row=>parseProduct(row));
  // Model numbers remain exact anchors even when semantic similarity is high.
  const anchored=eligible.filter(p=>anchors.every(anchor=>(productSearchDocument(p).text.normalize('NFKC').toLocaleLowerCase('uz').match(/[\p{L}\p{N}]+/gu)||[]).some(token=>token.startsWith(anchor))));
  const definitions=new Map((await getCategoryDefinitions()).map(d=>[d.name,d.fields]));
  const semantic=await semanticScores(preferences.query,anchored.map(p=>productSearchDocument(p,definitions.get(p.category))));
  const byId=new Map(anchored.map(p=>[p.id,p]));
  const ids=reciprocalRankFusion(lexical.map(p=>p.id),semantic.map(item=>item.id.replace(/^product:/,'')));
  const combined=ids.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
  if(preferences.sort==='price_asc')combined.sort((a,b)=>a.price-b.price);else if(preferences.sort==='price_desc')combined.sort((a,b)=>b.price-a.price);
  return combined;
 }catch{
  return lexical;
 }
}

export async function retrieveProducts(preferences:SearchPreferences):Promise<Product[]>{
 const products=await retrieveProductsRaw(preferences);
 const definitions=new Map((await getCategoryDefinitions()).map(d=>[d.name,d.fields]));
 return products.map(p=>({...p,categoryFieldLabels:Object.fromEntries((definitions.get(p.category)||[]).map(f=>[f.id,f.label])),customFields:[...(p.customFields||[]),...(definitions.get(p.category)||[]).flatMap(f=>p.categoryValues?.[f.id]!==undefined?[{name:f.label,value:String(p.categoryValues[f.id])}]:[])]}));
}

export async function retrieveKnowledge(query:string):Promise<{id:string;text:string}[]>{
 await initializeCustomerRetrieval();
 const [settings,shop]=await Promise.all([db.execute('SELECT knowledge FROM customer_bot_settings WHERE id=1'),getShop()]);
 const documents=knowledgeSearchDocuments(String(settings.rows[0]?.knowledge||''),shop);
 const tokens=terms(query);if(!tokens.length)return documents.filter(d=>d.id==='shop:contact');
 const ranked=documents.map(document=>{
  const body=document.text.normalize('NFKC').toLocaleLowerCase('uz');
  return {document,score:tokens.reduce((score,token)=>score+(body.includes(token)?1:0),0)};
 }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
 const lexical=ranked.slice(0,3).map(item=>item.document);
 if(!embeddingConfig().enabled)return lexical;
 try{
  const semantic=await semanticScores(query,documents);
  const byId=new Map(documents.map(d=>[d.id,d]));
  return reciprocalRankFusion(lexical.map(d=>d.id),semantic.map(d=>d.id),3).map(id=>byId.get(id)!);
 }catch{return lexical;}
}
