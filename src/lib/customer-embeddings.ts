import 'server-only';
import {createHash} from 'node:crypto';
import {embedMany} from 'ai';
import {createGoogle} from '@ai-sdk/google';

export type EmbeddingTask='document'|'query';
export type CustomerEmbeddingConfig={model:string;dimensions:number;namespace:string;enabled:boolean};
type Environment=Record<string,string|undefined>;
const supportedModels=new Set(['gemini-embedding-2','gemini-embedding-2-preview','gemini-embedding-001']);
const dimensions=768;
/** Namespace changes whenever the vector space or asymmetric retrieval formatting changes. */
export function embeddingConfig(env:Environment=process.env):CustomerEmbeddingConfig{
 const model=env.CUSTOMER_EMBEDDING_MODEL?.trim()||'gemini-embedding-2';
 const strategy=model==='gemini-embedding-001'?'task-type-v1':'search-prefix-v1';
 const namespace='google:'+createHash('sha256').update(JSON.stringify({model,dimensions,strategy,normalization:'l2-v1'})).digest('hex').slice(0,24);
 const disabled=['false','0','off'].includes((env.CUSTOMER_SEMANTIC_SEARCH||'').toLowerCase());
 return {model,dimensions,namespace,enabled:!disabled&&!!env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()&&supportedModels.has(model)};
}
export class CustomerEmbeddingError extends Error{
 constructor(public readonly code:'disabled'|'invalid_input'|'invalid_vector'|'provider_unavailable'){
  super('Customer semantic embeddings: '+code);this.name='CustomerEmbeddingError';
 }
}
export type EmbeddingRequest={model:string;values:string[];dimensions:number;taskType?:'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY';signal:AbortSignal;maxRetries:0};
export type EmbeddingRunner=(request:EmbeddingRequest)=>Promise<number[][]>;
/** Injection keeps tests offline and lets callers own persistent document/query caches. */
export function createTextEmbedder({env=process.env,run,timeoutMs=8000}:{env?:Environment;run?:EmbeddingRunner;timeoutMs?:number}={}){
 return async function embedTexts(texts:string[],task:EmbeddingTask):Promise<number[][]>{
  if(!Array.isArray(texts)||texts.length>32||!['document','query'].includes(task)||texts.some(text=>typeof text!=='string'||!text.trim()||text.length>12000))throw new CustomerEmbeddingError('invalid_input');
  if(!texts.length)return [];
  const config=embeddingConfig(env);if(!config.enabled)throw new CustomerEmbeddingError('disabled');
  const isEmbeddingOne=config.model==='gemini-embedding-001';
  // Embedding 2 rejects taskType; its documented asymmetric prompt structure
  // distinguishes search queries from documents. It embeds each batch request
  // separately (not several parts aggregated into one vector).
  const values=texts.map(text=>isEmbeddingOne?text:task==='query'?`task: search result | query: ${text}`:`title: none | text: ${text}`);
  const signal=AbortSignal.timeout(Math.max(1,Math.min(8000,timeoutMs)));
  const request:EmbeddingRequest={model:config.model,values,dimensions:config.dimensions,signal,maxRetries:0,...(isEmbeddingOne?{taskType:task==='query'?'RETRIEVAL_QUERY' as const:'RETRIEVAL_DOCUMENT' as const}:{})};
  try{
   const execute:EmbeddingRunner=run|| (async input=>{
    const google=createGoogle({apiKey:env.GOOGLE_GENERATIVE_AI_API_KEY});
    const {embeddings}=await embedMany({model:google.embeddingModel(input.model),values:input.values,dimensions:input.dimensions,maxRetries:0,maxParallelCalls:1,abortSignal:input.signal,...(input.taskType?{providerOptions:{google:{taskType:input.taskType}}}:{})});
    return embeddings;
   });
   const vectors=await execute(request);
   if(vectors.length!==texts.length)throw new CustomerEmbeddingError('invalid_vector');
   return vectors.map(vector=>{
    if(!Array.isArray(vector)||vector.length!==config.dimensions||vector.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw new CustomerEmbeddingError('invalid_vector');
    const norm=Math.hypot(...vector);if(!Number.isFinite(norm)||norm<=0)throw new CustomerEmbeddingError('invalid_vector');
    return vector.map(value=>value/norm);
   });
  }catch(error){
   if(error instanceof CustomerEmbeddingError)throw error;
   // SDK failures can contain keys, URLs and request text; never retain the cause.
   throw new CustomerEmbeddingError('provider_unavailable');
  }
 };
}
export const embedTexts=createTextEmbedder();
