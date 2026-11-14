import {database} from '../src/db.js';
import {createApp} from '../src/app.js';
export default createApp({db:database(),apiKey:process.env.ACTION_API_KEY,masterId:process.env.MASTER_ID,dashboardKey:process.env.DASHBOARD_KEY});
