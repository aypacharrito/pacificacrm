import {accessScope,isSessionApi,scopeAllows} from "./app/lib/account-access-policy";
import { clerkMiddleware, clerkClient, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import {cachedClerkUser} from "./app/lib/identity-cache";

const isProtectedRoute=createRouteMatcher([
  "/dashboard(.*)",
  "/miner-workspace(.*)",
  "/api/ai/(.*)",
  "/api/twilio/token(.*)",
  "/api/twilio/messages(.*)",
  "/api/admin/(.*)",
]);

const clerkConfigured=Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith("pk_") &&
  process.env.CLERK_SECRET_KEY?.trim().startsWith("sk_"),
);

const clerkHandler=clerkMiddleware(async(auth,request)=>{
  if(isProtectedRoute(request)||isSessionApi(request.nextUrl.pathname,request.method))await auth.protect();
  if(isSessionApi(request.nextUrl.pathname,request.method)){
    const {userId}=await auth();if(!userId)return NextResponse.json({error:"Sign in required."},{status:401});
    const client=await clerkClient(),member=await cachedClerkUser(userId,()=>client.users.getUser(userId));
    const email=member.primaryEmailAddress?.emailAddress||'';
    const owners=['pacificalegalinsurance@gmail.com',...(process.env.PACIFICA_PLATFORM_OWNER_EMAILS||'').split(',')].map(s=>s.trim().toLowerCase());
    if(request.nextUrl.pathname.startsWith('/api/miner/')&&!owners.includes(email.toLowerCase()))return NextResponse.json({error:'Miner is available only to the Pacifica platform owner.'},{status:403});
    if(!owners.includes(email.toLowerCase())){
      const workspaceId=String(member.privateMetadata.pacificaWorkspaceId||userId);
      const owner=workspaceId===userId?member:await cachedClerkUser(workspaceId,()=>client.users.getUser(workspaceId));
      const scopes=[accessScope(owner.privateMetadata),accessScope(member.privateMetadata)];
      let action:unknown;
      if(scopes.includes('read-only')&&request.method==='POST'&&['/api/miner/prospects','/api/miner/public-records'].includes(request.nextUrl.pathname)){
        try{action=(await request.clone().json()).action}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
      }
      if(scopes.some(scope=>!scopeAllows(scope,request.nextUrl.pathname,request.method,action)))return NextResponse.json({error:'This feature is outside your account access.'},{status:403});
    }
  }
});

function missingClerkHandler(request:NextRequest){
  if(!isProtectedRoute(request)&&!isSessionApi(request.nextUrl.pathname,request.method))return NextResponse.next();
  // ChatGPT Sites supplies its own authenticated-user headers. Let the page
  // validate those when Clerk is intentionally unavailable in that runtime.
  if(["/dashboard","/miner-workspace"].some(path=>request.nextUrl.pathname.startsWith(path))&&!process.env.VERCEL)return NextResponse.next();
  if(request.nextUrl.pathname.startsWith("/api/")){
    return NextResponse.json({error:"Secure login is not configured."},{status:503});
  }
  const loginUrl=new URL("/login",request.url);
  loginUrl.searchParams.set("error","auth_not_configured");
  return NextResponse.redirect(loginUrl);
}

export default clerkConfigured?clerkHandler:missingClerkHandler;

export const config={
  matcher:[
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
