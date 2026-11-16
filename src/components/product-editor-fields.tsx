'use client';
import type {Product,CategoryDefinition} from '@/lib/types';
import {CategoryProductFields} from './category-product-fields';
import {ProductImagesEditor} from './product-images-editor';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select';
type Props={product:Product;onChange:(p:Product)=>void;categories:string[];definitions:CategoryDefinition[];products:Product[];disabled:boolean;onUploadingChange:(busy:boolean)=>void;onUploaded:(urls:string[])=>void};
export function ProductEditorFields({product:p,onChange,categories,definitions,products,disabled,onUploadingChange,onUploaded}:Props){
 const change=(patch:Partial<Product>)=>onChange({...p,...patch});
 return <div className="product-editor-columns">
  <div className="product-editor-main">
   <section className="editor-section"><h3>Asosiy ma’lumotlar</h3>
    <label>Mahsulot nomi<Input required maxLength={120} readOnly={!!p.modelId} value={p.name} onChange={e=>change({name:e.target.value})} placeholder="Masalan, Samsung Galaxy S24"/></label>
    <div className="form-row"><div className="field"><label htmlFor="product-category">Turkum</label><Select value={p.category} onValueChange={value=>{if(value)change({category:value,modelId:'',categoryValues:{},color:'',ramGb:null,storageGb:null,condition:''});}} items={categories.map(value=>({value,label:value}))}><SelectTrigger id="product-category" className="select-trigger"><SelectValue/></SelectTrigger><SelectContent className="select-content" alignItemWithTrigger={false}>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><label>Brend<Input readOnly={!!p.modelId} value={p.brand} onChange={e=>change({brand:e.target.value})} placeholder="Samsung"/></label></div>
    <div className="form-row"><label>Artikul (SKU)<Input maxLength={120} value={p.sku||''} onChange={e=>change({sku:e.target.value})} placeholder="S24-8256-BLK"/></label><label>Shtrix-kod<Input maxLength={120} value={p.barcode||''} onChange={e=>change({barcode:e.target.value})} placeholder="Qutidagi shtrix-kod"/></label></div>
   </section>
   <CategoryProductFields key={(p.id||'new')+':'+p.category} product={p} onChange={onChange} fields={definitions.find(definition=>definition.name===p.category)?.fields||[]} products={products}/>
   <section className="editor-section"><h3>Tavsif</h3>
    <label>Tavsif<textarea required className="input" rows={3} maxLength={3000} value={p.description} onChange={e=>change({description:e.target.value})} placeholder="Mahsulot haqida qo‘shimcha ma’lumot"/></label>
   </section>
  </div>
  <aside className="product-editor-side">
   <section className="editor-section"><h3>Narx va qoldiq</h3>
    <label>Sotuv narxi, so‘m<Input type="number" inputMode="numeric" required min={0} step={1} value={p.price} onChange={e=>change({price:Number(e.target.value)})}/></label>
    <label>Xarid narxi, so‘m<Input type="number" inputMode="numeric" required min={0} step={1} value={p.purchasePrice??''} onChange={e=>change({purchasePrice:e.target.value===''?null:Number(e.target.value)})}/><small className="purchase-price-note">Faqat xodimlar uchun. Mijozlarga ko‘rsatilmaydi.</small></label>
    <div className="form-row"><label>Qoldiq, dona<Input type="number" required min={0} max={1000000000} step={1} value={p.stock} onChange={e=>change({stock:Number(e.target.value),stockCount:Number(e.target.value)})}/></label><label>O‘lchov birligi<Input value="Dona" readOnly/></label></div>
    {p.id&&p.stockCount!==undefined&&<label>Miqdor o‘zgarishi sababi<Input maxLength={500} value={p.stockNote||''} onChange={e=>change({stockNote:e.target.value})} placeholder="Sanashdagi farq"/></label>}
   </section>
   <section className="editor-section editor-image-section"><h3>Rasmlar</h3><p className="required-photo-note">Kamida bitta mahsulot rasmi kerak.</p><ProductImagesEditor disabled={disabled} onUploadingChange={onUploadingChange} onUploaded={onUploaded} product={p} onChange={images=>change({images,image:images[0]||''})}/></section>
   <section className="editor-section"><h3>Onlayn katalog</h3><div className="form-checks"><label><input type="checkbox" checked={p.published} onChange={e=>change({published:e.target.checked,hero:e.target.checked?p.hero:false})}/>Katalogda ko‘rsatish</label></div>
    <details className="editor-extra"><summary>Vitrina sozlamalari</summary><div><label>Eski narx, so‘m<Input type="number" inputMode="numeric" min={0} step={1} value={p.oldPrice} onChange={e=>change({oldPrice:Number(e.target.value)})}/></label><div className="form-checks"><label><input type="checkbox" checked={p.featured} onChange={e=>change({featured:e.target.checked})}/>Mashhur deb belgilash</label><label><input type="checkbox" checked={!!p.hero} disabled={!p.published} onChange={e=>change({hero:e.target.checked})}/>Bosh sahifada ko‘rsatish</label></div></div></details>
   </section>
  </aside>
 </div>;
}
