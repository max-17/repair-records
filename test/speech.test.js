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
test('voice waits for review, confirms once, and preserves cached transcript',()=>withDb(async db=>{
 let transcripts=0,parses=0;
 const run=voiceService({db,transcribeVoice:async()=>{transcripts++;return 'Bekzod Samsung S23 ekran 300 ming';},runCommand:commandService({db,parse:async()=>{parses++;return {...blank,action:'create',customer:'Bekzod',device:'Samsung S23',work:'Ekran',price_uzs:300000};}})});
 const send=(requestId,args,masterId='owner')=>run({masterId,conversationId:'chat',requestId,...args});
 const review=await send('1',{voice});assert.equal(review.kind,'transcript');assert.equal(parses,0);
 assert.deepEqual(await send('1',{voice}),review);assert.equal(transcripts,1);
 assert.equal(telegramPresentation(review).reply_markup.inline_keyboard.flat().length,3);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,0);
 assert.equal((await send('wrong',{text:`/voiceuse ${review.draft.token}`},'other')).kind,'expired_button');
 const saved=await send('2',{text:`/voiceuse ${review.draft.token}`});assert.equal(saved.kind,'created');assert.equal(parses,1);assert.ok(!telegramPresentation(saved).reply_markup);
 assert.deepEqual(await send('2',{text:`/voiceuse ${review.draft.token}`}),saved);
 assert.equal((await send('3',{text:`/voiceuse ${review.draft.token}`})).kind,'expired_button');
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,1);
}));
test('editing requires a new confirmation and cancellation never executes',()=>withDb(async db=>{
 let calls=0;
 const run=voiceService({db,transcribeVoice:async()=> 'Original command',runCommand:async input=>{calls++;return {kind:'clarify',reply:input.text};}});
 const send=(requestId,args)=>run({masterId:'owner',conversationId:'chat',requestId,...args});
 const first=await send('1',{voice});
 assert.equal((await send('2',{text:`/voiceedit ${first.draft.token}`})).kind,'transcript_edit');
 const edited=await send('3',{text:'Corrected command'});assert.equal(edited.kind,'transcript');assert.equal(calls,0);assert.notEqual(first.draft.token,edited.draft.token);
 assert.equal((await send('old',{text:`/voiceuse ${first.draft.token}`})).kind,'expired_button');
 assert.equal((await send('4',{text:`/voiceuse ${edited.draft.token}`})).reply,'Corrected command');assert.equal(calls,1);
 const second=await send('5',{voice});const cancelled=await send('6',{text:`/voicedeny ${second.draft.token}`});assert.equal(cancelled.reply,'Amal bekor qilindi.');assert.ok(!telegramPresentation(cancelled).reply_markup);
 assert.equal((await send('7',{text:`/voiceuse ${second.draft.token}`})).kind,'expired_button');assert.equal(calls,1);
}));
test('confirmation retries are idempotent after lost execution response',()=>withDb(async db=>{
 let transcriptions=0,attempts=0,parses=0;
 const command=commandService({db,parse:async()=>{parses++;return {...blank,action:'create',customer:'Bekzod',device:'Phone',work:'Screen'};}});
 const run=voiceService({db,transcribeVoice:async()=>{transcriptions++;return 'Bekzod telefon ekran';},runCommand:async input=>{const result=await command(input);if(++attempts===1)throw new Error('lost response');return result;}});
 const base={masterId:'owner',conversationId:'chat'};
 const review=await run({...base,requestId:'1',voice});const confirm={...base,requestId:'2',text:`/voiceuse ${review.draft.token}`};
 await assert.rejects(run(confirm),/lost response/);assert.equal((await run(confirm)).kind,'created');assert.equal(transcriptions,1);assert.equal(parses,1);
 assert.equal((await db.execute('SELECT count(*) AS n FROM repair_jobs')).rows[0].n,1);
}));
test('recognition failure never executes and review keeps original voice timestamp',()=>withDb(async db=>{
 let time=Date.parse('2026-11-14T18:59:00Z'),received,calls=0;const sent=time;
 const run=voiceService({db,now:()=>time,transcribeVoice:async clip=>{if(clip.file_id==='failed')throw new SpeechInputError('Ovoz tushunilmadi.');time+=120000;return 'Ertaga tayyor';},runCommand:async input=>{calls++;received=input;return {kind:'clarify',reply:'Test'};}});
 const base={masterId:'owner',conversationId:'chat'};
 assert.equal((await run({...base,requestId:'fail',voice:{...voice,file_id:'failed'}})).kind,'speech_error');assert.equal(calls,0);
 const review=await run({...base,requestId:'1',voice,receivedAt:sent});assert.equal(calls,0);
 await run({...base,requestId:'2',text:`/voiceuse ${review.draft.token}`});assert.equal(received.commandTime,sent);
}));
test('repair voice review shows extracted fields and executes the reviewed plan without reparsing',()=>withDb(async db=>{
 let parses=0;const runCommand=commandService({db,parse:async()=>{parses++;return {...blank,action:'create',customer:'Bekzod aka',device:'Redmi Note 9',work:'Ekran',price_uzs:500000,due_date:'2026-11-18'};}});
 const voiceRun=voiceService({db,previewCommand:input=>runCommand({...input,previewOnly:true}),transcribeVoice:async()=> 'raw transcript should not be shown',runCommand});
 const base={masterId:'owner',conversationId:'chat',receivedBy:'7',receivedByName:'Aziz'};
 const reviewed=await voiceRun({...base,requestId:'voice',voice});assert.match(reviewed.reply,/Mijoz: Bekzod aka/);assert.match(reviewed.reply,/Uskuna: Redmi Note 9/);assert.match(reviewed.reply,/Narx:.*UZS/);assert.match(reviewed.reply,/Tayyor sanasi: 2026-11-18/);assert.ok(!reviewed.reply.includes('raw transcript'));
 assert.equal((await db.execute('SELECT * FROM repair_jobs')).rows.length,0);
 const saved=await voiceRun({...base,requestId:'confirm',text:`/voiceuse ${reviewed.draft.token}`});assert.equal(saved.kind,'created');assert.equal(parses,1);assert.equal(saved.repair.price_uzs,500000);
}));
