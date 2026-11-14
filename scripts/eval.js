import 'dotenv/config';
import {cases} from '../eval/uzbek.js';
import {geminiParser,todayInTashkent} from '../src/commands.js';
import {messageTiming} from '../src/memory.js';
const flag=process.argv.indexOf('--limit');
const limit=flag<0?cases.length:Number(process.argv[flag+1]);
if(!Number.isInteger(limit)||limit<1)throw new Error('Use --limit with a positive integer');
const parse=geminiParser(process.env);let passed=0,failed=0;
const interval=Number(process.env.EVAL_INTERVAL_MS||4000);
for(const [i,item]of cases.slice(0,limit).entries()){
 if(i)await new Promise(resolve=>setTimeout(resolve,interval));
 try{
  const plan=await parse(item.text,{state:item.state,timing:messageTiming(item.state,Date.now())});
  const mismatches=Object.entries(item.expected).filter(([k,v])=>{
   const expected=v==='TODAY'?todayInTashkent():v;
   return typeof expected==='string'?String(plan[k]).toLowerCase()!==expected.toLowerCase():plan[k]!==expected;
  });
  if(mismatches.length){failed++;console.log(`FAIL ${i+1}: ${mismatches.map(([k])=>k).join(', ')}`);}else{passed++;console.log(`PASS ${i+1}`);}
 }catch(error){failed++;console.log(`ERROR ${i+1}: ${error.name} (${error.statusCode||'no status'})`);}
}
console.log(JSON.stringify({passed,failed,total:passed+failed}));if(failed)process.exitCode=1;
