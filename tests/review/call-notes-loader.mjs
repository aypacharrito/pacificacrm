import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier.endsWith('/lib/clerk-access'))return {url:'data:text/javascript,export async function getPacificaAccess(){return {allowed:globalThis.callNoteAllowed!==false,userId:"workspace-one"}}',shortCircuit:true};
 if(specifier.endsWith('/lib/workspace-storage'))return {url:'data:text/javascript,export async function updateStoredWorkspace(id,fn){if(id!=="workspace-one")throw Error("Wrong workspace");globalThis.callNoteWorkspace=fn(globalThis.callNoteWorkspace);return globalThis.callNoteWorkspace}',shortCircuit:true};
 return next(specifier,context);
}});
