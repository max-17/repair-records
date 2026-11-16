import { processImageCleanup } from '@/lib/image-cleanup';
import { after } from 'next/server';
import { processTelegramQueue } from '@/lib/telegram';
export const maxDuration=300;
import { NextResponse } from 'next/server';
import { deleteProduct } from '@/lib/db';
export async function DELETE(_: Request, context: {params: Promise<{id:string}>}) { try { const {id}=await context.params; await deleteProduct(id); after(async()=>{await Promise.allSettled([processTelegramQueue(),processImageCleanup()]);}); return NextResponse.json({ok:true}); } catch {return NextResponse.json({error:'O‘chirib bo‘lmadi.'},{status:500});} }
