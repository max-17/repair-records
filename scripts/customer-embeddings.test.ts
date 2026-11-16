import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddingConfig,createTextEmbedder,CustomerEmbeddingError,type EmbeddingRequest} from '../src/lib/customer-embeddings';
const env={GOOGLE_GENERATIVE_AI_API_KEY:'fixture-secret'};
const vector=()=>[3,4,...Array(766).fill(0)] as number[];
test('embedding namespace tracks vector-space configuration and missing/disabled keys stay offline',async()=>{
 const config=embeddingConfig(env);assert.equal(config.model,'gemini-embedding-2');assert.equal(config.dimensions,768);assert(config.enabled);assert(!config.namespace.includes('fixture-secret'));
 assert.equal(embeddingConfig({}).enabled,false);assert.equal(embeddingConfig({...env,CUSTOMER_SEMANTIC_SEARCH:'false'}).enabled,false);
 assert.equal(embeddingConfig({...env,CUSTOMER_EMBEDDING_MODEL:'not-supported'}).enabled,false);
 assert.notEqual(embeddingConfig({...env,CUSTOMER_EMBEDDING_MODEL:'gemini-embedding-001'}).namespace,config.namespace);
 let calls=0;const embed=createTextEmbedder({env:{},run:async()=>{calls++;return [];}});await assert.rejects(embed(['x'],'query'),(e:unknown)=>e instanceof CustomerEmbeddingError&&e.code==='disabled');assert.equal(calls,0);
});
test('Embedding 2 prefixes asymmetric text, batches separate vectors and L2-normalizes without mutating provider data',async()=>{
 const requests:EmbeddingRequest[]=[];const raw=vector();const embed=createTextEmbedder({env,run:async request=>{requests.push(request);return request.values.map(()=>raw);}});
 const documents=await embed(['Katta batareya','Suratga olish'],'document');assert.equal(documents.length,2);assert.equal(documents[0][0],.6);assert.equal(documents[0][1],.8);assert.equal(raw[0],3);
 await embed(['Zaryadi uzoq yetsin'],'query');assert.deepEqual(requests[0].values,['title: none | text: Katta batareya','title: none | text: Suratga olish']);assert.equal(requests[1].values[0],'task: search result | query: Zaryadi uzoq yetsin');assert.equal(requests[0].taskType,undefined);assert.equal(requests[0].maxRetries,0);assert.equal(requests[0].dimensions,768);
});
test('Embedding 001 uses taskType instead of Embedding 2 prompt prefixes',async()=>{
 const requests:EmbeddingRequest[]=[];const embed=createTextEmbedder({env:{...env,CUSTOMER_EMBEDDING_MODEL:'gemini-embedding-001'},run:async request=>{requests.push(request);return [vector()];}});
 await embed(['telefon'],'document');await embed(['batareya'],'query');assert.equal(requests[0].values[0],'telefon');assert.equal(requests[0].taskType,'RETRIEVAL_DOCUMENT');assert.equal(requests[1].taskType,'RETRIEVAL_QUERY');
});
test('invalid dimensions, nonfinite/zero vectors and provider details fail closed with sanitized errors',async()=>{
 for(const vectors of [[],[[1,2]],[Array(768).fill(0)],[Array(768).fill(NaN)]]){const embed=createTextEmbedder({env,run:async()=>vectors});await assert.rejects(embed(['x'],'query'),(e:unknown)=>e instanceof CustomerEmbeddingError&&e.code==='invalid_vector');}
 const embed=createTextEmbedder({env,run:async()=>{throw new Error('https://provider.example?api_key=fixture-secret private document');}});await assert.rejects(embed(['x'],'query'),(e:unknown)=>e instanceof CustomerEmbeddingError&&e.code==='provider_unavailable'&&!String(e).includes('fixture-secret')&&!('cause' in e));
 await assert.rejects(embed([''],'query'),/invalid_input/);await assert.rejects(embed(Array(33).fill('x'),'document'),/invalid_input/);assert.deepEqual(await embed([],'query'),[]);
});
