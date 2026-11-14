import {database} from './db.js';
import {createApp} from './app.js';
import {commandService,geminiParser} from './commands.js';
import {telegramWebhook} from './telegram.js';
import {telegramDelivery,telegramSender} from './delivery.js';
import {voiceService,groqTranscriber} from './speech.js';
export function createRuntimeApp(env=process.env) {
  let db;
  if(env.DATABASE_URL) {
    try { db=database(env); }
    catch { console.error('Database client could not initialize. Check DATABASE_URL and DATABASE_TOKEN.'); }
  }
  const runCommand=db && env.GOOGLE_GENERATIVE_AI_API_KEY?commandService({db,parse:geminiParser(env)}):null;
  const deliver=db && env.TELEGRAM_BOT_TOKEN?telegramDelivery({db,send:telegramSender(env.TELEGRAM_BOT_TOKEN)}):null;
  const runVoice=db&&runCommand?voiceService({db,transcribeVoice:groqTranscriber(env),runCommand}):null;
  const clearVoice=async({masterId,conversationId})=>{await db.execute({sql:"UPDATE voice_drafts SET status='cancelled' WHERE master_id=? AND conversation_id=? AND status IN ('pending','editing')",args:[masterId,conversationId]});};
  const answerCallback=async id=>{await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:id}),signal:AbortSignal.timeout(3000)});};
  return createApp({runCommand,telegramHandler:telegramWebhook({env,runCommand:deliver?runCommand:null,deliver,answerCallback,runVoice,clearVoice}),db,apiKey:env.ACTION_API_KEY,masterId:env.MASTER_ID,dashboardKey:env.DASHBOARD_KEY});
}
