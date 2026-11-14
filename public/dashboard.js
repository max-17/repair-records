const $=id=>document.getElementById(id);
const labels={received:'Qabul qilindi',in_progress:'Jarayonda',ready:'Tayyor',delivered:'Topshirildi',cancelled:'Bekor qilindi'};
let key='',page=1,generation=0,busy=false;
const money=new Intl.NumberFormat('uz-UZ');
function message(value){$('message').textContent=value;}
function logout(){generation++;key='';page=1;busy=false;$('rows').replaceChildren();$('dashboard').hidden=true;$('login').hidden=false;$('key').value='';$('login-form').querySelector('button').disabled=false;message('');}
function cell(value){const td=document.createElement('td');td.textContent=value;return td;}
async function load(){
 const current=++generation;busy=true;
 $('refresh').disabled=true;$('previous').disabled=true;$('next').disabled=true;
 message('Yuklanmoqda…');
 try{
  const query=new URLSearchParams({q:$('search').value,status:$('status').value,page:String(page)});
  if(!$('status').value)query.delete('status');
  const response=await fetch(`/api/repairs?${query}`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store'});
  if(current!==generation)return;
  if(response.status===401){logout();throw new Error('Kirish kaliti noto‘g‘ri.');}
  if(!response.ok)throw new Error('Ma’lumotlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.');
  const data=await response.json();if(current!==generation)return;
  $('login').hidden=true;$('dashboard').hidden=false;$('key').value='';
  $('master').textContent=data.master_id;$('rows').replaceChildren();
  for(const job of data.repairs){
   const tr=document.createElement('tr');const customer=cell(job.customer);
   const id=document.createElement('small');id.textContent=job.id;customer.append(id);
   const status=cell('');const badge=document.createElement('span');
   badge.className='badge '+(Object.hasOwn(labels,job.status)?job.status:'');badge.textContent=labels[job.status]||job.status;status.append(badge);
   tr.append(customer,cell(job.device),cell(job.work),cell(job.price_uzs==null?'—':money.format(job.price_uzs)+' so‘m'),cell(job.due_date||'Belgilanmagan'),status);$('rows').append(tr);
  }
  $('empty').hidden=data.repairs.length!==0;$('count').textContent=`${data.repairs.length} ta buyurtma · ${page}-sahifa`;$('page').textContent=`${page}-sahifa`;
  $('previous').disabled=page===1;$('next').disabled=data.repairs.length<100;message('');
 }catch(error){if(current===generation||!key)message(error.message||'Ulanishda xatolik.');}
 finally{if(current===generation){busy=false;$('refresh').disabled=false;$('login-form').querySelector('button').disabled=false;$('previous').disabled=page===1;}}
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();key=$('key').value.trim();page=1;$('login-form').querySelector('button').disabled=true;load();});
$('filters').addEventListener('submit',e=>{e.preventDefault();page=1;load();});
$('refresh').addEventListener('click',()=>load());
$('logout').addEventListener('click',logout);
$('previous').addEventListener('click',()=>{if(page>1&&!busy){page--;load();}});
$('next').addEventListener('click',()=>{if(!busy){page++;load();}});
