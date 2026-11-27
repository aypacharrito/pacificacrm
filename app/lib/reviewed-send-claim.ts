import {createHash} from "node:crypto";
import {workspaceRedis} from "./workspace-redis";

export type ReviewedSendState="submitting"|"accepted"|"uncertain";
export type ReviewedSendReceipt={state:ReviewedSendState;at:string;payloadHash:string;providerId?:string;reason?:string};
export class ReviewedSendConflictError extends Error {}

function payloadHash(leadId:number,channel:"sms"|"email",recipient:string,subject:string,body:string){
  return createHash("sha256").update(JSON.stringify([leadId,channel,recipient.trim().toLowerCase(),subject.trim(),body.trim()])).digest("hex");
}

export async function claimReviewedSend(input:{workspaceId:string;reviewId:string;leadId:number;channel:"sms"|"email";recipient:string;subject?:string;body:string}){
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.reviewId))throw new Error("Open a new Doxa review before submitting this message.");
  const receiptKey=`doxa-reviewed-send:v2:${input.workspaceId}:${input.reviewId}:${input.leadId}`;
  const holdKey=`doxa-reviewed-hold:v1:${input.workspaceId}:${input.leadId}:${input.channel}`;
  const hash=payloadHash(input.leadId,input.channel,input.recipient,input.subject||"",input.body);
  const started:ReviewedSendReceipt={state:"submitting",at:new Date().toISOString(),payloadHash:hash};
  // Redis NX is the dispatch boundary. No TTL: an unconfirmed provider request must
  // never become eligible simply because an employee reopened the review later.
  const claimed=await workspaceRedis(["SET",receiptKey,JSON.stringify(started),"NX"]);
  if(claimed===null){
    const existing=await workspaceRedis(["GET",receiptKey]);
    if(typeof existing!=="string")throw new Error("Reviewed send status is unavailable. No message was submitted.");
    const receipt=JSON.parse(existing) as ReviewedSendReceipt;
    if(receipt.payloadHash!==hash)throw new ReviewedSendConflictError("This Doxa review changed. Start a new review before submitting the edited message.");
    return {claimed:false,key:receiptKey,holdKey,receipt};
  }
  if(claimed!=="OK")throw new Error("Reviewed send protection is unavailable. No message was submitted.");
  try{
    const hold=await workspaceRedis(["SET",holdKey,receiptKey,"NX"]);
    if(hold!=="OK")throw new ReviewedSendConflictError("A reviewed send for this contact is still pending reconciliation. Check Messages before another review.");
  }catch(error){
    await workspaceRedis(["DEL",receiptKey]);
    throw error;
  }
  return {claimed:true,key:receiptKey,holdKey,receipt:started};
}

export async function finishReviewedSend(key:string,receipt:ReviewedSendReceipt,holdKey?:string){
  const saved=await workspaceRedis(["SET",key,JSON.stringify(receipt)]);
  if(saved!=="OK")throw new Error("Submission status could not be saved. Reconcile in Messages before any new review.");
  // A provider rejection or lost response remains on hold. Only a confirmed
  // acceptance releases the contact for a separately reviewed later message.
  if(receipt.state==="accepted"&&holdKey)await workspaceRedis(["DEL",holdKey]);
}
