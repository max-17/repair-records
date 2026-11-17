import {randomUUID} from 'node:crypto';
const normalize=value=>value.toLowerCase().replace(/[‘’ʻʼ`]/g,"'").replace(/[^\p{L}\p{N}]/gu,'');
export function confirmationAnswer(text){
 const normalized=normalize(text);
 if(['ha','tasdiq','tasdiqlayman','confirm','yes'].includes(normalized)||text.trim()==='/confirm')return 'yes';
 if(['yoq','bekor','bekorqil','cancel','no'].includes(normalized)||text.trim()==='/cancel')return 'no';
 return null;
}
export function snapshot(row){return JSON.stringify(Object.fromEntries(['id','master_id','customer','device','work','price_uzs','due_date','status','received_by','received_by_name','technician','updated_at'].map(k=>[k,row[k]])));}
export function proposal(row,changes,now){
 return {token:randomUUID(),repair_id:row.id,customer:row.customer,device:row.device,changes,before_snapshot:snapshot(row),at:new Date(now).toISOString()};
}
export function proposalReply(p){
 const before=JSON.parse(p.before_snapshot);
 const names={price_uzs:'Narx',status:'Holat',due_date:'Tayyor sanasi',work:'Ta’mirlash',technician:'Usta'};
 const statuses={ready:'Tayyor',delivered:'Topshirildi',cancelled:'Bekor qilindi',in_progress:'Jarayonda',received:'Qabul qilindi'};
 const format=(k,v)=>v==null?'Belgilanmagan':k==='price_uzs'?new Intl.NumberFormat('uz-UZ').format(v)+' so‘m':k==='status'?statuses[v]||v:v;
 return `${p.customer} · ${p.device}\n${Object.entries(p.changes).map(([k,v])=>`${names[k]}: ${format(k,before[k])} → ${format(k,v)}`).join('\n')}\nTasdiqlaysizmi?`;
}

export function telegramPresentation(result){
 const buttons=result.kind==='transcript'?[
  [{text:'Tasdiqlash',style:'success',callback_data:`voiceuse:${result.draft.token}`},{text:'Tahrirlash',callback_data:`voiceedit:${result.draft.token}`}],
  [{text:'Bekor qilish',style:'danger',callback_data:`voicedeny:${result.draft.token}`}]
 ]:result.kind==='confirmation'?[
  [{text:'Tasdiqlash',style:'success',callback_data:`confirm:${result.proposal.token}`},{text:'Tahrirlash',callback_data:`edit:${result.proposal.token}`}],
  [{text:'Bekor qilish',style:'danger',callback_data:`deny:${result.proposal.token}`}]
 ]:result.kind==='selection'?[
  ...result.selection.candidates.map((r,i)=>[{text:`${i+1}. ${r.customer} · ${r.device}`.slice(0,60),callback_data:`pick:${result.selection.token}:${i}`}]),
  [{text:'Bekor qilish',style:'danger',callback_data:`deny:${result.selection.token}`}]
 ]:null;
 return {text:result.reply.slice(0,4000),...(buttons?{reply_markup:{inline_keyboard:buttons}}:{})};
}
