import {todayInTashkent} from './time.js';
const keys=['customer','device','work','price_uzs','due_date','status','start_date','end_date'];
export function nextState(previous,plan,result,text,at){
 const fresh=plan.memory?.topic==='new';
 const state=fresh?{}:{...previous};
 const fields=Object.fromEntries(keys.filter(k=>plan[k]!=null).map(k=>[k,plan[k]]));
 if(result.kind==='reset')return {};
 // State contains facts accepted by the backend, not a model-generated narrative.
 if(result.kind==='clarify'){
  const action=plan.memory?.pending_action||(['create','update'].includes(plan.action)?plan.action:null);
  if(action)state.pending={action,fields:plan.memory?.topic==='continue'&&previous.pending?.action===action?{...previous.pending.fields,...fields}:fields,question:result.reply,at};
  else if(plan.memory?.topic!=='none')state.pending={action:null,fields,question:result.reply,at};
 }else delete state.pending;
 if(result.stale_reference){
  delete state.active_repair;
  // Do not carry inferred old identifiers into the confirmation question.
  state.pending={action:'update',fields:Object.fromEntries(Object.entries(fields).filter(([k])=>!['customer','device'].includes(k))),question:result.reply,at};
 }
 if(result.repair){
  state.active_repair={id:result.repair.id,customer:result.repair.customer,device:result.repair.device,at};
 }
 if(result.kind==='analytics')state.last_report={filters:fields,at};
 state.last_exchange={user:text.slice(0,3000),assistant:result.reply.slice(0,1000),kind:result.kind,at};
 return state;
}
export function activeReferenceIsStale(state,now){
 return !state.active_repair||todayInTashkent(new Date(state.active_repair.at))!==todayInTashkent(new Date(now));
}
