import {database,setup} from '../src/db.js';
const db=database();
try { await setup(db); console.log('Turso repair_jobs table is ready.'); }
catch { console.error('Database setup failed. Check Turso URL, token, and connectivity.'); process.exitCode=1; }
finally { db.close(); }
