import {productTitle} from './product-variants';
import type { Product, Shop } from './types';
export type TelegramSnapshot={name:string;description:string;price:number;oldPrice:number;stock:number;photos:string[];owner:string;storeUrl:string};
export function snapshot(product:Product,shop:Shop,baseUrl:string):TelegramSnapshot {
 const owner=shop.telegram.replace(/^@/,'').trim();
 if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(owner))throw new Error('Do‘kon sozlamalarida egasining Telegram foydalanuvchi nomini kiriting.');
 const base=new URL(baseUrl);if(base.protocol!=='https:')throw new Error('Telegram uchun ochiq HTTPS manzil kerak.');
 const photos=(product.images?.length?product.images:product.image?[product.image]:[]).map(url=>new URL(url,base).href);
 if(photos.length>10||photos.some(url=>new URL(url).protocol!=='https:'))throw new Error('Telegram uchun 10 tagacha ochiq HTTPS rasm kerak.');
 return {name:productTitle(product),description:product.description,price:product.price,oldPrice:product.oldPrice,stock:product.stock,photos,owner,storeUrl:base.origin};
}
export function postText(value:TelegramSnapshot){
 return [value.name,`${new Intl.NumberFormat('ru-RU').format(value.price)} so‘m`,value.oldPrice>value.price?`Oldingi narx: ${new Intl.NumberFormat('ru-RU').format(value.oldPrice)} so‘m`:'',value.stock>0?`Mavjud: ${value.stock} dona`:'Sotuvda yo‘q',value.description].filter(Boolean).join('\n\n');
}
export function postButtons(value:TelegramSnapshot,productId:string,botUsername?:string){
 const productUrl=`${value.storeUrl}/products/${encodeURIComponent(productId)}`;
 const draft=`${value.name}\n${productUrl}`;
 return {inline_keyboard:[[{text:'Do‘konimizda ko‘proq ko‘ring',url:botUsername?`https://t.me/${botUsername}?startapp=store`:value.storeUrl}],[{text:'Sotuvchiga yozish',url:`https://t.me/${value.owner}?text=${encodeURIComponent(draft)}`}]]};
}
export function needsRepost(previous:TelegramSnapshot,next:TelegramSnapshot,postedAt:number,now=Date.now()){
 const significant=previous.price!==next.price||previous.oldPrice!==next.oldPrice||(previous.stock>0)!==(next.stock>0);
 return significant&&now-postedAt>=7*86400000;
}
export function splitText(text:string,max=4000){const chars=Array.from(text);const parts:string[]=[];for(let i=0;i<chars.length;i+=max)parts.push(chars.slice(i,i+max).join(''));return parts;}
