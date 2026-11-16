import {cookies} from 'next/headers';
import {authenticated,sessionCookie} from '@/lib/auth';
import {refreshSemanticIndex,semanticIndexStatus} from '@/lib/customer-semantic';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
async function owner(){return authenticated((await cookies()).get(sessionCookie)?.value);}
export async function GET(){if(!await owner())return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});try{return Response.json(await semanticIndexStatus(),{headers});}catch{return Response.json({error:'Semantik indeks holati yuklanmadi.'},{status:503,headers});}}
export async function POST(request:Request){
 if(!await owner())return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});
 try{if(new URL(request.headers.get('origin')||'').host!==request.headers.get('host'))return Response.json({error:'Ruxsat yo‘q.'},{status:403,headers});return Response.json(await refreshSemanticIndex({limit:32}),{headers});}
 catch{return Response.json({error:'Indeks yangilanmadi. Google API kvotasi va tizim holatini tekshiring.'},{status:503,headers});}
}
