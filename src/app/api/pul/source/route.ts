import {staffSession} from '@/lib/staff-session';
import {db} from '@/lib/db';
import {UTApi} from 'uploadthing/server';
import {setupPul} from '../../../../pul-db.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.read'))return new Response('Unauthorized',{status:401,headers});
 const query=new URL(request.url).searchParams;
 await setupPul(db);
 const source=(await db.execute({sql:`SELECT s.audio_key,s.audio_bytes FROM pul_sources s JOIN pul_history_sources l ON l.source_id=s.id JOIN pul_history h ON h.id=l.history_id JOIN pul_records r ON r.id=h.record_id WHERE s.shop_id=? AND s.id=? AND r.id=? AND (r.worker_id=? OR ?=1) LIMIT 1`,args:[process.env.PUL_SHOP_ID||'main',query.get('source')||'',query.get('record')||'',actor.id,actor.permissions.includes('pul.all')||actor.permissions.includes('admin')?1:0]})).rows[0];
 if(!source)return new Response('Not found',{status:404,headers});
 if(source.audio_bytes)return new Response(new Uint8Array(source.audio_bytes as ArrayBuffer),{headers:{...headers,'Content-Type':'audio/ogg'}});
 if(!source.audio_key)return new Response('Not found',{status:404,headers});
 try{
  const signed=await new UTApi().generateSignedURL(String(source.audio_key),{expiresIn:60});
  const audio=await fetch(signed.ufsUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!audio.ok)throw new Error('UNAVAILABLE');
  return new Response(audio.body,{headers:{...headers,'Content-Type':'audio/ogg','Accept-Ranges':'none'}});
 }catch{return new Response('Ovozli faylni yuklab bo‘lmadi.',{status:503,headers});}
}
