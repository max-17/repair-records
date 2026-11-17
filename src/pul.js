import {randomUUID,createHash} from 'node:crypto';
import {writeTransaction} from './audit.js';
import {setupPul,pulRows,savePulRecord} from './pul-db.js';
import {PulError,minor,money,checkDate,visibleTo,remaining,providerRemaining,paidTo,recordName,recordSummary,paymentData,saleData,debtData,vendorData,reportText} from './pul-domain.js';
import {pulPlanSchema} from './pul-parser.js';
import {todayInTashkent} from './time.js';
export function pulOwnerIds(env){
 const explicit=env.PUL_OWNER_USER_IDS||env.PUL_OWNER_CHAT_ID||env.SHOP_ADMIN_CHAT_ID;
 if(explicit)return explicit.split(',').map(s=>s.trim()).filter(Boolean);
 try{const entries=Object.entries(JSON.parse(env.TELEGRAM_MASTERS||'{}'));const owner=entries.find(([,name])=>name==='owner');return owner?[owner[0]]:[];}catch{return [];}
}
const methods={cash:'Naqd',card:'Karta',transfer:'O‘tkazma'};
const actions={sale:'Sotuv / xizmat',debt:'Qarz yozish',pay:'Qarz to‘lovi',vendor_payment:'Provayder to‘lovi',vendor:'Provayder',edit:'Tahrirlash',delete:'O‘chirish',restore:'Tiklash',remind:'Eslatma'};
export function pulService({db,parse,transcribeVoice,env={},now=()=>Date.now()}){
 let ready;
 const init=async()=>{try{await (ready??=setupPul(db));}catch(error){ready=null;throw error;}};
 return async input=>{
  await init();
  const ctx={shopId:env.PUL_SHOP_ID||'main',userId:String(input.receivedBy),userName:input.receivedByName||String(input.receivedBy),conversationId:input.conversationId,requestId:input.requestId,now:now()};
  ctx.owner=pulOwnerIds(env).includes(ctx.userId);
  if(!ctx.userId||ctx.userId==='undefined')throw new Error('PUL_AUTH_REQUIRED');
  const hash=createHash('sha256').update(JSON.stringify({actor:ctx.userId,conversation:ctx.conversationId,text:input.text??null,voice:input.voice?.file_id??null,photo:input.photo??null})).digest('hex');
  const prior=(await db.execute({sql:'SELECT * FROM pul_requests WHERE shop_id=? AND request_id=?',args:[ctx.shopId,ctx.requestId]})).rows[0];
  if(prior){if(prior.input_hash!==hash)throw new Error('PUL_REQUEST_CONFLICT');return JSON.parse(prior.result_json);}
  await db.execute({sql:'INSERT INTO pul_workers(shop_id,user_id,name,chat_id) VALUES(?,?,?,?) ON CONFLICT(shop_id,user_id) DO UPDATE SET name=excluded.name,chat_id=excluded.chat_id',args:[ctx.shopId,ctx.userId,ctx.userName,String(input.chatId)]});
  const stored=(await db.execute({sql:'SELECT * FROM pul_drafts WHERE shop_id=? AND conversation_id=?',args:[ctx.shopId,ctx.conversationId]})).rows[0];
  const draft=stored?JSON.parse(stored.state_json):null;
  let text=input.text||'',records=accessibleRows(await pulRows(db,ctx.shopId),ctx);
  const command=/^\/pul_(confirm|edit|cancel|photo|showphoto) ([0-9a-f-]{36})$/.exec(text);
  const commandTime=input.voice&&Number.isFinite(input.receivedAt)&&input.receivedAt>0&&input.receivedAt<=ctx.now+300000?input.receivedAt:ctx.now;
  const ctxDate=todayInTashkent(new Date(commandTime));
  let next=draft,payload;
  try{
   if(command){
    if(command[1]==='showphoto'){
     const row=records.find(r=>r.id===command[2]&&!r.is_deleted);
     if(!row?.data.photo)throw new PulError('Rasm topilmadi.');
     payload={photo:row.data.photo,text:recordSummary(row,records)};
    }else{
     if(!draft||draft.token!==command[2]||!['pending','editing','photo'].includes(draft.phase))throw new PulError('Bu tugma eskirgan. Buyruqni qayta yuboring.');
     if(command[1]==='cancel'){next={...draft,phase:'cancelled'};payload={text:'Amal bekor qilindi.'};}
     else if(command[1]==='edit'){next={...draft,phase:'editing'};payload={text:'Qaysi ma’lumotni o‘zgartirish kerak? Matn yoki ovoz yuboring. /cancel — bekor qilish.'};}
     else if(command[1]==='photo'){
      if(draft.plan.action!=='sale'&&!(draft.plan.action==='edit'&&draft.prepared.kind==='sale'))throw new PulError('Rasm faqat sotuv yoki xizmatga qo‘shiladi.');
      next={...draft,phase:'photo'};payload={text:'Rasm yuboring. Tasdiqlashdan oldin yana ko‘rib chiqasiz.',reply_markup:{inline_keyboard:[[{text:'Bekor qilish',style:'danger',callback_data:`pul_cancel:${draft.token}`}]]}};
     }else{
      if(draft.phase!=='pending')throw new PulError('Avval ma’lumotlarni to‘ldiring.');
      return await writeTransaction(db,async tx=>{
       const cached=await cachedResult(tx,ctx,hash);if(cached)return cached;
       const current=(await tx.execute({sql:'SELECT token,state_json FROM pul_drafts WHERE shop_id=? AND conversation_id=?',args:[ctx.shopId,ctx.conversationId]})).rows[0];
       if(current?.token!==draft.token||JSON.parse(current.state_json).phase!=='pending')throw new PulError('Tasdiqlash eskirgan.');
       const fresh=accessibleRows(await pulRows(tx,ctx.shopId),ctx);
       if(draft.prepared.before){const live=fresh.find(r=>r.id===draft.prepared.before.id);if(!live||live.version!==draft.prepared.before.version)throw new PulError('Yozuv o‘zgargan. Uni qayta tekshiring.');}
       const prepared=prepare(draft.plan,fresh,ctx,draft.photo);
       if(JSON.stringify(prepared)!==JSON.stringify(draft.prepared))throw new PulError('Ma’lumotlar o‘zgargan. Buyruqni qayta yuboring.');
       const saved=await apply(tx,ctx,prepared,todayInTashkent(new Date(draft.at)));
       const response={text:`Saqlandi.\n${recordSummary(saved,await pulRows(tx,ctx.shopId))}`,...(saved.data.photo?{reply_markup:{inline_keyboard:[[{text:'Rasmni ko‘rish',callback_data:`pul_showphoto:${saved.id}`}]]}}:{})};
       await persist(tx,ctx,hash,{...draft,phase:'done'},response);return response;
      });
     }
    }
   }else if(text==='/cancel'){next={...draft,phase:'cancelled'};payload={text:'Amal bekor qilindi.'};}
   else if(input.photo){
    if(draft?.phase!=='photo')throw new PulError('Avval sotuvni kiriting va «Rasm qo‘shish»ni bosing.');
    next={...draft,token:randomUUID(),photo:input.photo,phase:'pending'};next.prepared=prepare(next.plan,records,ctx,input.photo);payload=review(next);
   }else{
    if(input.voice){
     const stage=`${ctx.requestId}:transcript`;
     const old=(await db.execute({sql:'SELECT input_hash,result_json FROM pul_requests WHERE shop_id=? AND request_id=?',args:[ctx.shopId,stage]})).rows[0];
     if(old){if(old.input_hash!==hash)throw new Error('PUL_REQUEST_CONFLICT');text=JSON.parse(old.result_json).text;}
     else{
      text=await transcribeVoice(input.voice,{requestId:input.requestId,masterId:input.masterId,conversationId:ctx.conversationId});
      if(typeof text!=='string'||text.trim().length<2||text.length>3000)throw new PulError('Ovozdan aniq ma’lumot olinmadi. Qayta yuboring.');
      await db.execute({sql:'INSERT INTO pul_requests(shop_id,request_id,input_hash,result_json) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',args:[ctx.shopId,stage,hash,JSON.stringify({text})]});
     }
    }
    if(!text.trim()||text.length>3000)throw new PulError('Qisqa matn yoki ovozli buyruq yuboring.');
    const previous=draft&&['editing','clarify'].includes(draft.phase)?draft.plan:null;
    const quick=text==='/pul_report'?{action:'report'}:text==='/pul_debts'?{action:'list',record_kind:'debt'}:null;
    const plan=pulPlanSchema.parse(quick?{...Object.fromEntries(Object.keys(pulPlanSchema.shape).map(k=>[k,k==='include_deleted'?false:null])),...quick}:await parse({text,previous,today:ctxDate,inactivitySeconds:draft?.at?Math.max(0,(ctx.now-draft.at)/1000):null,records:relevantRecords(records,text,previous).map(r=>({id:r.id,kind:r.kind,worker:r.worker_id,is_deleted:r.is_deleted,...r.data}))}));
    if(plan.action==='clarify'){
     next={token:randomUUID(),plan,phase:'clarify',at:commandTime};payload={text:plan.question||'Mijoz, summa va amalni aniqroq ayting.'};
    }else if(['list','report','history'].includes(plan.action)){
     payload=await readAction(db,plan,records,ctx,ctxDate);next={token:randomUUID(),phase:'done',at:ctx.now};
    }else{
     next={token:randomUUID(),plan,photo:previous?draft.photo:null,phase:'pending',at:previous?draft.at:commandTime};
     try{next.prepared=prepare(plan,records,ctx,next.photo);payload=review(next);}
     catch(error){if(!(error instanceof PulError))throw error;next.phase='clarify';payload={text:error.message};}
    }
   }
  }catch(error){if(!(error instanceof PulError))throw error;payload={text:error.message};}
  return writeTransaction(db,async tx=>{
   const cached=await cachedResult(tx,ctx,hash);if(cached)return cached;
   const live=(await tx.execute({sql:'SELECT token FROM pul_drafts WHERE shop_id=? AND conversation_id=?',args:[ctx.shopId,ctx.conversationId]})).rows[0];
   if((live?.token||null)!==(stored?.token||null))throw new Error('PUL_CONVERSATION_CHANGED');
   await persist(tx,ctx,hash,next,payload);return payload;
  });
 };
}
function relevantRecords(records,text,previous){
 const key=text.toLocaleLowerCase();const exact=records.filter(r=>key.includes(r.id)||(r.data.customer&&key.includes(r.data.customer.toLocaleLowerCase()))||(r.data.vendor&&key.includes(r.data.vendor.toLocaleLowerCase()))||r.id===previous?.record_id);
 return [...new Map([...exact,...records].map(r=>[r.id,r])).values()].slice(0,150);
}
function accessibleRows(rows,ctx){const owned=new Set(rows.filter(r=>visibleTo(r,ctx)).map(r=>r.id));return rows.filter(r=>visibleTo(r,ctx)||(r.kind==='payment'&&owned.has(r.reference_id)));}
async function cachedResult(tx,ctx,hash){const row=(await tx.execute({sql:'SELECT * FROM pul_requests WHERE shop_id=? AND request_id=?',args:[ctx.shopId,ctx.requestId]})).rows[0];if(!row)return null;if(row.input_hash!==hash)throw new Error('PUL_REQUEST_CONFLICT');return JSON.parse(row.result_json);}
async function persist(tx,ctx,hash,draft,payload){
 if(draft)await tx.execute({sql:'INSERT INTO pul_drafts(shop_id,conversation_id,token,state_json) VALUES(?,?,?,?) ON CONFLICT(shop_id,conversation_id) DO UPDATE SET token=excluded.token,state_json=excluded.state_json',args:[ctx.shopId,ctx.conversationId,draft.token||randomUUID(),JSON.stringify(draft)]});
 await tx.execute({sql:'INSERT INTO pul_requests(shop_id,request_id,input_hash,result_json) VALUES(?,?,?,?)',args:[ctx.shopId,ctx.requestId,hash,JSON.stringify(payload)]});
}
function findTarget(plan,records,{deleted=false}={}){
 let matches=records.filter(r=>r.is_deleted===deleted);
 if(plan.record_id)matches=matches.filter(r=>r.id===plan.record_id);
 else{
  if(plan.record_kind)matches=matches.filter(r=>r.kind===plan.record_kind);
  else if(['pay','remind'].includes(plan.action))matches=matches.filter(r=>['sale','debt'].includes(r.kind));
  else if(plan.action==='vendor_payment')matches=matches.filter(r=>r.kind==='sale'&&r.data.financedMinor>0);
  else throw new PulError('Yozuv ID sini kiriting. Avval «yozuvlarni ko‘rsat» deb qidiring.');
  if(plan.customer)matches=matches.filter(r=>(r.data.customer||'').toLocaleLowerCase()===plan.customer.toLocaleLowerCase());
  else throw new PulError('Mijoz yoki yozuv ID sini ayting.');
 }
 if(matches.length!==1)throw new PulError(matches.length?'Bir nechta yozuv topildi. Yozuv ID sini tanlang.':'Yozuv topilmadi yoki sizga tegishli emas.');
 return matches[0];
}
function prepare(plan,records,ctx,photo){
 if(['delete','restore'].includes(plan.action)&&!plan.reason)throw new PulError('Sababini ayting.');
 if(plan.action==='vendor'){
  if(!ctx.owner)throw new PulError('Provayderlarni faqat egasi boshqaradi.');
  const data=vendorData(plan),before=records.find(r=>r.kind==='vendor'&&!r.is_deleted&&r.data.vendor.toLocaleLowerCase()===data.vendor.toLocaleLowerCase())||null;
  return {kind:'vendor',data,before,payments:[]};
 }
 if(plan.action==='sale'){
  const data=saleData(plan),payments=(plan.payments||[]).map(p=>paymentData(p,data.currency));
  if(plan.vendor){
   if(!data.customer)throw new PulError('Provayder orqali savdo uchun mijoz ismi kerak.');
   const vendor=records.find(r=>r.kind==='vendor'&&!r.is_deleted&&r.data.vendor.toLocaleLowerCase()===plan.vendor.toLocaleLowerCase());
   if(!vendor)throw new PulError('Provayder topilmadi. Egasi avval nomi, foizi va turini qo‘shsin.');
   if(!(plan.financed_amount>0))throw new PulError('Provayder qoplaydigan summani ayting.');
   data.financedMinor=minor(plan.financed_amount);data.vendorId=vendor.id;data.vendorName=vendor.data.vendor;data.rateSnapshot={...vendor.data,version:vendor.version};
   data.expectedVendorMinor=data.financedMinor-(vendor.data.rateType==='commission'?Math.round(data.financedMinor*vendor.data.percentage/100):0);
  }else if(plan.financed_amount)throw new PulError('Muddatli to‘lov provayderini ayting.');
  const covered=payments.reduce((sum,p)=>sum+p.settledMinor,0)+data.financedMinor;
  if(covered>data.totalMinor)throw new PulError('To‘lov va provayder summasi sotuv narxidan oshib ketdi.');
  if(covered<data.totalMinor&&!data.customer)throw new PulError('Qoldiq qarz uchun mijoz ismi kerak.');
  if(plan.payments===null&&!data.financedMinor)throw new PulError('Qancha to‘landi va qanday usulda? To‘liq qarz bo‘lsa, «hali to‘lamadi» deb ayting.');
  data.photo=photo||null;return {kind:'sale',data,before:null,payments};
 }
 if(plan.action==='debt')return {kind:'debt',data:debtData(plan),before:null,payments:[]};
 const before=findTarget(plan,records,{deleted:plan.action==='restore'});
 if(!ctx.owner&&before.kind==='payment'&&before.worker_id!==ctx.userId)throw new PulError('Boshqa xodimning to‘lovini faqat egasi o‘zgartira oladi.');
 if(before.kind==='vendor'&&!ctx.owner)throw new PulError('Provayderlarni faqat egasi boshqaradi.');
 if(['pay','vendor_payment'].includes(plan.action)){
  if(!['sale','debt'].includes(before.kind))throw new PulError('To‘lov sotuv yoki qarzga tegishli bo‘lishi kerak.');
  const source=plan.action==='vendor_payment'?'vendor':'customer';
  const data=paymentData({amount:plan.amount,currency:plan.currency||before.data.currency,method:plan.method,exchange_rate:plan.payments?.[0]?.exchange_rate},before.data.currency,source);
  const available=source==='vendor'?providerRemaining(before,records):remaining(before,records);
  if(data.settledMinor>available)throw new PulError('To‘lov qolgan summadan oshib ketdi.');
  return {kind:'payment',data:{...data,customer:before.data.customer,isRepayment:true},before:null,target:{id:before.id,version:before.version},payments:[]};
 }
 let data={...before.data};
 if(plan.action==='edit'||plan.action==='remind'){
  if(before.kind==='sale'){
   data=saleData(plan,before.data);Object.assign(data,{vendorName:before.data.vendorName,rateSnapshot:before.data.rateSnapshot,occurredOn:before.data.occurredOn,photo:photo||before.data.photo});
   if(plan.vendor||plan.financed_amount!=null)throw new PulError('Provayder shartlarini o‘zgartirish uchun sotuvni bekor qilib, qayta kiriting.');
   if(data.totalMinor<(data.financedMinor||0)+paidTo(records,before.id))throw new PulError('Narx to‘langan va moliyalashtirilgan summadan kam bo‘lolmaydi.');
  }else if(before.kind==='debt'){
   data={...before.data,...debtData(plan,before.data)};if(data.totalMinor<paidTo(records,before.id))throw new PulError('Qarz to‘langan summadan kam bo‘lolmaydi.');
  }else if(before.kind==='payment'){
   const parent=records.find(r=>r.id===before.reference_id&&!r.is_deleted);if(!parent)throw new PulError('Asosiy yozuv topilmadi.');
   data={...before.data,...paymentData({amount:plan.amount??before.data.amountMinor/100,currency:plan.currency||before.data.currency,method:plan.method||before.data.method,exchange_rate:plan.payments?.[0]?.exchange_rate??before.data.exchangeRate},parent.data.currency,before.data.source)};
   const available=(data.source==='vendor'?parent.data.expectedVendorMinor:parent.data.totalMinor-(parent.data.financedMinor||0))-paidTo(records,parent.id,data.source,before.id);
   if(data.settledMinor>available)throw new PulError('To‘lov qolgan summadan oshib ketdi.');
  }else{data={...before.data,...vendorData({...plan,vendor:plan.vendor||before.data.vendor,percentage:plan.percentage??before.data.percentage,rate_type:plan.rate_type||before.data.rateType})};if(records.some(r=>r.kind==='vendor'&&!r.is_deleted&&r.id!==before.id&&r.data.vendor.toLocaleLowerCase()===data.vendor.toLocaleLowerCase()))throw new PulError('Bu nomli provayder mavjud.');}
  if(data.currency!==before.data.currency&&(before.data.financedMinor||records.some(r=>r.reference_id===before.id)))throw new PulError('To‘lovlari bor yozuvning valyutasini o‘zgartirib bo‘lmaydi.');
  if(plan.action==='remind'){
   if(!['sale','debt'].includes(before.kind))throw new PulError('Eslatma faqat qarz yoki sotuvga qo‘yiladi.');
   if(!plan.reminder_date&&!plan.due_date)throw new PulError('Eslatma sanasini ayting.');
  }
 }else if(plan.action==='delete'){
  if(records.some(r=>r.reference_id===before.id&&!r.is_deleted))throw new PulError('Avval ushbu yozuvga tegishli to‘lovlarni sabab bilan bekor qiling.');
 }else if(plan.action==='restore'){
  if(before.kind==='vendor'&&records.some(r=>r.kind==='vendor'&&!r.is_deleted&&r.data.vendor.toLocaleLowerCase()===before.data.vendor.toLocaleLowerCase()))throw new PulError('Bu nomli faol provayder mavjud.');
  if(before.kind==='payment'){
   const parent=records.find(r=>r.id===before.reference_id&&!r.is_deleted);if(!parent)throw new PulError('Avval asosiy yozuvni tiklang.');
   const available=data.source==='vendor'?providerRemaining(parent,records):remaining(parent,records);if(data.settledMinor>available)throw new PulError('Tiklash qoldiqdan oshib ketadi.');
  }
 }else throw new PulError('Bu amal qo‘llanmaydi.');
 return {kind:before.kind,data,before,payments:[],action:plan.action,reason:plan.reason};
}
async function apply(tx,ctx,p,today){
 const row=await savePulRecord(tx,ctx,{before:p.before,kind:p.kind,data:{...p.data,occurredOn:p.data.occurredOn||today},referenceId:p.target?.id,deleted:p.action==='delete',reason:p.reason,action:p.action==='delete'?'delete':p.action==='restore'?'restore':p.before?'edit':'create'});
 for(const payment of p.payments)await savePulRecord(tx,ctx,{kind:'payment',referenceId:row.id,data:{...payment,customer:p.data.customer,isRepayment:false,occurredOn:today}});
 return row;
}
function review(draft){
 const p=draft.prepared,d=p.data,lines=[`${actions[draft.plan.action]||'Amal'} — tekshiring:`,...(p.before?[`ID: ${p.before.id}`]:[])];
 if(d.customer)lines.push(`Mijoz: ${d.customer}`);if(d.phone)lines.push(`Telefon: ${d.phone}`);
 if(d.items)lines.push(...d.items.map(i=>`${i.type==='service'?'Xizmat':'Mahsulot'}: ${i.name} × ${i.quantity} · ${money(i.unitMinor,d.currency)}`));
 if(d.description)lines.push(`Izoh: ${d.description}`);
 if(d.totalMinor!=null)lines.push(`Summa: ${money(d.totalMinor,d.currency)}`);
 if(p.kind==='payment')lines.push(`To‘lov: ${money(d.amountMinor,d.currency)}`,`Usul: ${methods[d.method]}`,`Hisobdan yopiladi: ${money(d.settledMinor,d.targetCurrency)}`,`Manba: ${d.source==='vendor'?'Provayder':'Mijoz'}`);
 for(const payment of p.payments)lines.push(`To‘lov: ${money(payment.amountMinor,payment.currency)} · ${methods[payment.method]}`);
 if(d.financedMinor)lines.push(`Provayder: ${d.vendorName}`,`Moliyalashtirilgan: ${money(d.financedMinor,d.currency)}`,`Provayderdan kutiladi: ${money(d.expectedVendorMinor,d.currency)}`);
 if(p.kind==='sale'&&!p.before)lines.push(`Qarz: ${money(d.totalMinor-(d.financedMinor||0)-p.payments.reduce((s,x)=>s+x.settledMinor,0),d.currency)}`);
 if(d.dueDate)lines.push(`To‘lov muddati: ${d.dueDate}`);if(d.reminderDate)lines.push(`Eslatma: ${d.reminderDate}`);
 if(p.kind==='vendor')lines.push(`Provayder: ${d.vendor}`,`Foiz: ${d.percentage}% · ${d.rateType}`);
 if(p.reason)lines.push(`Sabab: ${p.reason}`);if(d.photo)lines.push('Rasm: biriktirilgan');
 lines.push('\nHali saqlanmadi. Tasdiqlaysizmi?');
 const rows=[[{text:'Tasdiqlash',style:'success',callback_data:`pul_confirm:${draft.token}`},{text:'Tahrirlash',callback_data:`pul_edit:${draft.token}`}]];
 if(p.kind==='sale'&&['sale','edit'].includes(draft.plan.action))rows.push([{text:d.photo?'Rasmni almashtirish':'Rasm qo‘shish',style:'primary',callback_data:`pul_photo:${draft.token}`}]);
 rows.push([{text:'Bekor qilish',style:'danger',callback_data:`pul_cancel:${draft.token}`}]);
 if(lines.join('\n').length>3800)throw new PulError('Buyruq juda uzun. Mahsulotlarni kichikroq guruhlarga bo‘lib kiriting.');
 return {text:lines.join('\n'),reply_markup:{inline_keyboard:rows}};
}
async function readAction(db,plan,records,ctx,today){
 if(plan.action==='report'){
  const workers=(await db.execute({sql:'SELECT user_id,name FROM pul_workers WHERE shop_id=?',args:[ctx.shopId]})).rows;
  return {text:reportText(records,{start:plan.start_date||today,end:plan.end_date||plan.start_date||today,userNames:Object.fromEntries(workers.map(r=>[r.user_id,r.name])),workerId:ctx.owner?null:ctx.userId}).slice(0,3900)};
 }
 if(plan.action==='history'){
  const row=findTarget(plan,records,{deleted:Boolean(plan.include_deleted)});
  const events=(await db.execute({sql:'SELECT action,user_name,occurred_at,before_json,after_json,reason FROM pul_history WHERE shop_id=? AND record_id=? ORDER BY occurred_at DESC LIMIT 10',args:[ctx.shopId,row.id]})).rows;
  return {text:`Tarix · ${row.id}\n`+events.map(e=>{const before=e.before_json?JSON.parse(e.before_json):null,after=JSON.parse(e.after_json);return `${new Intl.DateTimeFormat('uz-UZ',{timeZone:'Asia/Tashkent',dateStyle:'short',timeStyle:'short'}).format(new Date(e.occurred_at))} · ${e.user_name} · ${e.action}\n${before?JSON.stringify(before.data)+' → ':''}${JSON.stringify(after.data)}${e.reason?'\nSabab: '+e.reason:''}`;}).join('\n\n').slice(0,3500)};
 }
 let matches=records.filter(r=>plan.include_deleted||!r.is_deleted);
 if(plan.record_kind)matches=matches.filter(r=>r.kind===plan.record_kind);
 if(plan.record_id)matches=matches.filter(r=>r.id===plan.record_id);
 if(plan.customer)matches=matches.filter(r=>(r.data.customer||'').toLocaleLowerCase().includes(plan.customer.toLocaleLowerCase()));
 if(plan.description)matches=matches.filter(r=>JSON.stringify(r.data).toLocaleLowerCase().includes(plan.description.toLocaleLowerCase()));
 if(plan.record_kind==='debt')matches=records.filter(r=>['sale','debt'].includes(r.kind)&&(plan.include_deleted||!r.is_deleted)&&(!plan.customer||(r.data.customer||'').toLocaleLowerCase().includes(plan.customer.toLocaleLowerCase()))&&(!plan.record_id||r.id===plan.record_id)&&(plan.record_id||remaining(r,records)>0));
 const selected=matches.slice(0,8);return {text:(selected.length?selected.map(r=>recordSummary(r,records)).join('\n\n'):'Yozuv topilmadi.')+`\n\n${matches.length} ta yozuv.${matches.length>8?' Faqat dastlabki 8 tasi ko‘rsatildi. Mijoz yoki ID bilan aniqlashtiring.':''}`,reply_markup:{inline_keyboard:selected.filter(r=>r.data.photo).map(r=>[{text:`Rasm: ${r.data.customer||r.data.items?.[0]?.name||r.id}`.slice(0,60),callback_data:`pul_showphoto:${r.id}`}])}};
}
