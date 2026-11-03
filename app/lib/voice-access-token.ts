const encoder=new TextEncoder();
function base64Url(value:string|ArrayBuffer){const bytes=typeof value==='string'?encoder.encode(value):new Uint8Array(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export async function createVoiceAccessToken(input:{secret:string;accountSid:string;apiKeySid:string;appSid:string;identity:string;pushCredentialSid?:string}){
 const now=Math.floor(Date.now()/1000),header=base64Url(JSON.stringify({typ:'JWT',alg:'HS256',cty:'twilio-fpa;v=1'}));
 if(input.pushCredentialSid&&!/^CR[a-f0-9]{32}$/i.test(input.pushCredentialSid))throw Error('Invalid native push credential identifier.');
 const payload=base64Url(JSON.stringify({jti:`${input.apiKeySid}-${now}-${crypto.randomUUID()}`,grants:{identity:input.identity,voice:{incoming:{allow:true},outgoing:{application_sid:input.appSid},...(input.pushCredentialSid?{push_credential_sid:input.pushCredentialSid}:{})}},iat:now,exp:now+3600,iss:input.apiKeySid,sub:input.accountSid}));
 const key=await crypto.subtle.importKey('raw',encoder.encode(input.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(`${header}.${payload}`));
 return `${header}.${payload}.${base64Url(signature)}`;
}
