import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
export const sessionCookie='shop-owner';
export const sessionSeconds=60*60*12;
function secret(){return process.env.ADMIN_SESSION_SECRET;}
export function authenticated(token?:string){
 const key=secret();if(!key||!process.env.ADMIN_PASSWORD||!token)return false;
 const [expires,nonce,signature,...rest]=token.split('.');if(rest.length||!/^\d+$/.test(expires)||!nonce||!signature||Number(expires)<=Date.now()||Number(expires)>Date.now()+sessionSeconds*1000+60000)return false;
 const expected=createHmac('sha256',key).update(`${expires}.${nonce}`).digest('hex');
 return signature.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export function authConfigurationIssue(){
 if(!process.env.ADMIN_PASSWORD)return 'password_missing';
 if(!secret())return 'session_secret_missing';
 return null;
}
export function passwordMatches(value:string){const expected=process.env.ADMIN_PASSWORD;if(!expected||!secret())return false;return timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(expected).digest());}
export function createSession(){const key=secret();if(!key)throw new Error('Authentication is not configured');const body=`${Date.now()+sessionSeconds*1000}.${randomBytes(24).toString('hex')}`;return `${body}.${createHmac('sha256',key).update(body).digest('hex')}`;}
