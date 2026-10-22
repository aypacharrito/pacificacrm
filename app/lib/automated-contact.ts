import {hasInbound,latestInbound,renewalReady,type WarmingLead} from "./lead-warming-policy";
import {cleanAiControl,matchesOutreach,inOutreachWindow} from "./ai-control";
import {blocksAiText,blocksAutomatedText} from "./ai-sms-recipients";
import {hasContactPermission} from "./contact-permission";
import {readStoredWorkspace} from "./workspace-storage";

export async function assertAutomatedContact(workspaceId:string,address:string,channel:"sms"|"email",scheduled=false,replyId?:string){
  const workspace=await readStoredWorkspace(workspaceId);
  const key=(value:unknown)=>channel==="sms"?String(value||"").replace(/\D/g,"").slice(-10):String(value||"").trim().toLowerCase();
  const contacts=workspace?.leads.filter(raw=>key((raw as Record<string,unknown>)[channel==="sms"?"phone":"email"])===key(address)) as Array<Record<string,unknown>>|undefined;
  if(!workspace||!contacts?.length)throw new Error("Save this contact before automated outreach.");
  const conservative=scheduled||channel==="email";
  const latest=latestInbound(contacts as WarmingLead[]),replyAllowed=Boolean(replyId&&latest&&(latest.providerId||latest.id)===replyId);
  if(replyId&&!replyAllowed)throw new Error("A newer reply arrived. Reply to the latest message instead.");
  if(contacts.some(lead=>hasInbound(lead)&&!renewalReady(lead))&&!replyAllowed)throw new Error("This contact replied. Automatic outreach is paused until a requested follow-up is due.");
  if(contacts.some(lead=>(conservative?blocksAutomatedText(lead):blocksAiText(lead))||lead.deletedAt||lead.doNotCall||(channel==="sms"?lead.smsOptOut:lead.emailOptOut)))throw new Error("Automated outreach is paused for this contact. Follow up personally from Messages.");
  if(!contacts.some(lead=>hasContactPermission(lead,workspace.profile,channel)))throw new Error("Document permission before automated outreach.");
  const control=cleanAiControl(workspace.aiControl),rule=control.rules[channel];
  if(conservative&&contacts.some(lead=>!matchesOutreach(lead,rule)))throw new Error("This contact is excluded by the saved AI outreach rules.");
  if(scheduled&&(!(control.salesEnabled??workspace.profile.serverAutomationEnabled)||!inOutreachWindow(rule)))throw new Error("Automated sales sending is paused or outside its saved time window.");
  return workspace;
}
