import {productTitle} from './product-variants';
import type {Product} from './types';
import 'server-only';
import { enqueueTelegram } from './telegram-outbox';
import type { Transaction } from '@libsql/client';
import { db } from './db';
import { initializeInventory, InventoryError } from './inventory';
import { shiftDate, type SaleLineInput, type SaleReceipt, type SalesAnalytics, type SalesMetrics } from './sales-types';

let ready: Promise<void> | undefined;
export function initializeSales() {
  return ready ||= (async()=>{
    await initializeInventory();
    await db.execute(`CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, request_json TEXT NOT NULL, total INTEGER NOT NULL CHECK(total>=0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    await db.execute(`CREATE TABLE IF NOT EXISTS sale_items (
      sale_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity>0), unit_price INTEGER NOT NULL CHECK(unit_price>=0),
      line_total INTEGER NOT NULL CHECK(line_total>=0), PRIMARY KEY(sale_id,product_id))`);
    await db.execute('CREATE INDEX IF NOT EXISTS sales_created ON sales(created_at)');
    await db.execute('CREATE INDEX IF NOT EXISTS sale_items_product ON sale_items(product_id)');
  })().catch(error=>{ready=undefined;throw error;});
}
async function readReceipt(executor: Pick<Transaction,'execute'>, id: string): Promise<SaleReceipt> {
  const sale=await executor.execute({sql:'SELECT * FROM sales WHERE id=?',args:[id]});
  const lines=await executor.execute({sql:'SELECT * FROM sale_items WHERE sale_id=? ORDER BY rowid',args:[id]});
  return {id,total:Number(sale.rows[0].total),createdAt:String(sale.rows[0].created_at),items:lines.rows.map(row=>({productId:String(row.product_id),name:String(row.product_name),quantity:Number(row.quantity),unitPrice:Number(row.unit_price),total:Number(row.line_total)}))};
}
export async function confirmSale(id: string, items: SaleLineInput[]) {
  await initializeSales();
  const canonical=JSON.stringify([...items].sort((a,b)=>a.productId.localeCompare(b.productId)));
  const tx=await db.transaction('write');
  try {
    const existing=await tx.execute({sql:'SELECT request_json FROM sales WHERE id=?',args:[id]});
    if(existing.rows.length){
      if(existing.rows[0].request_json!==canonical)throw new InventoryError('Bu sotuv raqami boshqa savat uchun ishlatilgan.',409);
      const receipt=await readReceipt(tx,id);await tx.commit();return receipt;
    }
    const lines: (SaleLineInput & {name:string;before:number;after:number;total:number})[]=[];
    let total=0;
    for(const item of items){
      const result=await tx.execute({sql:'SELECT products.*,(SELECT fields FROM categories WHERE categories.name=products.category LIMIT 1) AS category_fields FROM products WHERE id=?',args:[item.productId]});
      const product=result.rows[0];
      if(!product)throw new InventoryError('Savatdagi mahsulot o‘chirilgan. Savatni tekshiring.',409);
      if(Number(product.price)!==item.unitPrice)throw new InventoryError(`${product.name}: narx o‘zgargan. Savat narxlarini yangilang.`,409);
      const before=Number(product.stock);
      if(before<item.quantity)throw new InventoryError(`${product.name}: omborda faqat ${before} dona qolgan.`,409);
      const lineTotal=item.quantity*item.unitPrice;total+=lineTotal;
      if(!Number.isSafeInteger(lineTotal)||!Number.isSafeInteger(total))throw new InventoryError('Sotuv summasi juda katta.');
      lines.push({...item,name:productTitle(product as unknown as Product),before,after:before-item.quantity,total:lineTotal});
    }
    await tx.execute({sql:'INSERT INTO sales(id,request_json,total) VALUES (?,?,?)',args:[id,canonical,total]});
    for(const line of lines){
      await tx.execute({sql:'UPDATE products SET stock=? WHERE id=?',args:[line.after,line.productId]});
      await enqueueTelegram(tx,line.productId);
      await tx.execute({sql:'INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)',args:[id,line.productId,line.name,line.quantity,line.unitPrice,line.total]});
      await tx.execute({sql:`INSERT INTO stock_movements(id,product_id,product_name,type,quantity,delta,before_stock,after_stock,note)
        VALUES (?,?,?,'sale',?,?,?,?,?)`,args:[`sale:${id}:${line.productId}`,line.productId,line.name,line.quantity,-line.quantity,line.before,line.after,`Sotuv: ${id}`]});
    }
    const receipt=await readReceipt(tx,id);await tx.commit();return receipt;
  } catch(error){await tx.rollback();throw error;}
  finally{tx.close();}
}
export async function recentSales(){
  await initializeSales();
  const rows=await db.execute('SELECT id FROM sales ORDER BY created_at DESC,rowid DESC LIMIT 50');
  const receipts:SaleReceipt[]=[];
  for(const row of rows.rows)receipts.push(await readReceipt(db,String(row.id)));
  return receipts;
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;}
export async function salesAnalytics(from:string,to:string):Promise<SalesAnalytics>{
  if(!validDate(from)||!validDate(to)||from>to)throw new InventoryError('Sanalar oralig‘ini tekshiring.');
  const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  if(days>366)throw new InventoryError('Bir yilgacha bo‘lgan davrni tanlang.');
  await initializeSales();
  const start=new Date(`${from}T00:00:00+05:00`).toISOString();
  const end=new Date(`${shiftDate(to,1)}T00:00:00+05:00`).toISOString();
  const previousStart=new Date(`${shiftDate(from,-days)}T00:00:00+05:00`).toISOString();
  async function metrics(a:string,b:string):Promise<SalesMetrics>{
    const result=await db.execute({sql:`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) sales,
      COALESCE((SELECT SUM(quantity) FROM sale_items JOIN sales ON sales.id=sale_items.sale_id WHERE sales.created_at>=? AND sales.created_at<?),0) units
      FROM sales WHERE created_at>=? AND created_at<?`,args:[a,b,a,b]});
    return {revenue:Number(result.rows[0].revenue),units:Number(result.rows[0].units),sales:Number(result.rows[0].sales)};
  }
  const [current,previous,daily,best,unsold,low]=await Promise.all([
    metrics(start,end),metrics(previousStart,start),
    db.execute({sql:`SELECT strftime('%Y-%m-%d',s.created_at,'+5 hours') date,SUM(s.total) revenue,COUNT(*) sales,
      SUM((SELECT SUM(quantity) FROM sale_items WHERE sale_id=s.id)) units FROM sales s WHERE s.created_at>=? AND s.created_at<? GROUP BY date ORDER BY date`,args:[start,end]}),
    db.execute({sql:`SELECT i.product_id,MAX(i.product_name) name,(SELECT stock FROM products WHERE id=i.product_id) stock,SUM(i.quantity) units,SUM(i.line_total) revenue
      FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.created_at>=? AND s.created_at<? GROUP BY i.product_id ORDER BY units DESC,revenue DESC LIMIT 10`,args:[start,end]}),
    db.execute({sql:`SELECT p.id,p.name,p.stock FROM products p WHERE p.stock>0 AND NOT EXISTS
      (SELECT 1 FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=p.id AND s.created_at>=? AND s.created_at<?) ORDER BY p.stock DESC,p.name LIMIT 20`,args:[start,end]}),
    db.execute('SELECT id,name,stock FROM products WHERE stock<=3 ORDER BY stock,name LIMIT 20'),
  ]);
  const trend=Array.from({length:days},(_,index)=>{const date=shiftDate(from,index);const row=daily.rows.find(row=>row.date===date);return {date,revenue:Number(row?.revenue||0),units:Number(row?.units||0),sales:Number(row?.sales||0)};});
  return {from,to,current,previous,trend,bestSellers:best.rows.map(row=>({productId:String(row.product_id),name:String(row.name),units:Number(row.units),revenue:Number(row.revenue),stock:row.stock==null?null:Number(row.stock)})),
    unsold:unsold.rows.map(row=>({productId:String(row.id),name:String(row.name),stock:Number(row.stock)})),lowStock:low.rows.map(row=>({productId:String(row.id),name:String(row.name),stock:Number(row.stock)}))};
}
