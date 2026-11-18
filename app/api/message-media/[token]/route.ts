import { isHostedRuntime } from "../../../lib/hosted-runtime";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {workspaceRedis,workspaceRedisConfig} from "../../../lib/workspace-storage";
import {messageMediaResponse} from '../../../lib/message-media-response';

export const runtime="nodejs";

type MediaRecord={name:string;type:string;size:number;base64:string;expiresAt:number};

async function record(token:string,history=false){
  if(!/^[a-f0-9]{64}$/i.test(token)||!workspaceRedisConfig().url)return null;
  let key=`pacifica:message-media:v1:${token}`;
  if(history){
    const access=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local"};
    if(!access.allowed)return null;
    key=`pacifica:message-archive:v1:${access.userId}:${token}`;
  }
  const raw=await workspaceRedis(["GET",key]);
  if(typeof raw!=="string")return null;
  try{const parsed=JSON.parse(raw) as MediaRecord;if(!parsed.base64||(!history&&parsed.expiresAt<Date.now()))return null;return parsed}catch{return null}
}

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;const history=new URL(_request.url).searchParams.get("history")==="1";const item=await record(token,history);if(!item)return new Response("Not found",{status:404});
  return messageMediaResponse(_request,item,new Uint8Array(Buffer.from(item.base64,"base64")).buffer,history);
}

export async function HEAD(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;const history=new URL(_request.url).searchParams.get("history")==="1";const item=await record(token,history);if(!item)return new Response(null,{status:404});
  return messageMediaResponse(_request,item,new Uint8Array(Buffer.from(item.base64,"base64")).buffer,history);
}
