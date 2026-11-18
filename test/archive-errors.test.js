import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveFailureCode} from '../src/pul-sources.js';
test('archive permission, credentials and limits produce distinct safe diagnostic codes',()=>{
 assert.equal(archiveFailureCode({code:'FORBIDDEN',message:'ACL override is disabled for this app'}),'archive_private_access_denied');
 assert.equal(archiveFailureCode({code:'UNAUTHORIZED',message:'Invalid token'}),'archive_auth_failed');
 assert.equal(archiveFailureCode({code:'BAD_REQUEST',message:'App storage limit exceeded'}),'archive_quota_exceeded');
 assert.equal(archiveFailureCode(new Error('https://secret.invalid/?token=hidden')),'archive_upload_failed');
 assert.equal(archiveFailureCode({message:{secret:'hidden'}}),'archive_upload_failed');
});
