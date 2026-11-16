import {claimConversationLease,releaseConversationLease,withOwnedLease,deliverWithLease,classifyDeliveryFailure} from '../../shared/reliability.js';
import 'server-only';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {Client,Row} from '@libsql/client';
import {defaultSearchPreferences,type SearchPreferences} from './customer-retrieval';
import {productTitle} from './product-variants';
import {money,type Product,type Shop} from './types';
export type CustomerState={preferences:SearchPreferences;messages:{role:'user'|'assistant';text:string}[];offeredIds:string[];lastAt:number;lastUpdateId?:number};
export type CustomerPlan={preferences:SearchPreferences;intent:'search'|'knowledge'|'greeting'|'clarify';question:string|null;excludePrevious:boolean};
export type CustomerRecommendation={productIds:string[];knowledgeQuotes:{sourceId:string;quote:string}[];question:string|null};
type Knowledge={id:string;text:string};
type Payload={chat_id:string;text:string;reply_markup?:unknown};
export type CustomerBotDependencies={db:Client;plan:(text:string,state:CustomerState,timing:Record<string,unknown>)=>Promise<CustomerPlan>;recommend:(text:string,preferences:SearchPreferences,candidates:Product[],knowledge:Knowledge[],state:CustomerState)=>Promise<CustomerRecommendation>;retrieveProducts:(p:SearchPreferences)=>Promise<Product[]>;retrieveKnowledge:(query:string)=>Promise<Knowledge[]>;getShop:()=>Promise<Shop>;send:(method:string,payload:Record<string,unknown>)=>Promise<unknown>;answerCallback?:(id:string)=>Promise<unknown>;adminChatId:string;baseUrl:string;now?:()=>number};
type Sender={id:number;first_name?:string;last_name?:string;username?:string};
type TelegramMessage={message_id?:number;chat:{id:number;type:string};from?:Sender;text?:string;voice?:unknown};
type Update={update_id:number;message?:TelegramMessage;callback_query?:{id:string;from:Sender;data?:string;message?:TelegramMessage}};
export class CustomerBotBusyError extends Error{}
export async function initializeCustomerBot(db:Client){
 await db.batch([
  `CREATE TABLE IF NOT EXISTS customer_chat_state(chat_id TEXT PRIMARY KEY,state_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customer_chat_locks(chat_id TEXT PRIMARY KEY,update_id INTEGER NOT NULL,token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customer_updates(update_id INTEGER PRIMARY KEY,chat_id TEXT NOT NULL,input_hash TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,lease_until INTEGER NOT NULL,response_json TEXT,created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS customer_update_rate ON customer_updates(chat_id,kind,created_at)`,
  `CREATE TABLE IF NOT EXISTS customer_offers(token TEXT PRIMARY KEY,chat_id TEXT NOT NULL,product_id TEXT NOT NULL,product_json TEXT NOT NULL,created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS customer_leads(id TEXT PRIMARY KEY,offer_token TEXT UNIQUE NOT NULL,chat_id TEXT NOT NULL,product_id TEXT NOT NULL,product_json TEXT NOT NULL,customer_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,error TEXT NOT NULL DEFAULT '')`,
 ],'write');
}
const greeting='Salom! Qanday mahsulot izlayapsiz? Model, byudjet va kerakli xususiyatlarni yozing. Masalan: 3 million so‘mgacha, 8/256 GB telefon. Mos variantlarni topaman. Sotib olish tugmasi tanlangan mahsulot va Telegram profilingizni adminga yuboradi.';
function freshState():CustomerState{return {preferences:{...defaultSearchPreferences},messages:[],offeredIds:[],lastAt:0};}
function product(row:Row):Product{const {purchasePrice:_privateCost,...publicRow}=row;return {...publicRow,published:Boolean(row.published),featured:false,images:[],customFields:[],categoryValues:JSON.parse(String(row.categoryValues||'{}'))} as unknown as Product;}
function safeQuestion(question:string|null){return question?.slice(0,400)||'Qaysi mahsulot yoki narx oralig‘i sizga kerak?';}
export function createCustomerBot(deps:CustomerBotDependencies){
 const {db}=deps;const now=deps.now||Date.now;let initialized:Promise<void>|undefined;
 const setup=()=>initialized||=initializeCustomerBot(db);
 async function currentProduct(id:string){const result=await db.execute({sql:'SELECT * FROM products WHERE id=? AND published=1 AND stock>0',args:[id]});if(!result.rows[0])return null;const p=product(result.rows[0]);if(Object.keys(p.categoryValues||{}).length){const category=await db.execute({sql:'SELECT fields FROM categories WHERE name=?',args:[p.category]});p.categoryFieldLabels=Object.fromEntries((JSON.parse(String(category.rows[0]?.fields||'[]')) as {id:string;label:string}[]).map(f=>[f.id,f.label]));}return p;}
 async function offer(chatId:string,p:Product){const token=randomBytes(12).toString('hex');await db.execute({sql:'INSERT INTO customer_offers(token,chat_id,product_id,product_json,created_at) VALUES(?,?,?,?,?)',args:[token,chatId,p.id,JSON.stringify({id:p.id,name:productTitle(p),price:p.price}),now()]});return token;}
 async function cards(chatId:string,items:Product[],intro='Quyidagi variantlar mos kelishi mumkin:'):Promise<Payload>{
  const rows:Record<string,unknown>[][]=[];const text=[intro];
  for(const [index,p]of items.entries()){
   const token=await offer(chatId,p);const url=new URL(`/products/${encodeURIComponent(p.id)}`,deps.baseUrl).href;
   text.push(`${index+1}. ${productTitle(p)}\n${money(p.price)} so‘m · Mavjud: ${p.stock} dona${p.description?'\n'+p.description.slice(0,280):''}`);
   rows.push([{text:`${index+1}. Batafsil`,url},{text:`${index+1}. Sotib olmoqchiman`,callback_data:`buy:${token}`}]);
  }
  text.push('Sotib olish tugmasi mahsulot va Telegram profilingizni adminga yuboradi. Bu buyurtma yoki band qilish emas.');
  return {chat_id:chatId,text:text.join('\n\n').slice(0,4000),reply_markup:{inline_keyboard:rows}};
 }
 async function cleanup(message:TelegramMessage|undefined){if(!message?.message_id)return;try{await deps.send('editMessageReplyMarkup',{chat_id:String(message.chat.id),message_id:message.message_id,reply_markup:{inline_keyboard:[]}});}catch{/* A Telegram edit failure must not repeat a lead. */}}
 async function buy(update:Update,chatId:string,sender:Sender):Promise<Payload>{
  const query=update.callback_query!;const token=/^buy:([a-f0-9]{24})$/.exec(query.data||'')?.[1];
  if(!token)return {chat_id:chatId,text:'Tugma topilmadi. Mahsulotni qaytadan qidiring.'};
  const result=await db.execute({sql:'SELECT * FROM customer_offers WHERE token=? AND chat_id=?',args:[token,chatId]});const saved=result.rows[0];
  if(!saved)return {chat_id:chatId,text:'Bu tugma ushbu suhbatga tegishli emas. Mahsulotni qaytadan qidiring.'};
  const prior=await db.execute({sql:'SELECT * FROM customer_leads WHERE offer_token=?',args:[token]});
  if(prior.rows.length&&['sent','uncertain','sending'].includes(String(prior.rows[0].status))){if(prior.rows[0].status==='sending')await db.execute({sql:"UPDATE customer_leads SET status='uncertain',updated_at=? WHERE offer_token=?",args:[now(),token]});await cleanup(query.message);return {chat_id:chatId,text:prior.rows[0].status==='sent'?'So‘rovingiz adminga allaqachon yuborilgan.':'So‘rovingiz qayd etilgan. Yetkazish holati tekshirilmoqda; qayta yuborilmadi.'};}
  const p=await currentProduct(String(saved.product_id));await cleanup(query.message);
  if(!p)return {chat_id:chatId,text:'Bu variant hozir mavjud emas. Boshqa variantni qidirib beraman — nima kerakligini yozing.'};
  const snapshot=JSON.parse(String(saved.product_json));
  if(snapshot.price!==p.price||snapshot.name!==productTitle(p))return cards(chatId,[p],'Mahsulot ma’lumoti yangilangan. Hozirgi ma’lumotni ko‘rib, xohlasangiz tugmani qayta bosing:');
  const customer={id:sender.id,first_name:(sender.first_name||'Mijoz').slice(0,80),username:/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(sender.username||'')?sender.username:''};
  const leadId=prior.rows.length?String(prior.rows[0].id):randomUUID();await db.execute({sql:`INSERT OR IGNORE INTO customer_leads(id,offer_token,chat_id,product_id,product_json,customer_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)`,args:[leadId,token,chatId,p.id,JSON.stringify({id:p.id,name:productTitle(p),price:p.price}),JSON.stringify(customer),now(),now()]});
  const claimed=await db.execute({sql:"UPDATE customer_leads SET status='sending',updated_at=? WHERE offer_token=? AND status IN ('pending','failed') RETURNING id",args:[now(),token]});
  if(!claimed.rows.length)return {chat_id:chatId,text:'So‘rovingiz qayd etilgan. Qayta yuborilmadi.'};
  try{
   await deps.send('sendMessage',{chat_id:deps.adminChatId,text:`Xaridga qiziqish #${leadId.slice(0,8)}\n\n${productTitle(p)}\nNarx: ${money(p.price)} so‘m\n\nMijoz: ${customer.first_name}\nTelegram: ${customer.username?'@'+customer.username:'ID '+sender.id}\n\nBu xarid so‘rovi. Buyurtma yaratilmagan, qoldiq o‘zgarmagan.`,reply_markup:{inline_keyboard:[[{text:'Mijozga yozish',url:customer.username?`https://t.me/${customer.username}`:`tg://user?id=${sender.id}`}],[{text:'Mahsulot',url:new URL(`/products/${encodeURIComponent(p.id)}`,deps.baseUrl).href}]]}});
   await db.execute({sql:"UPDATE customer_leads SET status='sent',updated_at=? WHERE offer_token=?",args:[now(),token]});
   return {chat_id:chatId,text:'So‘rovingiz adminga yuborildi. Admin siz bilan bog‘lanadi. Mahsulot band qilinmadi.'};
  }catch(error){
   const {status}=classifyDeliveryFailure(error);
   await db.execute({sql:'UPDATE customer_leads SET status=?,updated_at=?,error=? WHERE offer_token=?',args:[status,now(),'telegram_delivery_not_confirmed',token]});
   const shop=await deps.getShop();
   return {chat_id:chatId,text:`So‘rovingiz qayd etildi, lekin adminga yetkazilgani tasdiqlanmadi. ${shop.telegram?'Do‘konga @'+shop.telegram+' orqali yozishingiz mumkin.':'Do‘kon: '+shop.phone}`};
  }
 }
 return async function handle(raw:unknown){
  const update=raw as Update;if(!Number.isSafeInteger(update?.update_id))return;
  const message=update.message||update.callback_query?.message;const sender=update.callback_query?.from||message?.from;
  if(!message||!sender||message.chat?.type!=='private'||!Number.isSafeInteger(sender.id)||sender.id<=0||message.chat.id!==sender.id)return;
  const chatId=String(sender.id);await setup();
  if(update.callback_query?.id){try{if(deps.answerCallback)await deps.answerCallback(update.callback_query.id);else await deps.send('answerCallbackQuery',{callback_query_id:update.callback_query.id});}catch{/* A callback acknowledgement is independent of execution. */}}
  const stamp=now(),lockToken=randomUUID(),hash=createHash('sha256').update(JSON.stringify(update)).digest('hex');let prepared:Payload|null=null;
  const lease=()=>({kind:'customer' as const,scope:chatId,requestId:update.update_id,token:lockToken,now:now(),durationMs:180000});
  const tx=await db.transaction('write');
  try{
   const previous=(await tx.execute({sql:'SELECT * FROM customer_updates WHERE update_id=?',args:[update.update_id]})).rows[0];
   if(previous&&String(previous.input_hash)!==hash)throw new Error('CUSTOMER_UPDATE_CONFLICT');
   if(previous?.status==='sent'){await tx.commit();return;}
   if(!await claimConversationLease(tx,lease()))throw new CustomerBotBusyError('CUSTOMER_CHAT_BUSY');
   if(previous?.status==='prepared')prepared=JSON.parse(String(previous.response_json));
   await tx.execute({sql:"INSERT INTO customer_updates(update_id,chat_id,input_hash,kind,status,lease_until,created_at) VALUES(?,?,?,?,'processing',?,?) ON CONFLICT(update_id) DO UPDATE SET lease_until=excluded.lease_until",args:[update.update_id,chatId,hash,message.text&&!message.text.startsWith('/')&&!update.callback_query?'text':'action',stamp+180000,stamp]});
   await tx.commit();
  }catch(error){await tx.rollback();throw error;}finally{tx.close();}
  try{
   if(!prepared){
    const stored=(await db.execute({sql:'SELECT state_json FROM customer_chat_state WHERE chat_id=?',args:[chatId]})).rows[0];
    let state:CustomerState;try{state=stored?JSON.parse(String(stored.state_json)):freshState();}catch{state=freshState();}
    if(state.lastUpdateId!==undefined&&state.lastUpdateId>update.update_id){await db.execute({sql:"UPDATE customer_updates SET status='sent' WHERE update_id=?",args:[update.update_id]});return;}
    const text=message.text?.trim().slice(0,3000)||'';
    if(update.callback_query)prepared=await buy(update,chatId,sender);
    else if(text==='/start'||text==='/reset'||text.startsWith('/start ')){state=freshState();prepared={chat_id:chatId,text:greeting};}
    else if(!text)prepared={chat_id:chatId,text:'Hozircha matn yozing. Model, byudjet va kerakli xususiyatlarni ayting.'};
    else{
     const rate=await db.execute({sql:"SELECT count(*) AS total FROM customer_updates WHERE chat_id=? AND kind='text' AND created_at>?",args:[chatId,stamp-60000]});
     if(Number(rate.rows[0].total)>10)prepared={chat_id:chatId,text:'Bir oz kuting, so‘ng qayta yozing.'};
     else{
      const plan=await deps.plan(text,state,{inactivitySeconds:state.lastAt?Math.max(0,Math.floor((stamp-state.lastAt)/1000)):null,currentTime:new Date(stamp).toISOString()});
      if(plan.intent==='greeting')prepared={chat_id:chatId,text:greeting};
      else if(plan.intent==='clarify')prepared={chat_id:chatId,text:safeQuestion(plan.question)};
      else{
       const [retrieved,knowledge]=await Promise.all([plan.intent==='knowledge'?Promise.resolve([]):deps.retrieveProducts(plan.preferences),deps.retrieveKnowledge(plan.intent==='knowledge'?(plan.preferences.query||text):text)]);
       const candidates=retrieved.filter(p=>p.published&&p.stock>0&&(!plan.excludePrevious||!state.offeredIds.includes(p.id)));
       const recommendation=candidates.length||knowledge.length?await deps.recommend(text,plan.preferences,candidates,knowledge,state):{productIds:[],knowledgeQuotes:[],question:null};
       const candidateById=new Map(candidates.map(p=>[p.id,p]));const selected=[...new Set(recommendation.productIds)].flatMap(id=>candidateById.has(id)?[candidateById.get(id)!]:[]).slice(0,3);
       // Quotes are accepted only if present verbatim in the retrieved public source.
       const quotes=recommendation.knowledgeQuotes.filter(q=>q.quote.trim()&&knowledge.some(k=>k.id===q.sourceId&&k.text.includes(q.quote))).slice(0,3).map(q=>q.quote.slice(0,700));
       if(selected.length)prepared=await cards(chatId,selected);
       else if(quotes.length)prepared={chat_id:chatId,text:'Do‘kon ma’lumoti:\n\n'+quotes.join('\n\n')};
       else prepared={chat_id:chatId,text:plan.intent==='knowledge'?'Bu haqda tasdiqlangan do‘kon ma’lumoti topilmadi. Admin bilan aniqlashtiring.':candidates.length?safeQuestion(recommendation.question):'Hozir ushbu talablarga mos mavjud mahsulot topilmadi. Byudjet yoki talablarni o‘zgartiramizmi?'};
       state.offeredIds=selected.map(p=>p.id);
      }
      state.preferences=plan.preferences;
     }
     state.messages=[...state.messages,{role:'user' as const,text},{role:'assistant' as const,text:prepared.text}].slice(-6);
    }
    state.lastAt=stamp;state.lastUpdateId=update.update_id;
    await withOwnedLease(db,lease(),tx=>tx.batch([{sql:'INSERT INTO customer_chat_state(chat_id,state_json) VALUES(?,?) ON CONFLICT(chat_id) DO UPDATE SET state_json=excluded.state_json',args:[chatId,JSON.stringify(state)]},{sql:"UPDATE customer_updates SET status='prepared',response_json=? WHERE update_id=?",args:[JSON.stringify(prepared),update.update_id]}],'write'));
   }
   await deliverWithLease({db,lease:lease(),payload:prepared,send:payload=>deps.send('sendMessage',payload),acknowledge:async(_result,guard)=>{
    const saved=await db.execute({sql:`UPDATE customer_updates SET status='sent' WHERE update_id=? AND ${guard.sql}`,args:[update.update_id,...guard.args]});
    return saved.rowsAffected>0;
   }});
  }finally{await releaseConversationLease(db,lease());}
 };
}
