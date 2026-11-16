import 'server-only';
export class TelegramError extends Error {
 constructor(message:string,public ambiguous=false,public retryAfter=60,public retryable=false){super(message);}
}
export function telegramEnvironment(){
 const production=process.env.NODE_ENV==='production'&&process.env.INVENTORY_LOCAL_ONLY!=='true'&&(!process.env.VERCEL_ENV||process.env.VERCEL_ENV==='production');
 return {token:production?(process.env.SHOP_TELEGRAM_BOT_TOKEN):process.env.TELEGRAM_DEV_BOT_TOKEN,baseUrl:production?process.env.TELEGRAM_APP_URL:process.env.TELEGRAM_DEV_APP_URL,channels:production?undefined:process.env.TELEGRAM_DEV_CHANNEL_IDS?.split(',').map(x=>x.trim()).filter(Boolean),production};
}
export async function telegramCall<T>(method:string,payload:Record<string,unknown>={}):Promise<T>{
 const {token}=telegramEnvironment();if(!token)throw new TelegramError('Telegram bot sozlanmagan.');
 const multipart=['sendPhoto','sendMediaGroup','editMessageMedia'].includes(method);
 const requestBody=multipart?await photoUploadForm(method,payload):JSON.stringify(payload);
 let response:Response;
 try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',...(multipart?{}:{headers:{'content-type':'application/json'}}),body:requestBody,signal:AbortSignal.timeout(15000),cache:'no-store'});}catch{throw new TelegramError('Telegram javobi olinmadi. Kanalni tekshiring: so‘rov bajarilgan bo‘lishi mumkin.',true);}
 let body:{ok:boolean;result:T;description?:string;error_code?:number;parameters?:{retry_after?:number}};
 try{body=await response.json();}catch{throw new TelegramError('Telegram javobi tasdiqlanmadi. Kanalni tekshiring.',true);}
 if(!body.ok){if(body.description?.includes('message is not modified'))return true as T;
  const description=(body.description||'Sabab ko‘rsatilmagan').replaceAll(token,'[redacted]').replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,400);
  console.error('[telegram] Request rejected',{method,status:body.error_code||response.status,description});
  throw new TelegramError(`Telegram xatosi (${body.error_code||response.status}, ${method}): ${description}`,false,body.parameters?.retry_after||60,body.error_code===429||(body.error_code||response.status)>=500);
 }
 return body.result;
}

const maxPhotoBytes=10*1024*1024;
async function downloadPhoto(source:string):Promise<Blob>{
 try{
  if(new URL(source).protocol!=='https:')throw new TelegramError('Rasm uchun ochiq HTTPS havola kerak.');
  const response=await fetch(source,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!response.ok)throw new TelegramError('Rasmni yuklab bo‘lmadi ('+response.status+'). Rasm havolasini tekshiring.',false,60,response.status===429||response.status>=500);
  const mime=(response.headers.get('content-type')||'').split(';')[0];
  if(!mime.startsWith('image/'))throw new TelegramError('Rasm havolasi rasm qaytarmadi. Mahsulot rasmini tekshiring.');
  if(Number(response.headers.get('content-length')||0)>maxPhotoBytes){await response.body?.cancel();throw new TelegramError('Telegram uchun har bir rasm 10 MB dan oshmasligi kerak.');}
  const reader=response.body?.getReader();if(!reader)throw new TelegramError('Rasm fayli bo‘sh.');
  const chunks:BlobPart[]=[];let bytes=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxPhotoBytes){await reader.cancel();throw new TelegramError('Telegram uchun har bir rasm 10 MB dan oshmasligi kerak.');}chunks.push(new Uint8Array(value).buffer);}
  }finally{reader.releaseLock();}
  if(!bytes)throw new TelegramError('Rasm fayli bo‘sh.');
  return new Blob(chunks,{type:mime});
 }catch(error){if(error instanceof TelegramError)throw error;throw new TelegramError('Rasm yuklanmadi. Havolani tekshiring va qayta urinib ko‘ring.',false,60,true);}
}
async function photoUploadForm(method:string,payload:Record<string,unknown>){
 const form=new FormData();
 for(const [key,value] of Object.entries(payload)){if(key==='photo'||key==='media'||value===undefined)continue;form.set(key,typeof value==='object'?JSON.stringify(value):String(value));}
 const media=method==='sendPhoto'?[{media:String(payload.photo)}]:method==='sendMediaGroup'?payload.media as Record<string,unknown>[]:[payload.media as Record<string,unknown>];
 const photos=await Promise.all(media.map(item=>downloadPhoto(String(item.media))));
 photos.forEach((photo,index)=>form.set(method==='sendPhoto'?'photo':'photo_'+index,photo,'photo_'+index+(photo.type==='image/png'?'.png':photo.type==='image/webp'?'.webp':'.jpg')));
 if(method==='sendMediaGroup')form.set('media',JSON.stringify(media.map((item,index)=>({...item,media:'attach://photo_'+index}))));
 if(method==='editMessageMedia')form.set('media',JSON.stringify({...media[0],media:'attach://photo_0'}));
 return form;
}
