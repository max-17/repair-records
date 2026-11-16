import {cookies} from 'next/headers';
import {authenticated,sessionCookie} from '@/lib/auth';
import {db,initialize} from '@/lib/db';
import {readOperationsOverview} from '../../../../shared/observability.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
 if(!authenticated((await cookies()).get(sessionCookie)?.value))return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{await initialize();return Response.json(await readOperationsOverview(db),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Tizim holatini yuklab bo‘lmadi.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
