import {isHostedRuntime} from './hosted-runtime';
import {workspaceRedis,workspaceRedisConfig} from './workspace-redis';

export type PartnerStatus='received'|'agency_reviewed'|'declined';
export type PartnerPair={
 linkId:string;
 agencyWorkspaceId:string;
 agencyName:string;
 source:string;
 expiresAt:string;
 intendedDealerWorkspaceId:string;
 dealerWorkspaceId:string;
 revoked:boolean;
 receipts:{id:string;status:PartnerStatus}[];
};

const key=(id:string)=>`pacifica:v2:vehicle-partner:${id}`;
const validId=(id:string)=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export const partnerActive=(pair:PartnerPair)=>!pair.revoked&&Date.parse(pair.expiresAt)>Date.now();

async function localDatabase(){
 if(isHostedRuntime())throw Error('Partner storage is unavailable.');
 const {getD1}=await import('../../db/index');
 const db=getD1();
 await db.prepare('CREATE TABLE IF NOT EXISTS crm_vehicle_partners (id TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
 return db;
}

export async function readPartner(id:string):Promise<PartnerPair|null>{
 if(!validId(id))return null;
 const raw=workspaceRedisConfig().url
  ?await workspaceRedis(['GET',key(id)])
  :(await (await localDatabase()).prepare('SELECT value FROM crm_vehicle_partners WHERE id=?').bind(id).first() as {value:string}|null)?.value;
 if(typeof raw!=='string')return null;
 const value=JSON.parse(raw) as PartnerPair;
 return value.linkId===id&&Array.isArray(value.receipts)?value:null;
}

/** This updater can run again after a CAS conflict. It must have no external side effects. */
export async function updatePartner(id:string,update:(current:PartnerPair|null)=>PartnerPair){
 if(!validId(id))throw Error('Invalid vehicle partner link.');
 for(let attempt=0;attempt<4;attempt++){
  const redis=Boolean(workspaceRedisConfig().url);
  const db=redis?null:await localDatabase();
  const raw=redis
   ?await workspaceRedis(['GET',key(id)])
   :(await db!.prepare('SELECT value FROM crm_vehicle_partners WHERE id=?').bind(id).first() as {value:string}|null)?.value;
  const current=typeof raw==='string'?JSON.parse(raw) as PartnerPair:null;
  const next=update(current);
  if(current===next)return next;
  const serialized=JSON.stringify(next);
  if(redis){
   const saved=await workspaceRedis([
    'EVAL',
    "local v=redis.call('GET',KEYS[1]); if (ARGV[3]=='create' and not v) or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end",
    1,key(id),typeof raw==='string'?raw:'',serialized,typeof raw==='string'?'update':'create',
   ]);
   if(saved===1)return next;
  }else{
   const result=typeof raw==='string'
    ?await db!.prepare('UPDATE crm_vehicle_partners SET value=? WHERE id=? AND value=?').bind(serialized,id,raw).run()
    :await db!.prepare('INSERT INTO crm_vehicle_partners (id,value) VALUES (?,?) ON CONFLICT(id) DO NOTHING').bind(id,serialized).run();
   if(result.meta.changes===1)return next;
  }
 }
 throw Error('Partner status changed. Please retry.');
}

export function partnerSummary(pair:PartnerPair){
 return {
  linkId:pair.linkId,agencyName:pair.agencyName,source:pair.source,expiresAt:pair.expiresAt,
  revoked:pair.revoked,receipts:partnerActive(pair)?pair.receipts.map(({id,status})=>({id,status,quoteStatus:'Carrier quote required' as const})):[],
  stagesUnavailable:'Carrier quote required. Premiums and binding are unavailable until a licensed agent confirms a carrier path.',
 };
}
