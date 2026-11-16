"use client";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ComponentProps } from 'react';
import { Dialog as Primitive } from '@base-ui/react/dialog';
import { Drawer, DrawerContent, DrawerClose, DrawerTitle, DrawerDescription } from './drawer';
import { X } from 'lucide-react';
const MobileContext=createContext(false);
export function Dialog({responsive=true,...props}:Pick<ComponentProps<typeof Primitive.Root>,'children'|'open'|'defaultOpen'|'modal'|'disablePointerDismissal'>&{responsive?:boolean;onOpenChange?:(open:boolean)=>void}){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const query=window.matchMedia('(max-width: 760px)');const update=()=>{if(!props.open)setMobile(query.matches);};update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[props.open]);
 const drawer=responsive&&mobile;
 return <MobileContext.Provider value={drawer}>{drawer?<Drawer {...props} showSwipeHandle/>:<Primitive.Root {...props}/>}</MobileContext.Provider>;
}
export function DialogTitle(props:ComponentProps<typeof Primitive.Title>){return useContext(MobileContext)?<DrawerTitle {...props}/>:<Primitive.Title {...props}/>;}
export function DialogDescription(props:ComponentProps<typeof Primitive.Description>){return useContext(MobileContext)?<DrawerDescription {...props}/>:<Primitive.Description {...props}/>;}
export function DialogContent({children,className=''}:{children:React.ReactNode;className?:string}) {
 const mobile=useContext(MobileContext);
 const [viewport,setViewport]=useState<CSSProperties>({});
 useEffect(()=>{const visual=window.visualViewport;if(!visual)return;function update(){setViewport({'--dialog-viewport-height':`${visual!.height}px`,'--dialog-viewport-bottom':`${Math.max(0,window.innerHeight-visual!.height-visual!.offsetTop)}px`} as CSSProperties);}update();visual.addEventListener('resize',update);visual.addEventListener('scroll',update);return()=>{visual.removeEventListener('resize',update);visual.removeEventListener('scroll',update);};},[]);
 if(mobile)return <DrawerContent style={viewport} className={`responsive-form-drawer ${className}`}><div className="drawer-form-scroll">{children}</div><DrawerClose className="dialog-close" aria-label="Yopish / Закрыть"><X size={20}/></DrawerClose></DrawerContent>;
 return <Primitive.Portal><Primitive.Backdrop className="dialog-backdrop"/><Primitive.Popup className={`dialog-popup ${className}`}>{children}<Primitive.Close className="dialog-close" aria-label="Yopish / Закрыть"><X size={20}/></Primitive.Close></Primitive.Popup></Primitive.Portal>;
}
