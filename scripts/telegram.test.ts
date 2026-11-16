import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Product } from '../src/lib/types';

test('Telegram publishing uses isolated storage and mocked Telegram only',async t=>{
 const originalCwd=process.cwd(),directory=await mkdtemp(join(tmpdir(),'shop-telegram-'));
 process.chdir(directory);process.env.INVENTORY_LOCAL_ONLY='true';process.env.TELEGRAM_DEV_BOT_TOKEN='test-only';process.env.TELEGRAM_DEV_APP_URL='https://shop.example';process.env.TELEGRAM_DEV_CHANNEL_IDS='-1001234';
 const originalFetch=global.fetch;const calls:{method:string;body:Record<string,any>}[]=[];let id=100;let fail='';let networkFailure=false;let rejectDeletion=false;
 global.fetch=async(input,init)=>{
  const url=String(input);
  if(url.startsWith('https://images.example/'))return new Response(new Uint8Array([255,216,255,217]),{headers:{'content-type':'image/jpeg'}});
  assert.ok(url.startsWith('https://api.telegram.org/bottest-only/'),'No real services allowed');
  const method=url.split('/').pop()!;const body=init?.body instanceof FormData?Object.fromEntries([...init.body.entries()].map(([key,value])=>[key,typeof value==='string'&&['media','reply_markup','link_preview_options'].includes(key)?JSON.parse(value):value])):JSON.parse(String(init?.body));calls.push({method,body});
  if(method===fail){fail='';if(networkFailure)throw new Error('Connection lost');return Response.json({ok:false,error_code:429,parameters:{retry_after:1}});}
  if(method==='deleteMessages'&&rejectDeletion)return Response.json({ok:false,error_code:400,description:'message cannot be deleted'});
  const result=method==='getMe'?{id:42,username:'shop_test_bot'}:method==='getChat'?{id:-1001234,title:'Test channel',type:'channel'}:method==='getChatMember'?{status:'administrator',can_post_messages:true,can_edit_messages:true}:method==='sendMediaGroup'?body.media.map(()=>({message_id:++id})):method.startsWith('send')?{message_id:++id}:true;
  return Response.json({ok:true,result});
 };
 let db:Awaited<typeof import('../src/lib/db')>['db']|undefined;
 try{
  const database=await import('../src/lib/db');db=database.db;
  const {initializeInventory,adjustStock}=await import('../src/lib/inventory');const {confirmSale}=await import('../src/lib/sales');
  const {connectChannel,processTelegramQueue}=await import('../src/lib/telegram');const {snapshot,postButtons,needsRepost}=await import('../src/lib/telegram-content');
  await initializeInventory();await connectChannel('-1001234');
  const product:Product={id:'telegram-test',name:'Test <phone> 📱',category:'Smartfonlar',brand:'Test',price:100,oldPrice:120,stock:3,image:'https://images.example/1.jpg',images:['https://images.example/1.jpg','https://images.example/2.jpg'],description:'Owner description without translation',featured:false,published:true};
  await t.test('connection does not flood channels with existing products',async()=>{await processTelegramQueue();assert.equal(calls.filter(c=>c.method.startsWith('send')).length,0);});
  await t.test('new product posts all photos and both contextual buttons',async()=>{
   await database.saveProduct(product);await processTelegramQueue();const album=calls.find(c=>c.method==='sendMediaGroup')!;assert.equal(album.body.media.length,2);assert.ok(album.body.media[0].caption.includes(product.description));assert.equal(album.body.parse_mode,undefined);
   const text=calls.find(c=>c.method==='sendMessage')!;const buttons=text.body.reply_markup.inline_keyboard;assert.equal(buttons.length,2);assert.ok(buttons[0][0].url.includes('startapp=store'));const draft=new URL(buttons[1][0].url).searchParams.get('text')!;assert.ok(draft.includes(product.name));assert.ok(draft.includes('/products/telegram-test'));
  });
  await t.test('ordinary edit and sales update in place; repeated worker does not duplicate',async()=>{
   const sent=calls.filter(c=>c.method.startsWith('send')).length;
   product.price=90;await database.saveProduct(product);await processTelegramQueue();assert.ok(calls.some(c=>c.method==='editMessageCaption'));
   await confirmSale('test-sale',[{productId:product.id,quantity:1,unitPrice:90}]);await processTelegramQueue();assert.ok(calls.filter(c=>c.method==='editMessageCaption').at(-1)!.body.caption.includes('2 dona'));
   await processTelegramQueue();assert.equal(calls.filter(c=>c.method.startsWith('send')).length,sent);
  });
  await t.test('old important change reposts safely and reports Telegram old-message deletion limit',async()=>{
   const row=(await db!.execute("SELECT data FROM telegram_posts WHERE product_id='telegram-test'")).rows[0];const posted=JSON.parse(String(row.data));posted.postedAt=Date.now()-8*86400000;await db!.execute({sql:"UPDATE telegram_posts SET data=? WHERE product_id='telegram-test'",args:[JSON.stringify(posted)]});
   rejectDeletion=true;product.price=80;await database.saveProduct(product);const start=calls.length;await processTelegramQueue();const ops=calls.slice(start);assert.ok(ops.findIndex(c=>c.method==='sendMediaGroup')<ops.findIndex(c=>c.method==='deleteMessages'));const saved=JSON.parse(String((await db!.execute("SELECT data FROM telegram_posts WHERE product_id='telegram-test'")).rows[0].data));assert.ok(saved.warning);rejectDeletion=false;
  });
  await t.test('album companion retry resumes without sending the photos twice',async()=>{
   const retryProduct={...product,id:'telegram-retry',modelId:undefined};fail='sendMessage';await database.saveProduct(retryProduct);await processTelegramQueue();const albums=calls.filter(c=>c.method==='sendMediaGroup').length;
   await db!.execute("UPDATE telegram_jobs SET next_attempt=0 WHERE product_id='telegram-retry'");await processTelegramQueue();assert.equal(calls.filter(c=>c.method==='sendMediaGroup').length,albums);assert.equal((await db!.execute("SELECT status FROM telegram_jobs WHERE product_id='telegram-retry'")).rows[0].status,'posted');
  });
  await t.test('ambiguous sends stop rather than silently duplicating',async()=>{
   networkFailure=true;fail='sendPhoto';await database.saveProduct({...product,id:'telegram-uncertain',modelId:undefined,images:['https://images.example/one.jpg']});await processTelegramQueue();const sends=calls.filter(c=>c.method==='sendPhoto').length;await processTelegramQueue();assert.equal(calls.filter(c=>c.method==='sendPhoto').length,sends);assert.equal((await db!.execute("SELECT status FROM telegram_jobs WHERE product_id='telegram-uncertain'")).rows[0].status,'uncertain');networkFailure=false;
  });
  await t.test('full ten-photo albums and long descriptions keep all content',async()=>{
   const images=Array.from({length:10},(_,index)=>'https://images.example/'+index+'.jpg');const description='Full owner description '.repeat(100);
   const start=calls.length;await database.saveProduct({...product,id:'telegram-long',modelId:undefined,images,description});await processTelegramQueue();const sent=calls.slice(start);assert.equal(sent.find(c=>c.method==='sendMediaGroup')!.body.media.length,10);assert.ok(sent.find(c=>c.method==='sendMessage')!.body.text.includes(description));assert.equal(sent.find(c=>c.method==='sendMediaGroup')!.body.media[0].caption,undefined);
  });
  await t.test('restock is queued atomically and publishing is blocked with no dev token',async()=>{
   await adjustStock({id:'restock-test',productId:product.id,type:'in',quantity:8,note:''});assert.equal((await db!.execute("SELECT status FROM telegram_jobs WHERE product_id='telegram-test'")).rows[0].status,'pending');const before=calls.length;delete process.env.TELEGRAM_DEV_BOT_TOKEN;process.env.TELEGRAM_BOT_TOKEN='must-not-be-used';await processTelegramQueue();assert.equal(calls.length,before);
  });
  await t.test('only old price/availability changes repost and long descriptions stay complete',()=>{
   const value=snapshot(product,{telegram:'owner_test'} as any,'https://shop.example');assert.equal(needsRepost(value,{...value,stock:1},Date.now()-8*86400000),false);assert.equal(needsRepost(value,{...value,stock:0},Date.now()-8*86400000),true);assert.equal(needsRepost(value,{...value,price:1},Date.now()),false);assert.ok(postButtons(value,product.id).inline_keyboard[1][0].url.startsWith('https://t.me/owner_test?text='));
  });
 }finally{global.fetch=originalFetch;db?.close();process.chdir(originalCwd);await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(async error=>{if(error.code!=='EBUSY'||(await readdir(directory)).length)throw error;});}
});
