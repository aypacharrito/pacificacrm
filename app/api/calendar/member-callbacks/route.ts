import {getPacificaAccess} from '../../../lib/clerk-access';
import {readStoredWorkspace,workspaceRedisConfig} from '../../../lib/workspace-storage';
import {callbackConflicts,callbackFingerprint,callbackLead,completeMemberCallback,memberCallbacks,resolveCallbackTime,saveMemberCallback} from '../../../lib/member-callbacks';

export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function context(){
  const access=await getPacificaAccess();
  if(!access.allowed||!access.accountUserId||access.userId!==access.accountUserId&&!('teamRole' in access&&access.teamRole))return null;
  return {workspace:access.userId,member:access.accountUserId,role:access.role};
}
export async function GET(){
  const owner=await context();if(!owner)return json({error:'Workspace access required.'},403);
  try{return json({items:await memberCallbacks(owner)})}catch{return json({error:'Private callbacks could not load.'},503)}
}
export async function POST(request:Request){
  const owner=await context();if(!owner)return json({error:'Workspace access required.'},403);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid request origin.'},403);
  if(!workspaceRedisConfig().url||!workspaceRedisConfig().token)return json({error:'Private callback storage is unavailable.'},503);
  try{
    const body=await request.json() as Record<string,unknown>;
    if(body.action==='complete')return json({ok:true,item:await completeMemberCallback(owner,String(body.id||''))});
    if(body.action!=='preview'&&body.action!=='confirm')return json({error:'Choose a callback review action.'},400);
    const leadId=Number(body.leadId),messageId=String(body.messageId||'');
    if(!Number.isSafeInteger(leadId)||leadId<1||!messageId||messageId.length>200)return json({error:'Choose a saved SMS source.'},400);
    const workspace=await readStoredWorkspace(owner.workspace);if(!workspace)return json({error:'CRM workspace unavailable.'},404);
    const source=callbackLead(workspace,owner,leadId,messageId);if(!source)return json({error:'This callback source is no longer available to you.'},404);
    const timezone=workspace.profile.automationTimezone||'America/Los_Angeles';
    const dueAt=resolveCallbackTime(String(body.localTime||''),timezone);
    const existing=await memberCallbacks(owner);
    const prior=existing.find(item=>item.sourceMessageId===messageId);
    if(prior)return json({ok:true,created:false,item:prior});
    const conflicts=callbackConflicts(workspace,existing,dueAt),fingerprint=callbackFingerprint(leadId,messageId,dueAt,conflicts);
    const preview={leadId,messageId,dueAt,timezone,conflicts,fingerprint,sourceQuote:source.source.body.slice(0,300)};
    if(body.action==='preview')return json({preview});
    if(body.fingerprint!==fingerprint)return json({error:'The callback review changed. Review the time and conflicts again.',preview},409);
    if(conflicts.length&&body.acknowledgeConflict!==true)return json({error:'Review the calendar conflict before confirming.',preview},409);
    const saved=await saveMemberCallback(owner,leadId,String(source.lead.name||'Contact'),messageId,dueAt,timezone);
    return json({ok:true,...saved});
  }catch(error){return json({error:error instanceof Error?error.message:'Callback review failed.'},400)}
}
