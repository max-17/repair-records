import {createCipheriv,createDecipheriv,createHash,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';
const magic=Buffer.from('REPAIR-ARCHIVE-V1\0');
function keyFor(secret){return Buffer.from(hkdfSync('sha256',Buffer.from(secret),Buffer.alloc(0),'repair-records/audio-archive/v1',32));}
const keyId=key=>createHash('sha256').update(key).digest('hex').slice(0,16);
function candidates(env){return [env.AUDIO_ARCHIVE_KEY,env.ADMIN_SESSION_SECRET,...(env.AUDIO_ARCHIVE_PREVIOUS_KEYS||'').split(',')].filter(Boolean).map(keyFor);}
export function sealArchive(bytes,env){
 const key=candidates(env)[0];if(!key)throw Object.assign(new Error('SOURCE_STORAGE_NOT_CONFIGURED'),{code:'archive_not_configured'});
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(magic);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {bytes:Buffer.concat([magic,nonce,cipher.getAuthTag(),ciphertext]),keyId:keyId(key)};
}
export function openArchive(bytes,id,env,hash){
 const key=candidates(env).find(k=>keyId(k)===id);if(!key)throw new Error('ARCHIVE_KEY_UNAVAILABLE');
 const data=Buffer.from(bytes),offset=magic.length;
 if(data.length<offset+28||!data.subarray(0,offset).equals(magic))throw new Error('ARCHIVE_INVALID_FORMAT');
 const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(offset,offset+12));decipher.setAAD(magic);decipher.setAuthTag(data.subarray(offset+12,offset+28));
 const plain=Buffer.concat([decipher.update(data.subarray(offset+28)),decipher.final()]);
 if(hash){const actual=createHash('sha256').update(plain).digest();const expected=Buffer.from(hash,'hex');if(expected.length!==actual.length||!timingSafeEqual(actual,expected))throw new Error('ARCHIVE_HASH_MISMATCH');}
 return plain;
}
export function archiveLocation(storedKey){
 const match=/^enc1\.([a-f0-9]{16})\.(.+)$/.exec(storedKey);
 if(storedKey.startsWith('enc1.')&&!match)throw new Error('ARCHIVE_INVALID_KEY');
 return match?{key:match[2],keyId:match[1]}:{key:storedKey,keyId:null};
}
