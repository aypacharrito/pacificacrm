import {accessScope} from "../lib/account-access-policy";
import CRMClient from "../CRMClient";
import DashboardFixes from "../components/DashboardFixes";
import { requireChatGPTUser } from "../chatgpt-auth";
import { isPacificaPlatformOwnerEmail, requirePacificaWorkspacePage } from "../lib/clerk-access";
import { isClerkConfigured } from "../lib/clerk-config";
import { redirect } from "next/navigation";
import {getPlatformFeatures} from "../lib/platform-feature-store";

export const dynamic = "force-dynamic";

export default async function DashboardPage(){
  if(isClerkConfigured()){
    const access=await requirePacificaWorkspacePage();
    if(!isPacificaPlatformOwnerEmail(access.email)&&[access.accessMetadata,access.memberMetadata].some(meta=>accessScope(meta||{})!=="full"))redirect("/miner-workspace");
    return <>
      <CRMClient
        key={access.userId}
        clerkEnabled
        isOwner={access.role==="owner"||access.role==="manager"}
        isPlatformOwner={isPacificaPlatformOwnerEmail(access.email)}
        featureAccess={await getPlatformFeatures()}
        workspaceId={access.userId}
        currentUserName={access.displayName}
        currentUserEmail={access.email}
        userRole={access.role}
      />
      {(access.role==="owner"||access.role==="manager")&&<DashboardFixes workspaceId={access.userId}/>}
    </>;
  }
  if(process.env.VERCEL)redirect("/login?error=auth_not_configured");
  await requireChatGPTUser("/dashboard");
  return <CRMClient/>;
}
