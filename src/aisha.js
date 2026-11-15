import {createHash} from 'node:crypto';
export class AishaInputError extends Error{}
export class AishaPendingError extends Error{retryable=true;}
export function speechRequestKey(value){
 const bytes=createHash('sha256').update(value).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function aishaRecognizer(env,{db,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}={}){
 return async(audio,context={},voice={})=>{
  const key=env.AISHA_API||env.AISHA_API_KEY||env.VOICELAB_API_KEY;
  if(!key)throw new AishaInputError('Ovoz uchun AISHA_API hali sozlanmagan. Hozircha matn yuboring.');
  const started=now();const deadline=started+20000;
  const requestKey=speechRequestKey(JSON.stringify({masterId:context.masterId||'local',requestId:context.requestId||createHash('sha256').update(audio).digest('hex'),fileId:voice.file_id||null}));
  const headers={Authorization:`Bearer ${key}`};
  let job=db?(await db.execute({sql:'SELECT job_id FROM speech_jobs WHERE request_key=?',args:[requestKey]})).rows[0]?.job_id:null;
  let uploadMs=0,polls=0;
  const check=async response=>{
   if(response.ok)return;
   if([401,403].includes(response.status))throw new AishaInputError('Aisha kaliti yoki STT ruxsatlarini tekshiring.');
   if(response.status===402)throw new AishaInputError('Aisha transkripsiya krediti yetarli emas. Hozircha matn yuboring.');
   if([400,413,415,422].includes(response.status))throw new AishaInputError('Aisha ovozli faylni qabul qilmadi. Qisqa ovozli xabarni qayta yozing.');
   throw new AishaPendingError('Aisha temporarily unavailable');
  };
  if(!job){
   const form=new FormData();form.append('audio',new Blob([audio],{type:'audio/ogg'}),'voice-note.ogg');form.append('language',env.AISHA_SPEECH_LANGUAGE||'uz');form.append('include_speakers','false');
   let response;
   try{response=await fetcher('https://api.voicelab.uz/v1/stt',{method:'POST',headers:{...headers,'Idempotency-Key':requestKey,...(voice.duration?{'X-Audio-Duration-Ms':String(Math.round(voice.duration*1000))}:{})},body:form,signal:AbortSignal.timeout(15000)});}catch{throw new AishaPendingError('Aisha upload result uncertain; retry original request');}
   await check(response);const result=await response.json();
   job=result.id;
   if(typeof job!=='string'||!job)throw new AishaPendingError('Aisha did not return a job ID');
   if(db)await db.execute({sql:'INSERT INTO speech_jobs(request_key,provider,job_id) VALUES(?,?,?) ON CONFLICT(request_key) DO UPDATE SET job_id=excluded.job_id',args:[requestKey,'aisha',job]});
   uploadMs=now()-started;
  }
  while(now()<deadline){
   let response;
   try{response=await fetcher('https://api.voicelab.uz/v1/stt/transcriptions/'+encodeURIComponent(job),{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-now())))});}catch{throw new AishaPendingError('Aisha polling interrupted');}
   await check(response);const result=await response.json();polls++;
   if(result.status==='completed'){
    const text=typeof result.transcript==='string'?result.transcript.trim():'';
    if(text.length<2||text.length>3000)throw new AishaInputError('Ovozdan aniq matn olinmadi yoki matn juda uzun. Qisqaroq qayta yozing.');
    console.info('Speech timing',{provider:'aisha',upload_ms:uploadMs,polling_ms:now()-started-uploadMs,total_ms:now()-started,polls});
    return text;
   }
   if(result.status==='failed')throw new AishaInputError('Aisha ovozni taniy olmadi. Qayta yozing yoki matn yuboring.');
   const requested=Number(response.headers.get('Retry-After')||1);const delay=Math.max(1000,Number.isFinite(requested)?requested*1000:1000);
   if(now()+delay>=deadline)break;
   await sleep(delay);
  }
  throw new AishaPendingError('Aisha job still pending; retry existing job');
 };
}
