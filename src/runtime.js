import {database} from './db.js';
import {createApp} from './app.js';
export function createRuntimeApp(env=process.env) {
  let db;
  if(env.DATABASE_URL) {
    try { db=database(env); }
    catch { console.error('Database client could not initialize. Check DATABASE_URL and DATABASE_TOKEN.'); }
  }
  return createApp({db,apiKey:env.ACTION_API_KEY,masterId:env.MASTER_ID,dashboardKey:env.DASHBOARD_KEY});
}
