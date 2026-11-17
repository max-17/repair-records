export class PulError extends Error{}
export function minor(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12)throw new PulError('Summani to‘g‘ri kiriting.');
 if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw new PulError('Summa ikki kasr xonasidan oshmasin.');
 const parts=String(value).split('.');if((parts[1]||'').length>2)throw new PulError('Summa ikki kasr xonasidan oshmasin.');
 return Number(BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0')));
}
export function money(value,currency='UZS'){return `${new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(value/100)} ${currency}`;}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function checkDate(value){if(value!=null&&!validDate(value))throw new PulError('Sanani YYYY-MM-DD ko‘rinishida yozing.');return value||null;}
export const visibleTo=(row,ctx)=>row.shop_id===ctx.shopId&&(ctx.owner||row.worker_id===ctx.userId||row.kind==='vendor');
export function paidTo(records,id,source='customer',exceptId=null){return records.filter(r=>r.kind==='payment'&&!r.is_deleted&&r.reference_id===id&&r.id!==exceptId&&(r.data.source||'customer')===source).reduce((sum,r)=>sum+r.data.settledMinor,0);}
export function remaining(row,records){return Math.max(0,row.data.totalMinor-(row.kind==='sale'?(row.data.financedMinor||0):0)-paidTo(records,row.id));}
export function providerRemaining(row,records){return Math.max(0,(row.data.expectedVendorMinor||0)-paidTo(records,row.id,'vendor'));}
export function recordName(r){return `${r.kind==='sale'?'Sotuv/xizmat':r.kind==='debt'?'Qarz':r.kind==='payment'?'To‘lov':'Provayder'} · ${r.data.customer||r.data.vendor||r.data.description||r.data.items?.map(i=>i.name).join(', ')||''}`;}
export function recordSummary(r,records){const d=r.data;return `${recordName(r)}\nID: ${r.id}\n${r.kind==='payment'?money(d.amountMinor,d.currency)+' · '+d.method:r.kind==='vendor'?`${d.percentage}% · ${d.rateType}`:`${money(d.totalMinor,d.currency)}${d.items?'\n'+d.items.map(i=>`${i.name} × ${i.quantity}`).join('\n'):''}\nQarz qoldig‘i: ${money(remaining(r,records),d.currency)}${d.financedMinor?'\nProvayderdan kutilmoqda: '+money(providerRemaining(r,records),d.currency):''}${d.dueDate?'\nMuddat: '+d.dueDate:''}${d.photo?'\nRasm biriktirilgan.':''}`}${r.is_deleted?'\nO‘chirilgan':''}`;}
export function paymentData(input,currency,source='customer'){
 const amountMinor=minor(input.amount);if(amountMinor<=0)throw new PulError('To‘lov summasi noldan katta bo‘lsin.');
 if(!['cash','card','transfer'].includes(input.method))throw new PulError('To‘lov usulini ayting: naqd, karta yoki o‘tkazma.');
 const actual=input.currency||currency;if(!['UZS','USD'].includes(actual))throw new PulError('Valyuta UZS yoki USD bo‘lsin.');
 let settledMinor=amountMinor,rate=null;
 if(actual!==currency){
  if(!(input.exchange_rate>0&&input.exchange_rate<=1e9))throw new PulError(`1 ${actual} necha ${currency}? Kelishilgan kursni yozing.`);
  const scale=Math.round(input.exchange_rate*1e6);settledMinor=Number((BigInt(amountMinor)*BigInt(scale)+500000n)/1000000n);rate=input.exchange_rate;
 }
 if(!Number.isSafeInteger(settledMinor)||settledMinor>1e14)throw new PulError('To‘lov miqdori juda katta.');
 return {amountMinor,currency:actual,method:input.method,exchangeRate:rate,settledMinor,targetCurrency:currency,source};
}
export function saleData(plan,previous){
 const currency=plan.currency||previous?.currency||'UZS';
 const items=plan.items?plan.items.map(i=>({name:i.name,type:i.type,quantity:i.quantity,unitMinor:minor(i.unit_price)})):previous?.items?.map(i=>({...i}));
 if(!items?.length)throw new PulError('Nima sotildi yoki qanday xizmat bajarildi? Narxini ham ayting.');
 if(plan.amount!=null&&!plan.items&&items.length===1&&items[0].quantity===1)items[0]={...items[0],unitMinor:minor(plan.amount)};
 const subtotal=items.reduce((s,i)=>s+i.unitMinor*i.quantity,0);
 const totalMinor=plan.amount!=null?minor(plan.amount):plan.items?subtotal:previous.totalMinor;
 if(totalMinor<=0||!Number.isSafeInteger(totalMinor)||totalMinor>1e14||totalMinor>subtotal)throw new PulError('Umumiy narxni va mahsulot narxlarini tekshiring.');
 return {items,totalMinor,currency,customer:plan.customer??previous?.customer??null,phone:plan.phone??previous?.phone??null,description:plan.description??previous?.description??null,dueDate:checkDate(plan.due_date??previous?.dueDate),reminderDate:checkDate(plan.reminder_date??previous?.reminderDate),financedMinor:previous?.financedMinor||0,vendorId:previous?.vendorId||null,expectedVendorMinor:previous?.expectedVendorMinor||0,photo:previous?.photo||null};
}
export function debtData(plan,previous){
 const customer=plan.customer??previous?.customer;if(!customer)throw new PulError('Mijoz ismini ayting.');
 const totalMinor=plan.amount==null?previous?.totalMinor:minor(plan.amount);if(!(totalMinor>0))throw new PulError('Qarz summasini ayting.');
 return {customer,phone:plan.phone??previous?.phone??null,totalMinor,currency:plan.currency||previous?.currency||'UZS',description:plan.description??previous?.description??'Qarz',dueDate:checkDate(plan.due_date??previous?.dueDate),reminderDate:checkDate(plan.reminder_date??previous?.reminderDate)};
}
export function vendorData(plan){if(!plan.vendor||plan.percentage==null||!plan.rate_type)throw new PulError('Provayder nomi, foizi va turi kerak: komissiya yoki ustama.');return {vendor:plan.vendor,percentage:plan.percentage,rateType:plan.rate_type};}
export function reportText(records,{start,end,userNames={},workerId=null,title='Pul hisoboti'}){
 if(!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>366)throw new PulError('Hisobot davrini to‘g‘ri kiriting (ko‘pi bilan 366 kun).');
 const active=records.filter(r=>!r.is_deleted),period=active.filter(r=>(!workerId||r.worker_id===workerId)&&r.data.occurredOn>=start&&r.data.occurredOn<=end);
 const sales=new Map(),payments=new Map(),financing=new Map(),debts=new Map(),newDebts=new Map(),pendingVendors=new Map();
 const add=(map,key,value)=>map.set(key,(map.get(key)||0)+value);
 for(const r of period){const d=r.data;if(['sale','debt'].includes(r.kind)){const createdDebt=r.kind==='debt'?d.totalMinor:Math.max(0,d.totalMinor-(d.financedMinor||0)-active.filter(p=>p.kind==='payment'&&p.reference_id===r.id&&!p.data.isRepayment&&p.data.source!=='vendor').reduce((s,p)=>s+p.data.settledMinor,0));if(createdDebt)add(newDebts,d.currency,createdDebt);}if(r.kind==='sale'){add(sales,`${userNames[r.worker_id]||r.worker_id} · ${d.currency}`,d.totalMinor);if(d.financedMinor)add(financing,`${d.vendorName} · ${d.currency}`,d.financedMinor);}if(r.kind==='payment')add(payments,`${userNames[r.worker_id]||r.worker_id} · ${d.source==='vendor'?'provayder':d.isRepayment?'qarz to‘lovi':'to‘lov'} · ${d.method} · ${d.currency}`,d.amountMinor);}
 for(const r of active.filter(r=>['sale','debt'].includes(r.kind))){if(r.kind==='sale'&&providerRemaining(r,active)>0)add(pendingVendors,`${r.data.vendorName} · ${r.data.currency}`,providerRemaining(r,active));const left=remaining(r,active);if(left>0)add(debts,`${r.data.dueDate&&r.data.dueDate<end?'Muddati o‘tgan':'Ochiq'} · ${r.data.currency}`,left);}
 const lines=(map)=>map.size?[...map].map(([k,v])=>`${k}: ${new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(v/100)}`).join('\n'):'Yo‘q';
 return `${title}\n${start} — ${end} · Asia/Tashkent\n\nSotuv / xizmat (${period.filter(r=>r.kind==='sale').length} ta):\n${lines(sales)}\n\nHaqiqiy pul kirimi:\n${lines(payments)}\n\nProvayder orqali savdo:\n${lines(financing)}\n\nProvayderlardan kutilayotgan pul:\n${lines(pendingVendors)}\n\nDavrda yozilgan yangi qarz:\n${lines(newDebts)}\n\nJoriy qarz qoldig‘i:\n${lines(debts)}\n\nSotuv va pul kirimi alohida hisoblangan. Bu foyda hisoboti emas.`;
}
