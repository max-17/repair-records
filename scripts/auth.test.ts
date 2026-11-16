import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { authConfigurationIssue, passwordMatches, authenticated } from '../src/lib/auth';

test('password login accepts short passwords and logs no credentials', async () => {
 const cwd = process.cwd(), folder = await mkdtemp(join(tmpdir(), 'shop-auth-'));
 const saved = { password: process.env.ADMIN_PASSWORD, secret: process.env.ADMIN_SESSION_SECRET, local: process.env.INVENTORY_LOCAL_ONLY };
 const original = { warn: console.warn, error: console.error, info: console.info };
 const logs: unknown[][] = [];
 let database: typeof import('../src/lib/db') | undefined;
 try {
  process.env.ADMIN_PASSWORD = 'x';
  process.env.ADMIN_SESSION_SECRET = 'fixture-session-secret-do-not-log';
  process.env.INVENTORY_LOCAL_ONLY = 'true';
  assert.equal(authConfigurationIssue(), null);
  assert.equal(passwordMatches('x'), true);
  assert.equal(passwordMatches('wrong'), false);
  process.chdir(folder);
  const { POST } = await import('../src/app/api/auth/login/route');
  database = await import('../src/lib/db');
  console.warn = (...args) => { logs.push(args); };
  console.error = (...args) => { logs.push(args); };
  console.info = (...args) => { logs.push(args); };
  const login = (password: string, ip = 'fixture-client') => POST(new NextRequest('http://localhost/api/auth/login', {method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify({password})}));
  const success = await login('x');
  assert.equal(success.status, 200);
  const cookie = success.cookies.get('shop-owner');
  assert.ok(cookie);
  assert.equal(authenticated(cookie.value), true);
  assert.equal((await login('wrong')).status, 401);
  for(let i=0;i<10;i++) assert.equal((await login('wrong', 'rate-limit-fixture')).status, 401);
  assert.equal((await login('wrong', 'rate-limit-fixture')).status, 429);
  delete process.env.ADMIN_SESSION_SECRET;
  assert.equal((await login('x')).status, 503);
  assert.equal(authConfigurationIssue(), 'session_secret_missing');
  process.env.ADMIN_SESSION_SECRET = 'fixture-session-secret-do-not-log';
  delete process.env.ADMIN_PASSWORD;
  assert.equal((await login('x')).status, 503);
  assert.equal(authConfigurationIssue(), 'password_missing');
  const text = JSON.stringify(logs);
  assert.ok(text.includes('incorrect_password'));
  assert.ok(text.includes('session_secret_missing'));
  assert.ok(!text.includes('fixture-session-secret-do-not-log'));
  assert.ok(!text.includes('wrong'));
  assert.ok(!text.includes(cookie.value));
 } finally {
  console.warn = original.warn; console.error = original.error; console.info = original.info;
  database?.db.close(); process.chdir(cwd);
  for(const [key,value] of [['ADMIN_PASSWORD', saved.password], ['ADMIN_SESSION_SECRET',saved.secret], ['INVENTORY_LOCAL_ONLY',saved.local]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}
  await rm(folder,{recursive:true,force:true});
 }
});
