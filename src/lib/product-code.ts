import 'server-only';
import { randomInt } from 'node:crypto';
import type { Transaction } from '@libsql/client';

export async function ensureProductCode(transaction: Transaction, productId: string) {
 const existing=await transaction.execute({sql:'SELECT code FROM inventory_codes WHERE product_id=? ORDER BY created_at,rowid LIMIT 1',args:[productId]});
 if(existing.rows.length)return String(existing.rows[0].code);
 const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
 for(let attempt=0;attempt<20;attempt++){
  const raw=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
  const code=raw.slice(0,4)+'-'+raw.slice(4);
  const result=await transaction.execute({sql:'INSERT OR IGNORE INTO inventory_codes(code,product_id) VALUES (?,?)',args:[code,productId]});
  if(result.rowsAffected)return code;
 }
 throw new Error('CODE_ALLOCATION_FAILED');
}
