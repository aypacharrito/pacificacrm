import {clerkClient} from "@clerk/nextjs/server";
import {getPacificaAccess,isPacificaPlatformOwnerEmail} from "../../../lib/clerk-access";
import {getStripe,stripePlanPrices} from "../../../lib/stripe";
import {pacificaPlans,planSeatLimit,type PacificaPlan} from "../../../lib/plans";
import type Stripe from "stripe";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {readStoredWorkspace,saveWorkspaceChanges} from "../../../lib/workspace-storage";
import {defaultWorkspaceProfile,type WorkspaceTeamMember} from "../../../lib/workspace-profile";
import {forgetClerkUser} from "../../../lib/identity-cache";

export const runtime="nodejs";

async function manager(){
  if(!isClerkConfigured())return process.env.VERCEL?null:{allowed:true,role:"owner" as const,userId:"local",accountUserId:"local",email:"local"};
  const access=await getPacificaAccess();return access.allowed&&(access.role==="owner"||access.role==="manager")?access:null;
}


const paidStatuses=new Set(["active","trialing"]);

/**
 * The owner uses one seat. Determine plan from Checkout subscription metadata,
 * then configured Stripe Price IDs, then legacy amounts. Custom sales-approved
 * limits can be stored as pacificaSeatLimit in the owner's Clerk private metadata.
 */
async function workspaceSeatLimit(workspaceId:string){
  if(workspaceId==="local")return pacificaPlans.agency.seatLimit;
  const client=await clerkClient();
  const owner=await client.users.getUser(workspaceId);
  const email=(owner.primaryEmailAddress?.emailAddress||owner.emailAddresses[0]?.emailAddress||"").toLowerCase();
  if(isPacificaPlatformOwnerEmail(email))return Number.MAX_SAFE_INTEGER;
  const override=Number((owner.privateMetadata as {pacificaSeatLimit?:unknown}).pacificaSeatLimit);
  if(Number.isSafeInteger(override)&&override>=1&&override<=10000)return override;
  if(!email)return 1;

  const stripe=getStripe();
  const customers=await stripe.customers.list({email,limit:10});
  let limit=0;
  for(const customer of customers.data){
    const subscriptions=await stripe.subscriptions.list({customer:customer.id,status:"all",limit:100});
    for(const subscription of subscriptions.data){
      if(!paidStatuses.has(subscription.status))continue;
      let plan:PacificaPlan|null=null;
      const fromMetadata=subscription.metadata?.pacifica_plan;
      if(fromMetadata&&Object.prototype.hasOwnProperty.call(pacificaPlans,fromMetadata))plan=fromMetadata as PacificaPlan;
      if(!plan){
        for(const item of subscription.items.data){
          const price:Stripe.Price=item.price;
          const fromPrice=price.metadata?.pacifica_plan;
          if(fromPrice&&Object.prototype.hasOwnProperty.call(pacificaPlans,fromPrice)){plan=fromPrice as PacificaPlan;break;}
          const configured=(Object.keys(stripePlanPrices) as PacificaPlan[]).find(name=>stripePlanPrices[name]===price.id);
          if(configured){plan=configured;break;}
          if(price.currency==="usd"&&price.recurring?.interval==="month"){
            plan=(Object.keys(pacificaPlans) as PacificaPlan[]).find(name=>pacificaPlans[name].monthlyPrice*100===price.unit_amount)||null;
            if(plan)break;
          }
        }
      }
      // Unknown/custom subscriptions default to ten seats until an override
      // is configured. This does not affect existing team access.
      limit=Math.max(limit,plan?planSeatLimit(plan):pacificaPlans.agency.seatLimit);
    }
  }
  return limit||1;
}

async function seatCapacityError(workspaceId:string,roster:WorkspaceTeamMember[]){
  const limit=await workspaceSeatLimit(workspaceId);
  const current=1+roster.filter(item=>item.active).length;
  if(current<limit)return null;
  return Response.json({
    error:`This workspace includes up to ${limit} users (including the owner). Contact us for more seats and custom agency pricing: pacificalegalinsurance@gmail.com.`,
    seatLimit:limit,
    seatsInUse:current,
  },{status:409});
}

export async function GET(){
  const access=await manager();if(!access)return Response.json({error:"Workspace-manager access required"},{status:403});
  const workspace=await readStoredWorkspace(access.userId);return Response.json({members:workspace?.profile.teamRoster||[]},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  const access=await manager();if(!access)return Response.json({error:"Workspace-manager access required"},{status:403});
  try{
    const body=await request.json() as {action?:"add"|"remove"|"update";email?:string;userId?:string;role?:"manager"|"agent";active?:boolean};
    const action=body.action||"add";const workspace=await readStoredWorkspace(access.userId)||{leads:[],callLogs:[],profile:defaultWorkspaceProfile};let roster=[...workspace.profile.teamRoster];
    if(action==="add"){
      const email=String(body.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter the teammate’s sign-in email"},{status:400});
      const client=await clerkClient();const result=await client.users.getUserList({emailAddress:[email],limit:1});const user=result.data[0];
      if(!user)return Response.json({error:"That person must create their Pacifica sign-in first, then add the same email here."},{status:404});
      if(user.id===access.accountUserId)return Response.json({error:"The workspace owner is already included."},{status:400});
      const replacing=roster.find(item=>item.userId===user.id||item.email===email);
      if(!replacing?.active){const full=await seatCapacityError(access.userId,roster);if(full)return full;}
      const role=body.role==="manager"?"manager" as const:"agent" as const;
      await client.users.updateUserMetadata(user.id,{privateMetadata:{...user.privateMetadata,pacificaWorkspaceId:access.userId,pacificaRole:role,pacificaOwnerEmail:access.email}});forgetClerkUser(user.id);
      const name=[user.firstName,user.lastName].filter(Boolean).join(" ")||email;const member:WorkspaceTeamMember={userId:user.id,email,name,role,active:true};
      roster=[...roster.filter(item=>item.userId!==user.id&&item.email!==email),member];
    }else{
      const member=roster.find(item=>item.userId===body.userId);if(!member)return Response.json({error:"Team member not found"},{status:404});
      const client=await clerkClient();const user=await client.users.getUser(member.userId);
      if(action==="remove"){
        await client.users.updateUserMetadata(member.userId,{privateMetadata:{...user.privateMetadata,pacificaWorkspaceId:"",pacificaRole:"",pacificaOwnerEmail:""}});forgetClerkUser(member.userId);roster=roster.filter(item=>item.userId!==member.userId);
      }else{
        const role=body.role==="manager"?"manager" as const:"agent" as const;const active=body.active!==false;
        if(active&&!member.active){const full=await seatCapacityError(access.userId,roster);if(full)return full;}
        await client.users.updateUserMetadata(member.userId,{privateMetadata:{...user.privateMetadata,pacificaWorkspaceId:active?access.userId:"",pacificaRole:active?role:"",pacificaOwnerEmail:active?access.email:""}});forgetClerkUser(member.userId);
        roster=roster.map(item=>item.userId===member.userId?{...item,role,active}:item);
      }
    }
    const profile={...workspace.profile,teamRoster:roster,teamMembers:roster.filter(item=>item.active).map(item=>item.name)};await saveWorkspaceChanges(access.userId,workspace,{...workspace,profile});
    return Response.json({ok:true,members:roster});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to update team"},{status:500})}
}
