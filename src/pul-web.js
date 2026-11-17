import {setupStaff} from './staff-auth.js';
import {pulRows} from './pul-db.js';
import {remaining,providerRemaining,validDate} from './pul-domain.js';
export const webActor='web:owner';
export async function pulWebOverview(db,shopId,filters={}){
 await setupStaff(db);
 const rows=await pulRows(db,shopId),workers=(await db.execute({sql:'SELECT user_id,name FROM pul_workers WHERE shop_id=? ORDER BY name',args:[shopId]})).rows.map(r=>({id:String(r.user_id),name:String(r.name)}));
 const staff=(await db.execute('SELECT telegram_id,name FROM staff_users WHERE is_active=1 ORDER BY name')).rows;
 for(const user of staff){if(!workers.some(w=>w.id===user.telegram_id))workers.push({id:String(user.telegram_id),name:String(user.name)});}
 if(!workers.some(w=>w.id===webActor))workers.push({id:webActor,name:'Veb administrator'});
 const names=Object.fromEntries(workers.map(w=>[w.id,w.name]));
 const start=filters.start,end=filters.end;
 if(!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>366)throw new Error('INVALID_PERIOD');
 const decorate=r=>({id:r.id,kind:r.kind,workerId:r.worker_id,workerName:names[r.worker_id]||r.worker_id,referenceId:r.reference_id,isDeleted:r.is_deleted,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,data:{...r.data,photo:undefined},hasPhoto:!!r.data.photo,remaining:['sale','debt'].includes(r.kind)?remaining(r,rows):null,vendorRemaining:r.kind==='sale'?providerRemaining(r,rows):null});
 const period=rows.filter(r=>!r.is_deleted&&(!filters.worker||r.worker_id===filters.worker)&&r.data.occurredOn>=start&&r.data.occurredOn<=end);
 const groups=new Map(),workerGroups=new Map(),days=new Map();
 const empty=(currency)=>({currency,sales:0,salesCount:0,received:0,repayments:0,vendorReceived:0,cash:0,card:0,transfer:0,outstanding:0,overdue:0,vendorPending:0});
 for(const r of period){
  const currency=r.data.currency,g=groups.get(currency)||empty(currency),key=r.worker_id+':'+currency,w=workerGroups.get(key)||{...empty(currency),workerId:r.worker_id,workerName:names[r.worker_id]||r.worker_id};
  const dk=r.data.occurredOn+':'+currency,day=days.get(dk)||{date:r.data.occurredOn,currency,sales:0,received:0};
  if(r.kind==='sale'){g.sales+=r.data.totalMinor;g.salesCount++;w.sales+=r.data.totalMinor;w.salesCount++;day.sales+=r.data.totalMinor;}
  if(r.kind==='payment'){for(const x of [g,w]){x.received+=r.data.amountMinor;x[r.data.method]+=r.data.amountMinor;if(r.data.source==='vendor')x.vendorReceived+=r.data.amountMinor;else if(r.data.isRepayment)x.repayments+=r.data.amountMinor;}day.received+=r.data.amountMinor;}
  groups.set(currency,g);workerGroups.set(key,w);days.set(dk,day);
 }
 const today=filters.today;
 for(const r of rows.filter(r=>!r.is_deleted&&['sale','debt'].includes(r.kind)&&(!filters.worker||r.worker_id===filters.worker))){const g=groups.get(r.data.currency)||empty(r.data.currency),left=remaining(r,rows);g.outstanding+=left;if(r.data.dueDate&&r.data.dueDate<today)g.overdue+=left;if(r.kind==='sale')g.vendorPending+=providerRemaining(r,rows);groups.set(r.data.currency,g);}
 let matches=rows.filter(r=>(filters.status==='all'||r.is_deleted===(filters.status==='deleted'))&&(!filters.worker||r.worker_id===filters.worker));
 if(filters.kind==='owed')matches=matches.filter(r=>['sale','debt'].includes(r.kind)&&remaining(r,rows)>0);
 else if(filters.kind==='service')matches=matches.filter(r=>r.kind==='sale'&&r.data.items?.some(i=>i.type==='service'));
 else if(filters.kind&&filters.kind!=='all')matches=matches.filter(r=>r.kind===filters.kind);
 if(filters.currency)matches=matches.filter(r=>r.data.currency===filters.currency||r.kind==='vendor');
 if(filters.q){const q=filters.q.toLocaleLowerCase();matches=matches.filter(r=>(r.id+' '+JSON.stringify({...r.data,photo:undefined})+' '+(names[r.worker_id]||r.worker_id)).toLocaleLowerCase().includes(q));}
 if(filters.kind!=='owed'&&filters.kind!=='vendor')matches=matches.filter(r=>r.data.occurredOn>=start&&r.data.occurredOn<=end);
 const page=Math.max(1,Number(filters.page)||1),pageSize=30;
 return {records:matches.slice((page-1)*pageSize,page*pageSize).map(decorate),total:matches.length,page,pageSize,workers,vendors:rows.filter(r=>r.kind==='vendor'&&!r.is_deleted).map(decorate),analytics:{currencies:[...groups.values()],workers:[...workerGroups.values()],days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))}};
}
export async function pulWebDetail(db,shopId,id){
 const rows=await pulRows(db,shopId),row=rows.find(r=>r.id===id);if(!row)return null;
 const history=(await db.execute({sql:'SELECT id,action,user_id,user_name,occurred_at,before_json,after_json,reason FROM pul_history WHERE shop_id=? AND record_id=? ORDER BY occurred_at DESC,id DESC LIMIT 100',args:[shopId,id]})).rows.map(e=>({id:e.id,action:e.action,actor:e.user_name,at:e.occurred_at,reason:e.reason,before:e.before_json?JSON.parse(e.before_json).data:null,after:JSON.parse(e.after_json).data}));
 return {record:{...row,data:{...row.data,photo:undefined},hasPhoto:!!row.data.photo,remaining:['sale','debt'].includes(row.kind)?remaining(row,rows):null,vendorRemaining:row.kind==='sale'?providerRemaining(row,rows):null},payments:rows.filter(r=>r.reference_id===id).map(r=>({...r,data:{...r.data,photo:undefined}})),history:history.map(e=>({...e,before:e.before?{...e.before,photo:e.before.photo?'[rasm]':null}:null,after:{...e.after,photo:e.after.photo?'[rasm]':null}}))};
}
