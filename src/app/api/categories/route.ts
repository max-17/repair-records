import {after} from 'next/server';
import {refreshSemanticIndex} from '@/lib/customer-semantic';
import { NextRequest, NextResponse } from 'next/server';
import { addCategory,getCategories,getCategoryDefinitions,updateCategoryFields } from '@/lib/db';
import {CategoryFieldValidationError,normalizeCategoryName,validateCategoryFields} from '@/lib/category-fields';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{return NextResponse.json(request.nextUrl.searchParams.get('definitions')==='1'?await getCategoryDefinitions():await getCategories());}catch{return NextResponse.json({error:'Turkumlarni yuklab bo‘lmadi.'},{status:500});}}
async function write(request:NextRequest,update:boolean){
 try{
  const body=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['name','fields'].includes(key)))return NextResponse.json({error:'Turkum ma’lumotlarini tekshiring.'},{status:400});
  const name=normalizeCategoryName(body.name);
  const fields=body.fields===undefined?undefined:validateCategoryFields(body.fields);
  if(update){if(fields===undefined)return NextResponse.json({error:'Maydonlar ro‘yxatini yuboring.'},{status:400});if(!await updateCategoryFields(name,fields))return NextResponse.json({error:'Turkum topilmadi.'},{status:404});after(()=>refreshSemanticIndex({limit:32}).catch(()=>{}));return NextResponse.json({name,fields});}
  if(!await addCategory(name,fields))return NextResponse.json({error:'Bu turkum allaqachon mavjud.'},{status:409});
  const definition=(await getCategoryDefinitions()).find(category=>category.name===name);after(()=>refreshSemanticIndex({limit:32}).catch(()=>{}));return NextResponse.json(definition,{status:201});
 }catch(error){return NextResponse.json({error:error instanceof CategoryFieldValidationError?error.message:'Turkumni saqlab bo‘lmadi.'},{status:error instanceof CategoryFieldValidationError?400:500});}
}
export function POST(request:NextRequest){return write(request,false);}
export function PUT(request:NextRequest){return write(request,true);}
