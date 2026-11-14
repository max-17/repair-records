import 'dotenv/config';
import {readFile,stat} from 'node:fs/promises';
import {recognizeAudio,SpeechInputError} from '../src/speech.js';
try{
 const path=process.argv[2];if(!path)throw new SpeechInputError('Usage: npm run speech:try -- /absolute/path/to/voice.ogg [--compare]');
 if((await stat(path)).size>10*1024*1024)throw new SpeechInputError('Audio must be at most 10 MB.');
 const audio=await readFile(path);
 const models=process.argv.includes('--compare')?['whisper-large-v3','whisper-large-v3-turbo']:[process.env.GROQ_WHISPER_MODEL||'whisper-large-v3'];
 for(const model of models){const started=Date.now();const text=await recognizeAudio({...process.env,GROQ_WHISPER_MODEL:model},audio);console.log(JSON.stringify({model,elapsed_ms:Date.now()-started,text}));}
}catch(error){console.error(error instanceof SpeechInputError?error.message:`Speech test failed: ${error.name} (${error.statusCode||'check key and connectivity'}).`);process.exitCode=1;}
