'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Script from 'next/script';
import { getTelegramWebApp } from '@/lib/telegram-webapp';
export function TelegramBridge(){
 const [ready,setReady]=useState(false);const pathname=usePathname(),router=useRouter();
 useEffect(()=>{
  const app=getTelegramWebApp();if(!app)return;
  app.ready();app.expand();document.documentElement.classList.add('telegram-app');
  const update=()=>{const root=document.documentElement;root.style.setProperty('--telegram-viewport-height',`${app.viewportStableHeight||innerHeight}px`);root.style.setProperty('--telegram-safe-top',`${Math.max(app.safeAreaInset?.top||0,app.contentSafeAreaInset?.top||0)}px`);root.style.setProperty('--telegram-safe-bottom',`${Math.max(app.safeAreaInset?.bottom||0,app.contentSafeAreaInset?.bottom||0)}px`);};
  update();for(const event of ['viewportChanged','safeAreaChanged','contentSafeAreaChanged'])app.onEvent(event,update);
  const back=()=>{if(window.history.length>1)router.back();else router.push('/');};app.BackButton.onClick(back);if(pathname==='/')app.BackButton.hide();else app.BackButton.show();
  if(pathname?.startsWith('/admin'))app.enableClosingConfirmation();else app.disableClosingConfirmation();
  return()=>{for(const event of ['viewportChanged','safeAreaChanged','contentSafeAreaChanged'])app.offEvent(event,update);app.BackButton.offClick(back);};
 },[ready,pathname,router]);
 return <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={()=>setReady(true)}/>;
}
