import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { authConfigurationIssue, createSession, passwordMatches, sessionCookie, sessionSeconds } from '@/lib/auth';
import { db, initialize } from '@/lib/db';

export async function POST(request: NextRequest) {
 try {
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== request.headers.get('host')) {
   console.warn('[auth] Login rejected', { reason: 'invalid_origin' });
   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const issue = authConfigurationIssue();
  if (issue) {
   console.error('[auth] Login unavailable', { reason: issue });
   return NextResponse.json({ error: 'Admin kirishi sozlanmagan.' }, { status: 503 });
  }
  const body = await request.json();
  if (typeof body.password !== 'string' || body.password.length > 256) {
   console.warn('[auth] Login rejected', { reason: 'invalid_request' });
   return NextResponse.json({ error: 'Parolni tekshiring.' }, { status: 400 });
  }
  await initialize();
  await db.execute('CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
  const id = createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local').digest('hex');
  const now = Date.now();
  const attempts = await db.execute({
   sql: 'INSERT INTO login_attempts(id,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING attempts',
   args: [id, now + 900000, now, now],
  });
  if (Number(attempts.rows[0].attempts) > 10) {
   console.warn('[auth] Login rejected', { reason: 'rate_limited' });
   return NextResponse.json({ error: 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.' }, { status: 429 });
  }
  if (!passwordMatches(body.password)) {
   console.warn('[auth] Login rejected', { reason: 'incorrect_password' });
   return NextResponse.json({ error: 'Parol noto‘g‘ri.' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: sessionSeconds });
  console.info('[auth] Login successful');
  return response;
 } catch (error) {
  console.error('[auth] Login failed', { reason: 'unexpected_error', errorName: error instanceof Error ? error.name : 'UnknownError' });
  return NextResponse.json({ error: 'Kirish amalga oshmadi.' }, { status: 500 });
 }
}
