'use client';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { ProductBarcode } from './product-barcode';
import { useQuery } from '@tanstack/react-query';
import { Printer, ArrowLeft, Search, Eye, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { productTitle } from '@/lib/product-variants';
import { money } from '@/lib/types';
import { api } from '@/lib/api';
import type { InventoryData } from '@/lib/inventory-types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

const modes=[{value:'stock',label:'Qoldiq bo‘yicha'},{value:'restock',label:'Oxirgi kirim bo‘yicha'},{value:'one',label:'Bittadan'}];
type LabelProduct={id:string;name:string;code:string;price:number;stock:number;restocked:number|null;quantity:number};
export function ProductLabels({code,productId,productIds,initialCopies}:{code?:string;productId?:string;productIds?:string[];initialCopies?:number}){
  const [mode,setMode]=useState(initialCopies!==undefined?'restock':'stock');
  const [search,setSearch]=useState('');
  const [previewOpen,setPreviewOpen]=useState(false);
  const [previewId,setPreviewId]=useState<string>();
  const [testPrint,setTestPrint]=useState(false);
  const [copies,setCopies]=useState<Record<string,string>>(()=>productId&&initialCopies!==undefined?{[productId]:String(initialCopies)}:{});
  const [selection,setSelection]=useState<Set<string>|null>(null);
  const inventory=useQuery({queryKey:['inventory'],queryFn:()=>api<InventoryData>('/api/inventory')});
  const allowedIds=productIds===undefined?undefined:new Set(productIds);
  const products:LabelProduct[]=(inventory.data?.products||[]).flatMap(product=>{
    if((productId&&product.id!==productId)||(allowedIds&&!allowedIds.has(product.id)))return [];
    const codes=inventory.data?.codes.filter(label=>label.productId===product.id)||[];
    const label=code?codes.find(label=>label.code===code):codes.find(label=>label.code===product.barcode)||codes[0];
    if(!label)return [];
    const restocked=inventory.data?.restocks?.find(row=>row.productId===product.id)?.quantity??null;
    const automatic=mode==='one'?1:mode==='restock'?(restocked??0):product.stock;
    const numeric=Number(copies[product.id]??automatic);
    const quantity=Number.isInteger(numeric)&&numeric>=0?numeric:0;
    return [{id:product.id,name:productTitle(product),code:label.code,price:product.price,stock:product.stock,restocked,quantity}];
  });
  const visible=products.filter(product=>`${product.name} ${product.code}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected=products.filter(product=>selection===null||selection.has(product.id));
  const total=selected.reduce((sum,product)=>sum+product.quantity,0);
  const tooMany=total>1000;
  const invalid=selected.some(product=>{const value=copies[product.id];return value!==undefined&&(!/^\d+$/.test(value)||Number(value)>1000);});
  // Bound the print DOM even when an inventory has very large quantities.
  const labels=tooMany||invalid?[]:selected.flatMap(product=>Array.from({length:product.quantity},()=>product));
  const previewIndex=Math.max(0,selected.findIndex(product=>product.id===previewId));
  const previewProduct=selected[previewIndex];
  const printable=labels.length>0&&!inventory.isPending&&!inventory.isError;
  const printLabels=testPrint&&previewProduct?[previewProduct]:labels;
  function toggle(id:string){setSelection(current=>{const next=new Set(current??products.map(product=>product.id));if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function selectVisible(checked:boolean){setSelection(current=>{const next=new Set(current??products.map(product=>product.id));for(const product of visible){if(checked)next.add(product.id);else next.delete(product.id);}return next;});}
  function print(single=false){
    if(single?!previewProduct:!printable)return;
    flushSync(()=>setTestPrint(single));
    try{window.print();}finally{flushSync(()=>setTestPrint(false));}
  }
  const allVisible=visible.length>0&&visible.every(product=>selection===null||selection.has(product.id));
  const renderLabel=(label:LabelProduct,index:number)=><div className="barcode-label" key={label.code+'-'+index}><strong className="barcode-label-name" title={label.name}>{label.name}</strong><div className="barcode-label-code"><ProductBarcode value={label.code}/></div><span>{label.code}</span><b className="barcode-label-price">{money(label.price)} UZS</b></div>;
  return <main className="label-print-page billz-labels">
    <div className="label-screen">
      <header className="label-page-heading"><Link className="label-back-button" href="/admin" aria-label="Katalogga qaytish" title="Katalogga qaytish"><ArrowLeft size={20}/></Link><div className="label-heading-copy"><h1>Yorliqlarni chop etish</h1><p>Mahsulot nomi, narxi va shtrix-kodi</p></div><div className="label-heading-actions"><Button variant="outline" disabled={!printable} onClick={()=>setPreviewOpen(true)}><Eye size={18}/><span>Barcha betlar</span></Button><Button disabled={!printable} onClick={()=>print()}><Printer size={18}/><span>Chop etish</span>{total>0?' · '+total:''}</Button></div></header>
      <div className="label-workspace">
        <section className="label-settings" aria-label="Chop etish sozlamalari">
          <div className="label-setup-block"><h2>Yorliq shakli</h2><div className="label-format-info"><strong>Standart · A4</strong><span>3 ustun × 6 qator · betiga 18 ta yorliq</span></div></div>
          <div className="label-setup-block"><h2>Yorliqlar soni</h2><div className="label-mode-field"><label className="sr-only" id="label-mode-title">Nusxalar miqdori</label><Select value={mode} onValueChange={value=>{if(value){setMode(value);setCopies({});}}} items={modes}><SelectTrigger className="select-trigger" aria-labelledby="label-mode-title"><SelectValue/></SelectTrigger><SelectContent className="select-content" alignItemWithTrigger={false}>{modes.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><p className="label-field-note">Har bir mahsulot uchun nusxalar sonini quyida o‘zgartiring.</p></div>
          <div className="label-setup-block label-products-block"><div className="label-products-heading"><h2>Mahsulotlar <span>{products.length}</span></h2>{(productId||productIds)&&<Link href="/admin/labels">Barchasini ochish</Link>}</div><label className="search-box label-search"><Search size={18}/><input aria-label="Mahsulot yoki shtrix-kod qidirish" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nomi yoki kodi bo‘yicha qidirish"/></label>
          {inventory.isPending&&<p className="label-message" role="status">Yuklanmoqda…</p>}
          {inventory.isError&&<div className="label-message" role="alert"><p>Mahsulotlarni yuklab bo‘lmadi.</p><Button variant="outline" onClick={()=>inventory.refetch()}>Qayta urinish</Button></div>}
          {inventory.isSuccess&&<>
            <div className="label-list-heading"><label><input type="checkbox" checked={allVisible} disabled={!visible.length} onChange={event=>selectVisible(event.target.checked)}/>Barchasini tanlash</label><span>Nusxalar</span><Button size="sm" variant="ghost" disabled={!selected.length} onClick={()=>setSelection(new Set())}>Tozalash</Button></div>
            <div className="label-product-selection">{visible.map(product=>{
              const checked=selection===null||selection.has(product.id);
              return <div className="label-product-row" data-selected={checked} key={product.id}><label><input type="checkbox" checked={checked} onChange={()=>toggle(product.id)}/><span><strong>{product.name}</strong><small>{money(product.price)} so‘m · Qoldiq: {product.stock} dona</small><small>{product.restocked===null?'Oxirgi kirim: qayd etilmagan':'Oxirgi kirim: +'+product.restocked+' dona'}</small></span></label><div className="label-quantity-stepper" role="group" aria-label={product.name+' yorliq miqdori'}><Button type="button" variant="outline" size="icon" aria-label={product.name+' nusxalarini kamaytirish'} disabled={!checked||product.quantity<=0} onClick={()=>setCopies(current=>({...current,[product.id]:String(Math.max(0,product.quantity-1))}))}><Minus size={15}/></Button><Input type="number" className="label-copy-input" aria-label={product.name+' uchun nusxalar soni'} min={0} max={1000} step={1} value={copies[product.id]??String(product.quantity)} disabled={!checked} onChange={event=>setCopies(current=>({...current,[product.id]:event.target.value}))}/><Button type="button" variant="outline" size="icon" aria-label={product.name+' nusxalarini oshirish'} disabled={!checked||product.quantity>=1000} onClick={()=>setCopies(current=>({...current,[product.id]:String(Math.min(1000,product.quantity+1))}))}><Plus size={15}/></Button></div></div>;
            })}</div>
            {!visible.length&&<p className="label-message">{products.length?'Mahsulot topilmadi.':'Yorliq uchun mahsulot tanlanmagan.'}</p>}
            <div className="label-selection-footer"><span aria-live="polite">{selected.length} ta mahsulot</span><strong>{total} ta yorliq · {Math.ceil(total/18)} bet</strong></div>
          </>}
          {invalid&&<p className="form-error" role="alert">Nusxalar sonini 0 dan 1 000 gacha kiriting.</p>}
          {tooMany&&<p className="form-error" role="alert">Bir safar 1 000 tagacha yorliq chop eting. Kamroq mahsulot tanlang.</p>}
          </div>
        </section>
        <aside className="label-single-preview" aria-label="Yorliq namunasi"><div className="label-single-heading"><h2>Yorliq namunasi</h2><span>A4 · Shtrix-kod</span></div><div className="label-sticker-stage">{previewProduct?renderLabel(previewProduct,0):<p>Namunani ko‘rish uchun mahsulot tanlang.</p>}</div><div className="label-preview-navigation"><Button variant="ghost" size="icon" aria-label="Oldingi yorliq namunasi" disabled={!previewProduct||previewIndex===0} onClick={()=>setPreviewId(selected[previewIndex-1].id)}><ChevronLeft size={20}/></Button><span aria-live="polite">{previewProduct?previewIndex+1:0} / {selected.length}</span><Button variant="ghost" size="icon" aria-label="Keyingi yorliq namunasi" disabled={!previewProduct||previewIndex>=selected.length-1} onClick={()=>setPreviewId(selected[previewIndex+1].id)}><ChevronRight size={20}/></Button></div><Button className="label-test-print" variant="outline" disabled={!previewProduct||inventory.isPending||inventory.isError} onClick={()=>print(true)}><Printer size={17}/>Sinov uchun 1 ta chop etish</Button><p className="label-preview-note">Chop etish oynasida A4 va 100% masshtabni tanlang. Sinov tugmasi faqat ko‘rsatilgan bitta yorliqni chiqaradi.</p></aside>
      </div>
    </div>
    <Dialog responsive={false} open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="label-fullscreen-preview billz-label-preview"><header className="label-fullscreen-heading"><div><DialogTitle>Barcha yorliqlar</DialogTitle><DialogDescription>{total} ta yorliq · {Math.ceil(total/18)} bet · A4</DialogDescription></div><Button disabled={!printable} onClick={()=>print()}><Printer size={18}/>Chop etish</Button></header><div className="label-fullscreen-scroll">{Array.from({length:Math.ceil(labels.length/18)},(_,page)=><div className="label-preview-document" key={page}><div className="barcode-label-grid">{labels.slice(page*18,(page+1)*18).map(renderLabel)}</div></div>)}</div></DialogContent></Dialog>
    <div className="label-print-sheet" aria-hidden="true"><div className="barcode-label-grid">{printLabels.map(renderLabel)}</div></div>
  </main>;
}
