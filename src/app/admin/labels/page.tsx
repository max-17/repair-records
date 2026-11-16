import { ProductLabels } from '@/components/product-labels';
import { validInventoryCode } from '@/lib/inventory-types';
const validProductId=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
export default async function Page({searchParams}:{searchParams:Promise<{code?:string;product?:string;products?:string;copies?:string}>}){
  const {code,product,products,copies}=await searchParams;
  const productIds=typeof products==='string'?[...new Set(products.split(',').filter(validProductId))].slice(0,1000):undefined;
  return <ProductLabels key={[code,product,products,copies].join(':')} code={validInventoryCode(code)?code:undefined} productId={validProductId(product)?product:undefined} productIds={productIds} initialCopies={typeof copies==='string'&&/^\d+$/.test(copies)&&Number(copies)<=1000000000?Number(copies):undefined}/>;
}
