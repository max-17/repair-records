import {combinedRepairEnv} from '../../../../combined-runtime.js';
import {pulDailyNotifications} from '../../../../pul-notifications.js';
import {telegramSender} from '../../../../delivery.js';
import {db} from '@/lib/db';
import {refreshSemanticIndex} from '@/lib/customer-semantic';
import { timingSafeEqual } from 'node:crypto';
import { processTelegramQueue } from '@/lib/telegram';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;const actual=request.headers.get('authorization');
 if(!expected||!actual||Buffer.byteLength(actual)!==Buffer.byteLength('Bearer '+expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected)))return Response.json({error:'Unauthorized'},{status:401});
 const repairEnv=combinedRepairEnv();
 const tasks=await Promise.allSettled([processTelegramQueue(),refreshSemanticIndex({limit:32}),repairEnv.TELEGRAM_BOT_TOKEN?pulDailyNotifications({db,env:repairEnv,send:telegramSender(repairEnv.TELEGRAM_BOT_TOKEN)}):Promise.resolve({skipped:true})]);return Response.json({ok:tasks.every(task=>task.status==='fulfilled'),channel:tasks[0].status,semantic:tasks[1].status,pul:tasks[2].status==='fulfilled'?tasks[2].value:'failed'});
}
