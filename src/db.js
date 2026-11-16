import 'dotenv/config';
import { createClient } from '@libsql/client';
export function database(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return createClient({url: env.DATABASE_URL, authToken: env.DATABASE_TOKEN || env.database_token});
}
export async function setup(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS speech_jobs (
    request_key TEXT PRIMARY KEY, provider TEXT NOT NULL, job_id TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS voice_drafts (
    master_id TEXT NOT NULL, conversation_id TEXT NOT NULL, token TEXT NOT NULL,
    transcript TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(master_id,conversation_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS repair_events (
    id TEXT PRIMARY KEY, master_id TEXT NOT NULL, repair_id TEXT NOT NULL,
    request_id TEXT NOT NULL, actor_id TEXT NOT NULL, event_type TEXT NOT NULL,
    before_json TEXT, after_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  await db.execute('CREATE INDEX IF NOT EXISTS repair_events_lookup ON repair_events(master_id,repair_id,created_at)');
  await db.execute(`CREATE TABLE IF NOT EXISTS telegram_deliveries (
    update_id INTEGER PRIMARY KEY, conversation_id TEXT NOT NULL,
    input_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER NOT NULL DEFAULT 0, reply_text TEXT, telegram_message_id INTEGER,
    last_error_code TEXT, created_at INTEGER NOT NULL, sent_at INTEGER
  )`);
  await db.execute('CREATE INDEX IF NOT EXISTS telegram_delivery_order ON telegram_deliveries(conversation_id,status,created_at,update_id)');
  await db.execute(`CREATE TABLE IF NOT EXISTS telegram_locks (
    conversation_id TEXT PRIMARY KEY, update_id INTEGER NOT NULL, lease_until INTEGER NOT NULL, lease_token TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS conversation_state (
    master_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
    state_json TEXT NOT NULL, revision INTEGER NOT NULL,
    PRIMARY KEY(master_id,conversation_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS conversation_memory (
    master_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
    turns_json TEXT NOT NULL, revision INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    PRIMARY KEY(master_id,conversation_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS command_requests (
    master_id TEXT NOT NULL, request_id TEXT NOT NULL, input_hash TEXT NOT NULL,
    result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY(master_id,request_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS repair_jobs (
    id TEXT PRIMARY KEY, master_id TEXT NOT NULL, request_id TEXT NOT NULL,
    customer TEXT NOT NULL, device TEXT NOT NULL, work TEXT NOT NULL,
    price_uzs INTEGER, due_date TEXT, status TEXT NOT NULL DEFAULT 'received',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(master_id, request_id)
  )`);
  const columns=(await db.execute('PRAGMA table_info(repair_jobs)')).rows.map(row=>row.name);
  for(const name of ['received_by','received_by_name','technician']){
    if(!columns.includes(name))await db.execute(`ALTER TABLE repair_jobs ADD COLUMN ${name} TEXT`);
  }

}
