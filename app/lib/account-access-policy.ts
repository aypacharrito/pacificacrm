export type AccessScope='full'|'miner-only'|'read-only';
export type ManagedAccess={pacificaAccessPaused?:unknown;pacificaTrialEndsAt?:unknown;pacificaManaged?:unknown;pacificaPermanentAccess?:unknown;pacificaAccessScope?:unknown};
export function accessScope(metadata:ManagedAccess):AccessScope{return metadata.pacificaAccessScope==='miner-only'||metadata.pacificaAccessScope==='read-only'?metadata.pacificaAccessScope:'full'}
export function managedAccessState(metadata:ManagedAccess,now=Date.now()):'paused'|'permanent'|'trial'|'expired'|'unmanaged'{
 if(metadata.pacificaAccessPaused===true)return 'paused';
 if(metadata.pacificaManaged!==true)return 'unmanaged';
 if(metadata.pacificaPermanentAccess===true)return 'permanent';
 const end=Date.parse(String(metadata.pacificaTrialEndsAt||''));
 return Number.isFinite(end)&&end>now?'trial':'expired';
}
export function scopeAllows(scope:AccessScope,path:string,method:string,action?:unknown){
 if(scope==='full')return true;
 if(scope==='miner-only')return path.startsWith('/api/miner/')||path==='/api/ai/connection'&&method==='GET';
 if(method==='GET'||method==='HEAD')return ['/api/miner/campaigns','/api/miner/auto-feed','/api/ai/connection'].includes(path);
 return path==='/api/ai/crm'||path==='/api/ai/message'||['/api/miner/public-records','/api/miner/prospects'].includes(path)&&['search','analyze','csv-preview'].includes(String(action));
}
export function isSessionApi(path:string,method="GET"){
 if(path==="/api/lead-campaigns")return true;
 if(path==="/api/twilio/status"||path==="/api/integrations/leads")return method==="GET";
 if(path==="/api/calendar/feed")return method!=="GET";
 if(["/api/integrations/reconcile","/api/integrations/dispositions"].includes(path))return true;
 if(['/api/email/webhook','/api/twilio/messages/status','/api/twilio/recordings/status'].includes(path))return false;
 return /^\/api\/(admin|ai|miner|crm|team|automation|diagnostics|quotes|conversations|vin)(\/|$)/.test(path)||/^\/api\/(email\/messages|twilio\/(token|messages|recordings|status|diagnostics))(\/|$)/.test(path)||path==='/api/message-media'||/^\/api\/calendar\/(conversations|external|google|outlook)(\/|$)/.test(path);
}

export function accountAllows(account:{accessMetadata?:ManagedAccess;memberMetadata?:ManagedAccess;role?:string},path:string,method:string,action?:unknown){return [account.accessMetadata,account.memberMetadata].every(meta=>scopeAllows(accessScope(meta||{}),path,method,action));}
