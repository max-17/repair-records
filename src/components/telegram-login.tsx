'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
export function TelegramLogin({invite}:{invite?:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false),[expired,setExpired]=useState(false);const busy=useRef(false);
 useEffect(()=>{if(!url)return;let stopped=false;const timer=setInterval(async()=>{if(busy.current)return;busy.current=true;try{const response=await fetch('/api/auth/telegram',{cache:'no-store'});const result=await response.json();if(stopped)return;if(result.status==='approved')window.location.assign('/admin/pul');if(result.status==='expired'){setExpired(true);clearInterval(timer);}}catch{}finally{busy.current=false;}},2000);return ()=>{stopped=true;clearInterval(timer);};},[url]);
 async function begin(){setPending(true);setError('');setExpired(false);try{const response=await fetch('/api/auth/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite})});const result=await response.json();if(!response.ok)throw new Error(result.error);setUrl(result.url);}catch(e){setError(e instanceof Error?e.message:'Kirish amalga oshmadi.');}finally{setPending(false);}}
 return <div className="telegram-login"><Button disabled={pending} onClick={begin}>{pending?'Tayyorlanmoqda…':url?'Qaytadan boshlash':'Telegram orqali kirish'}</Button>{url&&!expired&&<><a className="button" href={url} target="_blank" rel="noopener noreferrer">Telegramni ochish</a><p role="status">Botda «Kirishni tasdiqlash»ni bosing. Keyin shu sahifaga qayting.</p></>}{expired&&<p role="status">Kirish muddati tugadi. Qaytadan boshlang.</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
