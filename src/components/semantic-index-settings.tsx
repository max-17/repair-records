'use client';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import Link from 'next/link';
import {api} from '@/lib/api';
import {Button} from './ui/button';
type IndexStatus={enabled:boolean;model:string;dimensions:number;total:number;ready:number;pending:number;processed?:number;busy?:boolean};
export function SemanticIndexSettings(){
 const client=useQueryClient();const query=useQuery({queryKey:['semantic-index'],queryFn:()=>api<IndexStatus>('/api/customer-bot/reindex'),refetchInterval:60000});
 const refresh=useMutation({mutationFn:()=>api<IndexStatus>('/api/customer-bot/reindex',{method:'POST'}),onSuccess:data=>{client.setQueryData(['semantic-index'],data);void client.invalidateQueries({queryKey:['operations']});}});
 return <section className="editor-section" aria-label="Semantik qidiruv" style={{margin:'24px 0',padding:18,border:'1px solid var(--border)',borderRadius:10}}><h2>Semantik qidiruv</h2>
  <p style={{fontSize:13,color:'var(--muted-foreground)'}}>So‘zlar turlicha bo‘lsa ham ma’nosi yaqin mahsulot va do‘kon ma’lumotlarini topadi. Narx va mavjudlik doim joriy bazadan tekshiriladi.</p>
  {query.isPending?<p>Yuklanmoqda…</p>:query.isError?<p className="form-error">{query.error.message}</p>:query.data&&<><p style={{fontSize:13}}>{query.data.model} · {query.data.dimensions} o‘lcham</p><p>{query.data.ready} / {query.data.total} tayyor · {query.data.pending} navbatda</p>{!query.data.enabled&&<p style={{fontSize:13}}>Semantik qidiruv o‘chirilgan yoki Google kaliti sozlanmagan. Kalit so‘z bo‘yicha qidiruv ishlaydi.</p>}<Button variant="outline" disabled={!query.data.enabled||refresh.isPending} onClick={()=>refresh.mutate()}>{refresh.isPending?'Indeks yangilanmoqda…':'Semantik indeksni yangilash'}</Button></>}
  {refresh.isError&&<p className="form-error" role="alert">{refresh.error.message}</p>}{refresh.isSuccess&&<p role="status">{refresh.data.busy?'Boshqa indekslash jarayoni ishlamoqda.':`${refresh.data.processed||0} ta ma’lumot indekslandi.`}</p>}
  <Link href="/admin/operations" style={{fontSize:13}}>Tizim holati va ogohlantirishlar →</Link>
 </section>;
}
