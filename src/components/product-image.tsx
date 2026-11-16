"use client";
import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import type { Product } from '@/lib/types';
export function ProductImage({product,className=''}:{product:Product;className?:string}) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[product.image]);
 return product.image && !failed ? <img className={className} src={product.image} alt={product.name} loading="lazy" onError={()=>setFailed(true)}/> : <div className={`image-fallback ${className}`}><Package size={52}/><span>{product.name}</span></div>;
}
