"use client";
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export function ImageViewer({images,initialIndex,name,onClose}:{images:string[];initialIndex:number;name:string;onClose:()=>void}) {
 const [index,setIndex]=useState(initialIndex);
 const scale=useRef(1);
 const pointers=useRef(new Set<number>());
 const swipe=useRef<{x:number;y:number;id:number}|null>(null);
 function changeImage(next:number){const clamped=Math.max(0,Math.min(images.length-1,next));if(clamped!==index){scale.current=1;setIndex(clamped);}}
 useEffect(()=>{
  function onKey(event:KeyboardEvent){if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();setIndex(previous=>{const next=Math.max(0,Math.min(images.length-1,previous+(event.key==='ArrowRight'?1:-1)));if(next!==previous)scale.current=1;return next;});}
  window.addEventListener('keydown',onKey,true);
  return ()=>window.removeEventListener('keydown',onKey,true);
 },[images.length]);
 return <Dialog responsive={false} open onOpenChange={open=>{if(!open)onClose();}}>
  <DialogContent className="image-viewer">
   <DialogTitle className="sr-only">{name}</DialogTitle>
   <div className="image-viewer-gestures"
    onPointerDownCapture={event=>{pointers.current.add(event.pointerId);swipe.current=pointers.current.size===1&&scale.current<=1.01?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;}}
    onPointerUpCapture={event=>{const start=swipe.current;pointers.current.delete(event.pointerId);swipe.current=null;if(!start||start.id!==event.pointerId||scale.current>1.01)return;const dx=event.clientX-start.x;const dy=event.clientY-start.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)changeImage(index+(dx<0?1:-1));}}
    onPointerCancelCapture={event=>{pointers.current.delete(event.pointerId);swipe.current=null;}}>
   <TransformWrapper key={index} minScale={1} maxScale={8} centerOnInit wheel={{step:0.08}} doubleClick={{mode:'toggle',step:2}} onTransform={(_,state)=>{scale.current=state.scale;}}>
    <TransformComponent wrapperClass="image-zoom-stage" contentClass="image-zoom-content">
     <img src={images[index]} alt={`${name} — ${index+1}/${images.length}`} draggable={false}/>
    </TransformComponent>
   </TransformWrapper>
   </div>
  </DialogContent>
 </Dialog>;
}
