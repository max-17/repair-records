'use client';
import {SemanticIndexSettings} from './semantic-index-settings';
import {useState} from 'react';
import Link from 'next/link';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,Check,Save} from 'lucide-react';
import {api} from '@/lib/api';
import {Button} from './ui/button';
type Lead={id:string;product:{name:string;price:number|null};customer:{first_name:string;username:string;id:string};status:string;createdAt:number};
type Settings={knowledge:string;leads:Lead[];config:{production:boolean;token:boolean;webhookSecret:boolean;adminChat:boolean;ai:boolean;baseUrl:boolean}};
const leadStatuses:Record<string,string>={sent:'Adminga yuborildi',uncertain:'Telegramni tekshiring',failed:'Yuborilmadi',pending:'Navbatda',sending:'Yuborilmoqda'};
const labels:{key:keyof Omit<Settings['config'],'production'>;label:string}[]=[{key:'token',label:'Mijoz botining tokeni'},{key:'webhookSecret',label:'Webhook siri'},{key:'adminChat',label:'Admin suhbat raqami'},{key:'ai',label:'AI kaliti'},{key:'baseUrl',label:'Do‘kon manzili'}];
export function CustomerBotSettings(){
 const client=useQueryClient();const [draft,setDraft]=useState<string|null>(null);const [saved,setSaved]=useState(false);
 const query=useQuery({queryKey:['customer-bot-settings'],queryFn:()=>api<Settings>('/api/customer-bot/settings')});
 const save=useMutation({mutationFn:(knowledge:string)=>api<{ok:true;knowledge:string}>('/api/customer-bot/settings',{method:'PUT',body:JSON.stringify({knowledge})}),onSuccess:result=>{client.setQueryData<Settings>(['customer-bot-settings'],current=>current?{...current,knowledge:result.knowledge}:current);setDraft(null);setSaved(true);}});
 const value=draft??query.data?.knowledge??'';
 return <main className="container" style={{maxWidth:960,paddingTop:28,paddingBottom:48}}>
  <Link className="back-link" href="/admin/settings"><ArrowLeft size={17}/>Sozlamalarga qaytish</Link>
  <header style={{margin:'20px 0 24px'}}><h1>Mijoz boti</h1><p className="muted" style={{marginTop:8}}>Mahsulot qidirish, tavsiya berish va xarid istagini adminga yuborish.</p></header>
  {query.isPending?<p role="status">Yuklanmoqda…</p>:query.isError?<div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={()=>query.refetch()}>Qayta urinish</Button></div>:query.data&&<>
   <section aria-label="Ulanish holati" style={{border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:24}}><h2 style={{fontSize:17,marginBottom:12}}>Ulanish holati {query.data.config.production?'':'· Test muhiti'}</h2><ul style={{listStyle:'none',display:'grid',gap:9,padding:0}}>{labels.map(({key,label})=><li key={key} style={{display:'flex',justifyContent:'space-between',gap:16,fontSize:13}}><span>{label}</span><strong>{query.data!.config[key]?'Sozlangan':'Sozlanmagan'}</strong></li>)}</ul>
    <details style={{marginTop:16,fontSize:12}}><summary style={{cursor:'pointer'}}>Server o‘zgaruvchilari</summary><p style={{lineHeight:1.8,marginTop:10}}>Asosiy muhit: <code>SHOP_TELEGRAM_BOT_TOKEN</code>, <code>SHOP_TELEGRAM_WEBHOOK_SECRET</code>, <code>SHOP_ADMIN_CHAT_ID</code>, <code>TELEGRAM_APP_URL</code> va mavjud <code>GOOGLE_GENERATIVE_AI_API_KEY</code>.</p><p style={{lineHeight:1.8,marginTop:8}}>Test muhiti: alohida <code>TELEGRAM_DEV_BOT_TOKEN</code>, <code>TELEGRAM_DEV_APP_URL</code> va <code>SHOP_DEV_ADMIN_CHAT_ID</code>. Admin mijoz botini avval ochib, <code>/start</code> yuborishi kerak.</p><p style={{lineHeight:1.8,marginTop:8}}>Server sozlangach <code>bun run customer:setup</code> webhookni ro‘yxatdan o‘tkazadi. Tokenlarni quyidagi bilim maydoniga yozmang.</p></details>
   </section>
   <form onSubmit={e=>{e.preventDefault();save.mutate(value);}}>
    <label htmlFor="customer-knowledge" style={{display:'block',fontWeight:700,marginBottom:8}}>Do‘kon haqidagi ochiq ma’lumotlar</label>
    <p id="knowledge-help" className="muted" style={{fontSize:13,lineHeight:1.7,marginBottom:12}}>Kafolat, yetkazib berish shartlari va tez-tez so‘raladigan savollarni yozing. Har bir mavzuni alohida xatboshi bilan ajrating. Bot bu matndan tegishli qismlarni topib foydalanadi. Narx va qoldiq katalogdan olinadi.</p>
    <textarea id="customer-knowledge" className="input" rows={14} maxLength={20000} aria-describedby="knowledge-help" style={{width:'100%',resize:'vertical',fontSize:16,lineHeight:1.6,padding:14}} value={value} onChange={e=>{setDraft(e.target.value);setSaved(false);}} placeholder={'Kafolat\nDo‘konning amaldagi kafolat shartlarini yozing.\n\nYetkazib berish\nHudud, narx va ish vaqtini yozing.'}/>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:12}}><small className="muted">{value.length.toLocaleString('uz-UZ')} / 20 000</small><Button type="submit" disabled={save.isPending||draft===null}><Save size={16}/>{save.isPending?'Saqlanmoqda…':'Saqlash'}</Button></div>
    {saved&&<p role="status" style={{display:'flex',alignItems:'center',gap:7,marginTop:12}}><Check size={16}/>Bilim matni saqlandi.</p>}{save.isError&&<p className="form-error" role="alert">{save.error.message}</p>}
   </form>
   <SemanticIndexSettings/>
   <section aria-label="Xarid so‘rovlari" style={{marginTop:32}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14}}><div><h2 style={{fontSize:19}}>Xarid so‘rovlari</h2><p className="muted" style={{fontSize:12,marginTop:5}}>Oxirgi 20 ta so‘rov. Bu tasdiqlangan buyurtma yoki to‘lov emas.</p></div><Button variant="outline" onClick={()=>query.refetch()}>Yangilash</Button></div>
    {!query.data.leads?.length?<p className="muted">Hali xarid so‘rovi yo‘q.</p>:<ul style={{listStyle:'none',padding:0,display:'grid',gap:10}}>{query.data.leads.map(lead=><li key={lead.id} style={{border:'1px solid var(--border)',borderRadius:9,padding:14,display:'grid',gap:6}}><strong>{lead.product.name}</strong>{lead.product.price!==null&&<span>{lead.product.price.toLocaleString('uz-UZ')} so‘m</span>}<span style={{fontSize:13}}>{lead.customer.first_name}{lead.customer.username?' · @'+lead.customer.username:lead.customer.id?' · ID '+lead.customer.id:''}</span><div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap',fontSize:12}}><time>{Number.isFinite(lead.createdAt)&&lead.createdAt>0?new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',dateStyle:'short',timeStyle:'short'}).format(new Date(lead.createdAt)):'—'}</time><strong>{leadStatuses[lead.status]||'Ko‘rib chiqing'}</strong></div></li>)}</ul>}
   </section>
  </>}
 </main>;
}
