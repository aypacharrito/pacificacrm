import {createHash,randomUUID} from "node:crypto";
import {WorkspaceLoadError} from "../../../lib/workspace-load";
import {clientWorkspace} from "../../../lib/workspace-client-view";
import { isClerkConfigured } from "../../../lib/clerk-config";
import { getPacificaAccess } from "../../../lib/clerk-access";
import type { WorkspaceProfile } from "../../../lib/workspace-profile";
import {
  cleanWorkspacePayload,
  mergeStoredWorkspace,
  migrateLegacyStoredWorkspace,
  readStoredWorkspace,
  workspaceKey,
  workspaceRedis,
  workspaceRedisConfig,
  updateStoredWorkspace,
} from "../../../lib/workspace-storage";

export const runtime = "nodejs";

type WorkspacePayload = {
  leads: unknown[];
  callLogs: unknown[];
  profile: WorkspaceProfile;
};

type Identity = {
  userId: string;
  email: string;
  role: "owner" | "manager" | "agent";
};

async function identity(): Promise<Identity | null> {
  if (!isClerkConfigured())
    return process.env.VERCEL
      ? null
      : { userId: "local", email: "local", role: "owner" };
  const access = await getPacificaAccess();
  if (!access.allowed) {
    if(access.role==="signed-out")return null;
    throw new WorkspaceLoadError("ACCESS_REQUIRED",403);
  }
  const role =
    access.role === "manager"
      ? ("manager" as const)
      : access.role === "agent"
        ? ("agent" as const)
        : ("owner" as const);
  return { userId: access.userId, email: access.email, role };
}

const legacyOwnerEmail = "pacificalegalinsurance@gmail.com";

function cleanPayload(value: unknown): WorkspacePayload {
  const clean=cleanWorkspacePayload(value);
  delete clean.voicePilot;
  delete clean.voicePilotHistory;
  delete clean.voicePilotBlocked;
  delete clean.documentInsights;
  delete clean.minerState;
  delete clean.quoteIntake;
  delete clean.noteReminders;
  delete clean.noteReview;
  delete clean.officeItems;
  delete clean.aiControl;
  delete clean.conversationCalendar;
  return clean;
}

export async function GET(request:Request) {
  const requestId=randomUUID();
  try {
    const owner = await identity();
    if (!owner)
      return Response.json({ error: "Sign in required",code:"SIGN_IN_REQUIRED",requestId }, { status: 401,headers:{"Cache-Control":"no-store"} });
    const workspace = await readStoredWorkspace(owner.userId);
    if(workspace){
      const body=JSON.stringify({found:true,...clientWorkspace(workspace)});
      const etag='"'+createHash('sha256').update(owner.userId).update(body).digest('hex')+'"';
      const headers={"Cache-Control":"private, no-store","ETag":etag,"Vary":"Cookie, Authorization"};
      if(request?.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
      return new Response(body,{headers:{...headers,"Content-Type":"application/json"}});
    }
    if (workspaceRedisConfig().url) {
      if (owner.email === legacyOwnerEmail) {
        const legacy = await workspaceRedis([
          "GET",
          `pacifica:workspace:${owner.userId}`,
        ]);
        if (typeof legacy === "string") {
          await workspaceRedis(["SET", workspaceKey(owner.userId), legacy]);
          return Response.json(
            { found: true, ...cleanPayload(JSON.parse(legacy)) },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
      }
      return Response.json(
        { found: false, ...cleanPayload({}) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (owner.email === legacyOwnerEmail) {
      const migrated = await migrateLegacyStoredWorkspace(owner.userId);
      if (migrated)
        return Response.json(
          { found: true, ...migrated },
          { headers: { "Cache-Control": "no-store" } },
        );
    }
    return Response.json(
      { found: false, ...cleanPayload({}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failure=error instanceof WorkspaceLoadError?error:new WorkspaceLoadError("WORKSPACE_UNAVAILABLE",500);
    // Safe to share with support: no contact records, credentials, or provider response bodies.
    console.error("[workspace:load]",{requestId,code:failure.code,status:failure.status,name:error instanceof Error?error.name:"UnknownError"});
    return Response.json(
      {
        error:failure.message,code:failure.code,requestId,
      },
      { status: failure.status||500,headers:{"Cache-Control":"no-store"} },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const owner = await identity();
    if (!owner)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    const payload = cleanPayload(await request.json());
    await updateStoredWorkspace(
      owner.userId,
      (current) => {
        const protectedPayload =
          owner.role === "agent"
            ? { ...payload, profile: current.profile }
            : payload;
        return mergeStoredWorkspace(current, protectedPayload);
      },
      { create: true },
    );
    return Response.json({ ok: true, storage: "cloud" });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save workspace",
      },
      { status: error instanceof WorkspaceLoadError ? error.status||500 : 500 },
    );
  }
}
