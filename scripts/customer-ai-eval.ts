import 'dotenv/config';
import assert from 'node:assert/strict';
import {planCustomerMessage,recommendCustomerProducts} from '../src/lib/customer-ai';
import {defaultSearchPreferences} from '../src/lib/customer-retrieval';
async function run(){
if(!process.argv.includes('--live'))throw new Error('Explicit --live required; this calls the configured Gemini API.');
const state={preferences:defaultSearchPreferences,messages:[],offeredIds:[],lastAt:0};
const plan=await planCustomerMessage('3 million so‘mgacha yangi Samsung, 8/256 telefon kerak',state,{inactivitySeconds:null});
assert.equal(plan.intent,'search');assert.equal(plan.preferences.maxPrice,3000000);assert.equal(plan.preferences.ramGb,8);assert.equal(plan.preferences.storageGb,256);assert.equal(plan.preferences.condition,'new');assert.equal(plan.preferences.brand,'Samsung');
const follow=await planCustomerMessage('Arzonrog‘i bormi?',{...state,preferences:plan.preferences,messages:[{role:'user',text:'3 milliongacha yangi Samsung 8/256'}]},{inactivitySeconds:15});
assert.equal(follow.preferences.maxPrice,3000000);assert.equal(follow.preferences.sort,'price_asc');assert.equal(follow.preferences.brand,'Samsung');
console.log('PASS: live Gemini extracts budget/specs/condition and preserves preferences for cheaper follow-up.');

}
run().catch(error=>{console.error('Live Gemini evaluation did not complete',{name:error.name,status:error.statusCode||null});process.exitCode=1;});
