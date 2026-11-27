import {getPacificaAccess} from '../../../lib/clerk-access';
import {accountAllows} from '../../../lib/account-access-policy';
import {aiClient,aiConfigured,aiModel,aiProviderIssue,aiReasoning} from '../../../lib/ai-provider';
import {cleanFolderAiEnrichmentResult,cleanFolderAiIdentityResult,folderEnrichmentInstructions,folderEnrichmentSchema,folderIdentityInstructions,folderIdentitySchema,type FolderAiTarget} from '../../../lib/folder-ai';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){const access=await getPacificaAccess();if(!access.allowed||!accountAllows(access,'/api/ai/folder-contacts','POST'))return Response.json({error:'Workspace access required.'},{status:403});return Response.json({configured:aiConfigured(),model:aiModel()},{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:Request){
 const access=await getPacificaAccess();if(!access.allowed||!accountAllows(access,'/api/ai/folder-contacts','POST'))return Response.json({error:'Workspace access required.'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 if(Number(request.headers.get('content-length'))>60000)return Response.json({error:'Text section is too large.'},{status:413});
 const raw=await request.text();if(Buffer.byteLength(raw)>60000)return Response.json({error:'Text section is too large.'},{status:413});
 let body;try{body=JSON.parse(raw)}catch{return Response.json({error:'Invalid scan request.'},{status:400})}
 const phase=body?.phase==='enrichment'?'enrichment':'identity';
 const targets:FolderAiTarget[]=phase==='enrichment'&&Array.isArray(body.targets)?body.targets:[];
 const targetsValid=phase==='identity'||(targets.length>0&&targets.length<=16&&targets.every(target=>target&&typeof target.id==='string'&&target.id.length<=100&&typeof target.name==='string'&&target.name.length<=180&&typeof target.phone==='string'&&target.phone.length<=80));
 if(body?.mode!=='ai'||typeof body.text!=='string'||!body.text.trim()||body.text.length>12000||typeof body.file!=='string'||body.file.length>1000||typeof body.page!=='string'||body.page.length>160||typeof body.goal!=='string'||body.goal.length>1200||!targetsValid)return Response.json({error:'Choose a folder and start an AI scan.'},{status:400});
 if(!aiConfigured())return Response.json({error:'Connect Doxa in Settings first.'},{status:503});
 try{
  request.signal.throwIfAborted();const model=aiModel();
  const instructions=phase==='identity'?folderIdentityInstructions:folderEnrichmentInstructions,schema=phase==='identity'?folderIdentitySchema:folderEnrichmentSchema;
  const response=await aiClient().responses.create({model,store:false,...aiReasoning(model),input:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({goal:body.goal,sourceFile:body.file,sourcePage:body.page,...(phase==='enrichment'?{targets}:{}),text:body.text})}],text:{format:{type:'json_schema',name:phase==='identity'?'pacifica_folder_identities':'pacifica_folder_enrichment',strict:true,schema}},max_output_tokens:6000},{signal:request.signal});
  if(response.status==='incomplete'&&response.incomplete_details?.reason==='max_output_tokens')return Response.json({code:'split_required',usage:{input:response.usage?.input_tokens||0,output:response.usage?.output_tokens||0}},{status:422});
  if(response.status!=='completed'||!response.output_text)throw Object.assign(Error('Incomplete extraction'),{code:'incomplete_response'});
  const parsed=JSON.parse(response.output_text),extracted=phase==='identity'?cleanFolderAiIdentityResult(parsed,body.text,body.file,body.page):cleanFolderAiEnrichmentResult(parsed,body.text,body.file,body.page,targets);
  return Response.json({...extracted,usage:{input:response.usage?.input_tokens||0,output:response.usage?.output_tokens||0},model},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const issue=aiProviderIssue(error);return Response.json({error:issue.notice,code:issue.code},{status:503})}
}
