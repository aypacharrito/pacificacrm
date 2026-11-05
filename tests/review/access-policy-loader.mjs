// These tests swap the signed-in user between cases; turn off the 30-second identity cache.
process.env.PACIFICA_IDENTITY_CACHE_MS='0';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){let source;
 if(specifier==='@clerk/nextjs/server')source=`export async function auth(){return {userId:globalThis.identity?.id}} export async function currentUser(){return globalThis.identity} export async function clerkClient(){return {users:{getUser:async()=>globalThis.workspaceOwner}}}`;
 if(specifier==='next/navigation')source=`export function redirect(path){throw Error(path)}`;
 if(specifier.endsWith('/clerk-config'))source=`export function isClerkConfigured(){return true}`;
 if(specifier.endsWith('/platform-feature-store'))source=`export async function getPlatformFeatures(){return globalThis.optionalFeatures||{miner:false,industryTools:false}}`;
 if(specifier.endsWith('/stripe'))source=`export function getStripe(){return {customers:{list:async()=>({data:[{id:'customer'}]})},subscriptions:{list:async()=>({data:globalThis.paid?[{status:'active'}]:[]})}}}`;
 return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);
}});
