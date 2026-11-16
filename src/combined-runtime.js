import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRuntimeApp } from './runtime.js';

// Never connect development requests to the production repair database or bot.
export function combinedRepairEnv(env = process.env) {
  if (env.NODE_ENV === 'production' && env.INVENTORY_LOCAL_ONLY !== 'true') return env;
  mkdirSync(resolve('data'), { recursive: true });
  return { ...env, DATABASE_URL: `file:${resolve('data/development.db')}`,
    DATABASE_TOKEN: '', database_token: '', TELEGRAM_BOT_TOKEN: env.REPAIR_DEV_BOT_TOKEN || '' };
}
let app;
export async function repairHandler(req, res) {
  // Owner sessions grant read-only access; external API clients retain bearer auth.
  if (req.method === 'GET' && !req.headers.authorization && process.env.DASHBOARD_KEY) {
    const { authenticated, sessionCookie } = await import('./lib/auth-core.ts');
    if (authenticated(req.cookies?.[sessionCookie])) {
      req.headers.authorization = `Bearer ${process.env.DASHBOARD_KEY}`;
    }
  }
  app ||= createRuntimeApp(combinedRepairEnv());
  return app(req, res);
}
