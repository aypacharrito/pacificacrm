import {getPacificaAccess} from '../../../lib/clerk-access';
import {readStoredWorkspace,updateStoredWorkspace} from '../../../lib/workspace-storage';
import {pendingConversationThreads,type ConversationLead,cleanConversationCalendar} from '../../../lib/conversation-calendar';
import {reviewConversationCalendar} from '../../../lib/conversation-calendar-engine';
import {aiConfigured} from '../../../lib/ai-provider';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(){const access=await getPacificaAccess();if(!access.allowed)return Response.json({error:'Sign in required'},{status:403});const w=await readStoredWorkspace(access.userId),s=cleanConversationCalendar(w?.conversationCalendar);return Response.json({pendingConversations:pendingConversationThreads((w?.leads||[]) as ConversationLead[],s.checked).length,nextRunAt:s.nextRunAt,enabled:s.enabled,lastRunAt:s.lastRunAt,lastAdded:s.lastAdded,error:s.error,configured:aiConfigured(),canManage:access.role==='owner'&&access.accountUserId===access.userId},{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){
 const access=await getPacificaAccess();if(!access.allowed)return Response.json({error:'Sign in required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{const body=await request.json();if(body.action==='run')return Response.json(await reviewConversationCalendar(access.userId,true));
 if(body.action!=='settings'||typeof body.enabled!=='boolean')return Response.json({error:'Invalid action'},{status:400});
 if(access.role!=='owner'||access.accountUserId!==access.userId)return Response.json({error:'The workspace owner manages text review.'},{status:403});
 await updateStoredWorkspace(access.userId,w=>({...w,conversationCalendar:{...cleanConversationCalendar(w.conversationCalendar),enabled:body.enabled,lease:'',nextRunAt:0}}));return Response.json({ok:true});
 }catch{return Response.json({error:'Text review could not be updated.'},{status:503})}
}
