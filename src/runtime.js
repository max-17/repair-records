import {database} from './db.js';
import {createApp} from './app.js';
import {commandService,geminiParser} from './commands.js';
import {telegramWebhook} from './telegram.js';
export function createRuntimeApp(env=process.env) {
  let db;
  if(env.DATABASE_URL) {
    try { db=database(env); }
    catch { console.error('Database client could not initialize. Check DATABASE_URL and DATABASE_TOKEN.'); }
  }
  const runCommand=db && env.GOOGLE_GENERATIVE_AI_API_KEY?commandService({db,parse:geminiParser(env)}):null;
  return createApp({runCommand,telegramHandler:telegramWebhook({env,runCommand}),db,apiKey:env.ACTION_API_KEY,masterId:env.MASTER_ID,dashboardKey:env.DASHBOARD_KEY});
}
