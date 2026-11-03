import {applyJarvisResult,cleanJarvisResult,JarvisInputError,jarvisAuth,toJarvisRequest,type JarvisSubmission} from "../../../../../lib/jarvis-integration";
import {cleanQuoteIntake} from "../../../../../lib/quote-intake";
import {readStoredWorkspace,updateStoredWorkspace} from "../../../../../lib/workspace-storage";

export const runtime="nodejs";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const validId=(id:string)=>/^[A-Za-z0-9_-]{6,80}$/.test(id);

// GET one quote request with the details needed to prepare a quote.
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=jarvisAuth(request);
  if(!auth.ok)return json({error:auth.error},auth.status);
  const {id}=await params;
  if(!validId(id))return json({error:"Quote request not found"},404);
  try{
    const workspace=await readStoredWorkspace(auth.workspaceId);
    const found=cleanQuoteIntake(workspace?.quoteIntake).submissions.find(s=>s.id===id) as JarvisSubmission|undefined;
    return found?json({request:toJarvisRequest(found)}):json({error:"Quote request not found"},404);
  }catch{
    return json({error:"Unable to read the quote request"},500);
  }
}

// POST a quote result: {status:"quoted"|"needs_info"|"failed", carrier, premium, termMonths, quoteNumber, notes, missing:[]}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=jarvisAuth(request);
  if(!auth.ok)return json({error:auth.error},auth.status);
  const {id}=await params;
  if(!validId(id))return json({error:"Quote request not found"},404);
  try{
    const raw=await request.text();
    if(raw.length>8000)return json({error:"Request is too large"},413);
    const result=cleanJarvisResult(JSON.parse(raw||"{}"));
    const next=await updateStoredWorkspace(auth.workspaceId,current=>applyJarvisResult(current,id,result));
    const saved=cleanQuoteIntake(next?.quoteIntake).submissions.find(s=>s.id===id) as JarvisSubmission|undefined;
    return json({ok:true,request:saved?toJarvisRequest(saved):null});
  }catch(error){
    if(error instanceof JarvisInputError)return json({error:error.message},error.status);
    if(error instanceof SyntaxError)return json({error:"Send valid JSON"},400);
    return json({error:"Unable to save the quote result"},500);
  }
}
