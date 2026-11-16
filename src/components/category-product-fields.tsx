'use client';
import type {Product,CategoryField} from '@/lib/types';
import {isMobileDevice} from '@/lib/product-variants';
import {Input} from './ui/input';
export function productCategoryValues(product:Product,fields:CategoryField[]):Record<string,string|number>{
 const values:Record<string,string|number>={};
 for(const field of fields){
  let value=product.categoryValues?.[field.id];
  if(value===undefined){
   if(field.id==='memory')value=product.storageGb?`${product.ramGb||''}/${product.storageGb}`:'';
   if(field.id==='color')value=product.color||'';
   if(field.id==='condition')value=product.condition==='new'?'Yangi':product.condition==='used'?'Ishlatilgan':'';
  }
  if(value===undefined||value==='')continue;
  if(field.type==='select'&&!field.options?.includes(String(value)))continue;
  if(field.type==='number'){const numeric=Number(value);if(Number.isFinite(numeric))values[field.id]=numeric;}
  else values[field.id]=String(value);
 }
 return values;
}
export function CategoryProductFields({product:p,onChange,fields,products}:{product:Product;onChange:(p:Product)=>void;fields:CategoryField[];products:Product[]}){
 const groups=[...new Map(products.filter(item=>item.modelId&&item.category===p.category).map(item=>[item.modelId!,item])).values()];
 const values=productCategoryValues(p,fields);
 const currentValue=(field:CategoryField)=>values[field.id]??'';
 function setValue(field:CategoryField,raw:string){
  const values={...(p.categoryValues||{})};if(raw==='')delete values[field.id];else values[field.id]=field.type==='number'?Number(raw):raw;
  const patch:Partial<Product>={categoryValues:values};
  if(field.id==='memory'){const match=/^([1-9]\d{0,2})\/([1-9]\d{0,4})$/.exec(raw.replace(/\s/g,''));patch.ramGb=match?Number(match[1]):null;patch.storageGb=match?Number(match[2]):null;}
  if(field.id==='color')patch.color=raw;
  if(field.id==='condition')patch.condition=/^(new|yangi)$/i.test(raw)?'new':/^(used|ishlatilgan)$/i.test(raw)?'used':'';
  onChange({...p,...patch});
 }
 if(!fields.length&&!isMobileDevice(p.category))return null;
 return <fieldset className="device-fields category-product-fields"><legend>Turkum xususiyatlari</legend>
  {isMobileDevice(p.category)&&<label>Model<select className="input" value={p.modelId||''} onChange={e=>{const model=groups.find(item=>item.modelId===e.target.value);onChange({...p,modelId:e.target.value,...(model?{name:model.name,brand:model.brand,category:model.category}:{})});}}><option value="">Yangi model</option>{groups.map(item=><option key={item.modelId} value={item.modelId}>{item.name}</option>)}</select></label>}
  <div className="category-product-inputs">{fields.map(field=><label key={field.id}>{field.label}{field.id==='memory'&&!/GB/i.test(field.label)?' (GB)':''}<span className="optional-label">Ixtiyoriy</span>{field.type==='select'?<select className="input" value={currentValue(field)} onChange={e=>setValue(field,e.target.value)}><option value="">Tanlanmagan</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</select>:<Input type={field.type==='number'?'number':'text'} step={field.type==='number'?'any':undefined} maxLength={field.type==='number'?undefined:300} pattern={field.id==='memory'?'[1-9][0-9]{0,2}/[1-9][0-9]{0,4}':undefined} title={field.id==='memory'?'Masalan, 8/256':undefined} placeholder={field.id==='memory'?'8/256':field.type==='number'?'Masalan, 2.5':'Qiymat kiriting'} value={currentValue(field)} onChange={e=>setValue(field,e.target.value)}/>}</label>)}</div>
  <p className="hint">Bu maydonlarni bo‘sh qoldirish mumkin. Har bir variantning narxi, qoldig‘i va kodi alohida.</p>
 </fieldset>;
}
