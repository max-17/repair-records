import {staffSession} from '@/lib/staff-session';
import {db} from '@/lib/db';
import {UTApi} from 'uploadthing/server';
import {archiveLocation,openArchive} from '../../../../archive-crypto.js';
import {setupPul} from '../../../../pul-db.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.read'))return new Response('Unauthorized',{status:401,headers});
 const query=new URL(request.url).searchParams;
 await setupPul(db);
 const source=(await db.execute({sql:`SELECT s.audio_key,s.audio_bytes,s.audio_hash FROM pul_sources s JOIN pul_history_sources l ON l.source_id=s.id JOIN pul_history h ON h.id=l.history_id JOIN pul_records r ON r.id=h.record_id WHERE s.shop_id=? AND s.id=? AND r.id=? AND (r.worker_id=? OR ?=1) LIMIT 1`,args:[process.env.PUL_SHOP_ID||'main',query.get('source')||'',query.get('record')||'',actor.id,actor.permissions.includes('pul.all')||actor.permissions.includes('admin')?1:0]})).rows[0];
 if(!source)return new Response('Not found',{status:404,headers});
 if(source.audio_bytes)return new Response(new Uint8Array(source.audio_bytes as ArrayBuffer),{headers:{...headers,'Content-Type':'audio/ogg'}});
 if(!source.audio_key)return new Response('Not found',{status:404,headers});
 try{
  const location=archiveLocation(String(source.audio_key));
  const signed=await new UTApi().generateSignedURL(location.key,{expiresIn:60});
  const audio=await fetch(signed.ufsUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!audio.ok)throw new Error('UNAVAILABLE');
  if(location.keyId){
   const reader=audio.body?.getReader();if(!reader)throw new Error('EMPTY');const chunks:Uint8Array[]=[];let length=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>10*1024*1024+128)throw new Error('TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const plain=openArchive(Buffer.concat(chunks),location.keyId,process.env,source.audio_hash?String(source.audio_hash):undefined);
   return new Response(new Uint8Array(plain),{headers:{...headers,'Content-Type':'audio/ogg','Accept-Ranges':'none'}});
  }
  return new Response(audio.body,{headers:{...headers,'Content-Type':'audio/ogg','Accept-Ranges':'none'}});
 }catch{return new Response('Ovozli faylni yuklab bo‘lmadi.',{status:503,headers});}
}
