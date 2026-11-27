import {getPacificaAccess} from '../../lib/clerk-access';
import {isClerkConfigured} from '../../lib/clerk-config';
import {isHostedRuntime} from '../../lib/hosted-runtime';
import {readQuoteToken} from '../../lib/quote-intake-token';
import {partnerActive,partnerSummary,readPartner,updatePartner} from '../../lib/vehicle-partner-pairing';
import {readStoredWorkspace,updateStoredWorkspace} from '../../lib/workspace-storage';

export const runtime='nodejs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});

async function member(){
 if(!isClerkConfigured())return isHostedRuntime()?null:{userId:'local',role:'owner',accountUserId:'local'};
 const access=await getPacificaAccess();
 return access.allowed?access:null;
}

async function owner(){
 const access=await member();
 return access?.role==='owner'&&access.accountUserId===access.userId?access:null;
}

export async function GET(){
 const access=await member();
 if(!access)return json({error:'Workspace sign-in required.'},403);
 try{
  const workspace=await readStoredWorkspace(access.userId);
  if(!workspace)return json({error:'Save your workspace first.'},409);
  const partnerships=[];
  for(const id of workspace.vehiclePartnerLinks||[]){
   const pair=await readPartner(id);
   if(pair?.dealerWorkspaceId===access.userId)partnerships.push(partnerSummary(pair));
  }
  return json({partnerships,workspaceId:access.userId});
 }catch{return json({error:'Partner statuses could not be loaded.'},503)}
}

export async function POST(request:Request){
 const access=await owner();
 if(!access)return json({error:'Workspace owner sign-in required.'},403);
 try{
  const body=await request.json() as {token?:string;preview?:boolean};
  const auth=readQuoteToken(String(body.token||''));
  const link=auth.link;
  if(!link?.vehicleReferral||link.id!==auth.linkId||auth.workspaceId===access.userId)
   throw Error('Use a vehicle partner invitation from another agency.');
  if(Date.parse(link.expiresAt)<=Date.now())throw Error('This invitation has expired.');

  const dealer=await readStoredWorkspace(access.userId);
  if(!dealer)throw Error('Save your workspace before accepting.');
  const invitation=await readPartner(link.id);
  if(!invitation||!partnerActive(invitation)||invitation.agencyWorkspaceId!==auth.workspaceId||
     invitation.intendedDealerWorkspaceId!==access.userId||invitation.expiresAt!==link.expiresAt)
   throw Error('This invitation is unavailable for your workspace.');
  if(body.preview===true)
   return json({invitation:{agencyName:invitation.agencyName,source:invitation.source,expiresAt:invitation.expiresAt}});

  const pair=await updatePartner(link.id,current=>{
   if(!current||!partnerActive(current)||current.agencyWorkspaceId!==auth.workspaceId||
      current.intendedDealerWorkspaceId!==access.userId||current.expiresAt!==link.expiresAt)
    throw Error('This invitation is unavailable for your workspace.');
   if(current.dealerWorkspaceId&&current.dealerWorkspaceId!==access.userId)
    throw Error('This invitation is already assigned to another dealership.');
   return current.dealerWorkspaceId?current:{...current,dealerWorkspaceId:access.userId};
  });
  await updateStoredWorkspace(access.userId,current=>current.vehiclePartnerLinks?.includes(link.id)
   ?current
   :{...current,vehiclePartnerLinks:[...(current.vehiclePartnerLinks||[]),link.id].slice(-50)});
  return json({partnership:partnerSummary(pair)});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const safe=/^(Use a vehicle|This invitation|Save your workspace)/.test(message);
  return json({error:safe?message:'Unable to accept invitation. Please try again.'},safe?400:503);
 }
}
