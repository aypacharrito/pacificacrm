import {cleanDocumentInsights} from '../../../lib/review-context';
import {createHash,randomUUID} from 'node:crypto';
import {getPacificaAccess} from '../../../lib/clerk-access';
import {readStoredWorkspace,updateStoredWorkspace} from '../../../lib/workspace-storage';
import {emptyNoteReview} from '../../../lib/note-reminders';
import {cleanDocumentLeadExtraction,documentLeadImportedFields} from '../../../lib/document-lead';
import {POST as scanDocument} from '../../ai/document-lead/route';
import type {StoredCommunication} from '../../../lib/communications';
export const runtime='nodejs';export const maxDuration=60;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
type Lead={id:number;deletedAt?:string;communications?:StoredCommunication[]};
export async function POST(request:Request){
 const access=await getPacificaAccess();if(!access.allowed)return json({error:'Workspace access required.'},403);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
 let claimKey='',claim='';
 try{
  const raw=await request.text();if(raw.length>4_200_000)return json({error:'File too large.'},413);
  const body=JSON.parse(raw);if(!Number.isSafeInteger(body.leadId))return json({error:'Choose a contact.'},400);
  if(!['policy','other'].includes(body.documentKind)||body.aiConsent!==true)return json({error:'Choose a non-ID document and approve AI review before uploading.'},400);
  const workspace=await readStoredWorkspace(access.userId);
  const lead=(workspace?.leads as Lead[]||[]).find(l=>l.id===body.leadId&&!l.deletedAt);if(!lead)return json({error:'Contact not found.'},404);
  let payload:{image?:string;pdf?:string;fileName?:string}={},identity='',name='Uploaded document';
  if(typeof body.messageId==='string'){
   const message=lead.communications?.find(m=>m.id===body.messageId);
   const attachment=Number.isInteger(body.index)&&body.index>=0?message?.attachments?.[body.index]:undefined;
   if(!attachment)return json({error:'Saved attachment not found.'},404);
   // Only owned, authenticated CRM media routes; never fetch a user-supplied external URL.
   const url=attachment.url;let response:Response;
   const media=url.match(/^\/api\/message-media\/([a-f0-9]{64})(?:\?.*)?$/i);
   const email=url.match(/^\/api\/email\/media\/([a-f0-9]{64})(?:\?.*)?$/i);
   const twilio=url.match(/^\/api\/twilio\/messages\/(SM[a-f0-9]{32})\/media\/(ME[a-f0-9]{32})(?:\?.*)?$/i);
   if(!media&&!email&&!twilio)return json({error:'Download this attachment and upload it here for AI review.'},400);
   identity=`${body.messageId}:${body.index}:${url}`;name=attachment.name||'Saved attachment';
   claimKey=`attachment:${lead.id}:${createHash('sha256').update(identity).digest('hex')}`;
   if(workspace?.noteReview?.checked[claimKey]==='done')return json({added:0,alreadyReviewed:true});
   if(media){const {GET}=await import('../../message-media/[token]/route');response=await GET(new Request(new URL(`/api/message-media/${media[1]}?history=1`,request.url)),{params:Promise.resolve({token:media[1]})});}
   else if(email){const {GET}=await import('../../email/media/[token]/route');response=await GET(request,{params:Promise.resolve({token:email[1]})});}
   else{const {GET}=await import('../../twilio/messages/[sid]/media/[mediaSid]/route');response=await GET(request,{params:Promise.resolve({sid:twilio![1],mediaSid:twilio![2]})});}
   if(!response.ok||!response.body)return json({error:'Attachment unavailable. Retry or upload the file.'},502);
   const type=(response.headers.get('content-type')||'').split(';')[0];
   if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(type)){await response.body.cancel();return json({error:'Use JPEG, PNG, WebP or PDF.'},400);}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
   while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2_700_000){await reader.cancel();return json({error:'File exceeds the 2.7 MB AI review limit.'},413);}chunks.push(part.value);}
   const data=`data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
   payload=type==='application/pdf'?{pdf:data}:{image:data};
  }else{
   payload={image:typeof body.image==='string'?body.image:undefined,pdf:typeof body.pdf==='string'?body.pdf:undefined};
   name=String(body.fileName||name).slice(0,120);identity=payload.image||payload.pdf||'';
   if(!identity)return json({error:'Choose a picture or PDF.'},400);
   claimKey=`attachment:${lead.id}:${createHash('sha256').update(identity).digest('hex')}`;
  }
  claim=`processing:${Date.now()+120000}:${randomUUID()}`;
  const claimed=await updateStoredWorkspace(access.userId,current=>{
   const state=current.noteReview||emptyNoteReview(),value=state.checked[claimKey];
   if(value==='done'||value?.startsWith('processing:')&&Number(value.split(':')[1])>Date.now())return current;
   return {...current,noteReview:{...state,checked:{...state.checked,[claimKey]:claim}}};
  });
  if(claimed.noteReview?.checked[claimKey]!==claim)return json({added:0,alreadyReviewed:true});
  const scan=await scanDocument(new Request(new URL('/api/ai/document-lead',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,documentKind:body.documentKind,aiConsent:true})}));
  const result=await scan.json();if(!scan.ok)throw Error(result.error||'AI document review failed.');
  const fields=documentLeadImportedFields(cleanDocumentLeadExtraction(result.extraction));
  const evidence=Object.entries(fields).filter(([,value])=>value).map(([key,value])=>`${key}: ${value}`);
  let added=0;
  await updateStoredWorkspace(access.userId,current=>{
   const state=current.noteReview||emptyNoteReview();if(state.checked[claimKey]!==claim)return current;
   const currentLead=(current.leads as Lead[]).find(l=>l.id===lead.id&&!l.deletedAt);
   if(!currentLead)throw Error('Contact is no longer available.');
   if(typeof body.messageId==='string'&&currentLead.communications?.find(m=>m.id===body.messageId)?.attachments?.[body.index]?.url!==lead.communications?.find(m=>m.id===body.messageId)?.attachments?.[body.index]?.url)throw Error('Attachment changed; retry review.');
   const now=new Date().toISOString(),documents=cleanDocumentInsights(current.documentInsights);
   const detail={id:randomUUID(),leadId:lead.id,sourceId:claimKey,name,text:evidence.join('\n').slice(0,12000),recordedAt:currentLead.communications?.find(m=>m.id===body.messageId)?.sentAt||now,createdAt:now};
   added=detail.text?1:0;
   return {...current,documentInsights:detail.text?[...documents.filter(d=>d.sourceId!==claimKey),detail].slice(-500):documents,noteReview:{...state,nextRunAt:state.lease?state.nextRunAt:0,checked:{...state.checked,[claimKey]:'done'}}};
  });return json({added,kind:"document-context"});
 }catch(error){
  if(claimKey&&claim)await updateStoredWorkspace(access.userId,current=>{const state=current.noteReview||emptyNoteReview();if(state.checked[claimKey]!==claim)return current;const checked={...state.checked};delete checked[claimKey];return {...current,noteReview:{...state,checked}};}).catch(()=>{});
  return json({error:error instanceof Error?error.message:'Attachment review failed.'},502);
 }
}
