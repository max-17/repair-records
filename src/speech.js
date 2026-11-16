import {transcribe} from 'ai';
import {createGroq} from '@ai-sdk/groq';
import {createHash} from 'node:crypto';
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
  return recognize(Buffer.concat(chunks),context,voice);
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
export function voiceService({db,transcribeVoice,runCommand,now=()=>Date.now()}){
 return async({masterId,conversationId,requestId,voice,text,receivedAt=null,receivedBy=null,receivedByName=null})=>{
  const hash=createHash('sha256').update(JSON.stringify({conversationId,voice:voice?.file_id||null,text:text??null})).digest('hex');
  const cached=(await db.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech:${requestId}`]})).rows[0];
  if(cached){if(cached.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(cached.result_json);}
  const draft=(await db.execute({sql:'SELECT * FROM voice_drafts WHERE master_id=? AND conversation_id=?',args:[masterId,conversationId]})).rows[0];
  const button=/^\/(voiceuse|voiceedit|voicedeny) ([0-9a-f-]{36})$/.exec(text||'');
  let result,newDraft;
  if(voice){
   // Persist the original message time and transcript before executing. A failed
   // command/delivery retry must neither shift relative dates nor re-upload audio.
   const cacheStage=(id,value)=>writeTransaction(db,async tx=>{
    const previous=(await tx.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,id]})).rows[0];
    if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(previous.result_json);}
    await tx.execute({sql:'INSERT INTO command_requests(master_id,request_id,input_hash,result_json) VALUES(?,?,?,?)',args:[masterId,id,hash,JSON.stringify(value)]});return value;
   });
   const received=await cacheStage(`speech-input:${requestId}`,{created_at:Number.isFinite(receivedAt)&&receivedAt>0&&receivedAt<=now()+300000?receivedAt:now()});
   let transcript;
   const previous=(await db.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech-transcript:${requestId}`]})).rows[0];
   if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');transcript=JSON.parse(previous.result_json).transcript;}
   else {
    try{
     transcript=await transcribeVoice(voice,{requestId,masterId,conversationId});
     if(typeof transcript!=='string'||transcript.trim().length<2||transcript.length>3000)throw new SpeechInputError('Ovozdan aniq matn olinmadi. Qisqaroq qayta yozing.');
    }
    catch(error){if(error.retryable)throw error;if(draft)newDraft={...draft,status:'cancelled'};result={kind:'speech_error',reply:(error instanceof SpeechInputError||error instanceof AishaInputError)?error.message:'Ovozni tanib bo‘lmadi. Keyinroq qayta yuboring yoki matn yozing.'};}
   }
   if(!previous&&!result)transcript=(await cacheStage(`speech-transcript:${requestId}`,{transcript:transcript.trim()})).transcript;
   if(!result){
    result=await runCommand({text:transcript,requestId:`voice-apply:${requestId}`,masterId,conversationId,commandTime:received.created_at,receivedBy,receivedByName});
    if(draft&&['pending','editing'].includes(draft.status))newDraft={...draft,status:'cancelled'};
   }
  }else if(text==='/cancel' && draft && ['pending','editing'].includes(draft.status)){
   newDraft={...draft,status:'cancelled'};result={kind:'cancelled_transcript',reply:'Amal bekor qilindi.'};
  }else if(button){
   if(!draft||draft.token!==button[2]||!['pending','editing'].includes(draft.status)||now()-Number(draft.created_at)>15*60*1000)result={kind:'expired_button',reply:'Bu ovozli xabarning tugmasi eskirgan. Ovoz yoki matnni qayta yuboring.'};
   else if(button[1]==='voiceuse' && draft.status==='pending'){
    result=await runCommand({text:draft.transcript,requestId:`voice-apply:${draft.token}`,masterId,conversationId,commandTime:Number(draft.created_at),receivedBy,receivedByName});newDraft={...draft,status:'applied'};
   }else if(button[1]==='voiceedit'){
    newDraft={...draft,status:'editing'};result={kind:'transcript_edit',reply:'✏️ To‘g‘rilangan matnni to‘liq yozing. Buyruq darhol bajariladi. /cancel — bekor qilish.'};
   }else if(button[1]==='voicedeny'){
    newDraft={...draft,status:'cancelled'};result={kind:'cancelled_transcript',reply:'Amal bekor qilindi.'};
   }else result={kind:'expired_button',reply:'Avval matnni to‘g‘rilab yuboring.'};
  }else if(draft?.status==='editing'&&text && !text.startsWith('/')){
   if(text.length>3000)result={kind:'speech_error',reply:'Matnni 3000 belgigacha yozing.'};
   else{result=await runCommand({text:text.trim(),requestId:`voice-edit:${draft.token}:${requestId}`,masterId,conversationId,commandTime:Number(draft.created_at),receivedBy,receivedByName});newDraft={...draft,transcript:text.trim(),status:'applied'};}
  }else return null;
  return writeTransaction(db,async tx=>{
   if(newDraft)await tx.execute({sql:'INSERT INTO voice_drafts(master_id,conversation_id,token,transcript,status,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(master_id,conversation_id) DO UPDATE SET token=excluded.token,transcript=excluded.transcript,status=excluded.status,created_at=excluded.created_at',args:[masterId,conversationId,newDraft.token,newDraft.transcript,newDraft.status,newDraft.created_at]});
   const previous=(await tx.execute({sql:'SELECT input_hash,result_json FROM command_requests WHERE master_id=? AND request_id=?',args:[masterId,`speech:${requestId}`]})).rows[0];
   if(previous){if(previous.input_hash!==hash)throw new Error('REQUEST_CONFLICT');return JSON.parse(previous.result_json);}
   await tx.execute({sql:'INSERT INTO command_requests(master_id,request_id,input_hash,result_json) VALUES(?,?,?,?)',args:[masterId,`speech:${requestId}`,hash,JSON.stringify(result)]});
   return result;
  });
 };
}
