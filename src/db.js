import 'dotenv/config';
import { createClient } from '@libsql/client';
export function database(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return createClient({url: env.DATABASE_URL, authToken: env.DATABASE_TOKEN || env.database_token});
}
export async function setup(db) {
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
}
