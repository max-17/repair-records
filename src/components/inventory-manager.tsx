'use client';
import { Fragment, useRef, useState, type FocusEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Check, EyeOff, History, MoreHorizontal, Package, Plus, Printer, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, ScanLine, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {variantDescription,productTitle} from '@/lib/product-variants';
import { money, type Product } from '@/lib/types';
import { stockActionLabels, validInventoryCode, type StockAction, type InventoryData } from '@/lib/inventory-types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { ProductImage } from './product-image';
import { CodeScanner } from './code-scanner';

function closeQuickOptionsOnBlur(event: FocusEvent<HTMLDetailsElement>) {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
}

type Adjustment = { product: Product; type: StockAction; id: string };
export function InventoryManager({onCreateProduct,onEditProduct,onDeleteProduct,onCreateVariant,categories,category,onCategoryChange,onAddCategory}:{
  onCreateVariant:(product:Product)=>void;onCreateProduct:()=>void;onEditProduct:(product:Product)=>void;onDeleteProduct:(product:Product)=>void;
  categories:string[];category:string;onCategoryChange:(category:string)=>void;onAddCategory:()=>void;
}){
  const client=useQueryClient();
  const router=useRouter(); const printAfterSave=useRef(false);
  const inventory=useQuery({queryKey:['inventory'],queryFn:()=>api<InventoryData>('/api/inventory')});
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('all');
  const [page,setPage]=useState(1);const [pageSize,setPageSize]=useState(10);
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [adjustment,setAdjustment]=useState<Adjustment|null>(null);
  const [quantity,setQuantity]=useState('1');const [note,setNote]=useState('');
  const [scanner,setScanner]=useState(false);const [camera,setCamera]=useState(false);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [mode,setMode]=useState<StockAction>('in');
  const [codeProduct,setCodeProduct]=useState<Product|null>(null);
  const scanBusy=useRef(false);
  const codeInput=useRef<HTMLInputElement>(null);
  const products=inventory.data?.products||[];
  const filtered=products.filter(p=>(`${p.name} ${p.sku||''} ${p.barcode||''} ${p.brand} ${p.category} ${variantDescription(p)}`.toLowerCase().includes(search.trim().toLowerCase())||inventory.data?.codes.some(label=>label.productId===p.id&&label.code.toLowerCase().includes(search.trim().toLowerCase())))&&(!category||p.category===category)&&(filter==='all'||(filter==='active'?p.published:filter==='hidden'?!p.published:filter==='low'?p.stock>0&&p.stock<=3:p.stock===0)));
 const grouped=new Map<string,Product[]>();for(const p of filtered){const key=p.modelId||p.id;grouped.set(key,[...(grouped.get(key)||[]),p]);}
 const list=[...grouped.values()].flat();
 const pageCount=Math.max(1,Math.ceil(list.length/pageSize));
 const currentPage=Math.min(page,pageCount);
 const pageItems=list.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const selectedProducts=products.filter(p=>selected.has(p.id));
 const allPageSelected=pageItems.length>0&&pageItems.every(p=>selected.has(p.id));
 const printSelection=selectedProducts.length?`/admin/labels?products=${encodeURIComponent(selectedProducts.map(p=>p.id).join(','))}`:'/admin/labels';
 function selectProduct(id:string,checked:boolean){setSelected(current=>{const next=new Set(current);if(checked)next.add(id);else next.delete(id);return next;});}
 function selectPage(checked:boolean){setSelected(current=>{const next=new Set(current);for(const p of pageItems){if(checked)next.add(p.id);else next.delete(p.id);}return next;});}

  function invalidate(){void client.invalidateQueries({queryKey:['inventory']});void client.invalidateQueries({queryKey:['products']});void client.invalidateQueries({queryKey:['analytics']});}
  function openAdjustment(product:Product,type:StockAction){
    save.reset();setError('');setQuantity(type==='count'?String(product.stock):'1');setNote('');
    setAdjustment({product,type,id:crypto.randomUUID()});
  }
  const save=useMutation({mutationFn:()=>api('/api/inventory',{method:'POST',body:JSON.stringify({id:adjustment!.id,productId:adjustment!.product.id,type:adjustment!.type,quantity:Number(quantity),note})}),onSuccess:()=>{invalidate();const productId=adjustment?.product.id;setAdjustment(null);setNotice('Qoldiq yangilandi.');if(printAfterSave.current&&productId)router.push(`/admin/labels?product=${encodeURIComponent(productId)}&copies=${Number(quantity)}`);}});
  async function lookup(value:string){
    if(scanBusy.current)return;
    setCamera(false);setError('');
    const cleaned=value.trim();setCode(cleaned);
    if(!validInventoryCode(cleaned)){setError('Shtrix-kod 1–120 ta harf, raqam yoki - _ . : belgilaridan iborat bo‘lsin.');return;}
    scanBusy.current=true;
    try{
      const result=await inventory.refetch();
      if(!result.data||result.error)throw new Error();
      const match=result.data.codes.find(label=>label.code===cleaned);
      const product=result.data.products.find(p=>p.id===match?.productId);
      if(product){setScanner(false);openAdjustment(product,mode);}
      else{setError('Bu shtrix-kod uchun mahsulot topilmadi. Mahsulot yorlig‘ini skanerlang.');setCamera(true);}
    }catch{setError('Shtrix-kod tekshirilmadi. Qayta urinib ko‘ring.');}
    finally{scanBusy.current=false;}
  }
  function openScanner(){setScanner(true);setCamera(true);setCode('');setError('');}
  return <section className="stock-workspace" aria-label="Ombor boshqaruvi">
    {notice&&<div className="notice" role="status"><Check size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Xabarni yopish">×</button></div>}
    <div className="product-management-toolbar inventory-catalog-toolbar"><div className="stock-summary inventory-status-tabs" aria-label="Katalog holati">
      {[['all',`Barchasi (${products.length})`],['active',`Faol (${products.filter(p=>p.published).length})`],['hidden',`Yashirilgan (${products.filter(p=>!p.published).length})`],['low',`Kam qoldiq (${products.filter(p=>p.stock>0&&p.stock<=3).length})`],['empty',`Tugagan (${products.filter(p=>p.stock===0).length})`]].map(([value,label])=><button key={value} aria-pressed={filter===value} className={filter===value?'selected':''} onClick={()=>{setFilter(value);setPage(1);}}>{label}</button>)}
    </div>
    <div className="inventory-catalog-tools"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nom, artikul yoki shtrix-kod" aria-label="Mahsulot yoki kod qidirish"/></label>
      <details className="inventory-filter-menu"><summary><SlidersHorizontal size={17}/><span>Filtrlar{category?' · 1':''}</span><ChevronDown size={14}/></summary><div className="inventory-filter-panel"><label>Turkum<select className="input" aria-label="Turkum bo‘yicha filtrlash" value={category} onChange={e=>{onCategoryChange(e.target.value);setPage(1);}}><option value="">Barcha turkumlar</option>{categories.map(value=><option key={value} value={value}>{value}</option>)}</select></label>{category&&<Button variant="ghost" onClick={()=>{onCategoryChange('');setPage(1);}}>Filtrni tozalash</Button>}</div></details>
      <Button variant="outline" className="inventory-scan" onClick={openScanner} aria-label="Shtrix-kod skanerlash"><ScanLine size={18}/><span>Skanerlash</span></Button>
      <details className="inventory-menu inventory-bulk-menu" onBlur={closeQuickOptionsOnBlur}><summary aria-label="Katalog amallari"><Package size={17}/><span>Amallar</span><ChevronDown size={14}/></summary><div className="inventory-menu-panel">{selectedProducts.length>0&&<Link href={printSelection}><Printer size={16}/>Tanlanganlarga yorliq ({selectedProducts.length})</Link>}<Link href="/admin/labels"><Printer size={16}/>Yorliqlar chop etish</Link><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onAddCategory();}}><Plus size={16}/>Turkum qo‘shish</button></div></details>
      <Button className="inventory-create" onClick={onCreateProduct}><Plus size={18}/><span>Yaratish</span></Button>
    </div></div>
    {inventory.isPending?<p className="loading-text">Ombor yuklanmoqda...</p>:inventory.isError?<div className="empty-state"><p>Ombor yuklanmadi.</p><Button onClick={()=>inventory.refetch()}>Qayta urinish</Button></div>:<>
      <div className="inventory-selection-bar" aria-live="polite"><span>{selectedProducts.length?`${selectedProducts.length} ta tanlandi`:`${list.length} ta mahsulot`}</span>{selectedProducts.length>0&&<div><Link href={printSelection}><Printer size={15}/>Yorliq chop etish</Link><button onClick={()=>setSelected(new Set())}>Tanlovni bekor qilish</button></div>}</div>
      <div className="inventory-table-scroll"><table className="inventory-catalog-table"><caption className="sr-only">Mahsulotlar katalogi</caption><thead><tr>
        <th className="inventory-select-cell"><input type="checkbox" aria-label="Sahifadagi barcha mahsulotlarni tanlash" checked={allPageSelected} onChange={e=>selectPage(e.target.checked)}/></th>
        <th className="inventory-photo-cell" scope="col">Foto</th><th scope="col">Nomi / variant</th><th className="inventory-sku-cell" scope="col">Artikul</th><th className="inventory-barcode-cell" scope="col">Shtrix-kod</th><th className="inventory-category-cell" scope="col">Turkum</th><th className="inventory-price-cell" scope="col">Narx, so‘m</th><th className="inventory-stock-cell" scope="col">Qoldiq</th><th className="inventory-action-cell" scope="col"><span className="sr-only">Amallar</span></th>
      </tr></thead><tbody>{pageItems.map((product,index)=><Fragment key={product.id}>{product.modelId&&!pageItems.slice(0,index).some(p=>p.modelId===product.modelId)&&list.filter(p=>p.modelId===product.modelId).length>1&&<tr className="inventory-model-row"><td colSpan={9}><strong>{product.name}</strong><span>{list.filter(p=>p.modelId===product.modelId).length} variant · {list.filter(p=>p.modelId===product.modelId).reduce((sum,p)=>sum+p.stock,0)} dona</span></td></tr>}
        <tr data-selected={selected.has(product.id)}>
          <td className="inventory-select-cell"><input type="checkbox" aria-label={`${product.name}${variantDescription(product)?' '+variantDescription(product):''} tanlash`} checked={selected.has(product.id)} onChange={e=>selectProduct(product.id,e.target.checked)}/></td>
          <td className="inventory-photo-cell"><div className="inventory-thumb"><Package aria-hidden="true" size={20}/><ProductImage product={product}/></div></td>
          <th scope="row" className="inventory-product-cell"><button className="inventory-product-name" onClick={()=>onEditProduct(product)} aria-label={`${product.name} tahrirlash`}>{product.name}</button>{variantDescription(product)&&<small>{variantDescription(product)}</small>}<small className="inventory-mobile-price">{money(product.price)} so‘m</small>{!product.published&&<span className="inventory-hidden-badge"><EyeOff size={12}/>Yashirilgan</span>}</th>
          <td className="inventory-sku-cell">{product.sku||<span className="inventory-muted">—</span>}</td>
          <td className="inventory-barcode-cell"><button className="inventory-code-button" onClick={()=>setCodeProduct(product)} aria-label={`${product.name} kodlarini ko‘rish`}>{product.barcode||inventory.data?.codes.find(c=>c.productId===product.id)?.code||'—'}</button></td>
          <td className="inventory-category-cell"><span>{product.category}</span><small>{product.brand}</small></td>
          <td className="inventory-price-cell"><strong>{money(product.price)}</strong>{product.oldPrice>product.price&&<del>{money(product.oldPrice)}</del>}</td>
          <td className={`inventory-stock-cell ${product.stock<=3?'inventory-low-stock':''}`}><button title="Qoldiqni sanash" aria-label={`${product.name} qoldig‘ini sanash`} onClick={()=>openAdjustment(product,'count')}><strong>{product.stock}</strong><small>dona</small></button></td>
          <td className="inventory-action-cell"><details className="inventory-menu row-menu" onBlur={closeQuickOptionsOnBlur}><summary aria-label={`${product.name} amallari`}><MoreHorizontal size={19}/></summary><div className="inventory-menu-panel"><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onEditProduct(product);}}>Tahrirlash</button><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');openAdjustment(product,'in');}}><ArrowDownLeft size={16}/>Kirim</button><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');openAdjustment(product,'count');}}>Qoldiqni sanash</button><button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');openAdjustment(product,'out');}}><ArrowUpRight size={16}/>Chiqim</button>{product.modelId&&<button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onCreateVariant(product);}}>Variant qo‘shish</button>}<button onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setCodeProduct(product);}}><ScanLine size={16}/>Kodlar</button><Link href={`/admin/labels?product=${encodeURIComponent(product.id)}`}><Printer size={16}/>Yorliq chop etish</Link><button className="inventory-delete" onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onDeleteProduct(product);}}><Trash2 size={16}/>O‘chirish</button></div></details></td>
        </tr>
      </Fragment>)}</tbody></table></div>
      {list.length>0&&<div className="inventory-pagination"><div><Button variant="ghost" size="icon" aria-label="Oldingi sahifa" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={18}/></Button><span>{currentPage} / {pageCount}</span><Button variant="ghost" size="icon" aria-label="Keyingi sahifa" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight size={18}/></Button></div><span>{(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize,list.length)} / {list.length}</span><label>Ko‘rsatish<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(size=><option key={size} value={size}>{size} ta</option>)}</select></label></div>}
      {!list.length&&<div className="empty-state"><Package size={28}/><h3>Mahsulot topilmadi</h3><p>Qidiruvni yoki filtrlarni o‘zgartiring, yoki yangi mahsulot qo‘shing.</p><Button onClick={onCreateProduct}><Plus size={16}/>Mahsulot qo‘shish</Button></div>}
      <details className="stock-history"><summary><History size={19}/>Harakatlar tarixi</summary>
        {!inventory.data?.movements.length?<p>Hali kirim yoki chiqim yo‘q.</p>:<ol>{inventory.data.movements.map(m=><li key={m.id}><div><strong>{m.productName}</strong><span>{stockActionLabels[m.type]} · {new Intl.DateTimeFormat('uz-UZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(m.createdAt))}</span>{m.note&&<p>{m.note}</p>}</div><div className="movement-numbers"><strong>{m.delta>0?'+':''}{m.delta}</strong><span>{m.before} → {m.after}</span></div></li>)}</ol>}
      </details>
    </>}
    <Dialog open={!!adjustment} onOpenChange={open=>{if(!open&&!save.isPending)setAdjustment(null);}}><DialogContent className="delete-dialog stock-dialog"><DialogTitle>{adjustment?stockActionLabels[adjustment.type]:''}</DialogTitle><DialogDescription>{adjustment?productTitle(adjustment.product):''} · Hozir {adjustment?.product.stock} dona</DialogDescription>
      <form onSubmit={event=>{event.preventDefault();if(quantity!==''&&!save.isPending){printAfterSave.current=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-print')==='true';save.mutate();}}}><label>{adjustment?.type==='count'?'Sanab chiqilgan qoldiq':'Miqdor'}<Input autoFocus required type="number" inputMode="numeric" min={adjustment?.type==='count'?0:1} max={1000000000} step={1} disabled={save.isPending} value={quantity} onChange={e=>{setQuantity(e.target.value);setAdjustment(current=>current?{...current,id:crypto.randomUUID()}:current);}}/></label><label>Izoh (ixtiyoriy)<Input maxLength={500} disabled={save.isPending} value={note} onChange={e=>{setNote(e.target.value);setAdjustment(current=>current?{...current,id:crypto.randomUUID()}:current);}} placeholder="Masalan, yangi yetkazib berish"/></label>{save.isError&&<p className="form-error" role="alert">{save.error.message}</p>}<div className="form-actions"><Button type="button" variant="outline" disabled={save.isPending} onClick={()=>setAdjustment(null)}>Bekor qilish</Button>{adjustment?.type==='in'&&<Button variant="outline" type="submit" data-print="true" disabled={save.isPending||quantity===''}><Printer size={17}/>Kirim va yorliq</Button>}<Button type="submit" disabled={save.isPending||quantity===''}>{save.isPending?'Saqlanmoqda...':'Tasdiqlash'}</Button></div></form>
    </DialogContent></Dialog>
    <Dialog open={scanner} onOpenChange={open=>{setScanner(open);setCamera(false);}}><DialogContent className="delete-dialog stock-dialog"><DialogTitle>Shtrix-kod orqali qoldiq</DialogTitle><DialogDescription>Bir xil variantdagi mahsulotlar uchun bitta shtrix-kod ishlating. O‘zgarish tasdiqlangandan keyin saqlanadi.</DialogDescription>
      <div className="stock-mode" role="group" aria-label="Harakat turi">{(['in','count'] as const).map(type=><Button key={type} variant={mode===type?'default':'outline'} onClick={()=>{setMode(type);codeInput.current?.focus();}}>{type==='count'?'Sanash':stockActionLabels[type]}</Button>)}</div>
      {camera&&<CodeScanner onScan={value=>void lookup(value)}/>}<form className="code-entry" onSubmit={event=>{event.preventDefault();void lookup(code);}}><label>Shtrix-kod<Input ref={codeInput} required maxLength={120} value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" placeholder="A7K2-M9PX"/></label><Button type="submit">Tekshirish</Button></form>
      {error&&<p role="alert" className="form-error">{error}</p>}
    </DialogContent></Dialog>
    <Dialog open={!!codeProduct} onOpenChange={open=>{if(!open)setCodeProduct(null);}}><DialogContent className="delete-dialog stock-dialog"><DialogTitle>Shtrix-kod yorliqlari</DialogTitle><DialogDescription>{codeProduct?productTitle(codeProduct):''}. Bir xil variantdagi mahsulotlarga shu shtrix-kod yorlig‘ini yopishtiring.</DialogDescription><ul className="assigned-codes">{inventory.data?.codes.filter(c=>c.productId===codeProduct?.id).map(c=><li key={c.code}><code>{c.code}</code><Link className="button button-outline" href={`/admin/labels?code=${encodeURIComponent(c.code)}`}>Chop etish</Link></li>)}</ul></DialogContent></Dialog>
  </section>;
}
