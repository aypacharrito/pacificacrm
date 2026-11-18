// Share concurrent reads and retain object identity when the workspace is unchanged.
import {readWorkspaceResponse,type WorkspaceSnapshot as Snapshot} from './workspace-load';
const snapshots=new Map<string,{etag:string;value:Snapshot}>();
const pending=new Map<string,Promise<Snapshot>>();
export function loadWorkspaceSnapshot(workspaceId:string):Promise<Snapshot>{
 const active=pending.get(workspaceId);if(active)return active;
 const saved=snapshots.get(workspaceId);
 const request=fetch('/api/crm/workspace',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(20_000),headers:saved?{'If-None-Match':saved.etag}:{}}).then(async response=>{
  if(response.status===304&&saved){saved.etag=response.headers.get('etag')||saved.etag;return saved.value;}
  const value=await readWorkspaceResponse(response),etag=response.headers.get('etag')||'';
  snapshots.set(workspaceId,{etag,value});
  if(snapshots.size>3)snapshots.delete(snapshots.keys().next().value!);
  return value;
 }).catch(error=>{snapshots.delete(workspaceId);throw error}).finally(()=>pending.delete(workspaceId));
 pending.set(workspaceId,request);return request;
}
