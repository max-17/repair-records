import {sourceFor} from './pul-sources.js';
import {transcribe} from 'ai';
import {createGroq} from '@ai-sdk/groq';
import {createHash,randomUUID} from 'node:crypto';
import {writeTransaction} from './audit.js';
import {aishaRecognizer,AishaInputError} from './aisha.js';
const MAX_BYTES=10*1024*1024;
export class SpeechInputError extends Error{}
export function groqTranscriber(env,{fetcher=fetch,recognize=transcribe}={}){
 return telegramTranscriber(env,{fetcher,check:()=>{if(!env.GROQ_API_KEY)throw new SpeechInputError('Ovoz uchun GROQ_API_KEY hali sozlanmagan. Hozircha matn yuboring.');},recognize:audio=>recognizeAudio(env,audio,recognize)});
}
export function aishaTranscriber(env,{db,fetcher=fetch,...options}={}){
 return telegramTranscriber(env,{fetcher,check:()=>{if(!(env.AISHA_API||env.AISHA_API_KEY||env.VOICELAB_API_KEY))throw new SpeechInputError('Ovoz uchun AISHA_API hali sozlanmagan. Hozircha matn yuboring.');},recognize:aishaRecognizer(env,{db,fetcher,...options})});
}
function telegramTranscriber(env,{fetcher,check,recognize}){
 return async(voice,context)=>{
  check();
  if(!voice||typeof voice.file_id!=='string'||!Number.isFinite(voice.duration)||voice.duration<1||voice.duration>120||voice.file_size>MAX_BYTES)throw new SpeechInputError('120 soniyagacha va 10 MB gacha ovozli xabar yuboring.');
  const metadata=await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:voice.file_id}),signal:AbortSignal.timeout(10000)});
  const file=await metadata.json();const path=file.result?.file_path;
  if(!metadata.ok||!file.ok||!path||!/^[a-zA-Z0-9_./-]+$/.test(path)||path.split('/').includes('..')||path.startsWith('/')||file.result.file_size>MAX_BYTES)throw new SpeechInputError('Ovozli faylni olib bo‘lmadi. Qayta yuboring.');
  // Download bytes locally: never give a speech provider a Telegram URL containing the bot token.
  const response=await fetcher(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length'))>MAX_BYTES)throw new SpeechInputError('Ovozli fayl juda katta yoki uni yuklab bo‘lmadi.');
  const reader=response.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES)throw new SpeechInputError('Ovozli fayl 10 MB dan katta.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(!length)throw new SpeechInputError('Ovozli fayl bo‘sh. Qayta yozib yuboring.');
  const audio=Buffer.concat(chunks);
  if(context?.archiveAudio){try{await context.archiveAudio(audio);}catch(error){const messages={archive_not_configured:'Ovoz arxivi hali sozlanmagan. Administratorga murojaat qiling.',archive_private_access_denied:'Ovoz arxiviga maxfiy fayl saqlash ruxsati yo‘q. Administrator arxiv ruxsatlarini tekshirsin.',archive_auth_failed:'Ovoz arxivi kaliti yoki ruxsatlari noto‘g‘ri. Administratorga murojaat qiling.',archive_quota_exceeded:'Ovoz arxivi uchun saqlash limiti tugagan. Administratorga murojaat qiling.'};const code=Object.hasOwn(messages,error?.code)?error.code:'archive_upload_failed';throw Object.assign(new SpeechInputError((messages[code]||'Ovozli xabarni arxivga saqlab bo‘lmadi. Keyinroq qayta yuboring.')+' Hali amal bajarilmadi.'),{code});}}
  return recognize(audio,context,voice);
 }; 
}
export async function recognizeAudio(env,audio,recognize=transcribe){
 if(!env.GROQ_API_KEY)throw new SpeechInputError('GROQ_API_KEY sozlanmagan.');
 if(!audio.byteLength||audio.byteLength>MAX_BYTES)throw new SpeechInputError('Audio bo‘sh yoki 10 MB dan katta.');
  const model=env.GROQ_WHISPER_MODEL||'whisper-large-v3';
  if(!['whisper-large-v3','whisper-large-v3-turbo'].includes(model))throw new SpeechInputError('Whisper modeli noto‘g‘ri sozlangan.');
  const language=env.GROQ_SPEECH_LANGUAGE||'uz';
  const groq=createGroq({apiKey:env.GROQ_API_KEY});
  const result=await recognize({model:groq.transcription(model),audio,maxRetries:0,abortSignal:AbortSignal.timeout(25000),providerOptions:{groq:{...(language==='auto'?{}:{language}),temperature:0,prompt:env.GROQ_SPEECH_PROMPT||'Telefon ta’mirlash ustaxonasi. Bugungi analitika. Kechagi analitika. Hisobot. Buyurtmalar. iPhone, Samsung, Redmi, ekran, batareya, tayyor, topshirildi, so‘m, ming, million.'}}});
  const text=result.text.trim();
  if(text.length<2||text.length>3000)throw new SpeechInputError('Ovozdan aniq matn olinmadi yoki matn juda uzun. Qisqaroq qayta yozing.');
  return text;
}
function reviewTranscript(draft){const review=draft.review_json?JSON.parse(draft.review_json):null;return {kind:'transcript',draft:{token:draft.token},reply:review?.reply||'Buyruq tayyor. Hali amal bajarilmadi. Tasdiqlaysizmi?'};}
export function voiceService({db,transcribeVoice,runCommand,previewCommand,archiveAudio=null,now=()=>Date.now()}){
 return async({masterId,conversationId,requestId,voice,text,receivedAt=null,receivedBy=null,receivedByName=null,messageId=null,chatId=null})=>{
  const hash=createHash('sha256').update(JSON.stringify({conversationId,voice:voice?.file_id||null,text:text??null})).digest('hex');
  const cached=(await db.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech:${requestId}`]})).rows[0];
  if(cached){if(cached.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(cached.result_json);}
  const draft=(await db.execute({sql:'SELECT * FROM voice_drafts WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]})).rows[0];
  const button=/^\/(voiceuse|voiceedit|voicedeny) ([0-9a-f-]{36})$/.exec(text||'');
  let result,newDraft;
  if(voice){
   // Persist the original message time and transcript before review. A failed
   // command/delivery retry must neither shift relative dates nor re-upload audio.
   const cacheStage=(id,value)=>writeTransaction(db,async tx=>{
    const previous=(await tx.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,id]})).rows[0];
    if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(previous.result_json);}
    await tx.execute({sql:'INSERT INTO command_requests(master_id,request_id,input_hash,result_json) VALUES(?,?,?,?)',args:[masterId,id,hash,JSON.stringify(value)]});return value;
   });
   const received=await cacheStage(`speech-input:${requestId}`,{token:randomUUID(),created_at:Number.isFinite(receivedAt)&&receivedAt>0&&receivedAt<=now()+300000?receivedAt:now()});
   let transcript,audio;
   const previous=(await db.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech-transcript:${requestId}`]})).rows[0];
   if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');({transcript,audio}=JSON.parse(previous.result_json));if(audio?.bytes)audio.bytes=Buffer.from(audio.bytes.data||audio.bytes);}
   else {
    try{
     transcript=await transcribeVoice(voice,{requestId,masterId,conversationId,...(archiveAudio?{archiveAudio:async bytes=>{audio=await archiveAudio(bytes,requestId);}}:{})});
     if(typeof transcript!=='string'||transcript.trim().length<2||transcript.length>3000)throw new SpeechInputError('Ovozdan aniq matn olinmadi. Qisqaroq qayta yozing.');
    }
    catch(error){if(error.retryable)throw error;if(draft)newDraft={...draft,status:'cancelled'};result={kind:'speech_error',reply:(error instanceof SpeechInputError||error instanceof AishaInputError)?error.message:'Ovozni tanib bo‘lmadi. Keyinroq qayta yuboring yoki matn yozing.'};}
   }
   if(!previous&&!result)transcript=(await cacheStage(`speech-transcript:${requestId}`,{transcript:transcript.trim(),audio})).transcript;
   if(!result){
    const sourceIds=archiveAudio?[...(draft?.status==='editing'&&draft.review_json?JSON.parse(draft.review_json).sourceIds||[]:[]),await sourceFor(db,{shopId:`repair:${masterId}`,requestId,userId:String(receivedBy||masterId),now:now()},{voice,receivedAt:received.created_at,messageId,chatId},transcript,audio)]:[];
    const review=previewCommand?await cacheStage(`speech-review:${requestId}`,await previewCommand({text:transcript,requestId:`voice-preview:${requestId}`,masterId,conversationId,commandTime:received.created_at,receivedBy,receivedByName})):null;
    newDraft={token:received.token||randomUUID(),transcript,status:'pending',created_at:received.created_at,review_json:JSON.stringify({...review,sourceIds})};
    result=reviewTranscript(newDraft);
   }
  }else if(text==='/cancel' && draft && ['pending','editing'].includes(draft.status)){
   newDraft={...draft,status:'cancelled'};result={kind:'cancelled_transcript',reply:'Amal bekor qilindi.'};
  }else if(button){
   if(!draft||draft.token!==button[2]||!['pending','editing'].includes(draft.status)||now()-Number(draft.created_at)>15*60*1000)result={kind:'expired_button',reply:'Bu ovozli xabarning tugmasi eskirgan. Ovoz yoki matnni qayta yuboring.'};
   else if(button[1]==='voiceuse' && draft.status==='pending'){
    result=await runCommand({text:draft.transcript,requestId:`voice-apply:${draft.token}`,masterId,conversationId,commandTime:Number(draft.created_at),receivedBy,receivedByName,...(draft.review_json?{preparedPlan:JSON.parse(draft.review_json).plan,sourceIds:JSON.parse(draft.review_json).sourceIds||[],expectedRevision:JSON.parse(draft.review_json).revision}:{})});newDraft={...draft,status:'applied'};
   }else if(button[1]==='voiceedit'){
    newDraft={...draft,status:'editing'};result={kind:'transcript_edit',reply:'✏️ To‘g‘rilangan matnni to‘liq yozing. Yuborgan matningiz tasdiqlash uchun qayta ko‘rsatiladi. /cancel — bekor qilish.'};
   }else if(button[1]==='voicedeny'){
    newDraft={...draft,status:'cancelled'};result={kind:'cancelled_transcript',reply:'Amal bekor qilindi.'};
   }else result={kind:'expired_button',reply:'Avval matnni to‘g‘rilab yuboring.'};
  }else if(draft?.status==='editing'&&text && !text.startsWith('/')){
   if(text.length>3000)result={kind:'speech_error',reply:'Matnni 3000 belgigacha yozing.'};
   else if(text.trim().length<2){result={kind:'speech_error',reply:'To‘g‘rilangan matnni to‘liq yozing.'};}
   else{const oldReview=draft.review_json?JSON.parse(draft.review_json):{};const sourceIds=archiveAudio?[...(oldReview.sourceIds||[]),await sourceFor(db,{shopId:`repair:${masterId}`,requestId,userId:String(receivedBy||masterId),now:now()},{text,messageId,chatId,receivedAt},null,null)]:oldReview.sourceIds||[];const review=previewCommand?await previewCommand({text:text.trim(),requestId:`voice-edit-preview:${requestId}`,masterId,conversationId,commandTime:Number(draft.created_at),receivedBy,receivedByName}):null;newDraft={...draft,token:randomUUID(),transcript:text.trim(),status:'pending',review_json:JSON.stringify({...review,sourceIds})};result=reviewTranscript(newDraft);}
  }else return null;
  return writeTransaction(db,async tx=>{
   if(newDraft)await tx.execute({sql:'INSERT INTO voice_drafts(master_id,conversation_id,token,transcript,status,created_at,review_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(master_id,conversation_id) DO UPDATE SET token=excluded.token,transcript=excluded.transcript,status=excluded.status,created_at=excluded.created_at,review_json=excluded.review_json',args:[masterId,conversationId,newDraft.token,newDraft.transcript,newDraft.status,newDraft.created_at,newDraft.review_json||null]});
   const previous=(await tx.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech:${requestId}`]})).rows[0];
   if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(previous.result_json);}
   await tx.execute({sql:'INSERT INTO command_requests(master_id,request_id,input_hash,result_json) VALUES(?,?,?,?)',args:[masterId,`speech:${requestId}`,hash,JSON.stringify(result)]});
   return result;
  });
 };
}
