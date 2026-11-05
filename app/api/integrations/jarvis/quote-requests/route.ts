import {cleanJarvisCreate,createJarvisQuoteRequest,JarvisInputError,jarvisAuth,listQuoteRequests,toJarvisRequest,type JarvisSubmission} from "../../../../lib/jarvis-integration";
import {cleanQuoteIntake} from "../../../../lib/quote-intake";
import {readStoredWorkspace,updateStoredWorkspace} from "../../../../lib/workspace-storage";

export const runtime="nodejs";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});

// GET /api/integrations/jarvis/quote-requests?filter=needs-quote|pending|all&limit=50
export async function GET(request:Request){
  const auth=jarvisAuth(request);
  if(!auth.ok)return json({error:auth.error},auth.status);
  try{
    const url=new URL(request.url);
    const filter=url.searchParams.get("filter")||"needs-quote";
    if(!["needs-quote","pending","all"].includes(filter))return json({error:"filter must be needs-quote, pending or all"},400);
    const requests=listQuoteRequests(await readStoredWorkspace(auth.workspaceId),filter,Number(url.searchParams.get("limit")||50));
    return json({requests});
  }catch{
    return json({error:"Unable to read quote requests"},500);
  }
}

// POST a new quote request the owner approved in Doxa:
// {customerName, product, coverage, phone, email, requestId(UUID)}. 201 when created, 200 for a resend of the same requestId.
// Creates a pending, agent-entered request only; it never accepts it, writes leads, contacts carriers or binds coverage.
export async function POST(request:Request){
  const auth=jarvisAuth(request);
  if(!auth.ok)return json({error:auth.error},auth.status);
  try{
    const raw=await request.text();
    if(raw.length>8000)return json({error:"Request is too large"},413);
    const input=cleanJarvisCreate(JSON.parse(raw||"{}"));
    let created=false;
    const next=await updateStoredWorkspace(auth.workspaceId,current=>{
      const updated=createJarvisQuoteRequest(current,input);
      created=updated!==current;
      return updated;
    });
    const saved=cleanQuoteIntake(next?.quoteIntake).submissions.find(s=>s.id===input.requestId) as JarvisSubmission|undefined;
    if(!saved)return json({error:"Unable to save the quote request"},500);
    return json({ok:true,created,request:toJarvisRequest(saved)},created?201:200);
  }catch(error){
    if(error instanceof JarvisInputError)return json({error:error.message},error.status);
    if(error instanceof SyntaxError)return json({error:"Send valid JSON"},400);
    return json({error:"Unable to save the quote request"},500);
  }
}
