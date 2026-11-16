import Catalog from '@/components/catalog';
import { getCategories, getProducts, getShop } from '@/lib/db';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export default async function Page() {
 const [products,categories,shop]=await Promise.allSettled([getProducts(),getCategories(),getShop()]);
 return <Catalog initialProducts={products.status==='fulfilled'?products.value:undefined} initialCategories={categories.status==='fulfilled'?categories.value:undefined} initialShop={shop.status==='fulfilled'?shop.value:undefined}/>;
}
