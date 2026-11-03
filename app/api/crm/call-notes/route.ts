import {getPacificaAccess} from '../../../lib/clerk-access';
import {updateStoredWorkspace} from '../../../lib/workspace-storage';
import {appendMobileCallNote} from '../../../lib/mobile-call-note';
export const runtime='nodejs';
export async function POST(request:Request){
 const access=await getPacificaAccess();if(!access.allowed)return Response.json({error:'Sign in required.'},{status:403});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin.'},{status:403});
 try{const raw=await request.text();if(raw.length>10000)return Response.json({error:'Notes are too long.'},{status:413});const body=JSON.parse(raw);
 const notes=typeof body.notes==='string'?body.notes.trim():'';
 if(!Number.isSafeInteger(body.leadId)||typeof body.key!=='string'||!/^[A-Za-z0-9:_-]{8,150}$/.test(body.key)||!notes||notes.length>6000||!['Completed','Call back later','Appointment set','No answer'].includes(body.outcome))return Response.json({error:'Check the contact and call notes.'},{status:400});
 await updateStoredWorkspace(access.userId,w=>({...w,leads:appendMobileCallNote(w.leads,{leadId:body.leadId,key:body.key,notes,outcome:body.outcome})}));
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Call notes could not save. Your draft is kept on this phone.'},{status:400})}
}
