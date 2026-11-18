import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numericProductName,numericProductPlan} from '../src/pul-product-numbers.js';
test('spoken Uzbek model and capacity numbers become digits',()=>{
 assert.equal(numericProductName("iPhone o'n uch pro"),'iPhone 13 pro');
 assert.equal(numericProductName('iPhone o‘n to‘rt Pro Max'),'iPhone 14 Pro Max');
 assert.equal(numericProductName('Redmi Note o‘n ikki'),'Redmi Note 12');
 assert.equal(numericProductName('Samsung yigirma uch Ultra'),'Samsung 23 Ultra');
 assert.equal(numericProductName('iPhone 13 Pro ikki yuz ellik olti GB'),'iPhone 13 Pro 256 GB');
});
test('digit normalization preserves existing identifiers and original customer/source text',()=>{
 assert.equal(numericProductName('OnePlus 13 / iPhone 14 Pro / 8/256'),'OnePlus 13 / iPhone 14 Pro / 8/256');
 const original={customer:'Uchqun aka',description:"o'n uch",items:[{name:"iPhone o'n uch pro",quantity:1,type:'product',unit_price:null}]};
 const result=numericProductPlan(original);assert.equal(result.customer,'Uchqun aka');assert.equal(result.description,"o'n uch");assert.equal(original.items[0].name,"iPhone o'n uch pro");assert.equal(result.items[0].name,'iPhone 13 pro');
});
