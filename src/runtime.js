import {randomUUID} from 'node:crypto';
import {observe,withTraceContext,recordOperationalEvent} from '../shared/observability.js';
import {database} from './db.js';
import {telegramButtonCleanup} from './telegram-ui.js';
import {createApp} from './app.js';
import {commandService,geminiParser} from './commands.js';
import {telegramWebhook} from './telegram.js';
import {telegramDelivery,telegramSender} from './delivery.js';
import {voiceService,groqTranscriber,aishaTranscriber} from './speech.js';
export function createRuntimeApp(env=process.env) {
  let db;
  if(env.DATABASE_URL) {
    try { db=database(env); }
    catch { console.error('Database client could not initialize. Check DATABASE_URL and DATABASE_TOKEN.'); }
  }
  const runCommand=db && env.GOOGLE_GENERATIVE_AI_API_KEY?commandService({db,parse:(...args)=>observe({db,bot:'staff',operation:'ai_plan'},()=>geminiParser(env)(...args))}):null;
  const deliver=db && env.TELEGRAM_BOT_TOKEN?telegramDelivery({db,send:telegramSender(env.TELEGRAM_BOT_TOKEN)}):null;
  const clearButtons=db&&env.TELEGRAM_BOT_TOKEN?telegramButtonCleanup({db,token:env.TELEGRAM_BOT_TOKEN}):null;
  const speechProvider=env.SPEECH_PROVIDER||((env.AISHA_API||env.AISHA_API_KEY||env.VOICELAB_API_KEY)?'aisha':'groq');
  const transcriber=speechProvider==='groq'?groqTranscriber(env):aishaTranscriber(env,{db});
  const runVoice=db&&runCommand?voiceService({db,transcribeVoice:(...args)=>observe({db,bot:'staff',operation:'voice_transcription'},()=>transcriber(...args)),runCommand}):null;
  const clearVoice=async({masterId,conversationId})=>{await db.execute({sql:"UPDATE voice_drafts SET status='cancelled' WHERE master_id=? AND conversation_id=? AND status IN ('pending','editing')",args:[masterId,conversationId]});};
  const answerCallback=async id=>{await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:id}),signal:AbortSignal.timeout(3000)});};
  const staffHandler=telegramWebhook({env,runCommand:deliver?runCommand:null,deliver,answerCallback,runVoice,clearVoice,clearButtons});
  const tracedHandler=async(req,res)=>{
    const traceId=randomUUID(),start=Date.now();res.setHeader('X-Request-ID',traceId);
    return withTraceContext(traceId,async()=>{try{return await staffHandler(req,res);}finally{if(db)await recordOperationalEvent({db,bot:'staff',operation:'staff.webhook',traceId,status:res.statusCode>=400?'error':'ok',errorCode:res.statusCode>=500?'operation_failed':res.statusCode>=400?'unauthorized':undefined,durationMs:Date.now()-start});}});
  };
  return createApp({speechStatus:{provider:speechProvider,configured:speechProvider==='groq'?Boolean(env.GROQ_API_KEY):Boolean(env.AISHA_API||env.AISHA_API_KEY||env.VOICELAB_API_KEY)},runCommand,telegramHandler:tracedHandler,db,apiKey:env.ACTION_API_KEY,masterId:env.MASTER_ID,dashboardKey:env.DASHBOARD_KEY});
}
