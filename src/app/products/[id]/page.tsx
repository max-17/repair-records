import { notFound } from 'next/navigation';
import { getProducts, getShop, getCategoryDefinitions } from '@/lib/db';
import ProductPage from '@/components/product-page';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const [products,shop,definitions]=await Promise.all([getProducts(),getShop(),getCategoryDefinitions()]);
 const product=products.find(p=>p.id===id);
 if(!product)notFound();
 const variants=product.modelId?products.filter(p=>p.modelId===product.modelId):[product];
 return <ProductPage product={product} shop={shop} variants={variants} fields={definitions.find(d=>d.name===product.category)?.fields||[]}/>;
}
