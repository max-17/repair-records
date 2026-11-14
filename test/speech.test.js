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
test('voice preview, edit and acceptance mutate repairs only once after transcript approval',()=>withDb(async db=>{
 let transcripts=0,parses=0;
 const command=commandService({db,parse:async text=>{parses++;assert.equal(text,'Bekzod Samsung S23 ekran 200 ming');return {...blank,action:'create',customer:'Bekzod',device:'Samsung S23',work:'Ekran',price_uzs:200000};}});
 const run=voiceService({db,transcribeVoice:async()=>{transcripts++;return 'Bekzod Samsung S23 ekran 300 ming';},runCommand:command});
 let n=0;const send=args=>run({masterId:'owner',conversationId:'chat',requestId:String(++n),...args});
 const first=await send({voice});assert.equal(first.kind,'transcript');assert.equal(parses,0);assert.equal(telegramPresentation(first).reply_markup.inline_keyboard.flat().length,3);
 const repeated=await run({masterId:'owner',conversationId:'chat',requestId:'1',voice});assert.deepEqual(repeated,first);assert.equal(transcripts,1);
 assert.equal((await send({text:`/voiceedit ${first.draft.token}`})).kind,'transcript_edit');
 const edited=await send({text:'Bekzod Samsung S23 ekran 200 ming'});assert.equal(edited.kind,'transcript');assert.notEqual(edited.draft.token,first.draft.token);
 assert.equal((await send({text:`/voiceuse ${first.draft.token}`})).kind,'expired_button');assert.equal(parses,0);
 const accepted=await send({text:`/voiceuse ${edited.draft.token}`});assert.equal(accepted.kind,'created');assert.equal(parses,1);
 assert.equal((await send({text:`/voiceuse ${edited.draft.token}`})).kind,'expired_button');assert.equal(parses,1);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,1);
}));
test('voice state is isolated and superseded, cancellation and failed transcription do not change repairs',()=>withDb(async db=>{
 let fail=false;let commands=0;const run=voiceService({db,transcribeVoice:async()=>{if(fail)throw new Error('provider');return 'Transcript';},runCommand:async()=>{commands++;}});
 const send=(id,args,masterId='owner',conversationId='chat')=>run({masterId,conversationId,requestId:id,...args});
 const first=await send('1',{voice});
 assert.equal((await send('2',{text:`/voiceuse ${first.draft.token}`},'other')).kind,'expired_button');
 const second=await send('3',{voice:{...voice,file_id:'second'}});
 assert.equal((await send('4',{text:`/voiceuse ${first.draft.token}`})).kind,'expired_button');
 await send('5',{text:`/voiceedit ${second.draft.token}`});assert.equal((await send('6',{text:'/cancel'})).kind,'cancelled_transcript');
 assert.equal((await send('7',{text:`/voiceuse ${second.draft.token}`})).kind,'expired_button');
 const third=await send('8',{voice});fail=true;assert.equal((await send('9',{voice:{...voice,file_id:'failed'}})).kind,'speech_error');
 assert.equal((await send('10',{text:`/voiceuse ${third.draft.token}`})).kind,'expired_button');assert.equal(commands,0);
}));

test('accepted transcript preserves its original date reference across midnight',()=>withDb(async db=>{
 let time=Date.parse('2026-11-14T18:59:00Z');let received;
 const run=voiceService({db,now:()=>time,transcribeVoice:async()=> 'Ertaga tayyor',runCommand:async input=>{received=input;return {kind:'clarify',reply:'Test'};}});
 const first=await run({masterId:'owner',conversationId:'chat',requestId:'1',voice});
 time+=2*60*1000;
 await run({masterId:'owner',conversationId:'chat',requestId:'2',text:`/voiceuse ${first.draft.token}`});
 assert.equal(received.commandTime,Date.parse('2026-11-14T18:59:00Z'));
}));
