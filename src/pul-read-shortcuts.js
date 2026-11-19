// Exact, read-only intents only. Extra qualifiers must go through normal parsing.
export function pulReadShortcut(text,today){
 const key=text.trim().toLocaleLowerCase().replace(/[.!?]+$/u,'').replace(/\s+/g,' ');
 if(key==='/pul_debts'||['qarzlar','qarz daftar','qarzlarni ko‘rsat',"qarzlarni ko'rsat"].includes(key))return {action:'list',record_kind:'debt'};
 const current=['/pul_report','hisobot','bugungi hisobot','bugun hisobot','bugungi analitika','bugun analitika'];
 const yesterday=['kechagi hisobot','kecha hisobot','kechagilik hisobot','kechagi analitika','kecha analitika','kechagilik analitika'];
 if(!current.includes(key)&&!yesterday.includes(key))return null;
 const date=yesterday.includes(key)?new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10):today;
 return {action:'report',start_date:date,end_date:date};
}
