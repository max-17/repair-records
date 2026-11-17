import {cookies} from 'next/headers';
import {db} from '@/lib/db';
import {createStaffSession,sessionCookie,sessionSeconds} from '@/lib/auth';
import {staffSession} from '@/lib/staff-session';
import {beginStaffLogin,pollStaffLogin} from '../../../../staff-auth.js';
import {combinedRepairEnv} from '../../../../combined-runtime.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
let botUsername=process.env.STAFF_BOT_USERNAME||'';
export async function GET(request:Request){
 if(new URL(request.url).searchParams.has('me')){const user=await staffSession();return Response.json(user?{id:user.id,name:user.name,role:user.roleName,permissions:user.permissions}:{error:'Unauthorized'},{status:user?200:401,headers:{'Cache-Control':'no-store'}});}
 const proof=(await cookies()).get('staff-login-proof')?.value;const result=await pollStaffLogin(db,process.env,proof);if(!result)return Response.json({status:'expired'},{headers:{'Cache-Control':'no-store'}});
 const response=Response.json({status:result.status},{headers:{'Cache-Control':'no-store'}});
 if(result.status==='approved'){(await cookies()).set(sessionCookie,createStaffSession(result.user!.id),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:sessionSeconds});}
 return response;
}
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(!origin||new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Forbidden'},{status:403});
 try{const raw=await request.text();if(raw.length>500)return Response.json({error:'So‘rov katta.'},{status:413});const body=JSON.parse(raw);if(body.invite&& !/^[\w-]{32}$/.test(body.invite))throw new Error('INVALID_INVITE');
  const env=combinedRepairEnv(),token=env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('BOT_UNAVAILABLE');
  if(!botUsername){const info=await fetch(`https://api.telegram.org/bot${token}/getMe`,{signal:AbortSignal.timeout(5000)});const value=await info.json();if(!value.ok||!/^\w+$/.test(value.result?.username))throw new Error('BOT_UNAVAILABLE');botUsername=value.result.username;}
  if(!/^\w+$/.test(botUsername))throw new Error('BOT_UNAVAILABLE');
  const result=await beginStaffLogin(db,process.env,{invite:body.invite,ip:request.headers.get('x-forwarded-for')?.split(',')[0]||'local'});
  (await cookies()).set('staff-login-proof',result.proof,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth/telegram',maxAge:600});
  return Response.json({url:`https://t.me/${botUsername}?start=auth_${result.id}`},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error&&error.message==='INVITE_EXPIRED'?'Taklif eskirgan yoki ishlatilgan.':error instanceof Error&&error.message==='RATE_LIMIT'?'Ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.':'Telegram kirishi hozir ishlamayapti. Bot sozlamalarini tekshiring.';return Response.json({error:message},{status:400});}
}
