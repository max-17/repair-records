import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {variantDescription,productTitle} from '../src/lib/product-variants';
import {applyCategoryValues,normalizeCategoryValues,validateCategoryFields,validateRequiredProductFields} from '../src/lib/category-fields';
import type {Product} from '../src/lib/types';

test('category field definitions validate typed optional inputs and required public product fields',()=>{
 const fields=validateCategoryFields([{id:'memory',label:'RAM / Xotira',type:'text'},{id:'color',label:'Rang',type:'text'},{id:'length',label:'Uzunlik',type:'number'},{id:'condition',label:'Holat',type:'select',options:['Yangi','Ishlatilgan']}]);
 assert.deepEqual(normalizeCategoryValues(fields,{}),{});
 assert.deepEqual(normalizeCategoryValues(fields,{memory:'',length:null}),{});
 const p={id:'validation'} as Product;
 applyCategoryValues(p,fields,normalizeCategoryValues(fields,{memory:'8/256',color:' Qora ',length:1.5,condition:'Ishlatilgan'}));
 assert.equal(p.ramGb,8);assert.equal(p.storageGb,256);assert.equal(p.color,'Qora');assert.equal(p.condition,'used');assert.equal(p.categoryValues?.length,1.5);
 assert.throws(()=>normalizeCategoryValues(fields,{length:'1.5'}),/raqam/);
 assert.throws(()=>normalizeCategoryValues(fields,{memory:'8-256'}),/8\/256/);
 assert.throws(()=>normalizeCategoryValues(fields,{memory:'999/256'}),/juda katta/);
 assert.throws(()=>normalizeCategoryValues(fields,{condition:'Unknown'}),/ro‘yxatdagi/);
 assert.throws(()=>normalizeCategoryValues(fields,{unknown:'value'}),/mavjud bo‘lmagan/);
 assert.throws(()=>validateCategoryFields([{id:'same',label:'A',type:'text'},{id:'same',label:'B',type:'text'}]),/takrorlanmasin/);
 assert.throws(()=>validateCategoryFields([{id:'selection',label:'Tanlash',type:'select',options:[]}]),/variant/);
 const required={name:'Product',price:10,purchasePrice:0,description:'Description',images:['https://shop.example/product.jpg']};
 assert.doesNotThrow(()=>validateRequiredProductFields(required));
 for(const key of ['name','price','purchasePrice','description','images'] as const){const invalid={...required,[key]:undefined};assert.throws(()=>validateRequiredProductFields(invalid));}
 assert.throws(()=>validateRequiredProductFields({...required,description:' '}));assert.throws(()=>validateRequiredProductFields({...required,images:[]}));
});

test('category definitions persist, legacy products retain unknown costs and public products omit private purchase price',async()=>{
 const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),'category-fields-'));const previous=process.env.INVENTORY_LOCAL_ONLY;let database:typeof import('../src/lib/db')|undefined;
 try{
  process.chdir(folder);process.env.INVENTORY_LOCAL_ONLY='true';database=await import('../src/lib/db');
  const {initializeInventory}=await import('../src/lib/inventory');await initializeInventory();
  const defaults=await database.getCategoryDefinitions();assert.deepEqual(defaults.find(c=>c.name==='Smartfonlar')?.fields.map(f=>f.id),['memory','color','condition']);
  assert(await database.addCategory('Kabellar',[{id:'length',label:'Uzunlik, m',type:'number'}]));
  assert.equal(await database.addCategory('Kabellar',[]),false);
  assert(await database.updateCategoryFields('Kabellar',[{id:'length',label:'Uzunlik, m',type:'number'},{id:'color',label:'Rang',type:'text'}]));
  assert.equal((await database.getCategoryDefinitions()).find(c=>c.name==='Kabellar')?.fields.length,2);
  const p:Product={id:'category-test',name:'USB cable',category:'Kabellar',brand:'',price:100,purchasePrice:55,stock:2,oldPrice:0,image:'https://shop.example/cable.jpg',images:['https://shop.example/cable.jpg'],description:'Cable',published:true,featured:false,categoryValues:{length:1.5,color:'Oq'}};
  await database.saveProduct(p);
  const publicProduct=(await database.getProducts(false)).find(product=>product.id===p.id)!;assert(!Object.hasOwn(publicProduct,'purchasePrice'));assert.deepEqual(publicProduct.categoryValues,{length:1.5,color:'Oq'});assert.equal(publicProduct.categoryFieldLabels?.length,'Uzunlik, m');assert.match(productTitle(publicProduct),/Uzunlik, m: 1.5/);
  const adminProduct=(await database.getProducts(true)).find(product=>product.id===p.id)!;assert.equal(adminProduct.purchasePrice,55);
  const update={...p,price:120,purchasePrice:undefined,categoryValues:undefined};await database.saveProduct(update);
  const persisted=(await database.getProducts(true)).find(product=>product.id===p.id)!;assert.equal(persisted.purchasePrice,55);assert.deepEqual(persisted.categoryValues,p.categoryValues);
  const {confirmSale}=await import('../src/lib/sales');const receipt=await confirmSale('category-display-sale',[{productId:p.id,quantity:1,unitPrice:120}]);assert.match(receipt.items[0].name,/Uzunlik, m: 1.5/);
  const {adjustStock}=await import('../src/lib/inventory');const movement=await adjustStock({id:'category-display-stock',productId:p.id,type:'in',quantity:1,note:''});assert.match(movement.productName,/Uzunlik, m: 1.5/);
  const legacy=(await database.getProducts(true)).find(product=>product.id==='iphone-15')!;assert.equal(legacy.purchasePrice,null);
  const blank:Product={...p,id:'optional-phone',name:'Optional phone',category:'Smartfonlar',modelId:undefined,purchasePrice:null,categoryValues:{},color:'',ramGb:null,storageGb:null,condition:''};await database.saveProduct(blank);assert.equal((await database.getProducts(true)).find(product=>product.id===blank.id)?.modelId,'');
  const explicit:Product={...blank,id:'explicit-optional-model',name:'Optional model',modelId:''};await database.saveProduct(explicit);assert(explicit.modelId);
  const partial:Product={...explicit,id:'partial-optional-variant',color:'Qora',categoryValues:{color:'Qora'}};await database.saveProduct(partial);assert.equal(partial.modelId,explicit.modelId);
  await assert.rejects(database.saveProduct({...explicit,id:'duplicate-empty-variant'}),/PRODUCT_VARIANT_CONFLICT/);
  const lengthVariant:Product={...explicit,id:'length-one',categoryValues:{length:1}};await database.saveProduct(lengthVariant);assert.equal(lengthVariant.modelId,explicit.modelId);
  const lengthTwo:Product={...explicit,id:'length-two',categoryValues:{length:2}};await database.saveProduct(lengthTwo);
  await assert.rejects(database.saveProduct({...explicit,id:'length-duplicate',categoryValues:{length:' 1 '}}),/PRODUCT_VARIANT_CONFLICT/);

 }finally{database?.db.close();process.chdir(cwd);if(previous===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=previous;await rm(folder,{recursive:true,force:true});}
});
