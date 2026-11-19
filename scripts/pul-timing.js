// One fictional text example. Live Google call; disposable local DB; no Telegram sends.
import 'dotenv/config';
import {performance} from 'node:perf_hooks';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {setup} from '../src/db.js';
import {setupStaff,staffAccess} from '../src/staff-auth.js';
import {pulParser} from '../src/pul-parser.js';
import {pulService} from '../src/pul.js';
import {pulRows} from '../src/pul-db.js';
const streaming=process.argv.includes('--stream');
const sample='Bekzod akaga iPhone 13 Pro ni 5 million so‘mga sotdim. 1 million naqd oldim, 4 million kartadan kartaga o‘tkazdi.';
const directory=await mkdtemp(join(tmpdir(),'pul-timing-')),client=createClient({url:`file:${join(directory,'db')}`});
const spans=[];let phase='setup';
function record(stage,ms,extra={}){spans.push({phase,stage,ms,...extra});}
function instrument(target){return new Proxy(target,{get(obj,key){const value=Reflect.get(obj,key);if(['execute','batch','transaction','commit','rollback'].includes(key))return async(...args)=>{const start=performance.now();try{const result=await value.apply(obj,args);return key==='transaction'?instrument(result):result;}finally{record('db_'+key,performance.now()-start);}};return typeof value==='function'?value.bind(obj):value;}});}
const db=instrument(client),env={...process.env,TELEGRAM_MASTERS:'{"42":"owner"}',PUL_OWNER_USER_IDS:'42',PUL_SHOP_ID:'timing-example',NODE_ENV:'test'};
const http=[];
const fetcher=async(...args)=>{
 const start=performance.now(),response=await fetch(...args);const row={headersMs:performance.now()-start,status:response.status,bytes:0};http.push(row);
 if(!response.body)return response;
 const reader=response.body.getReader();const stream=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();if(done){row.completeMs=performance.now()-start;controller.close();return;}if(row.firstBodyMs==null)row.firstBodyMs=performance.now()-start;row.bytes+=value.byteLength;controller.enqueue(value);}catch(e){controller.error(e);}},cancel(reason){return reader.cancel(reason);}});
 return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
};
try{
 let start=performance.now();await setup(db);await setupStaff(db,env);const setupMs=performance.now()-start;
 const parse=pulParser(env,{fetcher,streaming,onTiming:e=>record(e.stage,e.ms,{inputTokens:e.inputTokens,outputTokens:e.outputTokens,reasoningTokens:e.reasoningTokens})});
 const run=pulService({db,env,authorize:id=>staffAccess(db,env,id),parse,onTiming:e=>record(e.stage,e.ms)});
 phase='draft';start=performance.now();const draft=await run({text:sample,requestId:'timing-draft',conversationId:'timing-chat',receivedBy:'42',receivedByName:'Test worker',chatId:42});const draftMs=performance.now()-start;
 const token=draft.reply_markup?.inline_keyboard.flat().find(b=>b.callback_data.startsWith('pul_confirm:'))?.callback_data.split(':')[1];
 if(!token)throw new Error('NO_REVIEW');
 phase='confirmation';start=performance.now();await run({text:'/pul_confirm '+token,requestId:'timing-confirm',conversationId:'timing-chat',receivedBy:'42',receivedByName:'Test worker',chatId:42});const confirmMs=performance.now()-start;
 const rows=await pulRows(db,'timing-example');if(rows.filter(r=>r.kind==='sale').length!==1)throw new Error('INVALID_RESULT');
 const dbStats=p=>{const selected=spans.filter(s=>s.phase===p&&s.stage.startsWith('db_'));return {calls:selected.length,ms:selected.reduce((n,s)=>n+s.ms,0)};};
 const report={sample,mode:streaming?'streaming':'non-streaming',model:env.GEMINI_MODEL||'gemini-3.5-flash-lite',setupMs,draftMs,confirmMs,db:{setup:dbStats('setup'),draft:dbStats('draft'),confirmation:dbStats('confirmation')},parser:spans.filter(s=>!s.stage.startsWith('db_')),googleHttp:http,telegramDelivery:'not sent; not measured',database:'isolated local SQLite; excludes Turso network latency'};
 await writeFile(streaming?'/tmp/pul-one-example-stream-timing.json':'/tmp/pul-one-example-timing.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){console.log(JSON.stringify({error:e.name,code:e.statusCode||e.code||null}));process.exitCode=1;}
finally{client.close();await rm(directory,{recursive:true,force:true});}
