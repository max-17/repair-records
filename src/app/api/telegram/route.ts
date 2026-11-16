import { after } from 'next/server';
import { db, initialize, getProducts } from '@/lib/db';
import { enqueueTelegram } from '@/lib/telegram-outbox';
import { connectChannel, telegramStatus, processTelegramQueue } from '@/lib/telegram';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(){try{const status=await telegramStatus();after(()=>processTelegramQueue());return Response.json(status);}catch{return Response.json({error:'Telegram holati yuklanmadi.'},{status:500});}}
export async function POST(request:Request){
 try{
  const body=await request.json();await initialize();
  if(body.action==='connect'){
   if(typeof body.channel!=='string'||!/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{1,20})$/.test(body.channel))return Response.json({error:'@kanal_nomi yoki kanal raqamini kiriting.'},{status:400});
   const channel=await connectChannel(body.channel);return Response.json(channel);
  }
  if(body.action==='toggle'){
   if(typeof body.channel!=='string'||typeof body.enabled!=='boolean')return Response.json({error:'Kanalni tekshiring.'},{status:400});
   await db.execute({sql:'UPDATE telegram_channels SET enabled=? WHERE id=?',args:[Number(body.enabled),body.channel]});
  }else if(body.action==='publish'){
   if(!Array.isArray(body.products)||!body.products.length||body.products.length>50||body.products.some((id:unknown)=>typeof id!=='string'))return Response.json({error:'1–50 ta mahsulot tanlang.'},{status:400});
   const products=await getProducts(true);if(body.products.some((id:string)=>!products.some(p=>p.id===id&&p.published)))return Response.json({error:'Faqat katalogdagi mahsulotni joylash mumkin.'},{status:400});
   const tx=await db.transaction('write');try{for(const id of new Set<string>(body.products))await enqueueTelegram(tx,id,true);await tx.commit();}catch(error){await tx.rollback();throw error;}finally{tx.close();}
  }else if(body.action==='retry'){
   if(typeof body.productId!=='string'||typeof body.channel!=='string')return Response.json({error:'Postni tanlang.'},{status:400});
   // Unknown send outcomes require an explicit channel inspection acknowledgement.
   const job=await db.execute({sql:'SELECT status FROM telegram_jobs WHERE product_id=? AND channel_id=?',args:[body.productId,body.channel]});
   if(job.rows[0]?.status==='uncertain'&&body.checkedChannel!==true)return Response.json({error:'Avval kanalni tekshiring. Takroriy post paydo bo‘lishi mumkin.'},{status:409});
   await db.execute({sql:"UPDATE telegram_jobs SET status='pending',attempts=0,next_attempt=0,error='' WHERE product_id=? AND channel_id=? AND status IN ('failed','uncertain')",args:[body.productId,body.channel]});
  }else if(body.action!=='process'&&body.action!=='toggle')return Response.json({error:'Noto‘g‘ri amal.'},{status:400});
  after(()=>processTelegramQueue());return Response.json({ok:true});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Telegram so‘rovi bajarilmadi.'},{status:400});}
}
