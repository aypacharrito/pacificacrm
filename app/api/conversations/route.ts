import { isHostedRuntime } from "../../lib/hosted-runtime";
import {getPacificaAccess} from "../../lib/clerk-access";
import {isClerkConfigured} from "../../lib/clerk-config";
import {readStoredWorkspace} from "../../lib/workspace-storage";
import {archiveConversation,conversationAddress,readConversation} from "../../lib/conversation-history";
import {importSmsHistory} from "../../lib/twilio-conversation-history";
export const runtime="nodejs";
export async function GET(request:Request){
 const access=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local",email:"local"};if(!access.allowed)return Response.json({error:"Sign in to view conversations."},{status:403});
 try{const params=new URL(request.url).searchParams,channel=params.get("channel")==="email"?"email":"sms",workspace=await readStoredWorkspace(access.userId),lead=workspace?.leads.find(raw=>String((raw as {id:unknown}).id)===params.get("leadId")) as Record<string,unknown>|undefined;if(!lead)return Response.json({error:"Contact not found"},{status:404});
 const field=channel==="sms"?"phone":"email",address=conversationAddress(lead[field],channel);if(!address)return Response.json({messages:[],nextCursor:null,providerCursor:null});
 const matches=workspace!.leads.filter(raw=>conversationAddress((raw as Record<string,unknown>)[field],channel)===address) as Array<Record<string,unknown>>;
 await archiveConversation(access.userId,address,channel,matches.flatMap(item=>Array.isArray(item.communications)?item.communications:[]));
 let providerCursor:string|null=params.get("providerCursor"),notice="";
 if(channel==="sms"&&params.get("sync")==="1"){try{providerCursor=await importSmsHistory(access.userId,access.email,address,providerCursor||"")}catch{notice="Provider history is temporarily unavailable. Showing saved messages."}}
 const page=await readConversation(access.userId,address,channel,params.get("before")||"");return Response.json({...page,providerCursor,notice},{headers:{"Cache-Control":"private, no-store"}});
 }catch{console.error("[conversations] read failed");return Response.json({error:"Conversation history could not be loaded. Please retry."},{status:503})}
}
