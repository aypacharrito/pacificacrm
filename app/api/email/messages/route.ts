import { isHostedRuntime } from "../../../lib/hosted-runtime";
import {archiveMessageFiles} from "../../../lib/message-media-archive";
import {emailWithComplianceFooter} from "../../../lib/message-footer";
import {assertAutomatedContact} from "../../../lib/automated-contact";
import {hasContactPermission} from "../../../lib/contact-permission";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {inboundReplyAddress,outboundEmailStatus,sendOutboundEmail} from "../../../lib/outbound-email";
import {appendCommunication} from "../../../lib/communications";
import {agentAssignedLead} from "../../../lib/ai-workspace-scope";
import {claimReviewedSend,finishReviewedSend,ReviewedSendConflictError} from "../../../lib/reviewed-send-claim";
import {readStoredWorkspace,saveWorkspaceChanges} from "../../../lib/workspace-storage";

export const runtime="nodejs";

async function access(){
  const result=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local",accountUserId:"local",role:"owner" as const,email:"local"};
  if(!result.allowed)throw new Error("An active Pacifica subscription is required.");
  return result;
}

export async function GET(){
  try{await access();return Response.json(outboundEmailStatus(),{headers:{"Cache-Control":"no-store"}})}
  catch(error){return Response.json({configured:false,error:error instanceof Error?error.message:"Email status unavailable"},{status:403})}
}

export async function POST(request:Request){
  try{
    const workspace=await access();
    const body=await request.json() as {to?:string;subject?:string;text?:string;fromName?:string;replyTo?:string;leadId?:number;reviewId?:string;permissionDocumented?:boolean;idempotencyKey?:string;sendMode?:"ai"|"manual";attachments?:Array<{path?:string;filename?:string;contentType?:string}>};
    const leadId=Math.max(0,Number(body.leadId)||0);const stored=await readStoredWorkspace(workspace.userId);const lead=stored?.leads.find(raw=>Number((raw as Record<string,unknown>).id)===leadId) as Record<string,unknown>|undefined;
    if(!lead||lead.deletedAt||String(lead.email||"").trim().toLowerCase()!==String(body.to||"").trim().toLowerCase())return Response.json({error:"Save this email address on the workspace contact before sending."},{status:400});
    if(body.sendMode==="ai"&&workspace.role==="agent"&&!agentAssignedLead(stored!,workspace.accountUserId,lead))return Response.json({error:"This reviewed contact is no longer assigned to you."},{status:403});
    if(body.sendMode==="ai"&&body.permissionDocumented===true)return Response.json({error:"Review contact permission before sending."},{status:403});
    const permissionLead=body.permissionDocumented===true?{...lead,emailConsent:true}:lead;
    if(!hasContactPermission(permissionLead,stored!.profile,"email"))return Response.json({error:lead.emailOptOut?"This contact unsubscribed from email.":"Document this contact’s email permission before sending."},{status:403});
    if(!stored?.profile.businessAddress)return Response.json({error:"Add the business mailing address in Owner Settings before sending commercial email."},{status:400});
    const text=emailWithComplianceFooter(String(body.text||""),stored.profile);
    const idempotencyKey=String(body.idempotencyKey||`manual-${workspace.userId}-${leadId}-${Date.now()}`).replace(/[^a-zA-Z0-9:_-]/g,"-").slice(0,200);
    if(body.sendMode==="ai")await assertAutomatedContact(workspace.userId,String(body.to||""),"email");
    const attachments=(Array.isArray(body.attachments)?body.attachments:[]).flatMap(item=>item?.path&&item?.filename?[{path:String(item.path),filename:String(item.filename).slice(0,120),contentType:String(item.contentType||"").slice(0,100)}]:[]).slice(0,10);
    const savedAttachments=await archiveMessageFiles(workspace.userId,attachments,new URL(request.url).origin);
    const claim=body.sendMode==="ai"?await claimReviewedSend({workspaceId:workspace.userId,reviewId:String(body.reviewId||""),leadId,channel:"email",recipient:String(body.to||""),subject:String(body.subject||""),body:text}):null;
    if(claim&&!claim.claimed)return Response.json({ok:true,reviewedSend:claim.receipt,duplicate:true},{status:claim.receipt.state==="submitting"?202:200});
    try{
    const result=await sendOutboundEmail({to:String(body.to||""),subject:String(body.subject||""),text,fromName:String(body.fromName||""),replyTo:inboundReplyAddress(workspace.userId)||String(body.replyTo||""),idempotencyKey:claim?.key||idempotencyKey,attachments});const sentAt=new Date().toISOString();
    const leads=stored.leads.map(raw=>Number((raw as Record<string,unknown>).id)===leadId?{...(raw as Record<string,unknown>),lastEmailAt:sentAt,...(body.permissionDocumented===true?{emailConsent:true}:{}),communications:appendCommunication((raw as Record<string,unknown>).communications,{authorship:body.sendMode==="ai"?"automation":"owner",id:crypto.randomUUID(),channel:"email",direction:"outbound",subject:String(body.subject||"").slice(0,200),body:text,attachments:savedAttachments,status:body.sendMode==="ai"?"submitted":"sent",sentAt,provider:result.provider,providerId:result.id})}:raw);await saveWorkspaceChanges(workspace.userId,stored,{...stored,leads});
    const reviewedSend=claim?{state:"accepted" as const,at:sentAt,payloadHash:claim.receipt.payloadHash,providerId:result.id}:undefined;
    if(claim)await finishReviewedSend(claim.key,reviewedSend!,claim.holdKey);
    return Response.json({ok:true,reviewedSend,message:{id:result.id,provider:result.provider,status:claim?"submitted":"sent",sentAt,attachments:savedAttachments}});
    }catch(error){
      if(claim)await finishReviewedSend(claim.key,{state:"uncertain",at:new Date().toISOString(),payloadHash:claim.receipt.payloadHash,reason:"Submission could not be confirmed. Reconcile in Messages before making another review."},claim.holdKey);
      throw error;
    }
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Email could not be sent"},{status:error instanceof ReviewedSendConflictError?409:503})}
}
