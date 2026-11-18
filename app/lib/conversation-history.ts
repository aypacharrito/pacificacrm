import {createHash} from "node:crypto";
import type { StoredWorkspace } from "./workspace-storage";
import { workspaceRedis, workspaceRedisConfig } from "./workspace-redis";
import {cleanCommunications,communicationKey,mergeCommunication,type StoredCommunication,type CommunicationChannel} from "./communications";
export function conversationAddress(value:unknown,channel:CommunicationChannel){return channel==="sms"?String(value||"").replace(/\D/g,"").slice(-10):String(value||"").trim().toLowerCase()}
function threadKey(workspaceId:string,address:string,channel:CommunicationChannel){return `pacifica:history:v1:${workspaceId}:${channel}:${createHash("sha256").update(conversationAddress(address,channel)).digest("hex")}`}
const sortKey=(message:StoredCommunication)=>`${new Date(Number.isFinite(Date.parse(message.sentAt))?Date.parse(message.sentAt):0).toISOString()}|${communicationKey(message)}`;
const saveScript=`
for i=1,#ARGV,3 do
 local id=ARGV[i]; local rank=ARGV[i+1]; local message=cjson.decode(ARGV[i+2]); local raw=redis.call('HGET',KEYS[1],id)
 if raw then
  local old=cjson.decode(raw)
  if not message.attachments or #message.attachments==0 then message.attachments=old.attachments end
  if not message.body or message.body=='' then message.body=old.body end
  message.mediaCount=math.max(tonumber(message.mediaCount) or 0,tonumber(old.mediaCount) or 0)
  if message.channel=='sms' then
   local ranks={queued=1,accepted=1,sending=2,sent=3,failed=4,undelivered=4,delivered=5,received=5,read=6}
   if (ranks[old.status] or 0)>(ranks[message.status] or 0) then message.status=old.status end
  end
 end
 local previous=redis.call('HGET',KEYS[3],id); if previous and previous~=rank then redis.call('ZREM',KEYS[2],previous) end
 redis.call('HSET',KEYS[1],id,cjson.encode(message));redis.call('HSET',KEYS[3],id,rank);redis.call('ZADD',KEYS[2],0,rank)
end
return 1`;
async function database(){const {getD1}=await import("../../db/index");const db=getD1();await db.prepare("CREATE TABLE IF NOT EXISTS crm_messages (thread TEXT NOT NULL,id TEXT NOT NULL,sort_key TEXT NOT NULL,message_json TEXT NOT NULL,PRIMARY KEY(thread,id))").run();await db.prepare("CREATE INDEX IF NOT EXISTS crm_messages_order ON crm_messages(thread,sort_key)").run();return db}
/** No TTL or trimming. Inline workspace previews can be compacted only after this succeeds. */
export async function archiveConversation(workspaceId:string,address:string,channel:CommunicationChannel,input:unknown){
 const messages=cleanCommunications(input).filter(message=>message.channel===channel);if(!address||!messages.length)return;
 const key=threadKey(workspaceId,address,channel);
 if(workspaceRedisConfig().url){for(let start=0;start<messages.length;start+=20){const values=messages.slice(start,start+20).flatMap(message=>[communicationKey(message),sortKey(message),JSON.stringify(message)]);await workspaceRedis(["EVAL",saveScript,3,key,`${key}:order`,`${key}:ranks`,...values])}return}
 const db=await database();for(const message of messages){const id=communicationKey(message),row=await db.prepare("SELECT message_json FROM crm_messages WHERE thread=? AND id=?").bind(key,id).first() as {message_json:string}|null;const next=row?mergeCommunication(JSON.parse(row.message_json),message):message;await db.prepare("INSERT INTO crm_messages(thread,id,sort_key,message_json) VALUES(?,?,?,?) ON CONFLICT(thread,id) DO UPDATE SET sort_key=excluded.sort_key,message_json=excluded.message_json").bind(key,id,sortKey(next),JSON.stringify(next)).run()}
}
export async function readConversation(workspaceId:string,address:string,channel:CommunicationChannel,before="",limit=60){
 const key=threadKey(workspaceId,address,channel);limit=Math.min(100,Math.max(1,limit));if(before.length>512)throw Error("Invalid history cursor");let rows:Array<{sort:string;message:StoredCommunication}>=[];
 if(workspaceRedisConfig().url){const ranks=await workspaceRedis(["ZREVRANGEBYLEX",`${key}:order`,before?`(${before}`:"+","-","LIMIT",0,limit+1]);if(Array.isArray(ranks)&&ranks.length){const values=await workspaceRedis(["HMGET",key,...ranks.map(rank=>String(rank).slice(String(rank).indexOf("|")+1))]);rows=(Array.isArray(values)?values:[]).flatMap((raw,i)=>typeof raw==="string"?[{sort:String(ranks[i]),message:JSON.parse(raw)}]:[])}}
 else{const db=await database();const result=await db.prepare("SELECT sort_key,message_json FROM crm_messages WHERE thread=? AND sort_key<? ORDER BY sort_key DESC LIMIT ?").bind(key,before||"\uffff",limit+1).all();rows=(result.results as Array<{sort_key:string;message_json:string}>).map(row=>({sort:row.sort_key,message:JSON.parse(row.message_json)}))}
 const more=rows.length>limit;const page=rows.slice(0,limit);return {messages:page.map(row=>row.message).reverse(),nextCursor:more?page.at(-1)!.sort:null};
}
export async function archiveWorkspaceConversations(workspaceId:string,next:StoredWorkspace,previous?:StoredWorkspace){
 const oldById=new Map((previous?.leads||[]).map(raw=>{const lead=raw as Record<string,unknown>;return [lead.id,lead]}));const leads=[...next.leads];let index=0;
 await Promise.all(Array.from({length:4},async()=>{while(index<leads.length){const position=index++,lead=leads[position] as Record<string,unknown>,old=oldById.get(lead.id),messages=cleanCommunications(lead.communications);if(!messages.length)continue;
 const same=JSON.stringify(messages)===JSON.stringify(cleanCommunications(old?.communications));if(same&&messages.length<=200)continue;
 const oldMessages=new Map(cleanCommunications(old?.communications).map(message=>[communicationKey(message),JSON.stringify(message)]));
 const pending=old?.conversationArchiveVersion===1?messages.filter(message=>oldMessages.get(communicationKey(message))!==JSON.stringify(message)):messages;
 for(const channel of ["sms","email"] as const){const address=conversationAddress(lead[channel==="sms"?"phone":"email"],channel);if(address)await archiveConversation(workspaceId,address,channel,pending)}
 // Records without an address cannot be archived yet and must retain all inline data.
 const archived=messages.filter(message=>Boolean(conversationAddress(lead[message.channel==="sms"?"phone":"email"],message.channel)));
 const archivedSet=new Set(archived);leads[position]={...lead,conversationArchiveVersion:1,communications:[...messages.filter(message=>!archivedSet.has(message)),...archived.slice(-200)]};
 }}));return {...next,leads};
}
