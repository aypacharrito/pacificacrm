import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';

const TOKEN=/^flt_[0-9a-f]{32}\.[A-Za-z0-9_-]{40,60}$/;
const MEMBER=/^[A-Za-z0-9_-]{1,160}$/;
const MAX_REPLY=1024*1024;
const tools=new Set(['resolve_project','open_context','read_source']);

export function createFlintloadCompanion({userData,localAppData=process.env.LOCALAPPDATA,safeStorage,run=runAgent}){
  const file=path.join(userData,'flintload-grants-v1.json');
  const generations=new Map();
  const install=localAppData&&path.join(localAppData,'Programs','Mneme');
  const data=localAppData&&path.join(localAppData,'Mneme');
  function read(){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
  function write(value){fs.mkdirSync(userData,{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file)}
  function key(identity){if(!MEMBER.test(identity.workspaceId)||!MEMBER.test(identity.memberId))throw Error('A verified member account is required.');return `${identity.workspaceId}:${identity.memberId}`}
  function available(){return Boolean(install&&data&&fs.existsSync(path.join(install,'runtime','python.exe'))&&fs.existsSync(path.join(install,'app','mneme_app','agent.py'))&&fs.existsSync(path.join(data,'projects.json')))}
  function status(identity){const record=read()[key(identity)];return {available:available(),connected:Boolean(record),encrypted:canProtect(),message:!available()?'Install or open Flintload on this Windows computer, then reconnect.':!canProtect()?'Windows protected storage is unavailable. Reopen Pacifica and try again.':record?'Connected to Flintload. A revoked grant may need reconnecting.':'In Flintload, open Skills → Agent access, grant Doxa approved entries with draft recaps off, then paste the one-time token here.'}}
  function canProtect(){return Boolean(safeStorage?.isEncryptionAvailable?.())}
  async function connect(identity,token){const k=key(identity),generation=generations.get(k)||0;if(!available())throw Error('Flintload is unavailable. Install or open it on this Windows computer.');if(!canProtect())throw Error('Windows protected storage is unavailable. Reopen Pacifica and try again.');if(typeof token!=='string'||!TOKEN.test(token))throw Error('Paste the one-time Flintload access token.');let reply;try{reply=await run({install,data,token,name:'ping',args:{}})}catch{throw Error('Flintload did not accept this grant. Check that it is current and try again.')}if(reply?.error||!reply?.result)throw Error('Flintload did not accept this grant. Check that it is current and try again.');if(generations.get(k)!==generation&&generations.has(k))throw Error('The Flintload connection changed. Reconnect and try again.');const records=read();records[k]=safeStorage.encryptString(token).toString('base64');write(records);generations.set(k,generation+1);return status(identity)}
  function revoke(identity){const k=key(identity);generations.set(k,(generations.get(k)||0)+1);const records=read();delete records[k];write(records);return status(identity)}
  async function lookup(identity,query){const k=key(identity),generation=generations.get(k)||0;if(!available())throw Error('Flintload is unavailable. Install or open it on this Windows computer.');if(!canProtect())throw Error('Windows protected storage is unavailable.');const ciphertext=read()[k];if(typeof ciphertext!=='string')throw Error('Connect Flintload with a new read-only grant.');if(typeof query!=='string'||!query.trim()||query.length>500)throw Error('Enter a short lookup question.');let token;try{token=safeStorage.decryptString(Buffer.from(ciphertext,'base64'))}catch{throw Error('The protected grant cannot be opened. Reconnect Flintload.')}if(!TOKEN.test(token))throw Error('The protected grant is invalid. Reconnect Flintload.');
    const stillCurrent=()=>((generations.get(k)||0)===generation&&read()[k]===ciphertext);
    const call=async(name,args)=>{if(!tools.has(name))throw Error('This operation is unavailable.');if(!stillCurrent())throw Error('The Flintload connection changed. Run the lookup again.');const answer=await run({install,data,token,name,args});if(!stillCurrent())throw Error('The Flintload connection changed. Run the lookup again.');if(answer?.error)throw Error('Flintload rejected this grant. Reconnect or check its approved entries.');const result=answer?.result;if(result?.isError||!result?.structuredContent)throw Error('Flintload could not read this approved context. Check the grant and try again.');return result.structuredContent};
    const context=await call('resolve_project',{query:query.trim()});if(context?.status!=='resolved')return {status:context?.status==='ambiguous'?'ambiguous':'no_match',candidates:Array.isArray(context?.candidates)?context.candidates.map(item=>({breadcrumb:String(item.breadcrumb||'')})).slice(0,10):[]};
    const ids={vault:context.vault,project:context.project,folder:context.folder,entry:context.entry,revision:context.revision};
    const opened=await call('open_context',{...ids,anchor:context.anchor});
    const citations=Array.isArray(opened?.statement?.citations)?opened.statement.citations.slice(0,20):[];
    const evidence=[];for(const citation of citations){if(typeof citation.source!=='string'||typeof citation.locator!=='string')continue;const source=await call('read_source',{...ids,source:citation.source,locator:citation.locator});evidence.push({name:String(source.name||'').slice(0,200),locator:String(source.locator||'').slice(0,200),quote:String(source.quote||'').slice(0,4000),revision:String(source.source_revision||'').slice(0,100)})}
    if(!stillCurrent())throw Error('The Flintload connection changed. Run the lookup again.');
    return {status:'resolved',title:String(opened.title||'').slice(0,200),breadcrumb:String(opened.breadcrumb||'').slice(0,500),entry:String(opened.entry||'').slice(0,100),revision:String(opened.revision||'').slice(0,100),anchor:opened.anchor,statement:{text:String(opened.statement?.text||'').slice(0,8000),kind:String(opened.statement?.kind||'').slice(0,40)},evidence};
  }
  return {status,connect,revoke,lookup};
}

export function runAgent({install,data,token,name,args},spawnProcess=spawn){
  return new Promise((resolve,reject)=>{
    const child=spawnProcess(path.join(install,'runtime','python.exe'),['-m','mneme_app.agent','--data',data],{cwd:path.join(install,'app'),env:{...process.env,FLINTLOAD_GRANT:token},windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);child.kill();if(error)reject(error);else resolve(result)};
    const timer=setTimeout(()=>finish(Error('Flintload did not respond. Open Flintload and try again.')),10000);
    child.on('error',()=>finish(Error('Flintload could not start. Reinstall or reconnect it.')));
    child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>MAX_REPLY)return finish(Error('Flintload returned too much context.'));const line=output.indexOf('\n');if(line<0)return;try{finish(null,JSON.parse(output.slice(0,line)))}catch{finish(Error('Flintload returned an invalid response.'))}});
    child.on('close',()=>{if(!done)finish(Error('Flintload closed before responding.'))});
    child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:name==='ping'?'ping':'tools/call',params:name==='ping'?{}:{name,arguments:args}})+'\n');
  });
}
