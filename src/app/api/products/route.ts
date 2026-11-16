import {refreshSemanticIndex} from '@/lib/customer-semantic';
import {applyCategoryValues,normalizeCategoryValues,validateRequiredProductFields,CategoryFieldValidationError} from '@/lib/category-fields';
import { processImageCleanup } from '@/lib/image-cleanup';
import { after } from 'next/server';
import { processTelegramQueue } from '@/lib/telegram';
export const maxDuration=300;
import { initializeInventory } from '@/lib/inventory';
import { validInventoryCode } from '@/lib/inventory-types';
import { NextRequest, NextResponse } from 'next/server';
import { getProducts, saveProduct, getCategories, getCategoryDefinitions } from '@/lib/db';
import { type Product } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { try { return NextResponse.json(await getProducts(request.nextUrl.searchParams.get('all') === '1')); } catch { return NextResponse.json({error:'Maʼlumotlarni yuklab bo‘lmadi.'},{status:500}); } }
export async function POST(request: NextRequest) {
 try {
 const body=await request.json();
 if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Mahsulot ma’lumotlarini tekshiring.'},{status:400});
 const p=body as Product;
 p.brand??='';p.stock??=0;p.oldPrice??=0;p.published??=true;p.featured??=false;

 if(p.modelId!==undefined&&(typeof p.modelId!=='string'||(p.modelId!==''&&!/^[a-zA-Z0-9-]{1,80}$/.test(p.modelId))))return NextResponse.json({error:'Modelni tekshiring.'},{status:400});
 if(p.color!==undefined&&(typeof p.color!=='string'||p.color.trim().length>80))return NextResponse.json({error:'Rang 80 belgidan oshmasin.'},{status:400});
 if(p.color!==undefined)p.color=p.color.trim();
 for(const key of ['ramGb','storageGb'] as const)if(p[key]!==undefined&&p[key]!==null&&(!Number.isInteger(p[key])||p[key]!<1||p[key]!>(key==='ramGb'?256:32768)))return NextResponse.json({error:'RAM va xotirani GB da to‘g‘ri kiriting.'},{status:400});
 if(p.condition!==undefined&&!['','new','used'].includes(p.condition))return NextResponse.json({error:'Holat yangi yoki ishlatilgan bo‘lsin.'},{status:400});
 for(const field of ['sku','barcode'] as const) {
  if(p[field]!==undefined) {
   if(typeof p[field]!=='string'||p[field]!.length>120)return NextResponse.json({error:'Artikul va shtrix-kod 120 belgidan oshmasin.'},{status:400});
   p[field]=p[field]!.trim();
  }
 }
 if(p.barcode&&!validInventoryCode(p.barcode))return NextResponse.json({error:'Shtrix-kodda faqat harf, raqam, nuqta, tire, pastki chiziq yoki ikki nuqta ishlating.'},{status:400});
 if(p.customFields!==undefined) {
  if(!Array.isArray(p.customFields)||p.customFields.length>20||p.customFields.some(f=>!f||typeof f.name!=='string'||typeof f.value!=='string'||!f.name.trim()||!f.value.trim()||f.name.length>80||f.value.length>300))return NextResponse.json({error:'20 tagacha xususiyat kiriting. Nomi va qiymatini to‘ldiring.'},{status:400});
  p.customFields=p.customFields.map(f=>({name:f.name.trim(),value:f.value.trim()}));
  if(new Set(p.customFields.map(f=>f.name.toLocaleLowerCase('uz'))).size!==p.customFields.length)return NextResponse.json({error:'Xususiyat nomlari takrorlanmasin.'},{status:400});
 }
 // Inventory identity is allocated by the server, never supplied by the editor.
 delete p.inventoryCode;
 if(p.hero!==undefined&&(typeof p.hero!=='boolean'||(p.hero&&!p.published)))return NextResponse.json({error:'Bosh sahifa uchun ko‘rinadigan mahsulotni tanlang.'},{status:400});
 if (p.images !== undefined && (!Array.isArray(p.images) || p.images.length > 10 || p.images.some(url => typeof url !== 'string' || url.length > 2000 || !(/^https?:\/\//i.test(url)||/^\/uploads\/[a-zA-Z0-9-]+\.(jpg|png|webp|gif|avif)$/.test(url))))) return NextResponse.json({error:'10 tagacha HTTP(S) rasm havolasini kiriting.'},{status:400});
 p.images = p.images !== undefined ? p.images : p.image ? [p.image] : [];
 p.image = p.images[0] || '';
 validateRequiredProductFields(p);
 p.description=p.description.trim();
 if (!p.name?.trim() || p.name.length > 120 || !(await getCategories()).includes(p.category) || typeof p.brand!=='string' || p.brand.length>120 || !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0 || !Number.isSafeInteger(p.oldPrice) || p.oldPrice < 0 || typeof p.description !== 'string' || p.description.length > 3000 || typeof p.image !== 'string' || (p.image && !(/^https?:\/\//i.test(p.image)||/^\/uploads\/[a-zA-Z0-9-]+\.(jpg|png|webp|gif|avif)$/.test(p.image))) || typeof p.published !== 'boolean' || typeof p.featured !== 'boolean') return NextResponse.json({error:'Mahsulot maydonlarini tekshiring.'},{status:400});
 p.id = p.id || crypto.randomUUID(); if (!/^[a-zA-Z0-9-]{1,80}$/.test(p.id)) return NextResponse.json({error:'Noto‘g‘ri ID.'},{status:400});
 if(p.stockCount!==undefined&&(!Number.isSafeInteger(p.stockCount)||p.stockCount<0||p.stockCount>1000000000))return NextResponse.json({error:'Qoldiqni tekshiring.'},{status:400});
 if(p.stockNote!==undefined&&(typeof p.stockNote!=='string'||p.stockNote.length>500))return NextResponse.json({error:'Izoh 500 belgidan oshmasin.'},{status:400});
 if(p.categoryValues!==undefined){
  const definition=(await getCategoryDefinitions()).find(category=>category.name===p.category);
  if(!definition)return NextResponse.json({error:'Turkum topilmadi.'},{status:400});
  applyCategoryValues(p,definition.fields,normalizeCategoryValues(definition.fields,p.categoryValues));
 }
 await initializeInventory(); p.name=p.name.trim(); await saveProduct(p); after(async()=>{await Promise.allSettled([processTelegramQueue(),processImageCleanup(),refreshSemanticIndex({productIds:[p.id],includeKnowledge:false,limit:1})]);}); return NextResponse.json(p);
 } catch(error) { if(error instanceof CategoryFieldValidationError)return NextResponse.json({error:error.message},{status:400}); if(error instanceof Error&&['PRODUCT_MODEL_NOT_FOUND','PRODUCT_MODEL_MISMATCH','PRODUCT_VARIANT_INCOMPLETE','PRODUCT_VARIANT_CONFLICT'].includes(error.message))return NextResponse.json({error:({PRODUCT_MODEL_NOT_FOUND:'Model topilmadi.',PRODUCT_MODEL_MISMATCH:'Bir model variantlarida nom, turkum va brend bir xil bo‘lishi kerak.',PRODUCT_VARIANT_INCOMPLETE:'Variantning rangi, xotirasi va holatini to‘ldiring.',PRODUCT_VARIANT_CONFLICT:'Bu xususiyatlardagi variant ushbu modelda allaqachon mavjud.'} as Record<string,string>)[error.message]},{status:409}); if(error instanceof Error&&error.message==='PRODUCT_SKU_CONFLICT')return NextResponse.json({error:'Bu artikul boshqa mahsulotda ishlatilgan.'},{status:409}); if(error instanceof Error&&error.message==='PRODUCT_BARCODE_CONFLICT')return NextResponse.json({error:'Bu shtrix-kod boshqa mahsulotga tegishli.'},{status:409}); if(error instanceof Error&&error.message==='INVENTORY_CODE_CONFLICT')return NextResponse.json({error:'Bu kod boshqa mahsulotga biriktirilgan.'},{status:409}); return NextResponse.json({error:'Mahsulotni saqlab bo‘lmadi.'},{status:500}); }
}
