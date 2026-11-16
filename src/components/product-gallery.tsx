"use client";
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { productImages, type Product } from '@/lib/types';
import { ProductImage } from './product-image';
import { ImageViewer } from './image-viewer';

function nativeImageUrl(source:string) {
 try { const url=new URL(source); if(url.hostname==='images.unsplash.com'){url.searchParams.set('w','2400');url.searchParams.set('q','90');} return url.toString(); } catch {return source;}
}

export function ProductGallery({product,href,language='uz',children}:{product:Product;href?:string;language?:'uz'|'ru';children?:React.ReactNode}) {
 const images=productImages(product);
 const slides=images.length ? images : [''];
 const [active,setActive]=useState(0);
 const [viewer,setViewer]=useState<number|null>(null);
 const [dragging,setDragging]=useState(false);
 const track=useRef<HTMLDivElement>(null);
 const gesture=useRef({startX:0,scrollLeft:0,dragging:false,moved:false});
 const ru=language==='ru';
 function go(index:number) {
  const element=track.current;
  if(element)element.scrollTo({left:index*element.clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 return <div className={`product-gallery ${href?'gallery-card':'gallery-detail'}`} role="group" aria-roledescription={ru?'карусель':'rasmlar galereyasi'} aria-label={product.name}>
  <div ref={track} className={`gallery-track ${dragging?'is-dragging':''}`} tabIndex={href?undefined:0}
   onScroll={event=>{const element=event.currentTarget;setActive(Math.max(0,Math.min(slides.length-1,Math.round(element.scrollLeft/element.clientWidth))));}}
   onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(Math.max(0,Math.min(slides.length-1,active+(event.key==='ArrowRight'?1:-1))));}}}
   onPointerDown={event=>{const mouse=event.pointerType==='mouse'&&event.button===0&&slides.length>1;gesture.current={startX:event.clientX,scrollLeft:event.currentTarget.scrollLeft,dragging:mouse,moved:false};setDragging(mouse);}}
   onPointerMove={event=>{const g=gesture.current;const delta=event.clientX-g.startX;if(Math.abs(delta)>6)g.moved=true;if(g.dragging&&g.moved){event.preventDefault();if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.scrollLeft=g.scrollLeft-delta;}}}
   onPointerUp={event=>{const g=gesture.current;if(g.dragging&&g.moved){const index=Math.round(event.currentTarget.scrollLeft/event.currentTarget.clientWidth);go(index);}g.dragging=false;setDragging(false);}}
   onPointerCancel={()=>{gesture.current.dragging=false;setDragging(false);}}
   onPointerLeave={()=>{if(gesture.current.dragging&&!gesture.current.moved){gesture.current.dragging=false;setDragging(false);}}}
   onClickCapture={event=>{if(gesture.current.moved){event.preventDefault();event.stopPropagation();}}}
   onDragStart={event=>event.preventDefault()}>
   {slides.map((image,index)=>href?<Link key={`${image}-${index}`} className="gallery-slide" href={href} aria-label={`${product.name} — ${ru?'Подробнее':'Batafsil'}, ${index+1}/${slides.length}`}><ProductImage product={{...product,image}}/></Link>:<button type="button" key={`${image}-${index}`} className="gallery-slide" disabled={!image} onClick={()=>setViewer(index)} aria-label={`${ru?'Открыть изображение':'Rasmni to‘liq ochish'} ${index+1}`}><ProductImage product={{...product,image}}/></button>)}
  </div>
  {viewer!==null&&<ImageViewer images={images.map(nativeImageUrl)} initialIndex={viewer} name={product.name} onClose={()=>setViewer(null)}/> }
  {children}
  {!href&&images.length>0&&<button type="button" className="gallery-fullscreen" onClick={()=>setViewer(active)} aria-label={ru?'Открыть на весь экран':'To‘liq ekranda ochish'}><Maximize2 size={17}/></button>}
  {slides.length>1&&<><button type="button" className="gallery-arrow gallery-prev" aria-label={ru?'Предыдущее изображение':'Oldingi rasm'} disabled={active===0} onClick={()=>go(active-1)}><ChevronLeft size={19}/></button><button type="button" className="gallery-arrow gallery-next" aria-label={ru?'Следующее изображение':'Keyingi rasm'} disabled={active===slides.length-1} onClick={()=>go(active+1)}><ChevronRight size={19}/></button><div className="gallery-dots" aria-label={ru?'Выбор изображения':'Rasm tanlash'}>{slides.map((_,index)=><button type="button" key={index} className={active===index?'active':''} aria-label={`${ru?'Изображение':'Rasm'} ${index+1}`} aria-current={active===index?'true':undefined} onClick={()=>go(index)}><span/></button>)}</div></>}
 </div>;
}
