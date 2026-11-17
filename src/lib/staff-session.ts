import 'server-only';
import {cookies} from 'next/headers';
import {authenticated,staffSessionUser,sessionCookie} from './auth';
import {db} from './db';
import {staffAccess,staffPermissions,setupStaff} from '../staff-auth.js';
export async function staffSession(){const token=(await cookies()).get(sessionCookie)?.value;return staffTokenAccess(token);}
export async function staffTokenAccess(token?:string){if(!authenticated(token))return null;const id=staffSessionUser(token);if(id)return staffAccess(db,process.env,id);await setupStaff(db,process.env);return {id:'web:owner',name:'Veb administrator',roleId:'owner',roleName:'Egasi',masterId:'owner',permissions:staffPermissions};}
