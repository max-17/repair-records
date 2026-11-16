'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/types';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
const statuses:Record<string,string>={received:'Qabul qilindi',in_progress:'Jarayonda',ready:'Tayyor',delivered:'Topshirildi',cancelled:'Bekor qilindi'};
const filters=[{value:'all',label:'Barcha holatlar'},...Object.entries(statuses).map(([value,label])=>({value,label}))];
type Repair={id:string;customer:string;device:string;work:string;received_by_name:string|null;received_by:string|null;technician:string|null;price_uzs:number|null;due_date:string|null;status:string};
function dateLabel(value:string|null){if(!value)return '—';const parts=value.split('-');return parts.length===3?`${parts[2]}.${parts[1]}.${parts[0]}`:value;}
export function RepairManager(){
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
 const params=new URLSearchParams({q:search,status,page:String(page)});if(!status)params.delete('status');
 const query=useQuery({queryKey:['repairs',search,status,page],queryFn:()=>api<{repairs:Repair[]}>('/api/repairs?'+params)});
 return <section className="repair-workspace" aria-label="Ta’mirlash buyurtmalari">
  <div className="repair-toolbar"><label className="search-box"><Search size={18}/><input aria-label="Mijoz yoki qurilma" placeholder="Mijoz yoki qurilmani qidiring" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
   <Select value={status||'all'} items={filters} onValueChange={value=>{if(value){setStatus(value==='all'?'':value);setPage(1);}}}><SelectTrigger className="select-trigger" aria-label="Buyurtma holati"><SelectValue/></SelectTrigger><SelectContent className="select-content" alignItemWithTrigger={false}>{filters.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
   <Button variant="outline" disabled={query.isFetching} onClick={()=>query.refetch()}><RefreshCw size={17} className={query.isFetching?'repair-refreshing':''}/>Yangilash</Button></div>
  {query.isPending?<div className="loading-text" role="status">Yuklanmoqda…</div>:query.isError?<div className="form-error" role="alert">{query.error.message}<Button variant="outline" onClick={()=>query.refetch()}>Qayta urinish</Button></div>:<>
   <div className="inventory-table repair-table" tabIndex={0} role="region" aria-label="Ta’mirlash buyurtmalari jadvali"><table><thead><tr>{['Mijoz','Qurilma','Ish','Qabul qilgan','Usta','Narx','Tayyor sana','Holat'].map(x=><th key={x} scope="col">{x}</th>)}</tr></thead><tbody>{query.data.repairs.map(r=><tr key={r.id}><td className="repair-customer">{r.customer}</td><td className="repair-device">{r.device}</td><td className="repair-work">{r.work}</td><td>{r.received_by_name||r.received_by||'—'}</td><td>{r.technician||'—'}</td><td className="numeric">{r.price_uzs===null?'—':money(r.price_uzs)+' UZS'}</td><td className="repair-date">{dateLabel(r.due_date)}</td><td><span className="repair-status" data-status={r.status}><span/>{statuses[r.status]||r.status}</span></td></tr>)}</tbody></table>
   {!query.data.repairs.length&&<div className="repair-empty"><Wrench size={28}/><strong>Buyurtmalar topilmadi</strong><p>{search||status?'Qidiruv yoki holat filtrini o‘zgartiring.':'Buyurtmalar Telegram bot orqali qo‘shiladi.'}</p></div>}</div>
   <div className="repair-table-footer"><span>{query.data.repairs.length} ta buyurtma · {page}-sahifa</span><nav aria-label="Buyurtma sahifalari"><Button variant="outline" size="icon" aria-label="Oldingi sahifa" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></Button><span aria-current="page">{page}</span><Button variant="outline" size="icon" aria-label="Keyingi sahifa" disabled={query.data.repairs.length<100} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></Button></nav></div>
  </>}
  <p className="repair-footnote">Buyurtmalar Telegram bot orqali boshqariladi. Narx — kelishilgan summa.</p>
 </section>;
}
