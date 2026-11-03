import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {createVoiceAccessToken} from '../app/lib/voice-access-token.ts';
const config={secret:'test-secret',apiKeySid:'SK'+'a'.repeat(32),accountSid:'AC'+'b'.repeat(32),appSid:'AP'+'c'.repeat(32),identity:'pacifica_test'};
test('native Android grants contain the push credential, remain signed and expire in one hour',async()=>{
 const jwt=await createVoiceAccessToken({...config,pushCredentialSid:'CR'+'d'.repeat(32)}),[header,payload,signature]=jwt.split('.'),claims=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(claims.grants.voice.push_credential_sid,'CR'+'d'.repeat(32));assert.equal(claims.grants.identity,'pacifica_test');assert.equal(claims.exp-claims.iat,3600);
 assert.equal(signature,createHmac('sha256',config.secret).update(header+'.'+payload).digest('base64url'));
});
test('browser calling grants stay unchanged and invalid native identifiers are rejected',async()=>{
 const jwt=await createVoiceAccessToken(config),claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));assert.equal(claims.grants.voice.push_credential_sid,undefined);assert.equal(claims.grants.voice.incoming.allow,true);assert.equal(claims.grants.voice.outgoing.application_sid,config.appSid);
 await assert.rejects(()=>createVoiceAccessToken({...config,pushCredentialSid:'not-a-credential'}),/Invalid/);
});
