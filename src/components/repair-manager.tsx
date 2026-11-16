'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money } from '@/lib/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
const statuses:Record<string,string>={received:'Qabul qilindi',in_progress:'Jarayonda',ready:'Tayyor',delivered:'Topshirildi',cancelled:'Bekor qilindi'};
type Repair={id:string;customer:string;device:string;work:string;received_by_name:string|null;received_by:string|null;technician:string|null;price_uzs:number|null;due_date:string|null;status:string};
export function RepairManager(){
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
 const params=new URLSearchParams({q:search,status,page:String(page)});if(!status)params.delete('status');
 const query=useQuery({queryKey:['repairs',search,status,page],queryFn:()=>api<{repairs:Repair[]}>('/api/repairs?'+params)});
 return <section aria-label="Ta’mirlash buyurtmalari">
  <div className="admin-table-tools"><Input aria-label="Mijoz yoki qurilma" placeholder="Mijoz yoki qurilmani qidiring" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
   <select aria-label="Holat" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Barcha holatlar</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
   <Button variant="outline" onClick={()=>query.refetch()}>Yangilash</Button></div>
  {query.isPending?<p>Yuklanmoqda…</p>:query.isError?<p role="alert">{query.error.message}</p>:<>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:900,textAlign:'left',borderSpacing:'12px'}}><thead><tr>{['Mijoz','Qurilma','Ish','Qabul qilgan','Usta','Narx','Tayyor sana','Holat'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{query.data.repairs.map(r=><tr key={r.id}><td>{r.customer}</td><td>{r.device}</td><td>{r.work}</td><td>{r.received_by_name||r.received_by||'—'}</td><td>{r.technician||'—'}</td><td>{r.price_uzs===null?'—':money(r.price_uzs)+' so‘m'}</td><td>{r.due_date||'—'}</td><td>{statuses[r.status]||r.status}</td></tr>)}</tbody></table></div>
   {!query.data.repairs.length&&<p>Buyurtmalar topilmadi.</p>}
   <div className="form-actions"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Oldingi</Button><span>{page}</span><Button variant="outline" disabled={query.data.repairs.length<100} onClick={()=>setPage(p=>p+1)}>Keyingi</Button></div>
  </>}
  <p>Buyurtmalar Telegram bot orqali boshqariladi. Narx — kelishilgan summa.</p>
 </section>;
}
