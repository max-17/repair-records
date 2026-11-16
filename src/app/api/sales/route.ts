import { after } from 'next/server';
import { processTelegramQueue } from '@/lib/telegram';
export const maxDuration=300;
import { confirmSale, recentSales } from '@/lib/sales';
import { InventoryError } from '@/lib/inventory';
import type { SaleLineInput } from '@/lib/sales-types';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await recentSales());}catch{return Response.json({error:'Sotuvlar yuklanmadi.'},{status:500});}}
export async function POST(request:Request){
  try{
    const body=await request.json();
    if(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(body.id)||!Array.isArray(body.items)||!body.items.length||body.items.length>100||body.items.some((item:SaleLineInput)=>!item||typeof item.productId!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000000||!Number.isSafeInteger(item.unitPrice)||item.unitPrice<0)||new Set(body.items.map((item:SaleLineInput)=>item.productId)).size!==body.items.length)return Response.json({error:'Savatdagi mahsulot va miqdorlarni tekshiring.'},{status:400});
    const result=await confirmSale(body.id,body.items);after(()=>processTelegramQueue());return Response.json(result);
  }catch(error){return Response.json({error:error instanceof InventoryError?error.message:'Sotuv saqlanmadi. Qayta urinib ko‘ring.'},{status:error instanceof InventoryError?error.status:500});}
}
