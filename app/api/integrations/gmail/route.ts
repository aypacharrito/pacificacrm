import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPacificaAccess } from "../../../lib/clerk-access";
import { gmailAddresses, gmailConfig, gmailScope, isGmailAddress } from "../../../lib/gmail-triage-google";
import { emptyGmailPreferences, readGmailConnection, removeGmailConnection, sealGmail, withGmailLock, writeGmailConnection, type GmailPreferences } from "../../../lib/gmail-triage-store";
import { gmailThreadUrl, syncGmail } from "../../../lib/gmail-triage";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function owner() {
  const access = await getPacificaAccess();
  const supported = !gmailAddresses().length || isGmailAddress(access.email);
  return access.allowed && access.role === "owner" && access.userId === access.accountUserId && supported ? access.userId : "";
}

export async function GET() {
  const ownerId = await owner();
  if (!ownerId) return json({ error: "Gmail triage is available to the workspace owner." }, 403);
  const config = gmailConfig();
  try {
    const accounts = await Promise.all(gmailAddresses().map(async address => {
      const grant = config.ready ? await readGmailConnection(address) : null;
      const connection = grant?.ownerId === ownerId ? grant : null;
      return {
        address, connected: Boolean(connection), pushActive: (connection?.watchExpiresAt || 0) > Date.now(),
        preferences: connection?.preferences || emptyGmailPreferences, lastRunAt: connection?.lastRunAt,
        status: connection?.status, stats: connection?.stats || {},
        tasks: (connection?.tasks || []).filter(task => task.open).map(task => ({
          id: task.id, title: task.title, updatedAt: task.updatedAt, url: gmailThreadUrl(address, task.threadId),
        })),
      };
    }));
    return json({ configured: config.ready, pushConfigured: config.pushReady, accounts });
  } catch { return json({ error: "Gmail status could not be loaded." }, 503); }
}

export async function POST(request: Request) {
  const ownerId = await owner();
  if (!ownerId) return json({ error: "Gmail triage is available to the workspace owner." }, 403);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  const config = gmailConfig();
  if (!config.ready) return json({ error: "Gmail needs server setup before you can connect." }, 503);
  try {
    const input = await request.json() as { action?: string; address?: string; preferences?: Partial<GmailPreferences>; taskId?: string };
    const address = input.address;
    if (!isGmailAddress(address)) return json({ error: "Choose a supported Gmail account." }, 400);
    if (input.action === "connect") {
      const current = await readGmailConnection(address);
      if (current && current.ownerId !== ownerId) return json({ error: "This Gmail connection is unavailable in this workspace." }, 409);
      const nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
      const state = sealGmail({ ownerId, address, nonce, verifier, expiresAt: Date.now() + 600_000 }, "oauth");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      (await cookies()).set("pacifica_gmail_oauth", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/gmail", maxAge: 600 });
      const query = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: gmailScope,
        access_type: "offline", prompt: "consent select_account", login_hint: address, state,
        code_challenge: challenge, code_challenge_method: "S256",
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
    }
    if (input.action === "sync") {
      const result = await syncGmail(address, { ownerId, scheduled: true });
      return json(result, ["caught_up", "pending"].includes(result.status) ? 200 : result.status === "unavailable" ? 404 : 503);
    }
    const response = await withGmailLock(address, async () => {
      const connection = await readGmailConnection(address);
      if (!connection || connection.ownerId !== ownerId) return json({ error: "Gmail is not connected in this workspace." }, 404);
      if (input.action === "disconnect") {
        await removeGmailConnection(address);
        return json({ ok: true });
      }
      if (input.action === "preferences" && input.preferences && typeof input.preferences === "object") {
        const preferences = { ...connection.preferences };
        for (const key of Object.keys(emptyGmailPreferences) as (keyof GmailPreferences)[]) {
          const value = input.preferences[key];
          if (typeof value === "boolean") preferences[key] = value;
        }
        if (preferences.tasks && !connection.preferences.tasks && !connection.scan && !connection.page) {
          connection.scan = { kind: "starred", after: 0, anchor: connection.cursor };
        }
        connection.preferences = preferences;
      } else if (input.action === "review-starred") {
        if (connection.scan || connection.page) return json({ error: "Finish the current Gmail sync first." }, 409);
        connection.scan = { kind: "starred", after: 0, anchor: connection.cursor };
      } else if (input.action === "complete" && typeof input.taskId === "string") {
        const task = connection.tasks.find(item => item.id === input.taskId);
        if (!task) return json({ error: "Gmail task was not found." }, 404);
        task.open = false;
        task.updatedAt = Date.now();
      } else { return json({ error: "Choose a Gmail action." }, 400); }
      await writeGmailConnection(connection);
      return json({ ok: true });
    });
    return response || json({ error: "Gmail is syncing. Try again shortly." }, 409);
  } catch { return json({ error: "The Gmail action could not be completed." }, 503); }
}
