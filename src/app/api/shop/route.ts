import { after } from 'next/server';
import { processTelegramQueue } from '@/lib/telegram';
export const maxDuration=300;
import { NextResponse } from 'next/server';
import { getShop, saveShop, getProducts } from '@/lib/db';
import type { Shop } from '@/lib/types';
export const dynamic='force-dynamic';
export async function GET() { try {return NextResponse.json(await getShop());} catch {return NextResponse.json({error:'Do‘konni yuklab bo‘lmadi.'},{status:500});} }
export async function PUT(request: Request) {try {const shop=await request.json() as Shop; if (['name','tagline','phone','telegram','address','hours'].some(k=>typeof shop[k as keyof Shop] !== 'string' || String(shop[k as keyof Shop]).length>250) || !shop.name.trim() || !/^\+998\d{9}$/.test(shop.phone) || !/^[a-zA-Z0-9_]{5,32}$/.test(shop.telegram)) return NextResponse.json({error:'Telefon (+998 va 9 raqam) va Telegram nomini tekshiring.'},{status:400}); if(shop.heroMode!==undefined&&shop.heroMode!=='automatic'&&shop.heroMode!=='custom')return NextResponse.json({error:'Bosh sahifa rejimini tekshiring.'},{status:400}); if(shop.heroProductId!==undefined&&(typeof shop.heroProductId!=='string'||(shop.heroProductId!==''&&!(await getProducts()).some(p=>p.id===shop.heroProductId)))) return NextResponse.json({error:'Bosh sahifa uchun katalogdagi mahsulotni tanlang.'},{status:400}); await saveShop({...shop,heroProductId:shop.heroProductId??(await getShop()).heroProductId,heroMode:shop.heroMode??(await getShop()).heroMode}); after(()=>processTelegramQueue()); return NextResponse.json(shop);} catch {return NextResponse.json({error:'Saqlab bo‘lmadi.'},{status:500});} }
