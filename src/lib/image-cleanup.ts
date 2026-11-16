import 'server-only';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { UTApi } from 'uploadthing/server';
import { db, initialize } from './db';

export function uploadedImage(url: string): { local: boolean; key: string } | null {
  const local = /^\/uploads\/([a-zA-Z0-9-]+\.(?:jpg|png|webp|gif|avif))$/.exec(url);
  if (local) return { local: true, key: local[1] };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !(/(^|\.)(ufs\.sh|utfs\.io)$/.test(parsed.hostname))) return null;
    const remote = /^\/f\/([a-zA-Z0-9_.-]+)$/.exec(parsed.pathname);
    return remote ? { local: false, key: remote[1] } : null;
  } catch { return null; }
}

export async function queueImageCleanup(urls: string[]) {
  await initialize();
  const owned = [...new Set(urls)].filter(url => uploadedImage(url));
  if (owned.length) await db.batch(owned.map(url => ({ sql: 'INSERT OR IGNORE INTO image_cleanup(url) VALUES (?)', args: [url] })), 'write');
}

/** Retain failures for later retries. Never remove an image used by a saved product. */
export async function processImageCleanup() {
  await initialize();
  const pending = await db.execute('SELECT url FROM image_cleanup ORDER BY rowid LIMIT 100');
  let failed = 0;
  for (const row of pending.rows) {
    const url = String(row.url), asset = uploadedImage(url);
    const used = await db.execute({sql: "SELECT 1 FROM products WHERE image=? OR EXISTS(SELECT 1 FROM json_each(products.images) WHERE value=?) LIMIT 1", args:[url,url]});
    if (used.rows.length || !asset) {
      await db.execute({sql:'DELETE FROM image_cleanup WHERE url=?',args:[url]});
      continue;
    }
    try {
      const localMode = process.env.NODE_ENV !== 'production' || process.env.INVENTORY_LOCAL_ONLY === 'true';
      if (asset.local) {
        if (!localMode) throw new Error('LOCAL_CLEANUP_DISABLED');
        await unlink(join(process.cwd(),'public','uploads',asset.key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      } else {
        if (localMode) throw new Error('REMOTE_CLEANUP_DISABLED_IN_DEVELOPMENT');
        const result = await new UTApi().deleteFiles(asset.key);
        if (!result.success) throw new Error('IMAGE_DELETE_FAILED');
      }
      await db.execute({sql:'DELETE FROM image_cleanup WHERE url=?',args:[url]});
    } catch { failed++; }
  }
  return { failed };
}
