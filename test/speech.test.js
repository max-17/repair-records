import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setup} from '../src/db.js';
import {groqTranscriber,voiceService,SpeechInputError} from '../src/speech.js';
import {telegramPresentation} from '../src/tasks.js';
import {commandService} from '../src/commands.js';
const blank={action:'clarify',customer:null,device:null,work:null,price_uzs:null,due_date:null,status:null,start_date:null,end_date:null,question:null};
async function withDb(fn){const dir=await mkdtemp(join(tmpdir(),'speech-'));const db=createClient({url:`file:${join(dir,'test.db')}`});try{await setup(db);await fn(db);}finally{db.close();await rm(dir,{recursive:true,force:true});}}
const env={GROQ_API_KEY:'test-groq',TELEGRAM_BOT_TOKEN:'test-bot'};
const voice={file_id:'test-file',duration:5,file_size:100};
test('Whisper gets uploaded bytes and Uzbek language without receiving the Telegram bot URL',async()=>{
 let options,calls=0;
 const run=groqTranscriber(env,{fetcher:async url=>{calls++;if(calls===1){assert.ok(url.startsWith('https://api.telegram.org/'));return Response.json({ok:true,result:{file_path:'voice/test.oga',file_size:4}});}assert.ok(url.startsWith('https://api.telegram.org/file/'));return new Response(new Uint8Array([79,103,103,83]));},recognize:async value=>{options=value;return {text:'Bekzod aka Samsung S23'};}});
 assert.equal(await run(voice),'Bekzod aka Samsung S23');assert.ok(Buffer.isBuffer(options.audio));assert.equal(options.providerOptions.groq.language,'uz');assert.equal(options.model.modelId,'whisper-large-v3');assert.equal(options.maxRetries,0);assert.ok(!JSON.stringify(options.providerOptions).includes('test-bot'));
});
test('speech rejects missing keys, oversized clips, path traversal, and empty audio before interpretation',async()=>{
 let fetched=false;
 await assert.rejects(groqTranscriber({}, {fetcher:async()=>{fetched=true;}})(voice),SpeechInputError);assert.equal(fetched,false);
 await assert.rejects(groqTranscriber(env)({...voice,duration:121}),SpeechInputError);
 await assert.rejects(groqTranscriber(env)({...voice,file_size:11*1024*1024}),SpeechInputError);
 const traversal=groqTranscriber(env,{fetcher:async()=>Response.json({ok:true,result:{file_path:'../secret'}})});await assert.rejects(traversal(voice),SpeechInputError);
 let i=0;const empty=groqTranscriber(env,{fetcher:async()=>++i===1?Response.json({ok:true,result:{file_path:'voice/a.ogg'}}):new Response(new Uint8Array())});await assert.rejects(empty(voice),SpeechInputError);
});
test('authorized voice commands execute directly once without preview or confirmation buttons',()=>withDb(async db=>{
 let transcripts=0,parses=0;
 const command=commandService({db,parse:async text=>{parses++;return text==='Narxi 200 ming bo‘lsin'?{...blank,action:'update',customer:'Bekzod',device:'Samsung S23',price_uzs:200000}:{...blank,action:'create',customer:'Bekzod',device:'Samsung S23',work:'Ekran',price_uzs:300000};}});
 const run=voiceService({db,transcribeVoice:async clip=>{transcripts++;return clip.file_id==='price'?'Narxi 200 ming bo‘lsin':'Bekzod Samsung S23 ekran 300 ming';},runCommand:command});
 const send=(requestId,args)=>run({masterId:'owner',conversationId:'chat',requestId,...args});
 const first=await send('1',{voice});assert.equal(first.kind,'created');assert.equal(parses,1);assert.ok(!telegramPresentation(first).reply_markup);
 assert.deepEqual(await send('1',{voice}),first);assert.equal(transcripts,1);assert.equal(parses,1);
 const updated=await send('2',{voice:{...voice,file_id:'price'}});assert.equal(updated.kind,'updated');assert.equal(updated.repair.price_uzs,200000);assert.ok(!telegramPresentation(updated).reply_markup);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,1);
 assert.equal((await db.execute('SELECT count(*) AS n FROM voice_drafts')).rows[0].n,0);
 assert.equal((await db.execute("SELECT count(*) AS n FROM repair_events WHERE event_type='updated'")).rows[0].n,1);
 await assert.rejects(send('1',{voice:{...voice,file_id:'changed'}}),/REQUEST_CONFLICT/);
}));
test('unclear voice asks for missing details and failed transcription does not execute commands',()=>withDb(async db=>{
 let fail=false,calls=0;
 const run=voiceService({db,transcribeVoice:async()=>{if(fail)throw new Error('provider');return 'Bekzoddan telefon oldim';},runCommand:commandService({db,parse:async()=>{calls++;return {...blank,action:'create',customer:'Bekzod'};}})});
 const send=(requestId,args)=>run({masterId:'owner',conversationId:'chat',requestId,...args});
 const unclear=await send('1',{voice});assert.equal(unclear.kind,'clarify');assert.match(unclear.reply,/Telefon modeli/);assert.ok(!telegramPresentation(unclear).reply_markup);
 fail=true;assert.equal((await send('2',{voice:{...voice,file_id:'failed'}})).kind,'speech_error');assert.equal(calls,1);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,0);
}));
test('voice retry reuses transcript and original command ID after a lost execution response',()=>withDb(async db=>{
 let transcriptions=0,parses=0,attempts=0;
 const command=commandService({db,parse:async()=>{parses++;return {...blank,action:'create',customer:'Bekzod',device:'Phone',work:'Screen'};}});
 const run=voiceService({db,transcribeVoice:async()=>{transcriptions++;return 'Bekzoddan telefon ekran almashtirishga oldim';},runCommand:async input=>{const result=await command(input);if(++attempts===1)throw new Error('lost execution response');return result;}});
 const input={masterId:'owner',conversationId:'chat',requestId:'telegram:1',voice};
 await assert.rejects(run(input),/lost execution response/);
 const result=await run(input);assert.equal(result.kind,'created');assert.equal(transcriptions,1);assert.equal(parses,1);assert.equal(attempts,2);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,1);
 assert.deepEqual(await run(input),result);assert.equal(attempts,2);
}));
test('legacy voice buttons remain isolated and one explicit acceptance or corrected text executes once',()=>withDb(async db=>{
 const token=crypto.randomUUID();let commands=0;
 await db.execute({sql:'INSERT INTO voice_drafts(master_id,conversation_id,token,transcript,status,created_at) VALUES(?,?,?,?,?,?)',args:['owner','chat',token,'Old transcript','pending',Date.now()]});
 const run=voiceService({db,transcribeVoice:async()=>'',runCommand:async input=>{commands++;return {kind:'clarify',reply:input.text};}});
 const send=(requestId,text,masterId='owner')=>run({masterId,conversationId:'chat',requestId,text});
 assert.equal((await send('1',`/voiceuse ${token}`,'other')).kind,'expired_button');assert.equal(commands,0);
 assert.equal((await send('2',`/voiceedit ${token}`)).kind,'transcript_edit');
 const edited=await send('3','Corrected command');assert.equal(edited.kind,'clarify');assert.equal(edited.reply,'Corrected command');assert.equal(commands,1);assert.ok(!telegramPresentation(edited).reply_markup);
 assert.equal((await send('4',`/voiceuse ${token}`)).kind,'expired_button');assert.equal(commands,1);
 const cancelToken=crypto.randomUUID();await db.execute({sql:"UPDATE voice_drafts SET token=?,status='pending'",args:[cancelToken]});
 assert.equal((await send('5',`/voicedeny ${cancelToken}`)).reply,'Amal bekor qilindi.');assert.equal(commands,1);
}));
test('direct voice keeps original Telegram message date across recognition delay and retry after midnight',()=>withDb(async db=>{
 const sent=Date.parse('2026-11-14T18:59:00Z');let time=sent,received,attempts=0;
 const run=voiceService({db,now:()=>time,transcribeVoice:async()=>{time+=2*60*1000;if(++attempts===1)throw Object.assign(new Error('pending provider'),{retryable:true});return 'Ertaga tayyor';},runCommand:async input=>{received=input;return {kind:'clarify',reply:'Test'};}});
 const input={masterId:'owner',conversationId:'chat',requestId:'1',voice,receivedAt:sent};
 await assert.rejects(run(input),/pending provider/);
 time+=60*1000;assert.equal((await run(input)).kind,'clarify');assert.equal(received.commandTime,sent);assert.equal(received.requestId,'voice-apply:1');
}));
