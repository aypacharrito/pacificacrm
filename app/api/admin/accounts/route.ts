import {clerkClient} from '@clerk/nextjs/server';
import {isPacificaPlatformOwnerApi,isPacificaPlatformOwnerEmail} from '../../../lib/clerk-access';
import {accessScope,managedAccessState} from '../../../lib/account-access-policy';
import {cleanWorkspaceProfile} from '../../../lib/workspace-profile';
import {updateStoredWorkspace} from '../../../lib/workspace-storage';
import {forgetClerkUser} from '../../../lib/identity-cache';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await isPacificaPlatformOwnerApi())return json({error:'Platform-owner access required.'},403);
 try{
  const query=new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
  if(!query)return json({accounts:[]});
  const client=await clerkClient(),result=await client.users.getUserList({emailAddress:[query],limit:10});
  return json({accounts:result.data.map(user=>({id:user.id,email:user.primaryEmailAddress?.emailAddress||user.emailAddresses[0]?.emailAddress,name:[user.firstName,user.lastName].filter(Boolean).join(' '),state:managedAccessState(user.privateMetadata),scope:accessScope(user.privateMetadata),permanent:user.privateMetadata.pacificaPermanentAccess===true,trialEndsAt:String(user.privateMetadata.pacificaTrialEndsAt||''),teamMember:Boolean(user.privateMetadata.pacificaRole),protected:user.emailAddresses.some(x=>isPacificaPlatformOwnerEmail(x.emailAddress))}))});
 }catch{return json({error:'Unable to look up accounts. Check the account service connection.'},503)}
}
export async function POST(request:Request){
 if(!await isPacificaPlatformOwnerApi())return json({error:'Platform-owner access required.'},403);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
 try{
  const body=await request.json() as {id?:string;action?:string;industry?:string;days?:number;expiresAt?:string;scope?:string};
  if(!body.id||!['grant-trial','extend-trial','pause','resume','set-access','grant-permanent'].includes(body.action||''))return json({error:'Choose an account and action.'},400);
  const client=await clerkClient(),user=await client.users.getUser(body.id);
  if(user.emailAddresses.some(x=>isPacificaPlatformOwnerEmail(x.emailAddress)))return json({error:'Platform-owner accounts cannot be changed here.'},400);
  if(user.privateMetadata.pacificaRole||user.privateMetadata.pacificaWorkspaceId&&user.privateMetadata.pacificaWorkspaceId!==user.id)return json({error:'This is a team member. Manage the owning workspace account instead.'},409);
  const metadata={...user.privateMetadata};
  if(['set-access','grant-permanent','grant-trial','extend-trial'].includes(body.action||'')){
   const permanent=body.action==='grant-permanent';
   if(body.scope!==undefined&&!['full','miner-only','read-only'].includes(body.scope))return json({error:'Choose a valid access scope.'},400);
   const days=body.days??30;
   if(!Number.isInteger(days)||days<1||days>3650)return json({error:'Choose 1 to 3650 days.'},400);
   const start=body.action==='extend-trial'?Math.max(Date.now(),Date.parse(String(metadata.pacificaTrialEndsAt||''))||0):Date.now();
   const end=body.expiresAt?Date.parse(body.expiresAt):start+days*86400000;
   if(!permanent&&(!Number.isFinite(end)||end<=Date.now()||end>Date.now()+3650*86400000))return json({error:'Choose a future expiry within ten years.'},400);
   const fresh=metadata.pacificaManaged!==true;
   metadata.pacificaManaged=true;metadata.pacificaPermanentAccess=permanent;metadata.pacificaTrialEndsAt=permanent?'':new Date(end).toISOString();metadata.pacificaAccessPaused=false;
   if(body.scope)metadata.pacificaAccessScope=body.scope;
   if(fresh)await updateStoredWorkspace(user.id,current=>({...current,profile:cleanWorkspaceProfile({...current.profile,industry:body.industry||'general',mode:body.industry==='insurance'?'insurance':'sales'})}),{create:true});
  }else metadata.pacificaAccessPaused=body.action==='pause';
  await client.users.updateUserMetadata(user.id,{privateMetadata:metadata});forgetClerkUser(user.id);
  return json({ok:true,state:managedAccessState(metadata),scope:accessScope(metadata),trialEndsAt:metadata.pacificaTrialEndsAt||''});
 }catch{return json({error:'The account change could not be saved. Refresh before trying again.'},503)}
}
