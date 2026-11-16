export type CategoryField={id:string;label:string;type:'text'|'number'|'select';options?:string[]};
export type CategoryDefinition={name:string;fields:CategoryField[]};
export type Product = { purchasePrice?:number|null;categoryValues?:Record<string,string|number>;categoryFieldLabels?:Record<string,string>; id: string; modelId?:string; color?:string; ramGb?:number|null; storageGb?:number|null; condition?:'new'|'used'|''; sku?: string; barcode?: string; customFields?: {name:string;value:string}[]; name: string; category: string; brand: string; price: number; oldPrice: number; stock: number; stockCount?: number; stockNote?: string; image: string; images?: string[]; description: string; featured: boolean; published: boolean; hero?: boolean; inventoryCode?: string; };
export function productImages(product: Product): string[] { return product.images?.length ? product.images : product.image ? [product.image] : []; }
export type Shop = { name: string; tagline: string; phone: string; telegram: string; address: string; hours: string; heroProductId?: string; heroMode?: 'automatic' | 'custom'; };
export const categories = ['Smartfonlar', 'Planshetlar', 'Noutbuklar', 'Quloqchinlar', 'Aksessuarlar', 'Soatlar'];
export const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
