import 'dotenv/config';
import {readFile,stat} from 'node:fs/promises';
import {recognizeAudio,SpeechInputError} from '../src/speech.js';
import {aishaRecognizer,AishaInputError} from '../src/aisha.js';
import {database} from '../src/db.js';
let db;
try{
 const path=process.argv[2];if(!path)throw new SpeechInputError('Usage: npm run speech:try -- /path/to/voice.ogg [--provider aisha|groq] [--compare]');
 if((await stat(path)).size>10*1024*1024)throw new SpeechInputError('Audio must be at most 10 MB.');
 const audio=await readFile(path);const flag=process.argv.indexOf('--provider');
 const provider=flag>=0?process.argv[flag+1]:process.env.SPEECH_PROVIDER||'aisha';
 if(provider==='aisha'){
  db=database();const started=Date.now();const text=await aishaRecognizer(process.env,{db})(audio);console.log(JSON.stringify({provider,elapsed_ms:Date.now()-started,text}));
 }else if(provider==='groq'){
  const models=process.argv.includes('--compare')?['whisper-large-v3','whisper-large-v3-turbo']:[process.env.GROQ_WHISPER_MODEL||'whisper-large-v3'];
  for(const model of models){const started=Date.now();const text=await recognizeAudio({...process.env,GROQ_WHISPER_MODEL:model},audio);console.log(JSON.stringify({provider,model,elapsed_ms:Date.now()-started,text}));}
 }else throw new SpeechInputError('Provider must be aisha or groq.');
}catch(error){console.error(error instanceof SpeechInputError||error instanceof AishaInputError?error.message:`Speech test failed: ${error.name} (${error.statusCode||'check key and connectivity'}).`);process.exitCode=1;}
finally{db?.close();}
