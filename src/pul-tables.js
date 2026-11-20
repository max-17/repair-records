// Typed business tables; pul_records remains only the shared identity/audit registry.
const tables={sale:'pul_sales',purchase:'pul_purchases',debt:'pul_debts',payment:'pul_payments',vendor:'pul_vendors'};
export function pulTable(kind){const table=tables[kind];if(!table)throw new Error('PUL_INVALID_KIND');return table;}
const common=`id TEXT PRIMARY KEY REFERENCES pul_records(id), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json))`;
const contact=`customer TEXT GENERATED ALWAYS AS (json_extract(snapshot_json,'$.customer')) VIRTUAL, phone TEXT GENERATED ALWAYS AS (json_extract(snapshot_json,'$.phone')) VIRTUAL`;
const currency=`currency TEXT GENERATED ALWAYS AS (json_extract(snapshot_json,'$.currency')) VIRTUAL CHECK(currency IS NULL OR currency IN ('UZS','USD'))`;
const total=`total_minor INTEGER GENERATED ALWAYS AS (json_extract(snapshot_json,'$.totalMinor')) VIRTUAL CHECK(total_minor IS NULL OR (typeof(total_minor)='integer' AND total_minor>=0))`;
export const pulRowsSql=`SELECT r.id,r.shop_id,r.kind,r.reference_id,b.snapshot_json AS data_json,r.worker_id,r.version,r.is_deleted,r.created_at,r.updated_at FROM pul_records r JOIN (
 SELECT id,snapshot_json FROM pul_sales UNION ALL SELECT id,snapshot_json FROM pul_purchases UNION ALL SELECT id,snapshot_json FROM pul_debts WHERE sale_id IS NULL UNION ALL SELECT id,snapshot_json FROM pul_payments UNION ALL SELECT id,snapshot_json FROM pul_vendors
) b ON b.id=r.id`;
export async function setupPulTables(db){
 const existing=(await db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pul_schema_versions'")).rows.length;
 if(existing&&(await db.execute('SELECT 1 FROM pul_schema_versions WHERE version=1')).rows.length)return;
 const tx=await db.transaction('write');
 try{
  await tx.batch([
   'CREATE TABLE IF NOT EXISTS pul_schema_versions(version INTEGER PRIMARY KEY)',
   `CREATE TABLE IF NOT EXISTS pul_vendors (${common}, name TEXT GENERATED ALWAYS AS (json_extract(snapshot_json,'$.vendor')) VIRTUAL)`,
   ...['pul_sales','pul_purchases'].map(table=>`CREATE TABLE IF NOT EXISTS ${table} (${common},${contact},${currency},${total})`),
   `CREATE TABLE IF NOT EXISTS pul_debts (${common},sale_id TEXT UNIQUE REFERENCES pul_sales(id),${contact},${currency},${total},principal_minor INTEGER NOT NULL DEFAULT 0 CHECK(principal_minor>=0))`,
   `CREATE TABLE IF NOT EXISTS pul_payments (${common},sale_id TEXT REFERENCES pul_sales(id),purchase_id TEXT REFERENCES pul_purchases(id),debt_id TEXT REFERENCES pul_debts(id),${currency},amount_minor INTEGER GENERATED ALWAYS AS (json_extract(snapshot_json,'$.amountMinor')) VIRTUAL CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND amount_minor>0)),method TEXT GENERATED ALWAYS AS (json_extract(snapshot_json,'$.method')) VIRTUAL CHECK(method IS NULL OR method IN ('cash','card','transfer')),CHECK(NOT(sale_id IS NOT NULL AND purchase_id IS NOT NULL)),CHECK(NOT(purchase_id IS NOT NULL AND debt_id IS NOT NULL)))`,
   `CREATE TABLE IF NOT EXISTS pul_items (record_id TEXT NOT NULL REFERENCES pul_records(id),record_version INTEGER NOT NULL,position INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('product','service')),quantity REAL NOT NULL CHECK(quantity>0),unit_minor INTEGER CHECK(unit_minor IS NULL OR unit_minor>=0),PRIMARY KEY(record_id,record_version,position))`
  ]);
  for(const [kind,table] of Object.entries(tables)){
   await tx.execute(`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Use soft deletion'); END`);
   await tx.execute(`CREATE TRIGGER IF NOT EXISTS ${table}_kind BEFORE INSERT ON ${table} WHEN NOT EXISTS(SELECT 1 FROM pul_records WHERE id=NEW.id AND kind='${kind}'${kind==='debt'?" OR id=NEW.id AND kind='sale' AND NEW.sale_id=NEW.id":''}) BEGIN SELECT RAISE(ABORT,'PUL_KIND_MISMATCH'); END`);
  }
  for(const action of ['UPDATE','DELETE'])await tx.execute(`CREATE TRIGGER IF NOT EXISTS pul_items_no_${action.toLowerCase()} BEFORE ${action} ON pul_items BEGIN SELECT RAISE(ABORT,'Item history is immutable'); END`);
  for(const action of ['INSERT','UPDATE'])await tx.execute(`CREATE TRIGGER IF NOT EXISTS pul_payments_target_${action.toLowerCase()} BEFORE ${action} ON pul_payments WHEN NOT EXISTS(
   SELECT 1 FROM pul_records payment JOIN pul_records target ON target.id=payment.reference_id AND target.shop_id=payment.shop_id WHERE payment.id=NEW.id AND payment.kind='payment' AND (
    (target.kind='sale' AND NEW.sale_id=target.id AND NEW.debt_id=target.id AND NEW.purchase_id IS NULL) OR
    (target.kind='debt' AND NEW.debt_id=target.id AND NEW.sale_id IS NULL AND NEW.purchase_id IS NULL) OR
    (target.kind='purchase' AND NEW.purchase_id=target.id AND NEW.sale_id IS NULL AND NEW.debt_id IS NULL)))
   BEGIN SELECT RAISE(ABORT,'PUL_PAYMENT_TARGET'); END`);

  await tx.execute('CREATE INDEX IF NOT EXISTS pul_payments_sale ON pul_payments(sale_id)');
  await tx.execute('CREATE INDEX IF NOT EXISTS pul_payments_debt ON pul_payments(debt_id)');
  await tx.execute('CREATE INDEX IF NOT EXISTS pul_payments_purchase ON pul_payments(purchase_id)');
  const imported=(await tx.execute('SELECT 1 FROM pul_schema_versions WHERE version=1')).rows.length;
  if(!imported){
   const rows=(await tx.execute('SELECT * FROM pul_records')).rows;
   // Parent rows first; all IDs, including audit and source references, remain unchanged.
   for(const kind of ['vendor','sale','purchase','debt','payment'])for(const row of rows.filter(r=>r.kind===kind))await writePulDetails(tx,row.id,kind,JSON.parse(row.data_json),row.reference_id);
   for(const row of rows.filter(r=>r.kind==='sale'))await refreshSaleDebt(tx,row.id);
   const importedRows=(await tx.execute(pulRowsSql)).rows;
   if(importedRows.length!==rows.length)throw new Error('PUL_SPLIT_ROW_COUNT');
   const originals=new Map(rows.map(row=>[row.id,row]));
   for(const row of importedRows)if(JSON.stringify(JSON.parse(row.data_json))!==JSON.stringify(JSON.parse(originals.get(row.id).data_json)))throw new Error('PUL_SPLIT_DATA_MISMATCH');
   await tx.execute('CREATE TABLE pul_legacy_records AS SELECT * FROM pul_records');
   for(const action of ['INSERT','UPDATE','DELETE'])await tx.execute(`CREATE TRIGGER pul_legacy_records_no_${action.toLowerCase()} BEFORE ${action} ON pul_legacy_records BEGIN SELECT RAISE(ABORT,'Migration archive is immutable'); END`);
   await tx.execute('ALTER TABLE pul_records DROP COLUMN data_json');
   await tx.execute('INSERT INTO pul_schema_versions VALUES(1)');
  }
  if((await tx.execute('PRAGMA foreign_key_check')).rows.length)throw new Error('PUL_SPLIT_FOREIGN_KEYS');
  await tx.commit();
 }finally{if(!tx.closed)await tx.rollback();}
}
export async function writePulDetails(tx,id,kind,data,referenceId){
 const table=pulTable(kind),json=JSON.stringify(data);
 if(kind==='payment'){
  const parent=(await tx.execute({sql:'SELECT kind,shop_id FROM pul_records WHERE id=?',args:[referenceId]})).rows[0];
  const own=(await tx.execute({sql:'SELECT shop_id FROM pul_records WHERE id=?',args:[id]})).rows[0];
  if(!parent||parent.shop_id!==own?.shop_id||!['sale','purchase','debt'].includes(parent.kind))throw new Error('PUL_PAYMENT_TARGET');
  await tx.execute({sql:`INSERT INTO pul_payments(id,snapshot_json,sale_id,purchase_id,debt_id) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json`,args:[id,json,parent.kind==='sale'?referenceId:null,parent.kind==='purchase'?referenceId:null,['debt','sale'].includes(parent.kind)?referenceId:null]});
 }else if(kind==='debt')await tx.execute({sql:`INSERT INTO pul_debts(id,snapshot_json,principal_minor) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json,principal_minor=excluded.principal_minor`,args:[id,json,data.totalMinor||0]});
 else await tx.execute({sql:`INSERT INTO ${table}(id,snapshot_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json`,args:[id,json]});
 if(['sale','purchase'].includes(kind)){
  // Preserve each historical item version; never delete prior item rows.
  const version=(await tx.execute({sql:'SELECT version FROM pul_records WHERE id=?',args:[id]})).rows[0].version;
  const items=(data.items||[]).map((item,position)=>({sql:'INSERT INTO pul_items VALUES(?,?,?,?,?,?,?)',args:[id,version,position,item.name,item.type,item.quantity,item.unitMinor??null]}));
  if(items.length)await tx.batch(items);
 }
 if(kind==='sale')await refreshSaleDebt(tx,id);
 if(kind==='payment'){
  const target=(await tx.execute({sql:'SELECT sale_id FROM pul_payments WHERE id=?',args:[id]})).rows[0]?.sale_id;
  if(target)await refreshSaleDebt(tx,target);
 }
}
export async function refreshSaleDebt(tx,id){
 const sale=(await tx.execute({sql:'SELECT snapshot_json FROM pul_sales WHERE id=?',args:[id]})).rows[0];if(!sale)return;
 const d=JSON.parse(sale.snapshot_json);
 const paid=(await tx.execute({sql:`SELECT p.snapshot_json FROM pul_payments p JOIN pul_records r ON r.id=p.id WHERE p.sale_id=? AND r.is_deleted=0`,args:[id]})).rows.map(r=>JSON.parse(r.snapshot_json));
 const initial=paid.filter(p=>!p.isRepayment&&p.source!=='vendor').reduce((s,p)=>s+(p.settledMinor||0),0);
 const principal=d.separateCurrencies?(d.openingDebtMinor||0):Math.max(0,(d.totalMinor||0)-(d.financedMinor||0)-initial);
 const snapshot={customer:d.customer??null,phone:d.phone??null,currency:d.currency??null,totalMinor:principal,dueDate:d.dueDate??null,reminderDate:d.reminderDate??null};
 await tx.execute({sql:`INSERT INTO pul_debts(id,sale_id,snapshot_json,principal_minor) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot_json=excluded.snapshot_json,principal_minor=excluded.principal_minor`,args:[id,id,JSON.stringify(snapshot),principal]});
}
