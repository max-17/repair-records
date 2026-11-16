import type {Product,Shop,CategoryField} from './types';
export type SearchDocument={id:string;text:string};
/** Only recorded public facts are embedded. Price and stock stay in live SQL filters. */
export function productSearchDocument(p:Product,fields:CategoryField[]=[]):SearchDocument{return {id:`product:${p.id}`,text:[p.name,p.brand,p.category,p.description,p.color,p.ramGb?`${p.ramGb} GB RAM`:'',p.storageGb?`${p.storageGb} GB storage xotira`:'',p.condition==='new'?'Yangi brand new новый':p.condition==='used'?'Ishlatilgan used бывший в употреблении':'',...fields.flatMap(field=>p.categoryValues?.[field.id]!==undefined?[`${field.label}: ${p.categoryValues[field.id]}`]:[]),...(p.customFields||[]).map(f=>`${f.name}: ${f.value}`)].filter(Boolean).join('\n').slice(0,10000)};}
export function knowledgeSearchDocuments(knowledge:string,shop:Shop):SearchDocument[]{
 const docs:SearchDocument[]=[];
 for(const [index,paragraph]of knowledge.slice(0,20000).split(/\n\s*\n/).entries()){
  const text=paragraph.trim();if(!text)continue;
  for(let offset=0;offset<text.length;offset+=1200)docs.push({id:`knowledge:${index}:${offset/1200}`,text:text.slice(offset,offset+1200)});
 }
 docs.push({id:'shop:contact',text:`Do‘kon: ${shop.name}. Telefon: ${shop.phone}. Telegram: @${shop.telegram}. Manzil: ${shop.address}. Ish vaqti: ${shop.hours}.`});return docs;
}
