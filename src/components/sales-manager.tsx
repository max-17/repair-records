'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Check, ChevronDown, Package, Minus, Plus, ScanLine, RefreshCw, Search, ShoppingBasket, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import {productTitle,variantDescription} from '@/lib/product-variants';
import { money, type Product } from '@/lib/types';
import { validInventoryCode, type InventoryData } from '@/lib/inventory-types';
import type { SaleReceipt } from '@/lib/sales-types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { ProductImage } from './product-image';
import { CodeScanner } from './code-scanner';

type BasketLine={productId:string;name:string;quantity:number;unitPrice:number};
const draftKey='shop-pos-draft-v1';
export function SalesManager(){
  const client=useQueryClient();
  const inventory=useQuery({queryKey:['inventory'],queryFn:()=>api<InventoryData>('/api/inventory')});
  const sales=useQuery({queryKey:['sales'],queryFn:()=>api<SaleReceipt[]>('/api/sales')});
  const [search,setSearch]=useState('');const [browse,setBrowse]=useState(false);const [basket,setBasket]=useState<BasketLine[]>([]);
  const [quantityDrafts,setQuantityDrafts]=useState<Record<string,string>>({});
  const [requestId,setRequestId]=useState('');const [hydrated,setHydrated]=useState(false);
  const [scanner,setScanner]=useState(false);const [camera,setCamera]=useState(false);const [code,setCode]=useState('');
  const [message,setMessage]=useState('');const [error,setError]=useState('');const [receipt,setReceipt]=useState<SaleReceipt|null>(null);
  const [clearConfirm,setClearConfirm]=useState(false);const [refreshing,setRefreshing]=useState(false);
  const scanInput=useRef<HTMLInputElement>(null);const busy=useRef(false);
  const latestBasket=useRef(basket);latestBasket.current=basket;
  useEffect(()=>{
    let id=crypto.randomUUID();
    try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');
      if(saved&&typeof saved.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(saved.id)&&Array.isArray(saved.items)&&saved.items.length<=100&&saved.items.every((line:BasketLine)=>line&&typeof line.productId==='string'&&typeof line.name==='string'&&Number.isSafeInteger(line.quantity)&&line.quantity>0&&Number.isSafeInteger(line.unitPrice)&&line.unitPrice>=0)&&new Set(saved.items.map((line:BasketLine)=>line.productId)).size===saved.items.length){id=saved.id;setBasket(saved.items);}
    }catch{}setRequestId(id);setHydrated(true);
  },[]);
  useEffect(()=>{if(hydrated)try{localStorage.setItem(draftKey,JSON.stringify({id:requestId,items:basket}));}catch{}},[basket,requestId,hydrated]);
  function changeBasket(next:BasketLine[]){latestBasket.current=next;setBasket(next);setRequestId(crypto.randomUUID());setReceipt(null);confirm.reset();}
  const confirm=useMutation({mutationFn:()=>api<SaleReceipt>('/api/sales',{method:'POST',body:JSON.stringify({id:requestId,items:basket.map(({productId,quantity,unitPrice})=>({productId,quantity,unitPrice}))})}),onSuccess:result=>{
    setReceipt(result);latestBasket.current=[];setBasket([]);setRequestId(crypto.randomUUID());setError('');setMessage('Sotuv saqlandi. Qoldiq yangilandi.');
    for(const queryKey of [['inventory'],['products'],['sales'],['analytics']])void client.invalidateQueries({queryKey});
  }});
  const products=inventory.data?.products||[];
  const shown=products.filter(product=>{const value=search.trim().toLowerCase();return !value||`${product.name} ${product.sku||''} ${product.barcode||''} ${product.brand} ${product.category} ${variantDescription(product)}`.toLowerCase().includes(value)||inventory.data?.codes.some(label=>label.productId===product.id&&label.code.toLowerCase().includes(value));});
  const productById=new Map(products.map(product=>[product.id,product]));
  const total=basket.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);
  function addProduct(product:Product){
    if(confirm.isPending||!hydrated)return false;
    const current=latestBasket.current;const existing=current.find(line=>line.productId===product.id);
    if((existing?.quantity||0)+1>product.stock){setError(`${product.name}: qoldiq yetarli emas.`);return false;}
    changeBasket(existing?current.map(line=>line.productId===product.id?{...line,quantity:line.quantity+1}:line):[...current,{productId:product.id,name:productTitle(product),unitPrice:product.price,quantity:1}]);
    setError('');setMessage('');return true;
  }
  async function scan(value:string,incrementExisting=false){
    if(busy.current||confirm.isPending)return;
    const cleaned=value.trim();setError('');
    if(!validInventoryCode(cleaned)){setError('Shtrix-kod noto‘g‘ri.');return;}
    busy.current=true;
    try{const result=await inventory.refetch();if(!result.data||result.error)throw new Error();
      const label=result.data.codes.find(label=>label.code===cleaned);const product=result.data.products.find(product=>product.id===label?.productId);
      if(!product){setError('Mahsulot topilmadi. Omborda yaratilgan yorliqni skanerlang.');return;}
      if(!incrementExisting&&latestBasket.current.some(line=>line.productId===product.id)){setMessage('Bu mahsulot savatda bor. Miqdorni savatda tekshiring.');setCode('');return;}
      if(addProduct(product)){setCode('');scanInput.current?.focus();}
    }catch{setError('Shtrix-kod tekshirilmadi. Qayta urinib ko‘ring.');}finally{busy.current=false;}
  }
  function quantity(productId:string,value:number){
    if(confirm.isPending)return;
    const product=products.find(product=>product.id===productId);
    if(!Number.isInteger(value)||value<1||!product||value>product.stock){setError('Miqdor 1 dan qoldiq sonigacha bo‘lsin.');return;}
    changeBasket(basket.map(line=>line.productId===productId?{...line,quantity:value}:line));setError('');
  }
  function invalidQuantityDraft(productId:string){const value=quantityDrafts[productId];return value!==undefined&&(value===''||!Number.isInteger(Number(value))||Number(value)<1||Number(value)>(products.find(product=>product.id===productId)?.stock||0));}
  async function refreshPrices(){
    setRefreshing(true);const refreshed=await inventory.refetch();setRefreshing(false);
    if(!refreshed.data||refreshed.error){setError('Narxlar yangilanmadi. Qayta urinib ko‘ring.');return;}
    const next=latestBasket.current.map(line=>{const product=refreshed.data.products.find(product=>product.id===line.productId);return product?{...line,name:productTitle(product),unitPrice:product.price}:line;});
    changeBasket(next);setError('');setMessage('Savat narxlari yangilandi.');
  }
  return <div className="pos-workspace billz-pos">
    <section className="pos-main" aria-label="Yangi sotuv">
      <section className="pos-products" aria-label="Sotuv uchun mahsulotlar"><div className="pos-toolbar"><label className="search-box"><Search size={17}/><input aria-label="Sotuv uchun qidirish" placeholder="Artikul, kod yoki mahsulot nomi" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&search.trim()){event.preventDefault();void scan(search.trim(),true);setSearch('');}}}/></label><Button variant="outline" disabled={confirm.isPending||!hydrated} onClick={()=>{setScanner(true);setCamera(true);setCode('');setError('');}}><ScanLine size={17}/>Skanerlash</Button><Button variant="outline" aria-expanded={browse} aria-controls="pos-product-lookup" onClick={()=>setBrowse(value=>!value)}><Package size={17}/><span>Mahsulotlar</span><ChevronDown size={14}/></Button></div>
      {(search.trim()||browse)?<div id="pos-product-lookup" className="pos-lookup-results">{inventory.isPending?<p className="loading-text">Mahsulotlar yuklanmoqda...</p>:inventory.isError?<div className="empty-state"><p>Mahsulotlar yuklanmadi.</p><Button onClick={()=>inventory.refetch()}>Qayta urinish</Button></div>:!shown.length?<div className="empty-state"><Search size={26}/><h3>Mahsulot topilmadi</h3><p>Nom yoki Shtrix-kod bilan qidiring.</p></div>:<ul className="pos-product-list">{shown.map(product=><li key={product.id}><button type="button" className="pos-product-card" disabled={confirm.isPending||!hydrated||product.stock<1||(basket.find(line=>line.productId===product.id)?.quantity||0)>=product.stock} aria-label={`${product.name} savatga qo‘shish`} onClick={()=>{if(addProduct(product)){setSearch('');setBrowse(false);}}}><ProductImage product={product}/><div><strong>{productTitle(product)}</strong>{product.sku&&<small>Artikul: {product.sku}</small>}<small>{product.stock} dona · {product.category}</small><span>{money(product.price)} so‘m</span></div></button></li>)}</ul>}
      </div>:<p className="pos-search-hint">Mahsulotni qidiring yoki kodni skanerlang. Ro‘yxatdan tanlash uchun “Mahsulotlar”ni oching.</p>}
    </section>
      <section id="sales-basket" className="pos-cart" aria-label="Savat"><div className="pos-basket-heading"><h2><ShoppingBasket size={20}/>Savat <span>{basket.reduce((sum,line)=>sum+line.quantity,0)}</span></h2>{basket.length>0&&<Button variant="ghost" size="icon" aria-label="Savatni tozalash" disabled={confirm.isPending} onClick={()=>setClearConfirm(true)}><Trash2 size={16}/></Button>}</div>
      {message&&<p role="status" className="pos-notice"><Check size={16}/>{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
      {basket.length>0&&<div className="pos-cart-columns" aria-hidden="true"><span>Miqdor</span><span>Mahsulot</span><span>Jami</span><span/></div>}
      {!basket.length?<div className="pos-basket-empty"><ShoppingBasket size={30}/><h3>Savat bo‘sh</h3><p>Shtrix-kod skanerlang yoki qidiruvdan mahsulot qo‘shing.</p></div>:<ul className="pos-basket-lines">{basket.map(line=><li key={line.productId}><div className="pos-line-heading"><div className="pos-line-product">{productById.get(line.productId)&&<ProductImage product={productById.get(line.productId)!}/>}<div><strong>{line.name}</strong><span className="pos-line-code">{productById.get(line.productId)?.sku||productById.get(line.productId)?.barcode||''}</span></div></div><Button variant="ghost" size="icon" aria-label={`${line.name} savatdan olib tashlash`} disabled={confirm.isPending} onClick={()=>changeBasket(basket.filter(item=>item.productId!==line.productId))}><X size={15}/></Button></div><small>{money(line.unitPrice)} so‘m / dona</small><div className="pos-line-bottom"><div className="quantity-stepper"><Button variant="outline" size="icon" aria-label={`${line.name} miqdorini kamaytirish`} disabled={confirm.isPending||line.quantity===1} onClick={()=>quantity(line.productId,line.quantity-1)}><Minus size={15}/></Button><Input aria-label={`${line.name} miqdori`} type="number" min={1} max={products.find(product=>product.id===line.productId)?.stock||line.quantity} step={1} disabled={confirm.isPending} aria-invalid={invalidQuantityDraft(line.productId)} aria-describedby={invalidQuantityDraft(line.productId)?'quantity-error-'+line.productId:undefined} value={quantityDrafts[line.productId]??line.quantity} onChange={event=>{const raw=event.target.value;setQuantityDrafts(current=>({...current,[line.productId]:raw}));const value=Number(raw);const stock=products.find(product=>product.id===line.productId)?.stock||0;if(raw!==''&&Number.isInteger(value)&&value>=1&&value<=stock){changeBasket(latestBasket.current.map(item=>item.productId===line.productId?{...item,quantity:value}:item));setError('');}}} onBlur={()=>{setQuantityDrafts(current=>{if(current[line.productId]!==''&&current[line.productId]!==undefined)return current;const next={...current};delete next[line.productId];return next;});}}/><Button variant="outline" size="icon" aria-label={`${line.name} miqdorini oshirish`} disabled={confirm.isPending||line.quantity>=(products.find(product=>product.id===line.productId)?.stock||0)} onClick={()=>quantity(line.productId,line.quantity+1)}><Plus size={15}/></Button></div><strong>{money(line.quantity*line.unitPrice)} so‘m</strong></div>{invalidQuantityDraft(line.productId)&&quantityDrafts[line.productId]!==''&&<p className="form-error" id={'quantity-error-'+line.productId}>Miqdor 1 dan {products.find(product=>product.id===line.productId)?.stock||0} gacha bo‘lsin.</p>}{!products.some(product=>product.id===line.productId)&&<p className="form-error">Mahsulot o‘chirilgan. Savatdan olib tashlang.</p>}</li>)}</ul>}

      </section>
    </section>
    <aside id="sales-summary" className="pos-summary" aria-label="Sotuv yakuni"><h2>Sotuv yakuni</h2>      {confirm.isError&&<p role="alert" className="form-error">{confirm.error.message}</p>}
      <div className="pos-summary-count"><span>Mahsulotlar</span><strong>{basket.reduce((sum,line)=>sum+line.quantity,0)} dona</strong></div>
      {!basket.length&&<><div className="pos-total"><span>Jami</span><strong>0 <small>so‘m</small></strong></div><Button className="pos-confirm" disabled>Sotuvni tasdiqlash<Check size={17}/></Button></>}
      {basket.length>0&&<><div className="pos-total"><span>Jami</span><strong>{money(total)} <small>so‘m</small></strong></div><Button className="pos-confirm" disabled={confirm.isPending||refreshing||!hydrated||!Number.isSafeInteger(total)||basket.some(line=>invalidQuantityDraft(line.productId))} onClick={()=>confirm.mutate()}>{confirm.isPending?'Saqlanmoqda...':'Sotuvni tasdiqlash'}<Check size={17}/></Button><Button variant="ghost" className="pos-refresh" disabled={confirm.isPending||refreshing} onClick={refreshPrices}><RefreshCw size={14}/>Narxlarni yangilash</Button><p className="pos-help">Qoldiq faqat tasdiqlangandan keyin kamayadi.</p></>}
      {receipt&&<section className="pos-receipt" aria-label="Saqlangan sotuv"><h3>Sotuv saqlandi</h3><p>{new Intl.DateTimeFormat('uz-UZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(receipt.createdAt))}</p>{receipt.items.map(line=><div key={line.productId}><span>{line.name} × {line.quantity}</span><strong>{money(line.total)} so‘m</strong></div>)}<div><strong>Jami</strong><strong>{money(receipt.total)} so‘m</strong></div></section>}

    </aside>
    {basket.length>0&&<a className="pos-basket-jump" href="#sales-summary"><ShoppingBasket size={18}/>Jami ({basket.reduce((sum,line)=>sum+line.quantity,0)})<strong>{money(total)} so‘m</strong></a>}
    <details className="pos-recent"><summary>Oxirgi sotuvlar <span>{sales.data?.length||0}</span><ChevronDown size={16}/></summary><div className="pos-recent-content">{sales.isError?<p className="form-error">Sotuvlar yuklanmadi. <button onClick={()=>sales.refetch()}>Qayta urinish</button></p>:!sales.data?.length?<p>Hali sotuv yo‘q. Tasdiqlangan sotuvlar shu yerda ko‘rinadi.</p>:<ul>{sales.data.slice(0,10).map(sale=><li key={sale.id}><div><strong>{sale.items.reduce((sum,line)=>sum+line.quantity,0)} dona · {sale.items.map(line=>line.name).join(', ')}</strong><small>{new Intl.DateTimeFormat('uz-UZ',{dateStyle:'short',timeStyle:'short'}).format(new Date(sale.createdAt))}</small></div><strong>{money(sale.total)} so‘m</strong></li>)}</ul>}</div></details>

    <Dialog open={scanner} onOpenChange={open=>{setScanner(open);if(!open)setCamera(false);}}><DialogContent className="delete-dialog stock-dialog"><DialogTitle>Savatga shtrix-kod orqali qo‘shish</DialogTitle><DialogDescription>Kod topilgach tasdiqlang. Savatda bor mahsulot takrorlanmaydi.</DialogDescription>{camera&&<CodeScanner confirmScan onScan={value=>void scan(value)}/>}<form className="code-entry" onSubmit={event=>{event.preventDefault();void scan(code);}}><label>Shtrix-kod<Input ref={scanInput} required value={code} maxLength={120} autoComplete="off" onChange={event=>setCode(event.target.value)} placeholder="A7K2-M9PX"/></label><Button type="submit">Qo‘shish</Button></form>{message&&<p role="status" className="pos-notice">{message}</p>}{error&&<p role="alert" className="form-error">{error} <Link href="/admin">Omborga o‘tish</Link></p>}<Button variant="outline" className="pos-scan-done" onClick={()=>{setScanner(false);setCamera(false);}}>Savatga qaytish ({basket.reduce((sum,line)=>sum+line.quantity,0)})</Button></DialogContent></Dialog>
    <Dialog open={clearConfirm} onOpenChange={setClearConfirm}><DialogContent className="delete-dialog"><DialogTitle>Savatni tozalash?</DialogTitle><DialogDescription>Mahsulotlar savatdan olib tashlanadi. Ombordagi qoldiq o‘zgarmaydi.</DialogDescription><div className="form-actions"><Button variant="outline" onClick={()=>setClearConfirm(false)}>Bekor qilish</Button><Button onClick={()=>{changeBasket([]);setClearConfirm(false);setError('');setMessage('');}}>Tozalash</Button></div></DialogContent></Dialog>
  </div>;
}
