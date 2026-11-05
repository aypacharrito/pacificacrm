import {createHash,timingSafeEqual} from "node:crypto";
import {cleanQuoteIntake,phoneKey,type QuoteDetails,type QuoteSubmission} from "./quote-intake";
import type {StoredWorkspace} from "./workspace-storage";

/**
 * Jarvis integration: lets the owner's Jarvis assistant read pending quote requests and
 * record quote results. Least privilege by design:
 *  - one revocable token (JARVIS_INTEGRATION_TOKEN, 32+ chars) bound to one workspace
 *    (JARVIS_WORKSPACE_ID); rotate or delete the env var to revoke;
 *  - token only in the Authorization header, never in a URL;
 *  - Jarvis can attach a result to a request but cannot accept, dismiss or delete it,
 *    and never writes leads (an open CRM tab owns lead edits);
 *  - Jarvis (Doxa) can create a pending quote request that the owner approved in Doxa. It is marked
 *    agent-entered (no customer contact permission is recorded) and the owner still reviews it here.
 */
export type JarvisQuoteStatus="quoted"|"needs_info"|"failed";
export type JarvisQuoteResult={status:JarvisQuoteStatus;carrier:string;premium:number|null;termMonths:number|null;
  quoteNumber:string;notes:string;missing:string[];updatedAt:string};
export type JarvisSubmission=QuoteSubmission&{jarvis?:JarvisQuoteResult;jarvisHistory?:JarvisQuoteResult[]};
export type JarvisQuoteRequest={id:string;submittedAt:string;source:string;status:QuoteSubmission["status"];
  leadId:number|null;details:QuoteDetails;requestNotes:string;needsQuote:boolean;jarvis:JarvisQuoteResult|null};
export type JarvisAuth={ok:true;workspaceId:string}|{ok:false;status:number;error:string};

export class JarvisInputError extends Error{constructor(message:string,readonly status=400){super(message)}}

const STATUSES:JarvisQuoteStatus[]=["quoted","needs_info","failed"];
const digest=(value:string)=>createHash("sha256").update(value).digest();
const text=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";

export function jarvisAuth(request:Request):JarvisAuth{
  const expected=process.env.JARVIS_INTEGRATION_TOKEN?.trim()||"";
  const workspaceId=process.env.JARVIS_WORKSPACE_ID?.trim()||"";
  if(expected.length<32||!workspaceId)return {ok:false,status:503,error:"Jarvis integration is not configured"};
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim()||"";
  if(!supplied||!timingSafeEqual(digest(supplied),digest(expected)))return {ok:false,status:401,error:"Invalid Jarvis token"};
  return {ok:true,workspaceId};
}

export function toJarvisRequest(submission:JarvisSubmission):JarvisQuoteRequest{
  const jarvis=submission.jarvis||null;
  return {id:submission.id,submittedAt:submission.submittedAt,source:submission.source,status:submission.status,
    leadId:submission.leadId,details:submission.details,requestNotes:submission.requestNotes||"",jarvis,
    needsQuote:submission.status==="pending"&&jarvis?.status!=="quoted"};
}

export function listQuoteRequests(workspace:StoredWorkspace|null,filter="needs-quote",limit=50):JarvisQuoteRequest[]{
  const submissions=cleanQuoteIntake(workspace?.quoteIntake).submissions as JarvisSubmission[];
  const all=submissions.map(toJarvisRequest).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
  const chosen=filter==="all"?all:filter==="pending"?all.filter(r=>r.status==="pending"):all.filter(r=>r.needsQuote);
  return chosen.slice(0,Math.max(1,Math.min(100,limit||50)));
}

export function cleanJarvisResult(raw:unknown,now=new Date()):JarvisQuoteResult{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new JarvisInputError("Send a JSON object");
  const body=raw as Record<string,unknown>;
  const status=body.status as JarvisQuoteStatus;
  if(!STATUSES.includes(status))throw new JarvisInputError("status must be quoted, needs_info or failed");
  const number=(value:unknown,min:number,max:number,name:string)=>{
    if(value===undefined||value===null||value==="")return null;
    const n=typeof value==="number"?value:Number(String(value).replace(/[$,\s]/g,""));
    if(!Number.isFinite(n)||n<min||n>max)throw new JarvisInputError(`${name} is out of range`);
    return Math.round(n*100)/100;
  };
  const result:JarvisQuoteResult={status,carrier:text(body.carrier,80),premium:number(body.premium,0,10_000_000,"premium"),
    termMonths:number(body.termMonths,1,36,"termMonths"),quoteNumber:text(body.quoteNumber,80),notes:text(body.notes,2000),
    missing:Array.isArray(body.missing)?body.missing.map(x=>text(x,120)).filter(Boolean).slice(0,20):[],
    updatedAt:now.toISOString()};
  if(status==="quoted"&&(!result.carrier||result.premium===null))throw new JarvisInputError("A quoted result needs carrier and premium");
  if(status==="needs_info"&&!result.missing.length&&!result.notes)throw new JarvisInputError("Say what information is missing");
  return result;
}

