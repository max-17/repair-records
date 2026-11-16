import {refreshSemanticIndex} from '@/lib/customer-semantic';
import { timingSafeEqual } from 'node:crypto';
import { processTelegramQueue } from '@/lib/telegram';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;const actual=request.headers.get('authorization');
 if(!expected||!actual||Buffer.byteLength(actual)!==Buffer.byteLength('Bearer '+expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected)))return Response.json({error:'Unauthorized'},{status:401});
 await processTelegramQueue();const semantic=await Promise.allSettled([refreshSemanticIndex({limit:32})]);return Response.json({ok:true,semantic:semantic[0].status==='fulfilled'});
}
