"use client";
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeSwitch({button=false}:{button?:boolean}) {
 const [dark,setDark]=useState(true);
 useEffect(()=>{try{const value=localStorage.getItem('shop-theme')!=='light';setDark(value);document.documentElement.dataset.theme=value?'dark':'light';}catch{}},[]);
 function toggle(){const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';try{localStorage.setItem('shop-theme',next?'dark':'light');}catch{}}
 return <button type="button" className={button?"theme-switch theme-switch-button":"theme-switch"} role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggle}>{!button&&(dark?<Moon size={17}/>:<Sun size={17}/>) }<span className="theme-switch-track"><span/></span></button>;
}
