import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createClient} from '@libsql/client';
import {setupStaff,staffAccess,beginStaffLogin,pollStaffLogin,createStaffInvite,staffTelegramLogin} from '../src/staff-auth.js';
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'staff-login-'));const db=createClient({url:`file:${join(directory,'test.db')}`});const env={TELEGRAM_MASTERS:'{"42":"owner","7":"Aziz"}'};try{await setupStaff(db,env);await fn(db,env);}finally{db.close();await rm(directory,{recursive:true,force:true});}}
const update=(text,id=7)=>({update_id:1,message:{text,chat:{id,type:'private'},from:{id,first_name:'Worker'}}});
const approval=(token,id)=>({update_id:2,callback_query:{data:`stafflogin:${token}`,from:{id,first_name:'Worker'},message:{chat:{id,type:'private'}}}});
test('role bootstrap is once-only, access revocation is immediate and not restored by legacy env',()=>fixture(async(db,env)=>{
 assert.ok((await staffAccess(db,env,'42')).permissions.includes('admin'));assert.ok(!(await staffAccess(db,env,'7')).permissions.includes('admin'));
 await db.execute("UPDATE staff_users SET is_active=0 WHERE telegram_id='7'");await setupStaff(db,env);assert.equal(await staffAccess(db,env,'7'),null);assert.equal(await staffAccess(db,env,'999'),null);
}));
test('Telegram login proof is browser-bound, approval required, expiry and revocation are enforced',()=>fixture(async(db,env)=>{
 const request=await beginStaffLogin(db,env,{ip:'fixture'});assert.equal((await pollStaffLogin(db,env,request.proof)).status,'pending');assert.equal(await pollStaffLogin(db,env,'wrong-proof'),null);
 const login=staffTelegramLogin({db,env});assert.match((await login(update('/start auth_'+request.id))).text,/tasdiqlaysizmi/);assert.equal((await pollStaffLogin(db,env,request.proof)).status,'pending');
 await login(approval(request.id,7));assert.equal((await pollStaffLogin(db,env,request.proof)).user.id,'7');await db.execute("UPDATE staff_users SET is_active=0 WHERE telegram_id='7'");assert.equal(await pollStaffLogin(db,env,request.proof),null);
 await db.execute('UPDATE staff_login_requests SET expires_at=0');assert.match((await login(approval(request.id,7))).text,/eskirgan/);
}));
test('single-use staff invitation grants stored role only after Telegram confirmation',()=>fixture(async(db,env)=>{
 const invite=await createStaffInvite(db,env,'42','worker');const request=await beginStaffLogin(db,env,{invite:invite.token,ip:'fixture'});const login=staffTelegramLogin({db,env});
 assert.equal(await staffAccess(db,env,'9'),null);await login(update('/start auth_'+request.id,9));assert.equal(await staffAccess(db,env,'9'),null);await login(approval(request.id,9));assert.equal((await staffAccess(db,env,'9')).roleId,'worker');
 assert.match((await login(approval(request.id,10))).text,/ishlatilgan/);await assert.rejects(beginStaffLogin(db,env,{invite:invite.token,ip:'fixture'}),/INVITE_EXPIRED/);
 assert.equal((await db.execute("SELECT * FROM staff_events WHERE action='accept_invite'")).rows.length,1);await assert.rejects(db.execute('DELETE FROM staff_events'),/Immutable/);
}));
test('existing account cannot use a forwarded invite to change its role',()=>fixture(async(db,env)=>{
 const invite=await createStaffInvite(db,env,'42','owner');const request=await beginStaffLogin(db,env,{invite:invite.token,ip:'fixture'});const login=staffTelegramLogin({db,env});assert.match((await login(approval(request.id,7))).text,/hisob mavjud/);assert.equal((await staffAccess(db,env,'7')).roleId,'worker');
}));
