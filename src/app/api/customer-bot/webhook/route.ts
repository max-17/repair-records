import {after} from 'next/server';
import {observe} from '../../../../../shared/observability.js';
import {refreshSemanticIndex} from '@/lib/customer-semantic';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db,initialize,getShop} from '@/lib/db';
import {createCustomerBot,CustomerBotBusyError} from '@/lib/customer-bot';
import {planCustomerMessage,recommendCustomerProducts} from '@/lib/customer-ai';
import {retrieveProducts,retrieveKnowledge,initializeCustomerRetrieval} from '@/lib/customer-retrieval';
import {telegramCall,telegramEnvironment} from '@/lib/telegram-api';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const sender=z.object({id:z.number().int().positive().safe(),first_name:z.string().max(256).optional(),last_name:z.string().max(256).optional(),username:z.string().max(256).optional()});
const message=z.object({message_id:z.number().int().safe().optional(),chat:z.object({id:z.number().int().safe(),type:z.string().max(30)}),from:sender.optional(),text:z.string().max(4096).optional(),voice:z.unknown().optional()});
const updateSchema=z.object({update_id:z.number().int().nonnegative().safe(),message:message.optional(),callback_query:z.object({id:z.string().max(256),from:sender,data:z.string().max(128).optional(),message:message.optional()}).optional()});
let handler:ReturnType<typeof createCustomerBot>|undefined;
export async function POST(request:Request){
 const expected=process.env.SHOP_TELEGRAM_WEBHOOK_SECRET;
 if(!expected)return Response.json({error:'Bot sozlanmagan.'},{status:503});
 const given=Buffer.from(request.headers.get('x-telegram-bot-api-secret-token')||''),secret=Buffer.from(expected);
 if(given.length!==secret.length||!timingSafeEqual(given,secret))return Response.json({error:'Ruxsat yo‘q.'},{status:401});
 const env=telegramEnvironment();const admin=env.production?process.env.SHOP_ADMIN_CHAT_ID:process.env.SHOP_DEV_ADMIN_CHAT_ID;
 if(!env.token||!env.baseUrl||!admin||!/^\-?\d{1,20}$/.test(admin)||!process.env.GOOGLE_GENERATIVE_AI_API_KEY)return Response.json({error:'Bot sozlamalarini tekshiring.'},{status:503});
 if(env.token===process.env.TELEGRAM_BOT_TOKEN||env.token===process.env.REPAIR_DEV_BOT_TOKEN)return Response.json({error:'Mijoz va xodim botlari alohida bo‘lishi kerak.'},{status:503});
 if(Number(request.headers.get('content-length'))>16384)return Response.json({error:'Xabar juda katta.'},{status:413});
 const traceId=randomUUID();
 try{
  const reader=request.body?.getReader();if(!reader)return Response.json({error:'Xabar bo‘sh.'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return Response.json({error:'Xabar juda katta.'},{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
  let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return Response.json({error:'Noto‘g‘ri xabar.'},{status:400});}
  const parsed=updateSchema.safeParse(body);if(!parsed.success)return Response.json({error:'Noto‘g‘ri xabar.'},{status:400});
  await initialize();await initializeCustomerRetrieval();
  handler||=createCustomerBot({db,plan:(...args)=>observe({db,bot:'customer',operation:'customer.plan'},()=>planCustomerMessage(...args)),recommend:(...args)=>observe({db,bot:'customer',operation:'customer.recommend'},()=>recommendCustomerProducts(...args)),retrieveProducts:p=>observe({db,bot:'customer',operation:'retrieval.products'},()=>retrieveProducts(p)),retrieveKnowledge:q=>observe({db,bot:'customer',operation:'retrieval.knowledge'},()=>retrieveKnowledge(q)),getShop,send:(method,payload)=>observe({db,bot:'customer',operation:String(payload.chat_id)===admin?'admin_delivery':'customer.send'},()=>telegramCall(method,payload)),adminChatId:admin,baseUrl:env.baseUrl,answerCallback:id=>telegramCall('answerCallbackQuery',{callback_query_id:id})});
  return await observe({db,bot:'customer',operation:'customer.webhook',traceId},async()=>{await handler!(parsed.data);if(parsed.data.message?.text)after(()=>refreshSemanticIndex({limit:8}).catch(()=>{}));return Response.json({ok:true},{headers:{'X-Request-ID':traceId}});});
 }catch(error){console.error('Customer bot request failed',{name:error instanceof Error?error.name:'Error',busy:error instanceof CustomerBotBusyError});return Response.json({error:'Qayta urinib ko‘ring.'},{status:503,headers:{'X-Request-ID':traceId}});}
}
