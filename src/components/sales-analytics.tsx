'use client';
import { useEffect, useState } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Info } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { money, type Product } from '@/lib/types';
import { shopDate, shiftDate, type SalesAnalytics } from '@/lib/sales-types';
import { Button } from './ui/button';
import { AnalyticsRange } from './analytics-range';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

function Help({text}:{text:string}){const [open,setOpen]=useState(false);return <Tooltip.Provider><Tooltip.Root open={open} onOpenChange={setOpen}><Tooltip.Trigger className="analytics-help" aria-label="Izoh" onClick={()=>setOpen(value=>!value)}><Info size={14}/></Tooltip.Trigger><Tooltip.Portal><Tooltip.Positioner sideOffset={6} className="analytics-help-positioner"><Tooltip.Popup className="analytics-help-popup">{text}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>;}
function comparison(current:number,previous:number){
  if(!current&&!previous)return '';
  if(!previous)return '';
  if(!current&&!previous)return '';
  const value=Math.round((current-previous)/previous*100);return `${value>0?'+':''}${value}% oldingi davrga nisbatan`;
}
export function SalesAnalyticsPage({onEditProduct}:{onEditProduct:(product:Product)=>void}){
  const today=shopDate();
  const [range,setRange]=useState({from:shiftDate(today,-29),to:today});
  const analytics=useQuery({queryKey:['analytics',range.from,range.to],queryFn:()=>api<SalesAnalytics>(`/api/analytics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)});
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('analytics-range')||'null');if(saved&&/^\d{4}-\d{2}-\d{2}$/.test(saved.from)&&/^\d{4}-\d{2}-\d{2}$/.test(saved.to)&&saved.from<=saved.to)setRange(saved);}catch{}},[]);
  function selectRange(next:{from:string;to:string}){setRange(next);try{localStorage.setItem('analytics-range',JSON.stringify(next));}catch{}}
  const [editError,setEditError]=useState('');
  async function edit(id:string){try{setEditError('');const products=await api<Product[]>('/api/products?all=1');const product=products.find(p=>p.id===id);if(product)onEditProduct(product);else setEditError('Mahsulot o‘chirilgan.');}catch{setEditError('Mahsulot yuklanmadi. Qayta urinib ko‘ring.');}}
  const data=analytics.data;
  const max=Math.max(1,...(data?.trend.map(day=>day.revenue)||[1]));
  return <section className="analytics-workspace"><div className="analytics-filters"><AnalyticsRange value={range} onChange={selectRange}/></div>
    {analytics.isPending?<p className="loading-text">Hisobot yuklanmoqda...</p>:analytics.isError?<div className="empty-state"><p role="alert">{analytics.error.message}</p><Button onClick={()=>analytics.refetch()}>Qayta urinish</Button></div>:data&&<>
      <div className="analytics-overview"><div><span>Savdo summasi <Help text="Tasdiqlangan sotuvlar tushumi. Bu foyda emas. Hisobot Toshkent vaqti bo‘yicha."/></span><strong>{money(data.current.revenue)} <small>so‘m</small></strong><p>{comparison(data.current.revenue,data.previous.revenue)}</p></div><div><span>Sotilgan dona</span><strong>{money(data.current.units)} <small>dona</small></strong><p>{comparison(data.current.units,data.previous.units)}</p></div><div><span>Sotuvlar soni</span><strong>{money(data.current.sales)}</strong><p>{comparison(data.current.sales,data.previous.sales)}</p></div></div>
      <section className="analytics-trend"><h2><BarChart3 size={19}/>Sotuv dinamikasi <Help text="Kunlik tushum. Sotuv bo‘lmagan kunlar nol sifatida ko‘rsatiladi."/></h2>
        <div className="analytics-chart-frame"><svg className="sales-chart" viewBox="0 0 800 240" role="img" aria-label={data.current.sales?'Kunlik sotuv tushumi':'Ko‘rsatish uchun ma’lumot yo‘q'}><title>Kunlik sotuv tushumi</title>{[20,65,110,155,200].map(y=><line key={y} x1="70" x2="788" y1={y} y2={y} className="chart-grid"/>)}{data.current.sales>0&&[0,.5,1].map(f=><text key={f} x="60" y={204-f*180} textAnchor="end">{money(Math.round(max*f))}</text>)}{data.current.sales>0&&data.trend.map((day,index)=>{const slot=718/data.trend.length;const height=day.revenue/max*180;return <rect key={day.date} x={70+index*slot+slot*.2} y={200-height} width={Math.max(1,slot*.6)} height={height} className="chart-bar"><title>{day.date}: {money(day.revenue)} so‘m · {day.units} dona</title></rect>;})}{Array.from(new Set([0,Math.floor((data.trend.length-1)/4),Math.floor((data.trend.length-1)/2),Math.floor((data.trend.length-1)*3/4),data.trend.length-1])).map(index=><text key={index} x={70+(data.trend.length===1?359:index/(data.trend.length-1)*718)} y="229" textAnchor={index===0?'start':index===data.trend.length-1?'end':'middle'}>{data.trend[index].date.slice(8)}.{data.trend[index].date.slice(5,7)}</text>)}</svg>{!data.current.sales&&<div className="analytics-chart-empty" role="status">Ko‘rsatish uchun ma’lumot yo‘q</div>}</div>
        <details className="analytics-data-table"><summary>Kunlik jadvalni ko‘rish</summary><div><table><thead><tr><th>Sana</th><th>Tushum, so‘m</th><th>Dona</th><th>Sotuvlar</th></tr></thead><tbody>{data.trend.map(day=><tr key={day.date}><td>{day.date}</td><td>{money(day.revenue)}</td><td>{day.units}</td><td>{day.sales}</td></tr>)}</tbody></table></div></details>
      </section>
      {editError&&<p role="alert" className="form-error">{editError}</p>}<div className="analytics-lists"><section className="analytics-bestsellers"><h2>Eng ko‘p sotilganlar <Help text="Tanlangan davrda dona soni, so‘ng tushum bo‘yicha saralangan."/></h2>{!data.bestSellers.length?<p className="analytics-empty-note">Bu davrda sotilgan mahsulot yo‘q.</p>:<ol>{data.bestSellers.map((product,index)=><li key={product.productId}><span className="analytics-rank">{index+1}</span><div><button className="analytics-product-link" onClick={()=>void edit(product.productId)}>{product.name}</button><small>{product.units} dona sotilgan · Hozir mavjud: {product.stock??"—"}</small></div><strong>{money(product.revenue)} <small>so‘m</small></strong></li>)}</ol>}</section>
      <section className="analytics-lowstock"><h2>Kam qolgan mahsulotlar <Help text="Omborda 3 dona yoki kam qolgan mahsulotlar. Dastlabki 20 ta."/></h2>{!data.lowStock.length?<p className="analytics-empty-note">Qoldig‘i kam mahsulot yo‘q.</p>:<ul>{data.lowStock.map(product=><li key={product.productId}><div><button className="analytics-product-link" onClick={()=>void edit(product.productId)}>{product.name}</button><small>{product.stock?'Kam qoldi':'Tugagan'}</small></div><strong>{product.stock} <small>dona</small></strong></li>)}</ul>}<Link className="analytics-inventory-link" href="/admin">Omborda qoldiqni boshqarish →</Link></section></div>
    </>}
  </section>;
}
