import type {CategoryField,Product} from './types';
import {isMobileDevice} from './product-variants';
export class CategoryFieldValidationError extends Error {}
const fail=(message:string):never=>{throw new CategoryFieldValidationError(message);};
export function normalizeCategoryName(value:unknown){
 if(typeof value!=='string')return fail('Turkum nomini kiriting.');
 const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(name))return fail('Turkum nomi 1–60 belgidan iborat bo‘lsin.');return name;
}
export function defaultCategoryFields(name:string):CategoryField[]{return isMobileDevice(name)?[{id:'memory',label:'RAM / Xotira, GB',type:'text'},{id:'color',label:'Rang',type:'text'},{id:'condition',label:'Holati',type:'select',options:['Yangi','Ishlatilgan']}]:[];}
export function validateCategoryFields(value:unknown):CategoryField[]{
 if(!Array.isArray(value)||value.length>20)return fail('20 tagacha qo‘shimcha maydon kiriting.');
 const fields=value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['id','label','type','options'].includes(key)))return fail('Maydon ma’lumotlarini tekshiring.');
  if(typeof raw.id!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(raw.id))return fail('Maydon kodi kichik lotin harfi bilan boshlansin (40 belgigacha).');
  if(typeof raw.label!=='string'||!raw.label.trim()||raw.label.trim().length>80)return fail('Maydon nomi 1–80 belgidan iborat bo‘lsin.');
  if(!['text','number','select'].includes(raw.type))return fail('Maydon turini tanlang.');
  const field:CategoryField={id:raw.id,label:raw.label.trim(),type:raw.type};
  if(raw.type==='select'){
   if(!Array.isArray(raw.options)||raw.options.length<1||raw.options.length>30||raw.options.some((option:unknown)=>typeof option!=='string'||!option.trim()||option.trim().length>80))return fail('Tanlov maydoniga 1–30 ta variant kiriting.');
   field.options=raw.options.map((option:string)=>option.trim());
   if(new Set(field.options!.map(option=>option.toLocaleLowerCase('uz'))).size!==field.options!.length)return fail('Tanlov variantlari takrorlanmasin.');
  }else if(raw.options!==undefined)return fail('Variantlar faqat tanlov maydonida bo‘ladi.');
  return field;
 });
 if(new Set(fields.map(field=>field.id)).size!==fields.length||new Set(fields.map(field=>field.label.toLocaleLowerCase('uz'))).size!==fields.length)return fail('Maydon kodi va nomi takrorlanmasin.');return fields;
}
export function normalizeCategoryValues(fields:CategoryField[],input:unknown):Record<string,string|number>{
 if(!input||typeof input!=='object'||Array.isArray(input))return fail('Qo‘shimcha maydonlarni tekshiring.');
 const record=input as Record<string,unknown>,definitions=new Map(fields.map(field=>[field.id,field]));
 if(Object.keys(record).some(key=>!definitions.has(key)))return fail('Ushbu turkumda mavjud bo‘lmagan maydon yuborildi.');
 const values:Record<string,string|number>={};
 for(const [id,value]of Object.entries(record)){
  if(value===null||value===undefined||value==='')continue;
  const field=definitions.get(id)!;
  if(field.type==='number'){
   if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)return fail(`${field.label}: raqam kiriting.`);values[id]=value;
  }else{
   if(typeof value!=='string'||value.trim().length>300)return fail(`${field.label}: matnni tekshiring.`);
   const text=value.trim();if(!text)continue;
   if(field.type==='select'&&!field.options?.includes(text))return fail(`${field.label}: ro‘yxatdagi variantni tanlang.`);
   if(id==='memory'&&!/^([1-9]\d{0,2})\/([1-9]\d{0,4})$/.test(text))return fail('RAM / Xotirani 8/256 ko‘rinishida kiriting.');
   if(id==='memory'){const [ram,storage]=text.split('/').map(Number);if(ram>256||storage>32768)return fail('RAM yoki xotira juda katta.');}
   values[id]=text;
  }
 }
 return values;
}
/** Map only configured reserved IDs; all values remain optional. */
export function applyCategoryValues(product:Product,fields:CategoryField[],values:Record<string,string|number>){
 const ids=new Set(fields.map(field=>field.id));
 if(ids.has('memory')){const memory=typeof values.memory==='string'?values.memory:'';const [ram,storage]=memory.split('/').map(Number);product.ramGb=ram||null;product.storageGb=storage||null;}
 if(ids.has('color'))product.color=String(values.color||'');
 if(ids.has('condition')){const state=String(values.condition||'').toLocaleLowerCase('uz');product.condition=['yangi','new'].includes(state)?'new':['ishlatilgan','used'].includes(state)?'used':'';}
 product.categoryValues=values;
}
export function validateRequiredProductFields(product:Partial<Product>){
 if(typeof product.name!=='string'||!product.name.trim()||product.name.length>120)return fail('Mahsulot nomini kiriting (120 belgigacha).');
 if(!Number.isSafeInteger(product.price)||Number(product.price)<0)return fail('Sotuv narxini to‘g‘ri kiriting.');
 if(!Number.isSafeInteger(product.purchasePrice)||Number(product.purchasePrice)<0)return fail('Xarid narxini to‘g‘ri kiriting.');
 if(typeof product.description!=='string'||!product.description.trim()||product.description.length>3000)return fail('Mahsulot tavsifini kiriting (3000 belgigacha).');
 if(!Array.isArray(product.images)||product.images.length<1||product.images.some(image=>typeof image!=='string'||!image.trim()))return fail('Kamida bitta mahsulot rasmi kerak.');
}
