import {cookies} from 'next/headers';
import {createHash} from 'node:crypto';
import {authenticated,sessionCookie} from '@/lib/auth';
import {staffSession} from '@/lib/staff-session';
import {db} from '@/lib/db';
import {setupPul} from '../../../pul-db.js';
import {pulService} from '../../../pul.js';
import {pulPlanSchema} from '../../../pul-parser.js';
import {pulWebOverview,pulWebDetail,webActor} from '../../../pul-web.js';
import {todayInTashkent} from '../../../time.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.read'))return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});
 try{await setupPul(db);const p=new URL(request.url).searchParams,shop=process.env.PUL_SHOP_ID||'main';
  if(p.has('id')){if(!uuid(p.get('id')))return Response.json({error:'ID noto‘g‘ri.'},{status:400,headers});const detail=await pulWebDetail(db,shop,p.get('id'));if(detail&&!actor.permissions.includes('pul.all')&&detail.record.worker_id!==actor.id)return Response.json({error:'Ruxsat yo‘q.'},{status:403,headers});return Response.json(detail||{error:'Yozuv topilmadi.'},{status:detail?200:404,headers});}
  const today=todayInTashkent(new Date());const overview=await pulWebOverview(db,shop,{start:p.get('start')||today,end:p.get('end')||today,today,kind:p.get('kind')||'all',status:p.get('status')||'active',worker:actor.permissions.includes('pul.all')?(p.get('worker')||''):actor.id,currency:p.get('currency')||'',q:(p.get('q')||'').slice(0,300),page:Math.min(100000,Math.max(1,Number(p.get('page'))||1))});return Response.json({...overview,currentUser:{id:actor.id,name:actor.name,permissions:actor.permissions}},{headers});
 }catch(error){return Response.json({error:error instanceof Error&&error.message==='INVALID_PERIOD'?'Davrni tekshiring (ko‘pi bilan 366 kun).':'Yozuvlarni yuklab bo‘lmadi.'},{status:400,headers});}
}
export async function POST(request:Request){
 const session=(await cookies()).get(sessionCookie)?.value;
 const actor=await staffSession();
 if(!actor?.permissions.includes('pul.write'))return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});
 const origin=request.headers.get('origin');if(!origin||new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Ruxsat yo‘q.'},{status:403,headers});
 if(Number(request.headers.get('content-length')||0)>30000)return Response.json({error:'So‘rov juda katta.'},{status:413,headers});
 try{
  const raw=await request.text();if(raw.length>30000)return Response.json({error:'So‘rov juda katta.'},{status:413,headers});const body=JSON.parse(raw);
  if(!uuid(body.requestId)||!uuid(body.draftId)||!['preview','confirm','cancel'].includes(body.action))return Response.json({error:'So‘rov noto‘g‘ri.'},{status:400,headers});
  await setupPul(db);const shop=process.env.PUL_SHOP_ID||'main';let plan:{action:string;[key:string]:unknown}|undefined;
  if(body.action==='preview'){
   if(!actor.permissions.includes('admin')&&body.workerId!==actor.id)throw new Error('INVALID_WORKER');
   plan=pulPlanSchema.parse({...Object.fromEntries(Object.keys(pulPlanSchema.shape).map(k=>[k,k==='include_deleted'?false:null])),...body.plan});
   if(!['sale','debt','pay','vendor_payment','vendor','edit','delete','restore','remind'].includes(plan.action))throw new Error('INVALID_ACTION');
   if(body.workerId!==webActor&&!['edit','delete','restore','remind'].includes(plan.action)){const worker=(await db.execute({sql:'SELECT telegram_id FROM staff_users WHERE telegram_id=? AND is_active=1',args:[body.workerId||'']})).rows[0];if(!worker)throw new Error('INVALID_WORKER');}
   if(body.photo){if(!/^web:[0-9a-f-]{36}$/.test(body.photo))throw new Error('INVALID_PHOTO');const image=(await db.execute({sql:'SELECT id FROM pul_photos WHERE shop_id=? AND id=?',args:[shop,body.photo.slice(4)]})).rows[0];if(!image)throw new Error('INVALID_PHOTO');}
  }else if(!uuid(body.token))throw new Error('INVALID_TOKEN');
  const service=pulService({db,env:process.env,authorize:async()=>actor,allowAttribution:true,parse:async()=>plan,transcribeVoice:async()=>{throw new Error('VOICE_NOT_AVAILABLE');}});
  const scope=createHash('sha256').update(session!).digest('hex');
  const result=await service({masterId:'web',conversationId:`web:${scope}:${body.draftId}`,requestId:`web:${body.requestId}`,receivedBy:actor.id,receivedByName:actor.name,attributedWorkerId:body.action==='preview'?body.workerId:undefined,text:body.action==='preview'?'Manual entry':`/pul_${body.action} ${body.token}`,commandData:body.action==='preview'?{plan,photo:body.photo||null}:null,initialPhoto:body.photo||null});
  const button=result.reply_markup?.inline_keyboard?.flat().find((b:{callback_data?:string})=>b.callback_data?.startsWith('pul_confirm:'));
  const token=button?.callback_data?.split(':')[1];
  return Response.json({text:result.text,token,ready:Boolean(token),saved:result.text.startsWith('Saqlandi.'),cancelled:body.action==='cancel'},{headers});
 }catch(error){const code=error instanceof Error?error.message:'';return Response.json({error:code==='PUL_REQUEST_CONFLICT'?'Bu so‘rov o‘zgargan. Qaytadan kiriting.':code==='INVALID_WORKER'?'Xodimni tanlang.':'Ma’lumotlar noto‘g‘ri yoki saqlash amalga oshmadi. Qayta tekshiring.'},{status:400,headers});}
}
