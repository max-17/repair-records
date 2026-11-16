import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { database, setup } from '../src/db.js';
mkdirSync(resolve('data'), {recursive:true});
const db=database({DATABASE_URL:`file:${resolve('data/development.db')}`});
try { await setup(db); console.log('Local repair tables ready.'); } finally { db.close(); }
