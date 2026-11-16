import {observe} from './observability.js';
/** Shared durable-delivery primitives. Schema names are internal, never user input. */
const stores=Object.freeze({
 staff:Object.freeze({table:'telegram_locks',scope:'conversation_id',token:'lease_token'}),
 customer:Object.freeze({table:'customer_chat_locks',scope:'chat_id',token:'token'}),
});
/** @typedef {{kind:'staff'|'customer',scope:string,requestId:number,token:string,now:number,durationMs:number}} Lease */
function store(kind){const value=stores[kind];if(!Object.hasOwn(stores,kind)||!value)throw new Error('INVALID_LEASE_STORE');return value;}
export class DeliveryLeaseLostError extends Error{constructor(){super('DELIVERY_LEASE_LOST');this.code='DELIVERY_LEASE_LOST';}}
/** @param {any} executor @param {Lease} lease */
export async function claimConversationLease(executor,lease){
 const s=store(lease.kind);
 const result=await executor.execute({sql:`INSERT INTO ${s.table}(${s.scope},update_id,lease_until,${s.token}) VALUES(?,?,?,?) ON CONFLICT(${s.scope}) DO UPDATE SET update_id=excluded.update_id,lease_until=excluded.lease_until,${s.token}=excluded.${s.token} WHERE ${s.table}.lease_until<=? RETURNING update_id`,args:[lease.scope,lease.requestId,lease.now+lease.durationMs,lease.token,lease.now]});
 return result.rows.length>0;
}
/** Token ownership, not elapsed time alone, determines whether the worker may finish. @param {any} executor @param {Lease} lease */
export async function renewConversationLease(executor,lease){
 const s=store(lease.kind);
 const result=await executor.execute({sql:`UPDATE ${s.table} SET lease_until=? WHERE ${s.scope}=? AND ${s.token}=? RETURNING update_id`,args:[lease.now+lease.durationMs,lease.scope,lease.token]});
 if(!result.rows.length)throw new DeliveryLeaseLostError();
}
/** @param {Pick<Lease,'kind'|'scope'|'token'>} lease */
export function leaseOwnershipGuard(lease){const s=store(lease.kind);return {sql:`EXISTS (SELECT 1 FROM ${s.table} WHERE ${s.scope}=? AND ${s.token}=?)`,args:[lease.scope,lease.token]};}
/** An old worker can never release its replacement's lease. @param {any} executor @param {Pick<Lease,'kind'|'scope'|'token'>} lease */
export async function releaseConversationLease(executor,lease){const s=store(lease.kind);await executor.execute({sql:`DELETE FROM ${s.table} WHERE ${s.scope}=? AND ${s.token}=?`,args:[lease.scope,lease.token]});}
/** Run cache/state persistence in the same transaction as checking lease ownership. @param {any} db @param {Lease} lease @param {(executor:any)=>Promise<any>} apply */
export async function withOwnedLease(db,lease,apply){
 const tx=await db.transaction('write');
 try{await renewConversationLease(tx,lease);const result=await apply(tx);await tx.commit();return result;}
 catch(error){await tx.rollback();throw error;}
 finally{tx.close();}
}
/** Both bots renew before delivery and require a token-guarded acknowledgement. @param {{db:any,lease:Lease,payload:any,send:(payload:any)=>Promise<any>,acknowledge:(result:any,guard:{sql:string,args:string[]})=>Promise<boolean>}} options */
export async function deliverWithLease({db,lease,payload,send,acknowledge}){
 await renewConversationLease(db,lease);
 const result=await observe({db,bot:lease.kind,operation:lease.kind==='staff'?'staff_delivery':'customer_delivery'},()=>send(payload));
 if(!await acknowledge(result,leaseOwnershipGuard(lease)))throw new DeliveryLeaseLostError();
 return result;
}
/** Unknown transport outcomes are ambiguous, never proof a message was rejected. @param {any} error */
export function classifyDeliveryFailure(error){
 const definitive=error?.ambiguous===false;
 const raw=String(error?.code||error?.statusCode||'processing_failed');
 return {status:definitive?'failed':'uncertain',retryable:!!error?.retryable,code:/^[A-Za-z0-9_.-]{1,80}$/.test(raw)?raw:'processing_failed'};
}
