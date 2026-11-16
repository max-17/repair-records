import {productTitle} from './product-variants';
import type {Product} from './types';
import 'server-only';
import { enqueueTelegram } from './telegram-outbox';
import { ensureProductCode } from './product-code';
import { db, initialize, getProducts } from './db';
import type { StockAction, StockMovement, InventoryCode } from './inventory-types';

let ready: Promise<void> | undefined;
export class InventoryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function initializeInventory() {
  return ready ||= (async () => {
    await initialize();
    await db.execute(`CREATE TABLE IF NOT EXISTS inventory_codes (
      code TEXT PRIMARY KEY, product_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    await db.execute(`CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
      type TEXT NOT NULL, quantity INTEGER NOT NULL, delta INTEGER NOT NULL,
      before_stock INTEGER NOT NULL, after_stock INTEGER NOT NULL CHECK(after_stock>=0),
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    await db.execute('CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements(product_id,created_at)');
    const transaction=await db.transaction('write');
    try{
      const missing=await transaction.execute('SELECT id FROM products WHERE NOT EXISTS(SELECT 1 FROM inventory_codes WHERE product_id=products.id)');
      for(const product of missing.rows)await ensureProductCode(transaction,String(product.id));
      await transaction.commit();
    }catch(error){await transaction.rollback();throw error;}finally{transaction.close();}

    await db.execute(`INSERT OR IGNORE INTO stock_movements
      (id,product_id,product_name,type,quantity,delta,before_stock,after_stock,note)
      SELECT 'opening:'||id,id,name,'opening',stock,stock,0,stock,'Boshlang‘ich qoldiq'
      FROM products WHERE stock>0 AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE product_id=products.id)`);
  })().catch(error => { ready = undefined; throw error; });
}

function movement(row: Record<string, unknown>): StockMovement {
  return { id: String(row.id), productId: String(row.product_id), productName: String(row.product_name),
    type: row.type as StockMovement['type'], quantity: Number(row.quantity), delta: Number(row.delta),
    before: Number(row.before_stock), after: Number(row.after_stock), note: String(row.note), createdAt: String(row.created_at) };
}
export async function getInventory() {
  await initializeInventory();
  const [products, history, labels, restocks] = await Promise.all([
    getProducts(true), db.execute('SELECT * FROM stock_movements ORDER BY created_at DESC,rowid DESC LIMIT 200'),
    db.execute('SELECT code,product_id FROM inventory_codes ORDER BY created_at DESC,rowid DESC'),
    db.execute(`SELECT product_id,delta FROM stock_movements m WHERE delta>0 AND type='in' AND rowid=(SELECT rowid FROM stock_movements WHERE product_id=m.product_id AND delta>0 AND type='in' ORDER BY created_at DESC,rowid DESC LIMIT 1)`),
  ]);
  return { products, restocks: restocks.rows.map(row=>({productId:String(row.product_id),quantity:Number(row.delta)})), movements: history.rows.map(row => movement(row)),
    codes: labels.rows.map(row => ({ code: String(row.code), productId: row.product_id == null ? null : String(row.product_id) } satisfies InventoryCode)) };
}

export async function adjustStock(input: { id: string; productId: string; type: StockAction; quantity: number; note: string }) {
  await initializeInventory();
  const transaction = await db.transaction('write');
  try {
    const previous = await transaction.execute({ sql: 'SELECT * FROM stock_movements WHERE id=?', args: [input.id] });
    if (previous.rows.length) {
      const existing = movement(previous.rows[0]);
      if (existing.productId !== input.productId || existing.type !== input.type || existing.quantity !== input.quantity || existing.note !== input.note) {
        throw new InventoryError('Bu so‘rov boshqa o‘zgarish uchun ishlatilgan.', 409);
      }
      await transaction.commit(); return existing;
    }
    const result = await transaction.execute({ sql: 'SELECT products.*,(SELECT fields FROM categories WHERE categories.name=products.category LIMIT 1) AS category_fields FROM products WHERE id=?', args: [input.productId] });
    if (!result.rows.length) throw new InventoryError('Mahsulot topilmadi.', 404);
    const before = Number(result.rows[0].stock);
    const after = input.type === 'count' ? input.quantity : before + (input.type === 'in' ? input.quantity : -input.quantity);
    if (!Number.isSafeInteger(after) || after < 0 || after > 1000000000) throw new InventoryError('Qoldiq yetarli emas yoki miqdor juda katta.', 409);
    await transaction.execute({ sql: 'UPDATE products SET stock=? WHERE id=?', args: [after, input.productId] });
    await transaction.execute({ sql: `INSERT INTO stock_movements (id,product_id,product_name,type,quantity,delta,before_stock,after_stock,note)
      VALUES (?,?,?,?,?,?,?,?,?)`, args: [input.id, input.productId, productTitle(result.rows[0] as unknown as Product), input.type, input.quantity, after-before, before, after, input.note] });
    const saved = await transaction.execute({ sql: 'SELECT * FROM stock_movements WHERE id=?', args: [input.id] });
    await enqueueTelegram(transaction,input.productId);
    await transaction.commit(); return movement(saved.rows[0]);
  } catch (error) { await transaction.rollback(); throw error; }
  finally { transaction.close(); }
}
