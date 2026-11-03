import {accountAllows} from '../../../lib/account-access-policy';
import {inquiryLead} from '../../../lib/miner-prospect-tools';
import {randomUUID} from 'node:crypto';
import {getPacificaAccess,getPacificaMinerOwnerAccess} from '../../../lib/clerk-access';
import {readStoredWorkspace,updateStoredWorkspace} from '../../../lib/workspace-storage';
import {cleanMinerState,isLeadKind} from '../../../lib/miner-leads';
import {createQuoteToken} from '../../../lib/quote-intake-token';
import {mergeNewProspects} from '../../../lib/miner-auto-feed';
export const runtime='nodejs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
async function campaignAccess(request?:Request){if(request&&new URL(request.url).pathname==='/api/lead-campaigns'){const access=await getPacificaAccess();return access.allowed&&accountAllows(access,'/api/lead-campaigns',request.method)?access:null}return getPacificaMinerOwnerAccess()}
export async function GET(request:Request){const user=await campaignAccess(request);if(!user)return json({error:'Workspace access is required.'},403);try{const workspace=await readStoredWorkspace(user.userId);return json({...cleanMinerState(workspace?.minerState),checkedAt:Date.now(),scheduleConfigured:Boolean(process.env.CRON_SECRET),prospects:workspace?.leads.filter(raw=>!(raw as {deletedAt?:string}).deletedAt&&/Pacifica Miner/.test(String((raw as {source?:string}).source)))||[]});}catch{return json({error:'Workspace unavailable.'},503)}}
export async function POST(request:Request){
 const user=await campaignAccess(request);if(!user||user.role==='agent'||!accountAllows(user,new URL(request.url).pathname,'POST'))return json({error:'Manager or owner access is required.'},403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
 try{const body=await request.json();let result:Record<string,unknown>={};
  if(body.action==='link'){
   const workspace=await readStoredWorkspace(user.userId),item=cleanMinerState(workspace?.minerState).campaigns.find(c=>c.id===body.id&&!c.revoked&&Date.parse(c.expiresAt)>Date.now());if(!item)throw Error('Campaign unavailable.');
   return json({path:`/lead-capture#${createQuoteToken(user.userId,item.id)}`});
  }
  // Check link signing before persisting a campaign that could not be used.
  if(body.action==='create')createQuoteToken(user.userId,'preflight');
  await updateStoredWorkspace(user.userId,current=>{
   const state=cleanMinerState(current.minerState);
   if(body.action==='create'){
    if(!isLeadKind(body.kind)||!String(body.name||'').trim())throw Error('Choose a category and campaign name.');
    if(state.campaigns.length>=100)throw Error('Campaign limit reached.');
    const item={id:randomUUID(),name:String(body.name).trim().slice(0,100),kind:body.kind,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+365*86400000).toISOString(),revoked:false,autoImport:body.autoImport!==false};
    result={campaign:item,path:`/lead-capture#${createQuoteToken(user.userId,item.id)}`};return {...current,minerState:{...state,campaigns:[...state.campaigns,item]}};
   }
   if(body.action==='revoke'){if(!state.campaigns.some(c=>c.id===body.id))throw Error('Campaign unavailable.');return {...current,minerState:{...state,campaigns:state.campaigns.map(c=>c.id===body.id?{...c,revoked:true}:c)}};}
   const inquiry=state.inquiries.find(i=>i.id===body.id&&i.status==='pending');if(!inquiry||!['import','dismiss'].includes(body.action))throw Error('Choose a pending inquiry.');
   let updated=current;
   if(body.action==='import'){
    const lead=inquiryLead(inquiry);
    const merged=mergeNewProspects(current,[lead]);if(!merged.accepted.length)throw Error('A matching contact already exists, or capacity is reached. Review the inquiry without overwriting that contact.');updated=merged.workspace;result={prospects:merged.accepted};
   }
   return {...updated,minerState:{...state,inquiries:state.inquiries.map(i=>i.id===body.id?{...i,status:body.action==='import'?'imported' as const:'dismissed' as const}:i)}};
  });return json({ok:true,...result});
 }catch(error){return json({error:error instanceof Error?error.message:'Campaign update failed.'},400);}
}
