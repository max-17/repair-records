import type {Product} from './types';
export function isMobileDevice(category:string){return /smartfon|telefon|phone|planshet|tablet|смартфон|телефон|планшет/i.test(category);}
function categoryValues(value:unknown):Record<string,string|number>{
 if(typeof value==='string'){try{return categoryValues(JSON.parse(value));}catch{return {};}}
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,string|number>:{};
}
function categoryLabels(p:Partial<Product>):Record<string,string>{
 if(p.categoryFieldLabels)return p.categoryFieldLabels;
 // Sale/stock snapshots may receive a raw SQLite row with joined definitions.
 const raw=(p as Partial<Product>&{category_fields?:unknown}).category_fields;
 try{const fields=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(fields)?Object.fromEntries(fields.filter(field=>field&&typeof field.id==='string'&&typeof field.label==='string').map(field=>[field.id,field.label])):{};}catch{return {};}
}
export function variantDescription(p:Partial<Product>,language:'uz'|'ru'='uz'){
 const values=categoryValues(p.categoryValues),labels=categoryLabels(p);
 const ids=[...new Set([...Object.keys(labels),...Object.keys(values).sort()])];
 const extra=ids.filter(id=>!['memory','color','condition'].includes(id)&&Object.hasOwn(values,id)&&values[id]!==null&&values[id]!==undefined&&String(values[id]).trim()!=='').map(id=>`${labels[id]||(language==='ru'?'Параметр':'Xususiyat')}: ${String(values[id])}`);
 return [p.color,p.ramGb&&p.storageGb?`${p.ramGb}/${p.storageGb} GB`:p.storageGb?`${p.storageGb} GB`:p.ramGb?`${p.ramGb} GB RAM`:'',p.condition==='new'?(language==='ru'?'Новый':'Yangi'):p.condition==='used'?(language==='ru'?'Б/у':'Ishlatilgan'):'',...extra].filter(Boolean).join(' · ');
}
export function productTitle(p:Partial<Product>){const variant=variantDescription(p);return variant?`${p.name} / ${variant}`:String(p.name||'');}
export function variantKey(p:Partial<Product>){
 const attributes=Object.entries(categoryValues(p.categoryValues)).filter(([id,value])=>!['memory','color','condition'].includes(id)&&value!==null&&value!==undefined&&String(value).trim()!=='').sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>[id,String(value).normalize('NFKC').trim().toLocaleLowerCase('uz')]);
 // Keep the legacy four-element key when no generic attributes are present.
 return JSON.stringify([p.color?.normalize('NFKC').trim().toLocaleLowerCase('uz')||'',p.ramGb??null,p.storageGb??null,p.condition||'',...(attributes.length?[attributes]:[])]);
}
export function groupCatalog(products:Product[]){
 const groups=new Map<string,Product[]>();for(const p of products){const key=p.modelId||p.id;groups.set(key,[...(groups.get(key)||[]),p]);}
 return [...groups.values()].map(variants=>{const sorted=[...variants].sort((a,b)=>Number(b.stock>0)-Number(a.stock>0)||a.price-b.price);return {...sorted[0],variantCount:variants.length};});
}
