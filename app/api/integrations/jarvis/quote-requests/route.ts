import {jarvisAuth,listQuoteRequests} from "../../../../lib/jarvis-integration";
import {readStoredWorkspace} from "../../../../lib/workspace-storage";

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
