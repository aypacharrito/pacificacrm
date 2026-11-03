import {registerHooks} from 'node:module';
const sources={
 'clerk-access':`export async function getPacificaAccess(){return globalThis.jarvisTestAccess||{allowed:true,userId:'a',role:'owner'}} export async function workspaceAutomationAccess(){return true}`,
 'clerk-config':`export function isClerkConfigured(){return true}`
};
registerHooks({resolve(specifier,context,next){const name=specifier.split('/').at(-1)?.replace(/\.ts$/,'');return sources[name]?{url:'data:text/javascript,'+encodeURIComponent(sources[name]),shortCircuit:true}:next(specifier,context)}});
