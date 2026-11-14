import 'dotenv/config';
import {database} from './db.js';
import {createApp} from './app.js';
const app=createApp({db:database(),apiKey:process.env.ACTION_API_KEY,masterId:process.env.MASTER_ID,dashboardKey:process.env.DASHBOARD_KEY});
app.listen(process.env.PORT||3000,()=>console.log('Repair API listening'));
