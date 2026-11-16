import {todayInTashkent} from './time.js';
const keys=['customer','device','work','price_uzs','due_date','status','technician','start_date','end_date'];
export function messageTiming(state,now){
 const previous=state.last_exchange?.at;
 const timestamp=Date.parse(previous);
 const valid=Number.isFinite(timestamp);
 const seconds=valid?Math.max(0,Math.floor((now-timestamp)/1000)):null;
 return {
  previous_message_at:valid?previous:null,
  current_message_at:new Date(now).toISOString(),
  inactivity_seconds:seconds,
  current_local_date:todayInTashkent(new Date(now)),
  previous_local_date:valid?todayInTashkent(new Date(timestamp)):null,
  crossed_calendar_day:valid?todayInTashkent(new Date(timestamp))!==todayInTashkent(new Date(now)):false,
  timezone:'Asia/Tashkent'
 };
}
export function nextState(previous,plan,result,text,at,timing=messageTiming(previous,Date.parse(at))){
 const fresh=plan.memory?.topic==='new';
 const state=fresh?{}:{...previous};
 const fields=Object.fromEntries(keys.filter(k=>plan[k]!=null).map(k=>[k,plan[k]]));
 if(result.kind==='expired_button')return previous;
 if(result.kind==='reset')return {phase:'idle'};
 // State contains facts accepted by the backend, not a model-generated narrative.
 if(result.kind==='clarify'){
  const action=plan.memory?.pending_action||(['create','update'].includes(plan.action)?plan.action:null);
  if(action)state.pending={action,...(plan.memory?.topic==='continue'&&previous.pending?.action===action&&previous.pending?.repair_id?{repair_id:previous.pending.repair_id}:{}),fields:plan.memory?.topic==='continue'&&previous.pending?.action===action?{...previous.pending.fields,...fields}:fields,question:result.reply,at};
  else if(plan.memory?.topic!=='none')state.pending={action:null,fields,question:result.reply,at};
 }else delete state.pending;
 if(result.kind==='cancelled_confirmation')delete state.pending;
 if(result.kind==='editing')state.pending=result.draft;
 if(result.stale_reference){
  delete state.active_repair;
  // Do not carry inferred old identifiers into the confirmation question.
  state.pending={action:'update',fields:Object.fromEntries(Object.entries(fields).filter(([k])=>!['customer','device'].includes(k))),question:result.reply,at};
 }
 if(result.kind==='confirmation')state.confirmation=result.proposal;
 else if(plan.memory?.topic==='new'||!['clarify','expired_button'].includes(result.kind))delete state.confirmation;
 if(result.kind==='selection')state.selection=result.selection;
 else if(plan.memory?.topic==='new'||!['clarify','expired_button'].includes(result.kind))delete state.selection;
 if(result.repair){
  state.active_repair={id:result.repair.id,customer:result.repair.customer,device:result.repair.device,at};
 }
 if(result.kind==='analytics')state.last_report={filters:fields,at};
 state.phase=state.confirmation?'awaiting_confirmation':state.selection?'awaiting_selection':state.pending?'collecting_details':['created','updated','analytics','list'].includes(result.kind)?'completed':'idle';
 state.last_gap_seconds=timing.inactivity_seconds;
 state.last_exchange={user:text.slice(0,3000),assistant:result.reply.slice(0,1000),kind:result.kind,at};
 return state;
}
export function activeReferenceIsStale(state,now){
 return !state.active_repair||todayInTashkent(new Date(state.active_repair.at))!==todayInTashkent(new Date(now));
}

export function resolveReportPeriod(plan,text,state,timing){
 if(plan.action==='analytics' && state.pending?.action==='analytics' && /^(1|bir)\s+kun[.!?]?$/iu.test(text.trim())){
  return {...plan,start_date:timing.current_local_date,end_date:timing.current_local_date};
 }
 return plan;
}
