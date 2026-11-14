import {randomUUID} from 'node:crypto';
export async function auditRepair(tx,{masterId,requestId,actorId,before=null,after}){
 await tx.execute({sql:'INSERT INTO repair_events(id,master_id,repair_id,request_id,actor_id,event_type,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',args:[randomUUID(),masterId,after.id,requestId,actorId,before?'updated':'created',before?JSON.stringify(before):null,JSON.stringify(after)]});
}
export async function writeTransaction(db,operation){
 const tx=await db.transaction('write');
 try{const result=await operation(tx);await tx.commit();return result;}
 finally{if(!tx.closed)await tx.rollback();}
}
