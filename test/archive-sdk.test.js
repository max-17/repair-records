import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveClient} from '../src/pul-sources.js';
test('actual UploadThing SDK accepts archive client configuration before a stubbed request',async()=>{
 const token=Buffer.from(JSON.stringify({apiKey:'sk_synthetic_configuration_test_only',appId:'synthetic-app',regions:['fra1']})).toString('base64');
 let calls=0;
 const client=createArchiveClient({UPLOADTHING_TOKEN:token},{fetcher:async()=>{calls++;return Response.json({totalBytes:0,appTotalBytes:0,filesUploaded:0,limitBytes:1024});}});
 const result=await client.getUsageInfo();assert.equal(calls,1);assert.equal(result.limitBytes,1024);
});
