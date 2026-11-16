import { after } from 'next/server';
import { processTelegramQueue } from '@/lib/telegram';
export const maxDuration=300;
import { getInventory, adjustStock, InventoryError } from '@/lib/inventory';
import type { StockAction } from '@/lib/inventory-types';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(await getInventory()); }
  catch { return Response.json({ error: 'Ombor maʼlumotlari yuklanmadi.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.id) || typeof body.productId !== 'string' ||
      !['in','out','count'].includes(body.type) || !Number.isSafeInteger(body.quantity) || body.quantity < (body.type === 'count' ? 0 : 1) ||
      body.quantity > 1000000000 || typeof body.note !== 'string' || body.note.length > 500) {
      return Response.json({ error: 'Miqdor va izohni tekshiring.' }, { status: 400 });
    }
    const result=await adjustStock({ id: body.id, productId: body.productId, type: body.type as StockAction, quantity: body.quantity, note: body.note.trim() });
    after(()=>processTelegramQueue());return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof InventoryError ? error.message : 'O‘zgarish saqlanmadi.' }, { status: error instanceof InventoryError ? error.status : 500 });
  }
}
