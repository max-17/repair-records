'use client';
import {useLayoutEffect,useRef} from 'react';
import JsBarcode from 'jsbarcode';
/** Code 128 handles manufacturer numbers and existing alphanumeric inventory IDs. */
export function ProductBarcode({value}:{value:string}){
 const ref=useRef<SVGSVGElement>(null);
 useLayoutEffect(()=>{
  const svg=ref.current;if(!svg)return;
  JsBarcode(svg,value,{format:'CODE128',displayValue:false,width:1,height:44,margin:8,background:'#ffffff',lineColor:'#000000'});
  const width=svg.getAttribute('width'),height=svg.getAttribute('height');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('preserveAspectRatio','none');
 },[value]);
 return <svg ref={ref} role="img" aria-label={`Shtrix-kod ${value}`} data-barcode-value={value}/>;
}
