import {createHash,timingSafeEqual} from "node:crypto";
import {cleanQuoteIntake,type QuoteDetails,type QuoteSubmission} from "./quote-intake";
import type {StoredWorkspace} from "./workspace-storage";

/**
 * Jarvis integration: lets the owner's Jarvis assistant read pending quote requests and
 * record quote results. Least privilege by design:
 *  - one revocable token (JARVIS_INTEGRATION_TOKEN, 32+ chars) bound to one workspace
 *    (JARVIS_WORKSPACE_ID); rotate or delete the env var to revoke;
 *  - token only in the Authorization header, never in a URL;
 *  - Jarvis can attach a result to a request but cannot accept, dismiss or delete it,
 *    and never writes leads (an open CRM tab owns lead edits).
 */
export type JarvisQuoteStatus="quoted"|"needs_info"|"failed";
export type JarvisQuoteResult={status:JarvisQuoteStatus;carrier:string;premium:number|null;termMonths:number|null;
  quoteNumber:string;notes:string;missing:string[];updatedAt:string};
export type JarvisSubmission=QuoteSubmission&{jarvis?:JarvisQuoteResult;jarvisHistory?:JarvisQuoteResult[]};
export type JarvisQuoteRequest={id:string;submittedAt:string;source:string;status:QuoteSubmission["status"];
  leadId:number|null;details:QuoteDetails;needsQuote:boolean;jarvis:JarvisQuoteResult|null};
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
    leadId:submission.leadId,details:submission.details,jarvis,
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
