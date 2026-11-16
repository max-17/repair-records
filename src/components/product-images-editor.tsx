"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, ImagePlus, Link as LinkIcon, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ProductPhotoCamera } from './product-photo-camera';
import { ProductImage } from './product-image';
import type { Product } from '@/lib/types';
import { useUploadThing } from '@/lib/uploadthing';
import { MAX_IMAGE_BYTES } from '@/lib/upload-limits';
import { prepareProductImage, ImagePreparationError } from '@/lib/prepare-product-image';
export function ProductImagesEditor({product,onChange,onUploadingChange,onUploaded,disabled=false}:{product:Product;onChange:(images:string[])=>void;onUploadingChange:(uploading:boolean)=>void;onUploaded:(images:string[])=>void;disabled?:boolean}) {
 const images=product.images ?? (product.image ? [product.image] : []);
 const picker=useRef<HTMLInputElement>(null);
 const [cameraOpen,setCameraOpen]=useState(false);
 const latestBusyChange=useRef(onUploadingChange);latestBusyChange.current=onUploadingChange;

 const latestImages=useRef(images);latestImages.current=images;
 const latestOnChange=useRef(onChange);latestOnChange.current=onChange;
 const latestOnUploaded=useRef(onUploaded);latestOnUploaded.current=onUploaded;
 const busy=useRef(false);
 const queue=useRef<File[][]>([]);
 const reserved=useRef(0);
 const [pendingCount,setPendingCount]=useState(0);
 const [uploading,setUploading]=useState(false);
 useEffect(()=>{latestBusyChange.current(cameraOpen||uploading);},[cameraOpen,uploading]);
 const [preparing,setPreparing]=useState(false);
 const [progress,setProgress]=useState(0);
 const [error,setError]=useState('');
 const {startUpload}=useUploadThing('productImages',{onUploadProgress:setProgress});
 async function uploadFiles(files:File[]){
  if(!files.length||disabled)return;
  setError('');
  if(files.length>10-latestImages.current.length-reserved.current){setError('Jami 10 tagacha rasm qo‘shish mumkin.');return;}
  if(files.some(file=>!file.type.startsWith('image/'))){setError('Faqat rasm fayllarini tanlang.');return;}
  queue.current.push(files);reserved.current+=files.length;setPendingCount(reserved.current);
  if(busy.current)return;
  busy.current=true;setUploading(true);latestBusyChange.current(true);
  try{
   while(queue.current.length){
    const batch=queue.current.shift()!;setProgress(0);
    try{
     setPreparing(true);
     const prepared:File[]=[];
     for(const file of batch)prepared.push(await prepareProductImage(file));
     if(prepared.some(file=>file.size>MAX_IMAGE_BYTES))throw new ImagePreparationError('Har bir rasm 5 MB dan oshmasligi kerak.');
     setPreparing(false);
     const uploaded=await startUpload(prepared);
     if(!uploaded?.length)throw new Error('Upload did not complete');
     const urls=uploaded.map(file=>file.ufsUrl);latestOnUploaded.current(urls);
     const next=[...latestImages.current,...urls];
     latestImages.current=next;latestOnChange.current(next);
    }catch(cause){setError(cause instanceof ImagePreparationError?cause.message:'Rasmlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.');}
    finally{setPreparing(false);reserved.current-=batch.length;setPendingCount(reserved.current);}
   }
  }finally{busy.current=false;setUploading(false);}
 }
 function move(index:number,offset:number){const next=[...images];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);}
 return <fieldset className="images-editor" disabled={disabled} aria-busy={uploading}><legend>Mahsulot rasmlari <span>{images.length}/10</span></legend><p>Birinchi rasm muqova bo‘ladi. 10 tagacha rasm, har biri 5 MB gacha.</p><div className="image-upload-actions"><Button type="button" variant="outline" size="sm" disabled={disabled||images.length+pendingCount>=10} onClick={()=>{latestBusyChange.current(true);setCameraOpen(true);}}><Camera size={17}/>Suratga olish</Button><input ref={picker} className="sr-only" type="file" accept="image/*" multiple aria-label="Mahsulot rasmlarini tanlash" disabled={disabled||images.length+pendingCount>=10} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';void uploadFiles(files);}}/><Button type="button" variant="outline" size="sm" disabled={disabled||images.length+pendingCount>=10} onClick={()=>picker.current?.click()}><ImagePlus size={17}/>Rasm yuklash</Button></div>{cameraOpen&&<ProductPhotoCamera onClose={()=>setCameraOpen(false)} onCapture={file=>{setCameraOpen(false);void uploadFiles([file]);}}/>}{uploading&&<p role="status">{preparing?`${pendingCount} ta rasm tayyorlanmoqda…`:`${pendingCount} ta rasm yuklanmoqda… ${progress}%`}</p>}{uploading&&!preparing&&<div className="image-upload-progress" role="progressbar" aria-label="Rasmlar yuklanmoqda" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:`${progress}%`}}/></div>}{error&&<p className="form-error" role="alert">{error}</p>}{images.map((image,index)=><div className="image-editor-row" key={index}><div className="image-editor-preview"><ProductImage product={{...product,image}}/></div><label><span>{index===0?'Muqova rasmi':`Rasm ${index+1}`}</span><Input required type="text" maxLength={2000} placeholder="https://..." value={image} onChange={e=>onChange(images.map((url,i)=>i===index?e.target.value:url))}/></label><div className="image-editor-actions"><Button type="button" variant="ghost" size="icon" disabled={index===0} aria-label={`Rasm ${index+1} yuqoriga`} onClick={()=>move(index,-1)}><ArrowUp size={15}/></Button><Button type="button" variant="ghost" size="icon" disabled={index===images.length-1} aria-label={`Rasm ${index+1} pastga`} onClick={()=>move(index,1)}><ArrowDown size={15}/></Button><Button type="button" variant="ghost" size="icon" aria-label={`Rasm ${index+1} olib tashlash`} onClick={()=>onChange(images.filter((_,i)=>i!==index))}><Trash2 size={15}/></Button></div></div>)}<Button type="button" variant="outline" size="sm" disabled={images.length+pendingCount>=10} onClick={()=>onChange([...images,''])}><LinkIcon size={17}/>Havola qo‘shish</Button></fieldset>;
}
