import {registerHooks} from 'node:module';
const sources={
 'workspace-storage':`export async function automationWorkspaces(){return [{workspaceId:'test'}]}export async function readStoredWorkspace(){return globalThis.backupWorkspace}export async function updateStoredWorkspace(id,fn){globalThis.backupWorkspace=fn(globalThis.backupWorkspace);return globalThis.backupWorkspace}`,
 'clerk-access':`export async function workspaceAutomationAccess(){return true}`,
 'ai-provider':`export function aiConfigured(){return true}export function aiModel(){return 'test'}export function aiReasoning(){return {}}export function aiClient(){return {responses:{create:async()=>{globalThis.backupAiCalls++;globalThis.backupDuringAi?.();return {status:'completed',output_text:JSON.stringify(globalThis.backupDraft)}}}}}`,
 'outbound-sms':`export async function sendOutboundSms(input){globalThis.backupDeliveries.push(input);if(globalThis.backupProviderError)throw Error('Provider outcome unknown');return {id:'SMsent'}}`,
};
registerHooks({resolve(s,c,next){const n=s.split('/').at(-1)?.replace(/\.ts$/,'');return sources[n]?{url:'data:text/javascript,'+encodeURIComponent(sources[n]),shortCircuit:true}:next(s,c)}});
