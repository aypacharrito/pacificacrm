import { isHostedRuntime } from "../../lib/hosted-runtime";
import {getPacificaAccess} from "../../lib/clerk-access";
import {isClerkConfigured} from "../../lib/clerk-config";
import {workspaceRedis,workspaceRedisConfig} from "../../lib/workspace-storage";
import {mediaType,smsAudioTypes,messageAudioName} from '../../lib/message-audio';

export const runtime="nodejs";

const smsTypes=new Set(["image/jpeg","image/jpg","image/png","image/gif","image/heic","image/heif","application/pdf","text/vcard","text/x-vcard","text/csv",...smsAudioTypes]);
const smsLargeMediaTypes=new Set(["image/jpeg","image/jpg","image/png","image/gif"]);

async function access(){
  const result=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local",email:"local"};
  if(!result.allowed)throw new Error("An active Pacifica subscription is required.");
  return result;
}

function safeName(value:string,type:string){
  const extension=(value.match(/\.([a-zA-Z0-9]{1,6})$/)?.[1]||({"image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/gif":"gif","image/heic":"heic","image/heif":"heif","application/pdf":"pdf","text/vcard":"vcf","text/x-vcard":"vcf","text/csv":"csv"} as Record<string,string>)[type]||"file").toLowerCase();
  const base=value.replace(/\.[^.]+$/,"").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"attachment";
  const room=Math.max(1,19-extension.length);
  return `${base.slice(0,room)}.${extension}`.slice(0,20);
}

export async function POST(request:Request){
  try{
    const workspace=await access();
    if(!workspaceRedisConfig().url)return Response.json({error:"Message media storage is not configured. Add the existing Pacifica KV/Upstash storage variables before sending attachments."},{status:503});
    const form=await request.formData();
    const raw=form.get("file");
    const channel=form.get("channel")==="email"?"email":"sms";
    if(!(raw instanceof File)||!raw.size)return Response.json({error:"Choose a file first."},{status:400});
    const type=mediaType(raw.type||"application/octet-stream").replace('audio/x-m4a','audio/mp4');
    if(channel==="sms"&&!smsTypes.has(type))return Response.json({error:"This file type cannot be sent by MMS. Use MP3, M4A, a photo or PDF, or attach it to an email."},{status:400});
    const maximum=channel==="sms"?(smsLargeMediaTypes.has(type)?4_500_000:450_000):8_000_000;
    if(raw.size>maximum){const label=channel==="sms"&&!smsLargeMediaTypes.has(type)?"450 KB":"4.5 MB";return Response.json({error:`This file is too large for safe ${channel==="sms"?"Twilio MMS":"message"} delivery. Keep it under ${channel==="email"?"8 MB":label}.`},{status:413})}
    const bytes=Buffer.from(await raw.arrayBuffer());
    const token=`${crypto.randomUUID().replaceAll("-","")}${crypto.randomUUID().replaceAll("-","")}`;
    const name=safeName(raw.name||messageAudioName(type),type);
    const expiresAt=Date.now()+24*60*60*1000;
    const record={workspaceId:workspace.userId,name,type,size:raw.size,base64:bytes.toString("base64"),expiresAt};
    await workspaceRedis(["SET",`pacifica:message-media:v1:${token}`,JSON.stringify(record),"EX",86400]);
    const requestOrigin=new URL(request.url).origin;
    const base=(process.env.TWILIO_WEBHOOK_BASE_URL||requestOrigin).trim().replace(/\/$/,"");
    if(!/^https:\/\//i.test(base))return Response.json({error:"Attachment delivery requires an HTTPS public base URL."},{status:503});
    return Response.json({ok:true,attachment:{url:`${base}/api/message-media/${token}`,name,type,size:raw.size,expiresAt}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Attachment upload failed"},{status:500})}
}
