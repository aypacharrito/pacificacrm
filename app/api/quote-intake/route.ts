import {randomUUID} from 'node:crypto';
import {readQuoteToken,type QuoteCredentials} from '../../lib/quote-intake-token';
import {cleanQuoteDetails,cleanQuoteIntake,quoteConsentText,type QuoteLink,type QuoteSubmission} from '../../lib/quote-intake';
import {readStoredWorkspace,updateStoredWorkspace,type StoredWorkspace} from '../../lib/workspace-storage';
import {WorkspaceLoadError} from '../../lib/workspace-load';
import {partnerActive,readPartner,updatePartner,type PartnerStatus} from '../../lib/vehicle-partner-pairing';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
function credentials(request:Request){return readQuoteToken(request.headers.get('authorization')?.replace(/^Bearer /,'')||'')}
function available(workspace:StoredWorkspace|null,credentials:QuoteCredentials):QuoteLink{
 const id=credentials.linkId;
 const intake=cleanQuoteIntake(workspace?.quoteIntake),link=credentials.link||intake.links.find(l=>l.id===id);
 if(!workspace||!link||link.revoked||Date.parse(link.expiresAt)<=Date.now())throw Error('This quote link is invalid or expired. Ask your agent for a new link.');
 if(link.vehicleReferral&&!intake.links.some(l=>l.id===id&&l.vehicleReferral&&!l.revoked))throw Error('This quote link is no longer available.');
 if(link.leadId!==null){const lead=workspace.leads.find(raw=>(raw as {id:number}).id===link.leadId) as Record<string,unknown>|undefined;if(!lead||lead.deletedAt||lead.doNotCall)throw Error('This quote link is no longer available.')}
 return link;
}
export async function GET(request:Request){
 try{const auth=credentials(request),{workspaceId}=auth,workspace=await readStoredWorkspace(workspaceId),link=available(workspace,auth),business=workspace!.profile.businessName||'Your insurance agency';
  if(link.vehicleReferral){const pair=await readPartner(link.id);if(!pair||!partnerActive(pair)||!pair.dealerWorkspaceId||pair.agencyWorkspaceId!==workspaceId)throw Error('Link unavailable')}
  return json({business,existingContact:link.leadId!==null,vehicleReferral:link.vehicleReferral===true,expiresAt:link.expiresAt,consentText:quoteConsentText(business)});
 }catch{return json({error:'This quote link is unavailable or expired. Ask your agent for a new link.'},404)}
}
export async function POST(request:Request){
 try{
  const auth=credentials(request),{workspaceId,linkId}=auth;
  if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Request is too large.'},413);
  const text=await request.text();if(text.length>12000)return json({error:'Request is too large.'},413);
  const body=JSON.parse(text),workspace=await readStoredWorkspace(workspaceId),link=available(workspace,auth),now=new Date(),details=cleanQuoteDetails(body,link.leadId!==null,now,link.vehicleReferral===true),id=randomUUID();
  if(link.vehicleReferral){const pair=await readPartner(linkId);if(!pair||!partnerActive(pair)||!pair.dealerWorkspaceId||pair.agencyWorkspaceId!==workspaceId)throw Error('This quote link is no longer available.')}
  let savedSubmission:QuoteSubmission|undefined;
  const requestId=typeof body.requestId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)?body.requestId.toLowerCase():undefined;
  if(link.vehicleReferral&&!requestId)throw Error('This request needs a valid submission ID. Please reopen the form.');
  await updateStoredWorkspace(workspaceId,current=>{
   const active=available(current,auth),intake=cleanQuoteIntake(current.quoteIntake);
   const retry=requestId&&intake.submissions.find(s=>s.linkId===linkId&&s.requestId===requestId);
   if(retry){savedSubmission=retry;return current}
   // One completed details request per personal link. Repeated submissions cannot overwrite it.
   if(active.leadId!==null&&intake.submissions.some(s=>s.linkId===linkId))return current;
   const recent=intake.submissions.filter(s=>now.getTime()-Date.parse(s.submittedAt)<86400000);
   if(recent.length>=100||recent.filter(s=>s.linkId===linkId).length>=25)throw Error('This form has reached its daily limit. Please contact the agency directly.');
   if(intake.submissions.filter(s=>s.status==='pending').length>=400)throw Error('The agency needs to review its pending requests. Please contact it directly.');
   const duplicate=!link.vehicleReferral&&recent.some(s=>s.linkId===linkId&&s.details.phone===details.phone&&now.getTime()-Date.parse(s.submittedAt)<3600000);
   if(duplicate){savedSubmission=recent.find(s=>s.linkId===linkId&&s.details.phone===details.phone&&now.getTime()-Date.parse(s.submittedAt)<3600000);return current}
   const pending=intake.submissions.filter(s=>s.status==='pending');
   const reviewed=intake.submissions.filter(s=>s.status!=='pending').slice(-(499-pending.length));
   savedSubmission={id,linkId,leadId:active.leadId,source:active.source,submittedAt:now.toISOString(),status:'pending',details,consentText:quoteConsentText(current.profile.businessName||'Your insurance agency'),...(requestId?{requestId}:{})};
   return {...current,quoteIntake:{...intake,submissions:[...reviewed,...pending,savedSubmission].slice(-500)}};
  });
  if(link.vehicleReferral&&savedSubmission){
   const submission:QuoteSubmission=savedSubmission;
   if(!submission.consentText||!submission.details.contactPermission)throw Error('This quote request is missing consent. Contact the agency.');
   const status:PartnerStatus=submission.status==='accepted'?'agency_reviewed':submission.status==='dismissed'?'declined':'received';
   await updatePartner(linkId,pair=>{
    if(!pair||!partnerActive(pair)||pair.agencyWorkspaceId!==workspaceId)throw Error('This quote link is no longer available.');
    const existing=pair.receipts.find(r=>r.id===submission.id);
    if(existing?.status===status||existing&&status==='received'&&existing.status!=='received')return pair;
    const receipts=existing?pair.receipts.map(r=>r.id===submission.id?{...r,status}:r):[...pair.receipts,{id:submission.id,status}];
    return {...pair,receipts:receipts.slice(-500)};
   });
  }
  return json({ok:true,receipt:link.vehicleReferral?savedSubmission?.id:undefined,message:'Your request was received. Your agent will review the details and follow up with you.'});
 }catch(error){
  if(error instanceof WorkspaceLoadError)return json({error:'Your request could not be confirmed. Please retry with the same form.'},503);
  const message=error instanceof Error?error.message:'';
  return json({error:/^(Enter |Choose |Check |Confirm |Use |This |The agency |Unable to submit this request)/.test(message)?message:'Unable to submit. Please try again or contact your agent.'},/^(Enter |Choose |Check |Confirm |Use |This |The agency |Unable to submit this request)/.test(message)?400:503);
 }
}
