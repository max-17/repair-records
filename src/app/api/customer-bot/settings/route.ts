import {after} from 'next/server';
import {refreshSemanticIndex} from '@/lib/customer-semantic';
import {cookies} from 'next/headers';
import {authenticated,sessionCookie} from '@/lib/auth';
import {db,initialize} from '@/lib/db';
import {telegramEnvironment} from '@/lib/telegram-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
async function owner(){return authenticated((await cookies()).get(sessionCookie)?.value);}
async function setup(){
 await initialize();
 await db.execute("CREATE TABLE IF NOT EXISTS customer_bot_settings(id INTEGER PRIMARY KEY CHECK(id=1),knowledge TEXT NOT NULL DEFAULT '')");
 await db.execute("INSERT OR IGNORE INTO customer_bot_settings(id,knowledge) VALUES(1,'')");
}
export async function GET(){
 if(!await owner())return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});
 try{
  await setup();const result=await db.execute('SELECT knowledge FROM customer_bot_settings WHERE id=1');
  const leadTable=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_leads'");
  const leadRows=leadTable.rows.length?await db.execute('SELECT id,product_json,customer_json,status,created_at FROM customer_leads ORDER BY created_at DESC LIMIT 20'):null;
  const leads=(leadRows?.rows||[]).map(row=>{
   let product:Record<string,unknown>={},customer:Record<string,unknown>={};
   try{const parsed=JSON.parse(String(row.product_json));if(parsed&&typeof parsed==='object')product=parsed;}catch{}
   try{const parsed=JSON.parse(String(row.customer_json));if(parsed&&typeof parsed==='object')customer=parsed;}catch{}
   return {id:String(row.id),product:{name:typeof product.name==='string'?product.name:'Mahsulot',price:typeof product.price==='number'?product.price:null},customer:{first_name:typeof customer.first_name==='string'?customer.first_name:'Mijoz',username:typeof customer.username==='string'?customer.username:'',id:typeof customer.id==='number'||typeof customer.id==='string'?String(customer.id):''},status:String(row.status),createdAt:Number(row.created_at)};
  });
  const env=telegramEnvironment();
  return Response.json({knowledge:String(result.rows[0]?.knowledge||''),leads,config:{production:env.production,token:!!env.token,webhookSecret:!!process.env.SHOP_TELEGRAM_WEBHOOK_SECRET,adminChat:!!(env.production?process.env.SHOP_ADMIN_CHAT_ID:process.env.SHOP_DEV_ADMIN_CHAT_ID),ai:!!process.env.GOOGLE_GENERATIVE_AI_API_KEY,baseUrl:!!env.baseUrl}},{headers});
 }catch{return Response.json({error:'Mijoz boti sozlamalari yuklanmadi.'},{status:500,headers});}
}
export async function PUT(request:Request){
 if(!await owner())return Response.json({error:'Kirish talab qilinadi.'},{status:401,headers});
 try{
  const origin=request.headers.get('origin');
  if(!origin||new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Ruxsat berilmagan so‘rov.'},{status:403,headers});
  const body=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='knowledge')||typeof body.knowledge!=='string'||body.knowledge.length>20000)return Response.json({error:'Faqat bilim matnini kiriting (20 000 belgigacha).'},{status:400,headers});
  await setup();await db.execute({sql:'UPDATE customer_bot_settings SET knowledge=? WHERE id=1',args:[body.knowledge.trim()]});
  after(()=>refreshSemanticIndex({includeProducts:false,limit:24}).catch(()=>{}));
  return Response.json({ok:true,knowledge:body.knowledge.trim()},{headers});
 }catch{return Response.json({error:'Bilim matni saqlanmadi.'},{status:500,headers});}
}
