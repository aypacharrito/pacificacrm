import { isHostedRuntime } from "../../../lib/hosted-runtime";
import { currentUser } from "@clerk/nextjs/server";
import { getStripe } from "../../../lib/stripe";
import { isClerkConfigured } from "../../../lib/clerk-config";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    if(!isClerkConfigured())return Response.json({error:"Secure login must be configured before membership management is available."},{status:503});
    if(!isHostedRuntime())return Response.json({error:"Membership management is available on the production domain."},{status:503});
    const user=await currentUser();
    if(!user)return Response.json({error:"Sign in to manage this membership."},{status:401});
    const email=user?.primaryEmailAddress?.emailAddress||user?.emailAddresses[0]?.emailAddress;
    if(!email)return Response.json({error:"No billing email is attached to this account."},{status:400});
    const stripe=getStripe();
    const customers=await stripe.customers.list({email,limit:1});
    const customer=customers.data[0];
    if(!customer)return Response.json({error:"No Stripe membership was found for this email yet."},{status:404});
    const configuredOrigin=(process.env.NEXT_PUBLIC_APP_URL||"").replace(/\/$/,"");
    const origin=configuredOrigin||new URL(request.url).origin;
    const session=await stripe.billingPortal.sessions.create({customer:customer.id,return_url:`${origin}/dashboard`});
    return Response.json({url:session.url});
  }catch(error){
    console.error("[stripe/portal] unable to create session",error instanceof Error?error.message:"unknown error");
    return Response.json({error:"Unable to open Stripe membership management right now."},{status:500});
  }
}
