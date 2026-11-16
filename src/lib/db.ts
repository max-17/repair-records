import {defaultCategoryFields,validateCategoryFields} from './category-fields';
import {isMobileDevice,variantKey} from './product-variants';
import 'server-only';
import { createTelegramTables, enqueueTelegram } from './telegram-outbox';
import { createClient } from '@libsql/client';
import { ensureProductCode } from './product-code';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Product, Shop, CategoryField, CategoryDefinition } from './types';
import { categories as defaultCategories } from './types';

// Explicit local mode isolates development data from Turso.
const local = process.env.NODE_ENV !== 'production' || process.env.INVENTORY_LOCAL_ONLY === 'true';
const databaseUrl=process.env.DATABASE_URL||process.env.TURSO_DATABASE_URL;
const databaseToken=process.env.DATABASE_TOKEN||process.env.TURSO_AUTH_TOKEN;
if(!local&&!databaseUrl)throw new Error('Production requires DATABASE_URL');
if (local) mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
export const db = createClient({ url: local ? `file:${resolve(process.cwd(), 'data/development.db').replaceAll('\\', '/')}` : databaseUrl!, authToken: local ? undefined : databaseToken });
let ready: Promise<void> | undefined;
const seed: Product[] = [
 {id:'iphone-15',name:'Apple iPhone 15',category:'Smartfonlar',brand:'Apple',price:9850000,oldPrice:10500000,stock:8,image:'https://images.unsplash.com/photo-1710023038502-ba80a70a9f53?w=700&q=85',description:'128 GB · Black. Yorqin Super Retina XDR ekran, 48 MP kamera va USB-C. Kundalik foydalanish uchun yangi iPhone.',featured:true,published:true},
 {id:'airpods-pro',name:'AirPods Pro 2',category:'Quloqchinlar',brand:'Apple',price:2850000,oldPrice:3200000,stock:12,image:'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=700&q=85',images:['https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=700&q=85','https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=700&q=85'],description:'USB-C · White. Faol shovqinni kamaytirish, tiniq ovoz va qulay simsiz tinglash.',featured:true,published:true},
 {id:'macbook-air',name:'MacBook Air M2',category:'Noutbuklar',brand:'Apple',price:12900000,oldPrice:0,stock:3,image:'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=700&q=85',description:'13.6 inch · 8/256 GB · Silver. Yengil korpus, M2 chip va ish uchun qulay Retina ekran.',featured:false,published:true},
 {id:'samsung-s24',name:'Samsung Galaxy S24',category:'Smartfonlar',brand:'Samsung',price:8900000,oldPrice:9500000,stock:6,image:'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=700&q=85',description:'256 GB · Gray. AMOLED ekran va kundalik suratlar uchun kuchli kamera.',featured:true,published:true},
 {id:'sony-headphones',name:'Sony WH-1000XM5',category:'Quloqchinlar',brand:'Sony',price:4200000,oldPrice:0,stock:5,image:'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=700&q=85',description:'Black · Wireless. Shovqinni kamaytiruvchi quloqchinlar, uzoq tinglashga mos qulay dizayn.',featured:false,published:true},
 {id:'apple-watch',name:'Apple Watch Series 9',category:'Soatlar',brand:'Apple',price:5100000,oldPrice:5600000,stock:4,image:'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=700&q=85',description:'45 mm · GPS. Kundalik faollik, bildirishnomalar va sog‘liq ko‘rsatkichlari bir joyda.',featured:false,published:true},
 {id:'anker-charger',name:'Anker Nano 30W',category:'Aksessuarlar',brand:'Anker',price:290000,oldPrice:350000,stock:18,image:'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=700&q=85',description:'USB-C · White. Telefon va boshqa mos qurilmalar uchun ixcham tezkor quvvatlagich.',featured:false,published:true},
 {id:'jbl-speaker',name:'JBL Go 4',category:'Aksessuarlar',brand:'JBL',price:690000,oldPrice:0,stock:0,image:'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=700&q=85',description:'Black · Bluetooth. Ixcham, ko‘chma dinamik. Mavjudlikni sotuvchidan aniqlang.',featured:false,published:true},
];
export function initialize() { return ready ||= (async () => {
 await db.execute('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, brand TEXT NOT NULL, price INTEGER NOT NULL, oldPrice INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL, description TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1)');
 await db.execute('CREATE TABLE IF NOT EXISTS shop (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
 await db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
 await db.execute("CREATE TABLE IF NOT EXISTS inventory_codes (code TEXT PRIMARY KEY, product_id TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))");
 await db.execute('CREATE TABLE IF NOT EXISTS categories (key TEXT PRIMARY KEY, name TEXT NOT NULL)');
 const columns = await db.execute('PRAGMA table_info(products)');
 if (!columns.rows.some(column => column.name === 'images')) {
  try { await db.execute("ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]'"); }
  catch (error) { const updated = await db.execute('PRAGMA table_info(products)'); if (!updated.rows.some(column => column.name === 'images')) throw error; }
 }
 for (const [name, definition] of [['sku', "TEXT NOT NULL DEFAULT ''"], ['barcode', "TEXT NOT NULL DEFAULT ''"], ['customFields', "TEXT NOT NULL DEFAULT '[]'"], ['modelId',"TEXT NOT NULL DEFAULT ''"], ['color',"TEXT NOT NULL DEFAULT ''"], ['ramGb','INTEGER'], ['storageGb','INTEGER'], ['condition',"TEXT NOT NULL DEFAULT ''"], ['variantKey',"TEXT NOT NULL DEFAULT ''"], ['purchasePrice','INTEGER'], ['categoryValues',"TEXT NOT NULL DEFAULT '{}'"]]) {
  if (!columns.rows.some(column => column.name === name)) {
   try { await db.execute(`ALTER TABLE products ADD COLUMN ${name} ${definition}`); }
   catch(error) { const current=await db.execute('PRAGMA table_info(products)'); if(!current.rows.some(c=>c.name===name))throw error; }
  }
 }
 await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS product_variant_unique ON products(modelId,variantKey) WHERE modelId<>''");
 await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS product_sku_unique ON products(sku) WHERE sku<>''");
 await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS product_barcode_unique ON products(barcode) WHERE barcode<>''");
 await db.execute('CREATE TABLE IF NOT EXISTS image_cleanup (url TEXT PRIMARY KEY)');
 await createTelegramTables(db);
 const seeded = await db.execute("SELECT value FROM metadata WHERE key = 'seeded'");
 if (!seeded.rows.length) await db.batch([...seed.map(p => ({sql:'INSERT OR IGNORE INTO products (id,name,category,brand,price,oldPrice,stock,image,description,featured,published,images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',args:[p.id,p.name,p.category,p.brand,p.price,p.oldPrice,p.stock,p.image,p.description,Number(p.featured),Number(p.published),JSON.stringify(p.images || [p.image])]})),{sql:'INSERT OR IGNORE INTO shop VALUES (1, ?)',args:[JSON.stringify({name:'TechSpace',tagline:'Texnologiya yaqinroq.',phone:'+998901234567',telegram:'techspace_demo',address:'Toshkent, Malika savdo markazi, A-12',hours:'Har kuni, 09:00 – 20:00'})]},{sql:"INSERT OR IGNORE INTO metadata VALUES ('seeded', '1')",args:[]}], 'write');
 const migrated = await db.execute("SELECT value FROM metadata WHERE key = 'product-images-v1'");
 if (!migrated.rows.length) {
  const old = await db.execute("SELECT id,image FROM products WHERE images = '[]' AND image <> ''");
  await db.batch([...old.rows.map(p => ({sql:'UPDATE products SET images=? WHERE id=?',args:[JSON.stringify([String(p.image)]),String(p.id)]})),{sql:"INSERT OR IGNORE INTO metadata VALUES ('product-images-v1','1')",args:[]}], 'write');
 }
 const categoryColumns=await db.execute('PRAGMA table_info(categories)');
 if(!categoryColumns.rows.some(column=>column.name==='fields')){try{await db.execute("ALTER TABLE categories ADD COLUMN fields TEXT NOT NULL DEFAULT '[]'");}catch(error){const current=await db.execute('PRAGMA table_info(categories)');if(!current.rows.some(column=>column.name==='fields'))throw error;}}
 const existingCategories=await db.execute('SELECT DISTINCT category FROM products');
 const categoryNames=[...new Set([...defaultCategories,...existingCategories.rows.map(row=>String(row.category))])];
 await db.batch(categoryNames.map(name=>({sql:'INSERT OR IGNORE INTO categories (key,name,fields) VALUES (?,?,?)',args:[categoryKey(name),name,JSON.stringify(defaultCategoryFields(name))]})),'write');
 const fieldMigration=await db.execute("SELECT value FROM metadata WHERE key='category-fields-v1'");
 if(!fieldMigration.rows.length){const categories=await db.execute('SELECT key,name,fields FROM categories');await db.batch([...categories.rows.filter(row=>String(row.fields)==='[]'&&defaultCategoryFields(String(row.name)).length).map(row=>({sql:'UPDATE categories SET fields=? WHERE key=?',args:[JSON.stringify(defaultCategoryFields(String(row.name))),String(row.key)]})),{sql:"INSERT OR IGNORE INTO metadata(key,value) VALUES('category-fields-v1','1')",args:[]}],'write');}
 })().catch(error => { ready = undefined; throw error; }); }
export function categoryKey(name:string){return name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('uz');}
export async function getCategories():Promise<string[]>{await initialize();const result=await db.execute('SELECT name FROM categories ORDER BY rowid');return result.rows.map(row=>String(row.name));}
export async function getCategoryDefinitions():Promise<CategoryDefinition[]>{await initialize();const result=await db.execute('SELECT name,fields FROM categories ORDER BY rowid');return result.rows.map(row=>({name:String(row.name),fields:JSON.parse(String(row.fields||'[]')) as CategoryField[]}));}
export async function addCategory(name:string,fields:CategoryField[]=defaultCategoryFields(name)):Promise<boolean>{await initialize();const result=await db.execute({sql:'INSERT OR IGNORE INTO categories(key,name,fields) VALUES(?,?,?)',args:[categoryKey(name),name,JSON.stringify(validateCategoryFields(fields))]});return result.rowsAffected>0;}
export async function updateCategoryFields(name:string,fields:CategoryField[]):Promise<boolean>{await initialize();const result=await db.execute({sql:'UPDATE categories SET fields=? WHERE key=?',args:[JSON.stringify(validateCategoryFields(fields)),categoryKey(name)]});return result.rowsAffected>0;}
export async function getProducts(all = false): Promise<Product[]> {
 await initialize();
 const [result,definitions]=await Promise.all([db.execute(`SELECT * FROM products ${all?'':'WHERE published=1'} ORDER BY rowid`),getCategoryDefinitions()]);
 const labelsByCategory=new Map(definitions.map(category=>[category.name,Object.fromEntries(category.fields.map(field=>[field.id,field.label]))]));
 return result.rows.map(row=>{
  const product={...row,images:JSON.parse(String(row.images||'[]')),customFields:JSON.parse(String(row.customFields||'[]')),categoryValues:JSON.parse(String(row.categoryValues||'{}')),categoryFieldLabels:labelsByCategory.get(String(row.category))||{},featured:!!row.featured,published:!!row.published} as unknown as Product;
  if(!all)delete product.purchasePrice;
  return product;
 });
}
export async function saveProduct(p: Product) { await initialize(); const statement=()=>({sql:'INSERT INTO products (id,name,category,brand,price,oldPrice,stock,image,description,featured,published,images,sku,barcode,customFields,modelId,color,ramGb,storageGb,condition,variantKey,purchasePrice,categoryValues) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, brand=excluded.brand, price=excluded.price, oldPrice=excluded.oldPrice,  image=excluded.image, description=excluded.description, featured=excluded.featured, published=excluded.published, images=excluded.images, sku=excluded.sku, barcode=excluded.barcode, customFields=excluded.customFields, modelId=excluded.modelId, color=excluded.color, ramGb=excluded.ramGb, storageGb=excluded.storageGb, condition=excluded.condition, variantKey=excluded.variantKey,purchasePrice=excluded.purchasePrice,categoryValues=excluded.categoryValues',args:[p.id,p.name,p.category,p.brand,p.price,p.oldPrice,p.stock,p.image,p.description,Number(p.featured),Number(p.published),JSON.stringify(p.images || (p.image ? [p.image] : [])),p.sku||'',p.barcode||'',JSON.stringify(p.customFields||[]),p.modelId||'',p.color||'',p.ramGb??null,p.storageGb??null,p.condition||'',variantKey(p),p.purchasePrice??null,JSON.stringify(p.categoryValues||{})]});
 const changes=[];
 if(p.hero===true)changes.push({sql:"UPDATE shop SET data=json_set(data,'$.heroProductId',?,'$.heroMode','custom') WHERE id=1",args:[p.id]});
 if(p.hero===false||!p.published)changes.push({sql:"UPDATE shop SET data=json_set(data,'$.heroProductId','') WHERE id=1 AND json_extract(data,'$.heroProductId')=?",args:[p.id]});
 const transaction=await db.transaction('write');
 try{
  const previous=await transaction.execute({sql:'SELECT * FROM products WHERE id=?',args:[p.id]});
  const previousProduct=previous.rows[0];
  const wantsGroup=p.modelId!==undefined;
  if(p.purchasePrice===undefined)p.purchasePrice=previousProduct?.purchasePrice==null?null:Number(previousProduct.purchasePrice);
  p.categoryValues ??= JSON.parse(String(previousProduct?.categoryValues||'{}'));
  p.modelId ??= String(previousProduct?.modelId||'');
  p.color ??= String(previousProduct?.color||'');
  if(p.ramGb===undefined)p.ramGb=previousProduct?.ramGb==null?null:Number(previousProduct.ramGb);
  if(p.storageGb===undefined)p.storageGb=previousProduct?.storageGb==null?null:Number(previousProduct.storageGb);
  p.condition ??= (String(previousProduct?.condition||'') as Product['condition']);
  if(!isMobileDevice(p.category)){p.modelId='';p.color='';p.ramGb=null;p.storageGb=null;p.condition='';}
  else {
   const hasAttributes=Boolean(p.color||p.ramGb||p.storageGb||p.condition||Object.keys(p.categoryValues||{}).length);
   if(p.modelId){
    const group=await transaction.execute({sql:'SELECT name,category,brand FROM products WHERE modelId=? LIMIT 1',args:[p.modelId]});
    const model=group.rows[0];
    if(!model)throw new Error('PRODUCT_MODEL_NOT_FOUND');
    if(model.name!==p.name||model.category!==p.category||model.brand!==p.brand)throw new Error('PRODUCT_MODEL_MISMATCH');
   }else if(wantsGroup||hasAttributes){p.modelId=crypto.randomUUID();}
   if(p.modelId){
    const duplicate=await transaction.execute({sql:'SELECT id FROM products WHERE modelId=? AND variantKey=? AND id<>?',args:[p.modelId,variantKey(p),p.id]});
    if(duplicate.rows.length)throw new Error('PRODUCT_VARIANT_CONFLICT');
   }
  }
  p.sku ??= String(previous.rows[0]?.sku||'');
  p.barcode ??= String(previous.rows[0]?.barcode||'');
  p.customFields ??= JSON.parse(String(previous.rows[0]?.customFields||'[]'));
  if(p.sku) {
   const duplicate=await transaction.execute({sql:'SELECT id FROM products WHERE sku=? AND id<>?',args:[p.sku,p.id]});
   if(duplicate.rows.length)throw new Error('PRODUCT_SKU_CONFLICT');
  }
  p.inventoryCode=await ensureProductCode(transaction,p.id);
  if(p.barcode) {
   const duplicate=await transaction.execute({sql:'SELECT product_id FROM inventory_codes WHERE code=?',args:[p.barcode]});
   if(duplicate.rows.length&&String(duplicate.rows[0].product_id)!==p.id)throw new Error('PRODUCT_BARCODE_CONFLICT');
   await transaction.execute({sql:'INSERT OR IGNORE INTO inventory_codes(code,product_id) VALUES (?,?)',args:[p.barcode,p.id]});
  }
  await transaction.execute({sql:"INSERT OR IGNORE INTO image_cleanup(url) SELECT value FROM products,json_each(products.images) WHERE products.id=? AND value<>''",args:[p.id]});
  await transaction.execute({sql:"INSERT OR IGNORE INTO image_cleanup(url) SELECT image FROM products WHERE id=? AND image<>''",args:[p.id]});
  for(const change of [statement(),...changes])await transaction.execute(change);
  if(p.stockCount!==undefined||!previous.rows.length){
   const before=Number(previous.rows[0]?.stock||0),after=p.stockCount??p.stock;
   if(before!==after){await transaction.execute({sql:'UPDATE products SET stock=? WHERE id=?',args:[after,p.id]});await transaction.execute({sql:'INSERT INTO stock_movements(id,product_id,product_name,type,quantity,delta,before_stock,after_stock,note) VALUES (?,?,?,?,?,?,?,?,?)',args:[crypto.randomUUID(),p.id,p.name,previous.rows.length?'count':'opening',after,after-before,before,after,p.stockNote?.trim()||'']});}
  }
  await enqueueTelegram(transaction,p.id,!previous.rows.length||(!previous.rows[0].published&&p.published));
  await transaction.commit();
 }catch(error){await transaction.rollback();throw error;}finally{transaction.close();} }
export async function deleteProduct(id: string) { await initialize(); await db.batch([{sql:"INSERT OR IGNORE INTO image_cleanup(url) SELECT value FROM products,json_each(products.images) WHERE products.id=? AND value<>''",args:[id]},{sql:"INSERT OR IGNORE INTO image_cleanup(url) SELECT image FROM products WHERE id=? AND image<>''",args:[id]},{sql:`INSERT INTO telegram_jobs(product_id,channel_id,allow_create) SELECT ?,id,0 FROM telegram_channels WHERE 1=1 ON CONFLICT(product_id,channel_id) DO UPDATE SET revision=telegram_jobs.revision+1,status=CASE WHEN telegram_jobs.status IN ('working','uncertain') THEN telegram_jobs.status ELSE 'pending' END,next_attempt=0`,args:[id]},{sql:'UPDATE inventory_codes SET product_id=NULL WHERE product_id=?',args:[id]},{sql:'DELETE FROM products WHERE id = ?',args:[id]}],'write'); }
export async function getShop(): Promise<Shop> { await initialize(); const result=await db.execute('SELECT data FROM shop WHERE id=1'); return JSON.parse(String(result.rows[0].data)); }
export async function saveShop(shop: Shop) { await initialize(); await db.batch([{sql:'UPDATE shop SET data=? WHERE id=1',args:[JSON.stringify(shop)]},{sql:`INSERT INTO telegram_jobs(product_id,channel_id,allow_create) SELECT p.product_id,p.channel_id,0 FROM telegram_posts p JOIN telegram_channels c ON c.id=p.channel_id WHERE 1=1 ON CONFLICT(product_id,channel_id) DO UPDATE SET revision=telegram_jobs.revision+1,status=CASE WHEN telegram_jobs.status IN ('working','uncertain') THEN telegram_jobs.status ELSE 'pending' END,next_attempt=0`,args:[]}],'write'); }
