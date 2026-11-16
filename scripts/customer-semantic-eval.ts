import 'dotenv/config';
import assert from 'node:assert/strict';
import {embedTexts,embeddingConfig} from '../src/lib/customer-embeddings';
import {cosineSimilarity} from '../src/lib/customer-semantic';
async function run(){
 if(!process.argv.includes('--live'))throw new Error('Explicit --live required.');
 const docs=['Smartphone with a 6000 mAh battery, designed for long battery endurance.','Planshet: stilus bilan qo‘lda yozish, dars konspektlari va chizmalar uchun.','Lightweight USB-C data cable, length 2 metres.'];
 const queries=['Rozetka izlab yurmasdan telefonni kun bo‘yi ishlatmoqchiman','Планшет для рукописных конспектов'];
 const [documents,vectors]=await Promise.all([embedTexts(docs,'document'),embedTexts(queries,'query')]);
 const ranked=vectors.map(query=>documents.map((doc,index)=>({index,score:cosineSimilarity(query,doc)})).sort((a,b)=>b.score-a.score));
 assert.equal(ranked[0][0].index,0);assert.equal(ranked[1][0].index,1);
 console.log('PASS: live multilingual semantic matches for battery endurance and handwritten notes.',{model:embeddingConfig().model,dimensions:documents[0].length,topScores:ranked.map(r=>Number(r[0].score.toFixed(3)))});
}
run().catch(error=>{console.error('Live semantic evaluation did not complete',{name:error.name,code:error.code||null});process.exitCode=1;});
