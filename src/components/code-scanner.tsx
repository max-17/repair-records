'use client';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from './ui/button';
import type { IScannerControls } from '@zxing/browser';
export function CodeScanner({onScan,continuous=false,confirmScan=false}:{onScan:(value:string)=>void;continuous?:boolean;confirmScan?:boolean}){
 return <BrowserCodeScanner onScan={onScan} continuous={continuous} confirmScan={confirmScan}/>;
}
function BrowserCodeScanner({onScan,continuous=false,confirmScan=false}:{onScan:(value:string)=>void;continuous?:boolean;confirmScan?:boolean}){
  const video=useRef<HTMLVideoElement>(null);
  const latest=useRef(onScan);latest.current=onScan;
  const [error,setError]=useState('');const [detected,setDetected]=useState('');
  const pending=useRef('');const blocked=useRef('');const sound=useRef<AudioContext|null>(null);
  useEffect(()=>{const audio=new AudioContext();sound.current=audio;const unlock=()=>{void audio.resume().catch(()=>{});};document.addEventListener('pointerdown',unlock);return()=>{document.removeEventListener('pointerdown',unlock);sound.current=null;void audio.close().catch(()=>{});};},[]);
  function beep(){const audio=sound.current;if(!audio)return;void audio.resume().then(()=>{if(audio.state!=='running')return;const tone=audio.createOscillator(),gain=audio.createGain();tone.type='sine';tone.frequency.value=1800;gain.gain.setValueAtTime(.12,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);tone.connect(gain);gain.connect(audio.destination);tone.start();tone.stop(audio.currentTime+.12);}).catch(()=>{});}
  useEffect(()=>{
    let disposed=false;let delivered=false;let controls:IScannerControls|undefined;
    let stream:MediaStream|undefined;
    let lastValue='';let lastSeen=0;
    const element=video.current;
    async function start(){
      try{
        if(!window.isSecureContext)throw new Error('INSECURE_CONTEXT');
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('CAMERA_UNSUPPORTED');
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'}},audio:false});
        if(disposed){stream.getTracks().forEach(track=>track.stop());return;}
        const {BrowserMultiFormatReader}=await import('@zxing/browser');
        if(disposed||!element)return;
        const reader=new BrowserMultiFormatReader();
        controls=await reader.decodeFromStream(stream,element,(result,_error,scanner)=>{
          if(disposed||delivered)return;
          if(confirmScan){
            if(pending.current)return;
            if(!result){if(Date.now()-lastSeen>800)blocked.current='';return;}
            const value=result.getText();lastSeen=Date.now();
            if(value===blocked.current)return;
            pending.current=value;blocked.current=value;setDetected(value);beep();return;
          }
          if(result&&!continuous)beep();          if(continuous){
            if(!result){if(Date.now()-lastSeen>800)lastValue='';return;}
            const value=result.getText();const repeat=value===lastValue;lastValue=value;lastSeen=Date.now();
            if(!repeat)latest.current(value);
          }else if(result&&!delivered){delivered=true;scanner.stop();latest.current(result.getText());}
        });
        if(disposed)controls.stop();
      }catch(cause){stream?.getTracks().forEach(track=>track.stop());if(!disposed){
        const name=cause instanceof Error?cause.name:'';
        const message=cause instanceof Error?cause.message:'';
        const detail=message==='INSECURE_CONTEXT'?'Kamera uchun HTTPS orqali oching.':message==='CAMERA_UNSUPPORTED'?'Bu brauzer kamerani qo‘llab-quvvatlamaydi. Chrome yoki Safari orqali oching.':name==='NotAllowedError'||name==='PermissionDeniedError'?'Kameraga ruxsat berilmagan. Brauzer sayt sozlamalarida Kamera → Ruxsat berish ni tanlang. Telefon sozlamalarida ham brauzerga kamera ruxsatini tekshiring.':name==='NotFoundError'?'Kamera topilmadi. Kamera qurilmasini tekshiring.':name==='NotReadableError'||name==='TrackStartError'?'Kamera band yoki ishga tushmadi. Kameradan foydalanayotgan boshqa ilovalarni yoping va qayta urinib ko‘ring.':name==='OverconstrainedError'?'Kamera sozlamalari mos kelmadi. Boshqa kamera yoki brauzerda urinib ko‘ring.':`Kamera ochilmadi (${name||'noma’lum xato'}). Skanerlashni yopib, qayta oching yoki kodni qo‘lda kiriting.`;
        setError(detail);
      }}
    }
    void start();
    return()=>{disposed=true;controls?.stop();stream?.getTracks().forEach(track=>track.stop());if(element?.srcObject instanceof MediaStream)element.srcObject.getTracks().forEach(track=>track.stop());};
  },[continuous,confirmScan]);
  return <div className="qr-camera"><video ref={video} autoPlay muted playsInline aria-label="Shtrix-kod skanerlash kamerasi"/>{error&&<p role="alert" className="form-error">{error}</p>}{detected?<div className="qr-scan-feedback"><p role="status"><Check size={18}/>Shtrix-kod topildi</p><code>{detected}</code><Button type="button" onClick={()=>{const value=pending.current;if(!value)return;latest.current(value);pending.current='';setDetected('');}}>Tasdiqlash va savatga qo‘shish</Button></div>:<p>Shtrix-kodni kameraga qarating.</p>}</div>;
}