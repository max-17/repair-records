import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {writeTransaction} from './audit.js';
const ready=new WeakMap();
export const staffPermissions=['pul.read','pul.write','pul.all','repairs','admin'];
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function setupStaff(db,env=process.env){let promise=ready.get(db);if(!promise){promise=createTables(db,env);ready.set(db,promise);}try{await promise;}catch(error){ready.delete(db);throw error;}}
async function createTables(db,env){
 await db.execute('CREATE TABLE IF NOT EXISTS staff_roles(id TEXT PRIMARY KEY,name TEXT NOT NULL,permissions_json TEXT NOT NULL,is_deleted INTEGER NOT NULL DEFAULT 0)');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_users(telegram_id TEXT PRIMARY KEY,name TEXT NOT NULL,role_id TEXT NOT NULL REFERENCES staff_roles(id),repair_master_id TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_invites(token_hash TEXT PRIMARY KEY,role_id TEXT NOT NULL REFERENCES staff_roles(id),created_by TEXT NOT NULL,expires_at INTEGER NOT NULL,used_by TEXT,is_revoked INTEGER NOT NULL DEFAULT 0)');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_login_requests(id TEXT PRIMARY KEY,proof_hash TEXT NOT NULL UNIQUE,invite_hash TEXT,expires_at INTEGER NOT NULL,approved_by TEXT,status TEXT NOT NULL DEFAULT \'pending\')');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL)');
 await db.execute("CREATE TRIGGER IF NOT EXISTS staff_events_immutable_update BEFORE UPDATE ON staff_events BEGIN SELECT RAISE(ABORT,'Immutable history'); END");
 await db.execute("CREATE TRIGGER IF NOT EXISTS staff_events_immutable_delete BEFORE DELETE ON staff_events BEGIN SELECT RAISE(ABORT,'Immutable history'); END");
 await db.execute('CREATE TABLE IF NOT EXISTS staff_config(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 await db.execute('CREATE TABLE IF NOT EXISTS staff_login_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)');
 await writeTransaction(db,async tx=>{
  const boot=(await tx.execute("SELECT value FROM staff_config WHERE key='bootstrap'")).rows[0];if(boot)return;
  for(const [id,name,permissions] of [['owner','Egasi',staffPermissions],['leader','Rahbar',['pul.read','pul.write','pul.all','repairs']],['worker','Xodim',['pul.read','pul.write','repairs']]])await tx.execute({sql:'INSERT INTO staff_roles(id,name,permissions_json) VALUES(?,?,?) ON CONFLICT DO NOTHING',args:[id,name,JSON.stringify(permissions)]});
  let masters={};try{masters=JSON.parse(env.TELEGRAM_MASTERS||'{}');}catch{}
  const owners=(env.PUL_OWNER_USER_IDS||env.PUL_OWNER_CHAT_ID||env.SHOP_ADMIN_CHAT_ID||Object.entries(masters).find(([,name])=>name==='owner')?.[0]||'').split(',').map(x=>x.trim());
  const ids=new Set([...Object.keys(masters),...owners].filter(x=>/^\d+$/.test(x)));
  for(const id of ids)await tx.execute({sql:'INSERT INTO staff_users(telegram_id,name,role_id,repair_master_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING',args:[id,masters[id]||'Egasi',owners.includes(id)?'owner':'worker',masters[id]||id,new Date().toISOString()]});
  await tx.execute("INSERT INTO staff_config(key,value) VALUES('bootstrap','1')");
 });
}
export async function staffAccess(db,env,id){await setupStaff(db,env);const user=(await db.execute({sql:'SELECT u.*,r.name AS role_name,r.permissions_json,r.is_deleted FROM staff_users u JOIN staff_roles r ON r.id=u.role_id WHERE u.telegram_id=?',args:[String(id)]})).rows[0];if(!user||!user.is_active||user.is_deleted)return null;return {id:String(id),name:String(user.name),roleId:String(user.role_id),roleName:String(user.role_name),masterId:String(user.repair_master_id),permissions:JSON.parse(user.permissions_json).includes('admin')?staffPermissions:JSON.parse(user.permissions_json)};}
export async function staffEvent(tx,actor,action,target,before,after){await tx.execute({sql:'INSERT INTO staff_events(id,actor_id,action,target_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)',args:[randomUUID(),actor,action,target,before?JSON.stringify(before):null,JSON.stringify(after),new Date().toISOString()]});}
export async function createStaffInvite(db,env,actor,roleId){await setupStaff(db,env);const token=randomBytes(24).toString('base64url'),expires=Date.now()+7*86400000;await writeTransaction(db,async tx=>{const role=(await tx.execute({sql:'SELECT * FROM staff_roles WHERE id=? AND is_deleted=0',args:[roleId]})).rows[0];if(!role)throw new Error('ROLE_NOT_FOUND');await tx.execute({sql:'INSERT INTO staff_invites(token_hash,role_id,created_by,expires_at) VALUES(?,?,?,?)',args:[hash(token),roleId,actor,expires]});await staffEvent(tx,actor,'invite',roleId,null,{roleId,expires});});return {token,expires};}
export async function beginStaffLogin(db,env,{invite,ip}){
 await setupStaff(db,env);const now=Date.now();const limit=(await db.execute({sql:'INSERT INTO staff_login_limits(id,count,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count',args:[hash(ip||'unknown'),now+900000,now,now]})).rows[0];if(Number(limit.count)>20)throw new Error('RATE_LIMIT');
 let inviteHash=null;if(invite){inviteHash=hash(invite);const row=(await db.execute({sql:'SELECT token_hash FROM staff_invites WHERE token_hash=? AND expires_at>? AND used_by IS NULL AND is_revoked=0',args:[inviteHash,now]})).rows[0];if(!row)throw new Error('INVITE_EXPIRED');}
 const id=randomBytes(24).toString('base64url'),proof=randomBytes(32).toString('base64url');await db.execute({sql:'INSERT INTO staff_login_requests(id,proof_hash,invite_hash,expires_at) VALUES(?,?,?,?)',args:[id,hash(proof),inviteHash,now+600000]});return {id,proof};
}
export async function pollStaffLogin(db,env,proof){await setupStaff(db,env);if(!proof)return null;const row=(await db.execute({sql:'SELECT * FROM staff_login_requests WHERE proof_hash=? AND expires_at>?',args:[hash(proof),Date.now()]})).rows[0];if(!row)return null;if(row.status!=='approved')return {status:'pending'};const access=await staffAccess(db,env,row.approved_by);return access?{status:'approved',user:access}:null;}
export function staffTelegramLogin({db,env}){return async update=>{
 if(!Number.isSafeInteger(update?.update_id))return null;
 const callback=update.callback_query,msg=callback?.message||update.message,from=callback?.from||msg?.from;if(!msg||msg.chat?.type!=='private'||!Number.isSafeInteger(from?.id)||from.is_bot)return null;
 const start=/^\/start(?:@\w+)? auth_([\w-]{32})$/.exec(msg.text||''),confirm=/^stafflogin:([\w-]{32})$/.exec(callback?.data||'');if(!start&&!confirm)return null;
 await setupStaff(db,env);const id=(start||confirm)[1],userId=String(from.id);const row=(await db.execute({sql:'SELECT * FROM staff_login_requests WHERE id=? AND expires_at>?',args:[id,Date.now()]})).rows[0];if(!row)return {text:'Kirish havolasi eskirgan. Saytda qayta urinib ko‘ring.'};
 const access=await staffAccess(db,env,userId);
 if(!row.invite_hash&&!access)return {text:'Sizga kirish huquqi berilmagan. Egasidan taklif havolasini so‘rang.'};
 if(start)return {text:'Do‘kon boshqaruviga Telegram orqali kirishni tasdiqlaysizmi? Faqat o‘zingiz hozir ochgan sayt uchun tasdiqlang.',reply_markup:{inline_keyboard:[[{text:'Kirishni tasdiqlash',style:'success',callback_data:`stafflogin:${id}`}]]}};
 return writeTransaction(db,async tx=>{
  const current=(await tx.execute({sql:'SELECT * FROM staff_login_requests WHERE id=? AND expires_at>?',args:[id,Date.now()]})).rows[0];if(!current)return {text:'Kirish havolasi eskirgan.'};
  if(current.status==='approved')return {text:current.approved_by===userId?'Kirish tasdiqlangan. Saytga qayting.':'Bu kirish allaqachon ishlatilgan.'};
  if(current.invite_hash){
   const invite=(await tx.execute({sql:'SELECT i.*,r.is_deleted FROM staff_invites i JOIN staff_roles r ON r.id=i.role_id WHERE token_hash=?',args:[current.invite_hash]})).rows[0];if(!invite||invite.used_by||invite.is_revoked||invite.expires_at<Date.now()||invite.is_deleted)return {text:'Taklif havolasi yaroqsiz yoki ishlatilgan.'};
   const existing=(await tx.execute({sql:'SELECT * FROM staff_users WHERE telegram_id=?',args:[userId]})).rows[0];
   // Invites add new staff only; they cannot silently change an existing person's role.
   if(existing)return {text:'Sizda hisob mavjud. Oddiy Telegram kirishidan foydalaning; rolni egasi o‘zgartiradi.'};
   const name=[from.first_name,from.last_name].filter(Boolean).join(' ').slice(0,200)||userId;
   await tx.execute({sql:'INSERT INTO staff_users(telegram_id,name,role_id,repair_master_id,created_at) VALUES(?,?,?,?,?)',args:[userId,name,invite.role_id,userId,new Date().toISOString()]});
   await tx.execute({sql:'UPDATE staff_invites SET used_by=? WHERE token_hash=? AND used_by IS NULL',args:[userId,current.invite_hash]});await staffEvent(tx,invite.created_by,'accept_invite',userId,null,{name,roleId:invite.role_id});
  }else if(!access)return {text:'Kirish huquqi bekor qilingan.'};
  await tx.execute({sql:"UPDATE staff_login_requests SET status='approved',approved_by=? WHERE id=? AND status='pending'",args:[userId,id]});
  return {text:'Kirish tasdiqlandi. Saytga qayting.'};
 });
};}
