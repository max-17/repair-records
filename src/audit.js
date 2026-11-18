import {randomUUID} from 'node:crypto';
export async function auditRepair(tx,{masterId,requestId,actorId,before=null,after,sourceIds=[]}){
 const eventId=randomUUID();
 await tx.execute({sql:'INSERT INTO repair_events(id,master_id,repair_id,request_id,actor_id,event_type,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)',args:[eventId,masterId,after.id,requestId,actorId,before?'updated':'created',before?JSON.stringify(before):null,JSON.stringify(after)]});
 for(const [position,id] of sourceIds.entries())await tx.execute({sql:'INSERT INTO repair_event_sources(event_id,source_id,position) SELECT ?,id,? FROM pul_sources WHERE id=? AND shop_id=?',args:[eventId,position,id,`repair:${masterId}`]});
}
export async function writeTransaction(db,operation){
 const tx=await db.transaction('write');
 try{const result=await operation(tx);await tx.commit();return result;}
 finally{if(!tx.closed)await tx.rollback();}
}
