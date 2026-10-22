import {reserveSms,settleSms} from "./sms-budget";
import {smsSegments} from "./lead-warming-policy";
import {appendCommunication,type StoredCommunication} from "./communications";
import {updateStoredWorkspace} from "./workspace-storage";
import type {MessageAttachment} from "./message-attachments";
import {smsFailureMessage} from "./sms-delivery";
import {assertSmsDeliveryHistory, SmsPreflightError, type SmsDeliveryRecord} from "./sms-preflight";
import {automatedSmsBody} from "./message-footer";
import {assertAutomatedContact} from "./automated-contact";
import {logEvent} from "./observability";
import {smsReadiness} from "./sms-readiness";
import {phoneAssignmentForWorkspace} from "./phone-assignments";
import {twilioAccountConfig,twilioApiRequest,type TwilioApiError} from "./twilio-rest";
import {validateSmsLinks} from "./sms-content-policy";

type TwilioMessageResponse=TwilioApiError&{sid?:string;status?:string;price?:string;num_segments?:string};

function normalized(value:string){
  const digits=value.replace(/\D/g,"");
  if(digits.length===10)return `+1${digits}`;
  if(digits.length===11&&digits.startsWith("1"))return `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(value.trim())?value.trim():"";
}

export async function outboundSmsStatus(workspaceId:string,email=""){
  const assignment=await phoneAssignmentForWorkspace(workspaceId,email);
  let credentialError="";
  try{twilioAccountConfig()}catch(error){credentialError=error instanceof Error?error.message:"Twilio credentials are incomplete"}
  const sendingEnabled=process.env.PACIFICA_SMS_SENDING_ENABLED!=="false";
  return smsReadiness(assignment,sendingEnabled,credentialError);
}

export async function sendOutboundSms(input:{replyId?:string;idempotencyKey?:string;deadline?:number;workspaceId:string;to:string;body:string;workspaceEmail?:string;automated?:boolean;scheduled?:boolean;officeReminderId?:string;mediaUrls?:string[];attachments?:MessageAttachment[]}){
  const requestedAt=Date.now();
  const signal=(ms:number)=>AbortSignal.timeout(Math.max(1,Math.min(ms,(input.deadline??Infinity)-Date.now())));
  const status=await outboundSmsStatus(input.workspaceId,input.workspaceEmail);
  if(!status.configured)throw new Error(status.message);
  const to=normalized(input.to);if(!to)throw new Error("Lead has an invalid phone number");
  if(input.automated&&!/^\+1\d{10}$/.test(to))throw new Error("Automatic SMS is limited to US/Canada numbers; review other destinations personally.");
  const body=input.body.trim().slice(0,1500);const mediaUrls=(input.mediaUrls||[]).map(value=>String(value).trim()).filter(value=>/^https:\/\//i.test(value)).slice(0,10);if(!body&&!mediaUrls.length)throw new Error("Write a message or attach a file first");
  const links=validateSmsLinks(body);
  const {accountSid,credentials}=twilioAccountConfig();
  const callbackBase=(process.env.TWILIO_WEBHOOK_BASE_URL||"https://pacificacrm.com").trim().replace(/\/$/,"");
  const assignment=await phoneAssignmentForWorkspace(input.workspaceId,input.workspaceEmail);const form=new URLSearchParams({To:to,From:status.from,StatusCallback:`${callbackBase}/api/twilio/messages/status?workspace=${encodeURIComponent(input.workspaceId)}`});if(body)form.set("Body",body);for(const mediaUrl of mediaUrls)form.append("MediaUrl",mediaUrl);
  if(assignment?.messagingServiceSid)form.set("MessagingServiceSid",assignment.messagingServiceSid);
  if(input.officeReminderId){const {assertOfficeReminder}=await import("./office-reminder-permission");await assertOfficeReminder(input.workspaceId,input.officeReminderId,to)}
  if(input.automated){const workspace=await assertAutomatedContact(input.workspaceId,to,"sms",input.scheduled===true,input.replyId);form.set("Body",automatedSmsBody(body,workspace.profile.businessName))}
  // Read delivery results before creating another message, including failures from older clients.
  const history=await twilioApiRequest<{messages?:SmsDeliveryRecord[]}>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?${new URLSearchParams({From:status.from,To:to,PageSize:"20"})}`,{signal:signal(5000)},credentials);
  if(!history.response.ok||!Array.isArray(history.data.messages))throw new SmsPreflightError("delivery history could not be checked. Try again after the connection recovers.");
  assertSmsDeliveryHistory(history.data.messages);
  if(input.automated)await assertAutomatedContact(input.workspaceId,to,"sms",input.scheduled===true,input.replyId);
  const reservation=await reserveSms(input.workspaceId,{to,body:form.get("Body")||"",automated:input.automated,key:input.idempotencyKey,replyId:input.replyId,mms:mediaUrls.length>0});
  const {response,data}=await twilioApiRequest<TwilioMessageResponse>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form.toString(),signal:signal(10000)},credentials);
  if(!response.ok||!data.sid){if(response.status>=400&&response.status<500)await settleSms(input.workspaceId,reservation,{state:"rejected"});logEvent("sms_provider_rejected",{workspaceId:input.workspaceId,code:data.code});throw new Error(smsFailureMessage(data.code))};
  await settleSms(input.workspaceId,reservation,{state:"submitted",providerId:data.sid,...(data.price!=null&&Number.isFinite(Number(data.price))?{actualCents:Math.ceil(Math.abs(Number(data.price))*100)}:{})});
  logEvent("sms_provider_accepted",{providerId:data.sid,workspaceId:input.workspaceId,status:data.status||"queued",mediaCount:mediaUrls.length,embeddedLinks:links.length,requestedAt:new Date(requestedAt).toISOString(),elapsedMs:Date.now()-requestedAt});
  const sentAt=new Date().toISOString();let historySaved=true;
  const communication:StoredCommunication={id:data.sid,providerId:data.sid,channel:"sms",direction:"outbound",from:status.from,to,body:form.get("Body")||"",attachments:input.attachments,mediaCount:mediaUrls.length,status:data.status||"queued",sentAt,provider:"twilio",segments:smsSegments(form.get("Body")||"").segments};
  try{await updateStoredWorkspace(input.workspaceId,current=>({...current,leads:current.leads.map(raw=>{const lead=raw as Record<string,unknown>;return normalized(String(lead.phone||""))===to?{...lead,lastSmsAt:sentAt,communications:appendCommunication(lead.communications,communication)}:lead})}))}catch{historySaved=false;logEvent("sms_history_pending",{workspaceId:input.workspaceId,providerId:data.sid})}
  return {historySaved,communication,id:data.sid,provider:"twilio" as const,status:data.status||"queued",from:status.from};
}
