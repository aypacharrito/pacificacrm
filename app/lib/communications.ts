import {cleanMessageAttachments,type MessageAttachment} from "./message-attachments";
import {nextSmsDeliveryStatus} from "./sms-delivery";
export type CommunicationChannel="sms"|"email";
export type StoredCommunication={segments?:number;attachments?:MessageAttachment[];mediaCount?:number;from?:string;to?:string;id:string;channel:CommunicationChannel;direction:"outbound"|"inbound";subject?:string;body:string;status:string;sentAt:string;provider:string;providerId?:string;failureReason?:string;errorCode?:number};
export function cleanCommunications(value:unknown):StoredCommunication[]{
 if(!Array.isArray(value))return [];
 return value.flatMap(raw=>{
  if(!raw||typeof raw!=="object")return [];const item=raw as Partial<StoredCommunication>;
  const channel=item.channel==="email"?"email":item.channel==="sms"?"sms":null,body=String(item.body||"").trim().slice(0,10000),attachments=cleanMessageAttachments(item.attachments),mediaCount=Math.min(30,Math.max(Number(item.mediaCount)||0,attachments.length));
  if(!channel||(!body&&!attachments.length&&!mediaCount))return [];
  return [{segments:Number.isFinite(Number(item.segments))?Math.max(1,Math.round(Number(item.segments))):undefined,id:String(item.id||item.providerId||crypto.randomUUID()),channel,direction:item.direction==="inbound"?"inbound":"outbound",body,attachments,mediaCount,from:String(item.from||""),to:String(item.to||""),subject:String(item.subject||"").slice(0,200)||undefined,status:String(item.status||"sent").slice(0,60),sentAt:String(item.sentAt||new Date().toISOString()),provider:String(item.provider||"pacifica").slice(0,60),providerId:String(item.providerId||"").slice(0,200)||undefined,failureReason:String(item.failureReason||"").slice(0,500)||undefined,errorCode:Number.isInteger(Number(item.errorCode))&&Number(item.errorCode)>0?Number(item.errorCode):undefined} satisfies StoredCommunication];
 });
}
export const communicationKey=(message:StoredCommunication)=>`${message.channel}:${message.providerId||message.id}`;
export function mergeCommunication(old:StoredCommunication,next:StoredCommunication):StoredCommunication{return {...old,...next,id:old.id,body:next.body||old.body,attachments:next.attachments?.length?next.attachments:old.attachments,mediaCount:Math.max(old.mediaCount||0,next.mediaCount||0),status:next.channel==="sms"?nextSmsDeliveryStatus(old.status,next.status):next.status}}
export function mergeConversationMessages(...groups:StoredCommunication[][]){const messages=new Map<string,StoredCommunication>();for(const message of groups.flat()){const key=communicationKey(message),old=messages.get(key);messages.set(key,old?mergeCommunication(old,message):message)}return [...messages.values()].sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt)||communicationKey(a).localeCompare(communicationKey(b)))}
export function appendCommunication(current:unknown,communication:StoredCommunication){return mergeConversationMessages(cleanCommunications(current),[communication])}
