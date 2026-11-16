import { salesAnalytics } from '@/lib/sales';
import { InventoryError } from '@/lib/inventory';
import { shopDate, shiftDate } from '@/lib/sales-types';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{const params=new URL(request.url).searchParams;const today=shopDate();return Response.json(await salesAnalytics(params.get('from')||shiftDate(today,-29),params.get('to')||today));}
  catch(error){return Response.json({error:error instanceof InventoryError?error.message:'Hisobot yuklanmadi.'},{status:error instanceof InventoryError?error.status:500});}
}
