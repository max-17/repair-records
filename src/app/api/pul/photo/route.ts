import {cookies} from 'next/headers';
import {authenticated,sessionCookie} from '@/lib/auth';
import {staffSession} from '@/lib/staff-session';
import {db} from '@/lib/db';
import {setupPul,pulRows} from '../../../../pul-db.js';
import {readPulPhoto,imageContentType} from '../../../../pul-photos.js';
import {combinedRepairEnv} from '../../../../combined-runtime.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.read'))return new Response('Unauthorized',{status:401,headers:privateHeaders});
 try{
  await setupPul(db);const shop=process.env.PUL_SHOP_ID||'main',record=new URL(request.url).searchParams.get('record');
  const row=(await pulRows(db,shop)).find((r:{id:string;worker_id:string;data:{photo?:string}})=>r.id===record);if(row&&!actor.permissions.includes('pul.all')&&row.worker_id!==actor.id)return new Response('Forbidden',{status:403});const photo=row?.data.photo;if(!photo)return new Response('Not found',{status:404,headers:privateHeaders});
  if(photo.startsWith('web:')){const image=await readPulPhoto(db,shop,photo.slice(4));if(!image)return new Response('Not found',{status:404});return new Response(new Uint8Array(image.bytes),{headers:{...privateHeaders,'Content-Type':image.contentType}});}
  const token=combinedRepairEnv().TELEGRAM_BOT_TOKEN;if(!token)throw new Error('PHOTO_UNAVAILABLE');
  const info=await fetch(`https://api.telegram.org/bot${token}/getFile`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:photo}),signal:AbortSignal.timeout(10000),cache:'no-store'});const file=await info.json();const path=file.result?.file_path;
  if(!file.ok||typeof path!=='string'||!/^photos\/[\w.-]+$/.test(path)||file.result.file_size>10*1024*1024)throw new Error('PHOTO_UNAVAILABLE');
  const response=await fetch(`https://api.telegram.org/file/bot${token}/${path}`,{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw new Error('PHOTO_UNAVAILABLE');
  return new Response(response.body,{headers:{...privateHeaders,'Content-Type':'image/jpeg'}});
 }catch{return new Response('Rasmni yuklab bo‘lmadi.',{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.write'))return Response.json({error:'Kirish talab qilinadi.'},{status:401});
 const origin=request.headers.get('origin');if(!origin||new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Ruxsat yo‘q.'},{status:403});
 try{const reader=request.body?.getReader();if(!reader)throw new Error('EMPTY');let length=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();return Response.json({error:'Rasm 2 MB dan oshmasin.'},{status:413});}chunks.push(value);}
  const bytes=Buffer.concat(chunks),type=imageContentType(bytes);if(!type)return Response.json({error:'JPG, PNG yoki WebP rasm tanlang.'},{status:400});
  await setupPul(db);const id=crypto.randomUUID();await db.execute({sql:'INSERT INTO pul_photos(id,shop_id,bytes,content_type,created_at) VALUES(?,?,?,?,?)',args:[id,process.env.PUL_SHOP_ID||'main',bytes,type,new Date().toISOString()]});return Response.json({photo:`web:${id}`},{headers:privateHeaders});
 }catch{return Response.json({error:'Rasm saqlanmadi.'},{status:400});}
}