export type JarvisCreateInput={customerName:string;product:string;coverage:string;phone:string;email:string;requestId:string};
export const JARVIS_SOURCE="Doxa";
export const JARVIS_LINK_ID="doxa";
export const JARVIS_DAILY_CREATE_LIMIT=50;
export const agentEnteredText="Entered by the agency owner through Doxa after approving it there. Not submitted by the customer: "+
  "no customer contact permission is recorded with this request.";
const PRODUCTS=["Auto","Home","Renters","Life","Commercial","Home & Auto"];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME=/^[\p{L}\p{N}][\p{L}\p{N}&'’.,\- ]{1,99}$/u;

export function cleanJarvisCreate(raw:unknown):JarvisCreateInput{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new JarvisInputError("Send a JSON object");
  const body=raw as Record<string,unknown>;
  const customerName=text(body.customerName,100).replace(/\s+/g," ");
  if(!NAME.test(customerName))throw new JarvisInputError("customerName must be the customer's name (2-100 characters)");
  const product=text(body.product,40);
  if(product&&!PRODUCTS.includes(product))throw new JarvisInputError(`product must be one of ${PRODUCTS.join(", ")}, or empty`);
  const phone=phoneKey(text(body.phone,30));
  if(phone&&!/^\d{10}$/.test(phone))throw new JarvisInputError("phone must be a 10-digit US number, or empty");
  const email=text(body.email,200).toLowerCase();
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new JarvisInputError("email is not valid");
  const requestId=text(body.requestId,64).toLowerCase();
  if(!UUID.test(requestId))throw new JarvisInputError("requestId must be a UUID");
  return {customerName,product,coverage:text(body.coverage,500),phone,email,requestId};
}

/** Adds a pending, agent-entered request. A resend with the same requestId returns the workspace unchanged. */
export function createJarvisQuoteRequest(workspace:StoredWorkspace,input:JarvisCreateInput,now=new Date()):StoredWorkspace{
  const intake=cleanQuoteIntake(workspace.quoteIntake);
  const existing=intake.submissions.find(s=>s.id===input.requestId);
  if(existing){
    if(existing.linkId!==JARVIS_LINK_ID)throw new JarvisInputError("requestId is already in use",409);
    return workspace;
  }
  const pending=intake.submissions.filter(s=>s.status==="pending");
  if(pending.length>=400)throw new JarvisInputError("Review the pending quote requests in Pacifica first",429);
  const today=intake.submissions.filter(s=>s.linkId===JARVIS_LINK_ID&&now.getTime()-Date.parse(s.submittedAt)<86400000);
  if(today.length>=JARVIS_DAILY_CREATE_LIMIT)throw new JarvisInputError("Doxa's daily quote-request limit is reached",429);
  const details:QuoteDetails={name:input.customerName,phone:input.phone,email:input.email,product:input.product,address:"",city:"",
    state:"",zip:"",dateOfBirth:"",renewalDate:"",vin:"",currentCarrier:"",contactPermission:false};
  const submission:QuoteSubmission={id:input.requestId,linkId:JARVIS_LINK_ID,leadId:null,source:JARVIS_SOURCE,
    submittedAt:now.toISOString(),status:"pending",details,consentText:agentEnteredText,
    ...(input.coverage?{requestNotes:input.coverage}:{})};
  const reviewed=intake.submissions.filter(s=>s.status!=="pending").slice(-(499-pending.length));
  return {...workspace,quoteIntake:{...intake,submissions:[...reviewed,...pending,submission].slice(-500)}};
}

export function applyJarvisResult(workspace:StoredWorkspace,id:string,result:JarvisQuoteResult):StoredWorkspace{
  const intake=cleanQuoteIntake(workspace.quoteIntake);
  const index=intake.submissions.findIndex(s=>s.id===id);
  if(index<0)throw new JarvisInputError("Quote request not found",404);
  const current=intake.submissions[index] as JarvisSubmission;
  const history=[...(current.jarvisHistory||[]),result].slice(-10);
  const submissions=[...intake.submissions];
  submissions[index]={...current,jarvis:result,jarvisHistory:history} as JarvisSubmission;
  return {...workspace,quoteIntake:{...intake,submissions}};
}
