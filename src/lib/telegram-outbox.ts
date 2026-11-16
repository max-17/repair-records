import type { Client, Transaction } from '@libsql/client';

// No dependency on db.ts: these helpers run inside the product/stock transaction.
export async function createTelegramTables(db: Pick<Client,'execute'>) {
 await db.execute(`CREATE TABLE IF NOT EXISTS telegram_channels(id TEXT PRIMARY KEY,title TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1)`);
 await db.execute(`CREATE TABLE IF NOT EXISTS telegram_jobs(product_id TEXT NOT NULL,channel_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,allow_create INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',PRIMARY KEY(product_id,channel_id))`);
 await db.execute(`CREATE TABLE IF NOT EXISTS telegram_posts(product_id TEXT NOT NULL,channel_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(product_id,channel_id))`);
 await db.execute(`CREATE TABLE IF NOT EXISTS telegram_lock(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL)`);
 await db.execute("INSERT OR IGNORE INTO telegram_lock VALUES(1,'',0)");
}
export async function enqueueTelegram(tx: Pick<Transaction,'execute'>, productId: string, allowCreate=false) {
 await tx.execute({sql:`INSERT INTO telegram_jobs(product_id,channel_id,allow_create)
 SELECT ?,id,? FROM telegram_channels WHERE 1=1
 ON CONFLICT(product_id,channel_id) DO UPDATE SET revision=telegram_jobs.revision+1,allow_create=MAX(telegram_jobs.allow_create,excluded.allow_create),status=CASE WHEN telegram_jobs.status IN ('uncertain','working') THEN telegram_jobs.status ELSE 'pending' END,next_attempt=0,error=CASE WHEN telegram_jobs.status='uncertain' THEN telegram_jobs.error ELSE '' END`,args:[productId,Number(allowCreate)]});
}
