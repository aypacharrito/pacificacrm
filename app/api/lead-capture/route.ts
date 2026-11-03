import {inquiryLead} from '../../lib/miner-prospect-tools';
import {mergeNewProspects} from '../../lib/miner-auto-feed';
import {randomUUID} from 'node:crypto';
import {readQuoteToken} from '../../lib/quote-intake-token';
import {readStoredWorkspace,updateStoredWorkspace} from '../../lib/workspace-storage';
import {workspaceAutomationAccess} from '../../lib/clerk-access';
import {captureConsent,cleanInquiry,cleanMinerState} from '../../lib/miner-leads';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function context(request:Request){const credentials=readQuoteToken(request.headers.get('authorization')?.replace(/^Bearer /,'')||'');if(!await workspaceAutomationAccess(credentials.workspaceId,"crm"))throw Error('This form is unavailable.');const workspace=await readStoredWorkspace(credentials.workspaceId);const campaign=cleanMinerState(workspace?.minerState).campaigns.find(c=>c.id===credentials.linkId&&!c.revoked&&Date.parse(c.expiresAt)>Date.now());if(!workspace||!campaign)throw Error('This form is unavailable.');return {...credentials,workspace,campaign};}
export async function GET(request:Request){try{const {workspace,campaign}=await context(request),business=workspace.profile.businessName||'Your local advisor';return json({name:campaign.name,kind:campaign.kind,business,consentText:captureConsent(business)});}catch{return json({error:'This form is unavailable. Please contact your advisor.'},404);}}
export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length')||0)>10000)return json({error:'Request is too large.'},413);
  const raw=await request.text();if(raw.length>10000)return json({error:'Request is too large.'},413);
  const body=JSON.parse(raw);if(body.website)return json({ok:true});
  const {workspaceId,campaign}=await context(request),input=cleanInquiry(body,campaign.kind),now=new Date().toISOString();
  await updateStoredWorkspace(workspaceId,current=>{
   const state=cleanMinerState(current.minerState);if(!state.campaigns.some(c=>c.id===campaign.id&&!c.revoked&&Date.parse(c.expiresAt)>Date.now()))throw Error('This form is unavailable.');
   const recent=state.inquiries.filter(i=>Date.now()-Date.parse(i.submittedAt)<86400000);
   if(recent.some(i=>i.campaignId===campaign.id&&((input.phone&&i.phone===input.phone)||(input.email&&i.email===input.email))))return current;
   if(recent.length>=100||state.inquiries.filter(i=>i.status==='pending').length>=500)throw Error('This form has reached its daily limit. Contact your advisor.');
   const retain=state.inquiries.length>=1000?state.inquiries.filter(i=>i.status==='pending'):state.inquiries;
   const inquiry={id:randomUUID(),campaignId:campaign.id,...input,submittedAt:now,status:'pending' as const,consentText:captureConsent(current.profile.businessName||'Your local advisor')};
   const active=state.campaigns.find(c=>c.id===campaign.id)!;
   const merged=active.autoImport===false?{workspace:current,accepted:[]}:mergeNewProspects(current,[inquiryLead(inquiry)]);
   return {...merged.workspace,minerState:{...state,inquiries:[...retain,{...inquiry,status:merged.accepted.length?'imported':'pending'}]}};
  });return json({ok:true});
 }catch(error){const message=error instanceof Error?error.message:'';return json({error:/^(Enter |Confirm |This form)/.test(message)?message:'Could not submit. Please try again.'},400);}
}
