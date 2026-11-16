import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramCall, TelegramError } from '../src/lib/telegram-api';

test('Telegram photo uploads preserve all files and respect upload limits', async t => {
 const saved = {fetch:global.fetch, token:process.env.TELEGRAM_DEV_BOT_TOKEN, local:process.env.INVENTORY_LOCAL_ONLY, error:console.error};
 process.env.TELEGRAM_DEV_BOT_TOKEN='photo-test-token';process.env.INVENTORY_LOCAL_ONLY='true';
 const requests:{method:string;form:FormData;headers:RequestInit['headers']}[]=[];
 let rejection='', lostResponse=false;
 const logs:unknown[][]=[];
 console.error=(...args)=>{logs.push(args);};
 global.fetch=async(input,init)=>{
  const url=String(input);
  if(url.startsWith('https://images.example/')){
   if(url.endsWith('missing.jpg'))return new Response('missing',{status:404});
   if(url.endsWith('oversized.jpg'))return new Response(new Uint8Array(1),{headers:{'content-type':'image/jpeg','content-length':String(11*1024*1024)}});
   if(url.endsWith('streamed.jpg'))return new Response(new Uint8Array(10*1024*1024+1),{headers:{'content-type':'image/jpeg'}});
   if(url.endsWith('not-image.txt'))return new Response('not an image',{headers:{'content-type':'text/plain'}});
   const size=url.endsWith('large.jpg')?5424698:4;
   return new Response(new Uint8Array(size),{headers:{'content-type':'image/jpeg','content-length':String(size)}});
  }
  assert.ok(url.startsWith('https://api.telegram.org/botphoto-test-token/'),'No real services allowed');
  assert.ok(init?.body instanceof FormData);
  requests.push({method:url.split('/').pop()!,form:init.body,headers:init.headers});
  if(lostResponse)throw new Error('connection lost');
  return Response.json(rejection?{ok:false,error_code:400,description:rejection}:{ok:true,result:{message_id:123}});
 };
 try{
  await t.test('5.4 MB photos use multipart files in a complete album',async()=>{
   const media=[{type:'photo',media:'https://images.example/small.jpg',caption:'Owner description'},{type:'photo',media:'https://images.example/large.jpg'}];
   await telegramCall('sendMediaGroup',{chat_id:'-1001234',media});
   const sent=requests.at(-1)!;assert.equal(sent.method,'sendMediaGroup');assert.equal(sent.headers,undefined);
   const items=JSON.parse(String(sent.form.get('media')));
   assert.equal(items.length,2);assert.equal(items[0].caption,'Owner description');
   assert.deepEqual(items.map((i:{media:string})=>i.media),['attach://photo_0','attach://photo_1']);
   const photo=sent.form.get('photo_1');assert.ok(photo instanceof Blob);assert.equal(photo.size,5424698);assert.equal(photo.type,'image/jpeg');
  });
  await t.test('single photos retain captions and channel buttons',async()=>{
   const buttons={inline_keyboard:[[{text:'Store',url:'https://shop.example'}]]};
   await telegramCall('sendPhoto',{chat_id:'-1001234',photo:'https://images.example/large.jpg',caption:'Product',reply_markup:buttons});
   const form=requests.at(-1)!.form;assert.ok(form.get('photo') instanceof Blob);assert.equal(form.get('caption'),'Product');assert.deepEqual(JSON.parse(String(form.get('reply_markup'))),buttons);
  });
  await t.test('photo replacements also upload attachments',async()=>{
   await telegramCall('editMessageMedia',{chat_id:'-1001234',message_id:9,media:{type:'photo',media:'https://images.example/large.jpg',caption:'Updated'}});
   const form=requests.at(-1)!.form;assert.equal(form.get('message_id'),'9');assert.equal(JSON.parse(String(form.get('media'))).media,'attach://photo_0');assert.ok(form.get('photo_0') instanceof Blob);
  });
  for(const photo of ['oversized.jpg','streamed.jpg','missing.jpg','not-image.txt'])await t.test('rejects '+photo+' before any Telegram send',async()=>{
   const before=requests.length;
   await assert.rejects(telegramCall('sendPhoto',{chat_id:'-1001234',photo:'https://images.example/'+photo}),error=>error instanceof TelegramError&&!error.ambiguous);
   assert.equal(requests.length,before);
  });
  await t.test('provider errors include method and reason without tokens or URLs',async()=>{
   rejection='Bad Request: PHOTO_INVALID_DIMENSIONS photo-test-token https://private.example/file?secret=hidden';
   await assert.rejects(telegramCall('sendPhoto',{chat_id:'-1001234',photo:'https://images.example/small.jpg'}),error=>error instanceof TelegramError&&error.message.includes('sendPhoto')&&error.message.includes('PHOTO_INVALID_DIMENSIONS')&&!error.message.includes('photo-test-token')&&!error.message.includes('secret=hidden'));
   assert.ok(!JSON.stringify(logs).includes('photo-test-token'));assert.ok(!JSON.stringify(logs).includes('secret=hidden'));rejection='';
  });
  await t.test('a lost Telegram response still stops automatic resending',async()=>{
   lostResponse=true;
   await assert.rejects(telegramCall('sendPhoto',{chat_id:'-1001234',photo:'https://images.example/small.jpg'}),error=>error instanceof TelegramError&&error.ambiguous);
  });
 }finally{
  global.fetch=saved.fetch;console.error=saved.error;
  if(saved.token===undefined)delete process.env.TELEGRAM_DEV_BOT_TOKEN;else process.env.TELEGRAM_DEV_BOT_TOKEN=saved.token;
  if(saved.local===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=saved.local;
 }
});