import {accessScope,managedAccessState,type ManagedAccess} from "./account-access-policy";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "./clerk-config";
import { getStripe } from "./stripe";
import {getPlatformFeatures} from "./platform-feature-store";
import {cachedClerkUser,cachedPaidSubscription} from "./identity-cache";

export const PACIFICA_ADMIN_EMAILS=new Set([
  "pacificalegalinsurance@gmail.com",
  "davidscarinsurance@gmail.com",
  ...(process.env.PACIFICA_ADMIN_EMAILS||"").split(",").map(email=>email.trim().toLowerCase()).filter(Boolean),
]);
export const PACIFICA_PLATFORM_OWNER_EMAILS=new Set([
  "pacificalegalinsurance@gmail.com",
  ...(process.env.PACIFICA_PLATFORM_OWNER_EMAILS||"").split(",").map(email=>email.trim().toLowerCase()).filter(Boolean),
]);
const paidStatuses=new Set(["active","trialing"]);
const clerkUser=(userId:string)=>cachedClerkUser(userId,async()=>(await clerkClient()).users.getUser(userId));

async function getClerkIdentity(){
  try{
    const {userId}=await auth();
    if(!userId)return null;
    const user=await cachedClerkUser(userId,()=>currentUser());
    if(!user)return null;
    const email=(user.primaryEmailAddress?.emailAddress||user.emailAddresses[0]?.emailAddress||"").toLowerCase();
    const metadata=user.privateMetadata as {pacificaWorkspaceId?:unknown;pacificaRole?:unknown}&ManagedAccess;
    const workspaceId=String(metadata.pacificaWorkspaceId||userId).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,160)||userId;
    const teamRole=metadata.pacificaRole==="manager"?"manager" as const:metadata.pacificaRole==="agent"?"agent" as const:null;
    const displayName=[user.firstName,user.lastName].filter(Boolean).join(" ")||email;
    const workspaceMetadata=workspaceId!==userId?(await clerkUser(workspaceId)).privateMetadata:metadata;
    return email?{userId:workspaceId,accountUserId:userId,email,teamRole,displayName,accessMetadata:workspaceMetadata as ManagedAccess,memberMetadata:metadata}:null;
  }catch(error){
    console.error("[access] Clerk identity lookup failed",error instanceof Error?error.message:"unknown error");
    return null;
  }
}

async function hasPaidSubscription(email:string){
  return cachedPaidSubscription(email,()=>checkPaidSubscription(email));
}

async function checkPaidSubscription(email:string){
  try{
    const stripe=getStripe();
    const customers=await stripe.customers.list({email,limit:10});
    for(const customer of customers.data){
      const subscriptions=await stripe.subscriptions.list({customer:customer.id,status:"all",limit:20});
      if(subscriptions.data.some(subscription=>paidStatuses.has(subscription.status)))return true;
    }
  }catch(error){
    console.error("[access] subscription verification failed",error instanceof Error?error.message:"unknown error");
  }
  return false;
}

export async function getPacificaAccess(){
  const identity=await getClerkIdentity();
  if(!identity)return {allowed:false,role:"signed-out" as const,email:"",userId:"",accountUserId:"",displayName:""};
  if(isPacificaPlatformOwnerEmail(identity.email))return {allowed:true,role:"owner" as const,...identity};
  const state=managedAccessState(identity.accessMetadata);
  if(state==="paused"||managedAccessState(identity.memberMetadata)==="paused")return {allowed:false,role:"access-paused" as const,...identity};
  if(state==="trial"||state==="permanent")return {allowed:true,role:identity.teamRole||"owner" as const,...identity};
  if(state==="expired"){
    const owner=identity.teamRole?await clerkUser(identity.userId):null;
    const email=owner?.primaryEmailAddress?.emailAddress||identity.email;
    if(await hasPaidSubscription(email))return {allowed:true,role:identity.teamRole||"owner" as const,...identity};
    return {allowed:false,role:"trial-expired" as const,...identity};
  }
  if(PACIFICA_ADMIN_EMAILS.has(identity.email))return {allowed:true,role:"owner" as const,...identity};
  if(identity.teamRole)return {allowed:true,role:identity.teamRole,...identity};
  if(await hasPaidSubscription(identity.email))return {allowed:true,role:"owner" as const,...identity};
  return {allowed:false,role:"subscription-required" as const,...identity};
}

export async function requirePacificaWorkspacePage(){
  const access=await getPacificaAccess();
  if(access.role==="signed-out")redirect("/login");
  if(!access.allowed)redirect("/access-required");
  return access;
}

export async function hasPacificaWorkspaceApiAccess(){
  if(!isClerkConfigured())return !process.env.VERCEL;
  return (await getPacificaAccess()).allowed;
}

export async function isPacificaOwnerApi(){
  if(!isClerkConfigured())return !process.env.VERCEL;
  const access=await getPacificaAccess();
  return access.allowed&&(access.role==="owner"||access.role==="manager");
}

export function isPacificaPlatformOwnerEmail(email:string){return PACIFICA_PLATFORM_OWNER_EMAILS.has(email.trim().toLowerCase())}

export async function isPacificaPlatformOwnerApi(){
  if(!isClerkConfigured())return !process.env.VERCEL;
  const access=await getPacificaAccess();
  return access.allowed&&isPacificaPlatformOwnerEmail(access.email);
}

export async function getPacificaMinerOwnerAccess(){
  if(!(await getPlatformFeatures()).miner)return null;
  if(!isClerkConfigured())return process.env.NODE_ENV==="production"?null:{allowed:true,role:"owner" as const,email:"local@pacifica",userId:"local",accountUserId:"local",displayName:"Local owner"};
  const access=await getPacificaAccess();
  return access.allowed&&isPacificaPlatformOwnerEmail(access.email)?access:null;
}

/** Cron jobs have no signed-in session; check the workspace owner before dispatch. */
export async function workspaceAutomationAccess(workspaceId:string,feature:"crm"|"miner"="crm"){
 if(feature==="miner"&&!(await getPlatformFeatures()).miner)return false;
 if(!isClerkConfigured())return !process.env.VERCEL;
 try{const owner=await clerkUser(workspaceId);const email=owner.primaryEmailAddress?.emailAddress||owner.emailAddresses[0]?.emailAddress||"";
  if(isPacificaPlatformOwnerEmail(email))return true;
  if(feature==="miner")return false;
  const scope=accessScope(owner.privateMetadata);
  if(scope==="read-only"||scope==="miner-only")return false;
  const state=managedAccessState(owner.privateMetadata);
  if(state==="paused")return false;
  if(state==="trial"||state==="permanent")return true;
  if(state==="expired")return await hasPaidSubscription(email);
  return PACIFICA_ADMIN_EMAILS.has(email.toLowerCase())||await hasPaidSubscription(email);
 }catch{return false}
}
