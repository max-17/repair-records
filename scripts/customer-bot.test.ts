import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {createCustomerBot,CustomerBotBusyError,type CustomerBotDependencies,type CustomerState} from '../src/lib/customer-bot';
import {defaultSearchPreferences} from '../src/lib/customer-retrieval';
import type {Product} from '../src/lib/types';
const fixture:Product={id:'phone',name:'Test Phone',category:'Smartfonlar',brand:'Test',price:100,oldPrice:0,stock:2,image:'',images:[],description:'Tasdiqlangan tavsif',featured:false,published:true,color:'Qora',ramGb:8,storageGb:256,condition:'new'};
const message=(id:number,text:string,chat=123)=>({update_id:id,message:{message_id:id,chat:{id:chat,type:'private'},from:{id:chat,first_name:'Mijoz',username:'customer_test'},text}});
const callback=(id:number,data:string,chat=123)=>({update_id:id,callback_query:{id:'callback-'+id,from:{id:chat,first_name:'Mijoz',username:'customer_test'},data,message:{message_id:99,chat:{id:chat,type:'private'}}}});
async function context(overrides:Partial<CustomerBotDependencies>={}){
 const dir=await mkdtemp(join(tmpdir(),'customer-harness-'));const db=createClient({url:'file:'+join(dir,'test.db')});
 await db.execute('CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,category TEXT,brand TEXT,price INTEGER,oldPrice INTEGER,stock INTEGER,image TEXT,description TEXT,published INTEGER,color TEXT,ramGb INTEGER,storageGb INTEGER,condition TEXT)');
 await db.execute({sql:'INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[fixture.id,fixture.name,fixture.category,fixture.brand,fixture.price,fixture.oldPrice,fixture.stock,fixture.image,fixture.description,1,fixture.color!,8,256,'new']});
 const sends:{method:string;payload:Record<string,unknown>}[]=[];let plans=0,recommendations=0;const seen:CustomerState[]=[];
 const deps:CustomerBotDependencies={db,adminChatId:'999',baseUrl:'https://shop.example',now:()=>1000000,getShop:async()=>({name:'Shop',tagline:'',phone:'+998901234567',telegram:'shop_owner',address:'Toshkent',hours:'9-20'}),retrieveProducts:async()=>[fixture],retrieveKnowledge:async()=>[],plan:async(_text,state)=>{plans++;seen.push(structuredClone(state));return {preferences:{...defaultSearchPreferences,query:'phone'},intent:'search',question:null,excludePrevious:false};},recommend:async()=>{recommendations++;return {productIds:['invented','phone'],knowledgeQuotes:[],question:null};},send:async(method,payload)=>{sends.push({method,payload});return {};},...overrides};
 return {db,sends,deps,handle:createCustomerBot(deps),seen,counts:()=>({plans,recommendations}),close:async()=>{db.close();await rm(dir,{recursive:true,force:true});}};
}
function token(c:Awaited<ReturnType<typeof context>>){const reply=c.sends.find(s=>s.method==='sendMessage'&&s.payload.chat_id==='123'&&s.payload.reply_markup)!.payload;return (reply.reply_markup as {inline_keyboard:{callback_data?:string}[][]}).inline_keyboard[0][1].callback_data!;}
test('private customer offers are chat-bound, notify admin once and never create sales or change stock',async()=>{
 const c=await context();try{
  await c.handle(message(1,'/start'));assert.deepEqual(c.counts(),{plans:0,recommendations:0});
  await c.handle(message(2,'telefon'));assert.equal(c.counts().plans,1);const buy=token(c);
  assert.match(String(c.sends.at(-1)!.payload.text),/8\/256 GB/);assert(!String(c.sends.at(-1)!.payload.text).includes('invented'));
  await c.handle(callback(3,buy,124));assert.equal((await c.db.execute('SELECT * FROM customer_leads')).rows.length,0);
  await c.handle(callback(4,buy));await c.handle(callback(4,buy));await c.handle(callback(5,buy));
  assert.equal(c.sends.filter(s=>s.method==='sendMessage'&&s.payload.chat_id==='999').length,1);assert.equal((await c.db.execute('SELECT * FROM customer_leads')).rows.length,1);assert.equal((await c.db.execute('SELECT stock FROM products')).rows[0].stock,2);
  const before=c.counts().plans;await c.handle({...message(6,'private'),message:{...message(6,'private').message,chat:{id:123,type:'group'}}});assert.equal(c.counts().plans,before);
 }finally{await c.close();}
});
test('normal reply retries reuse prepared output and state follows the next message',async()=>{
 const c=await context();let fail=true;c.deps.send=async(method,payload)=>{if(method==='sendMessage'&&fail){fail=false;throw new Error('send failure');}c.sends.push({method,payload});};c.handle=createCustomerBot(c.deps);
 try{
  const update=message(10,'telefon');await assert.rejects(c.handle(update),/send failure/);await c.handle(update);assert.deepEqual(c.counts(),{plans:1,recommendations:1});
  await c.handle(message(11,'arzonroq'));assert.equal(c.seen[1].preferences.query,'phone');assert.equal(c.seen[1].messages.length,2);assert.deepEqual(c.seen[1].offeredIds,['phone']);
 }finally{await c.close();}
});
test('changed price produces a fresh offer, and sold-out products cannot be forwarded',async()=>{
 const c=await context();try{
  await c.handle(message(20,'telefon'));const old=token(c);await c.db.execute('UPDATE products SET price=200');await c.handle(callback(21,old));assert.equal((await c.db.execute('SELECT * FROM customer_leads')).rows.length,0);assert.match(String(c.sends.at(-1)!.payload.text),/200/);
  const fresh=(c.sends.at(-1)!.payload.reply_markup as {inline_keyboard:{callback_data?:string}[][]}).inline_keyboard[0][1].callback_data!;
  await c.db.execute('UPDATE products SET stock=0');await c.handle(callback(22,fresh));assert.equal((await c.db.execute('SELECT * FROM customer_leads')).rows.length,0);assert.match(String(c.sends.at(-1)!.payload.text),/mavjud emas/);
 }finally{await c.close();}
});
test('ambiguous admin delivery stays visible and is never automatically sent twice',async()=>{
 const c=await context();let adminSends=0;c.deps.send=async(method,payload)=>{if(method==='sendMessage'&&payload.chat_id==='999'){adminSends++;throw Object.assign(new Error('timeout'),{ambiguous:true});}c.sends.push({method,payload});};c.handle=createCustomerBot(c.deps);
 try{await c.handle(message(30,'telefon'));const buy=token(c);await c.handle(callback(31,buy));await c.handle(callback(31,buy));await c.handle(callback(32,buy));assert.equal(adminSends,1);assert.equal((await c.db.execute('SELECT status FROM customer_leads')).rows[0].status,'uncertain');assert(c.sends.some(s=>String(s.payload.text).includes('tasdiqlanmadi')));}finally{await c.close();}
});
test('knowledge answers quote only retrieved text and do not retrieve arbitrary products',async()=>{
 let retrieved=0;const c=await context({plan:async()=>({preferences:{...defaultSearchPreferences,query:'kafolat'},intent:'knowledge',question:null,excludePrevious:false}),retrieveProducts:async()=>{retrieved++;return [fixture];},retrieveKnowledge:async()=>[{id:'warranty',text:'Kafolat 12 oy.'}],recommend:async()=>({productIds:['phone'],knowledgeQuotes:[{sourceId:'warranty',quote:'Kafolat 12 oy.'},{sourceId:'invented',quote:'Bepul telefon.'}],question:null})});
 try{await c.handle(message(40,'Kafolat qancha?'));assert.equal(retrieved,0);const reply=String(c.sends.at(-1)!.payload.text);assert.match(reply,/Kafolat 12 oy/);assert(!reply.includes('Bepul'));assert(!reply.includes('Test Phone'));}finally{await c.close();}
});
test('concurrent messages in one chat fail safely while another chat proceeds',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>release=r);let entered!:()=>void;const began=new Promise<void>(r=>entered=r);
 const c=await context({plan:async(text)=>{if(text==='slow'){entered();await wait;}return {preferences:{...defaultSearchPreferences},intent:'clarify',question:'Byudjet qancha?',excludePrevious:false};}});
 try{const running=c.handle(message(50,'slow'));await began;await assert.rejects(c.handle(message(51,'next')),CustomerBotBusyError);await c.handle(message(52,'other',124));release();await running;}finally{release();await c.close();}
});
