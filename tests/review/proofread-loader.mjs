import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){const name=specifier.split('/').at(-1)?.replace(/\.ts$/,'');const sources={
'clerk-access':`export async function getPacificaAccess(){return {allowed:globalThis.proofAccess,userId:'test'}}`,
'workspace-storage':`export async function acquireAutomationLease(){return true}`,
'ai-provider':`export function aiConfigured(){return true}export function aiModel(){return 'test'}export function aiReasoning(){return {}}export function aiClient(){return {responses:{create:async()=>({status:'completed',output_text:globalThis.proofText})}}}`};if(sources[name])return {url:'data:text/javascript,'+encodeURIComponent(sources[name]),shortCircuit:true};return next(specifier,context)}});
