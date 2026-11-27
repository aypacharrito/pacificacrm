import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier.endsWith('/clerk-access'))return {url:'data:text/javascript,export async function hasPacificaWorkspaceApiAccess(){return globalThis.pacificaTestAccess===true} export async function getPacificaAccess(){return {allowed:globalThis.pacificaTestAccess===true,userId:globalThis.pacificaTestWorkspace||"test",accountUserId:globalThis.pacificaTestMember||"test",teamRole:"member",email:"test@example.com"}}',shortCircuit:true};
 return next(specifier,context);
}});
