import { cookies } from "next/headers";
import { getPacificaAccess } from "../../../../lib/clerk-access";
import { gmailClient, gmailConfig, gmailScope, gmailTokens, isGmailAddress, isHistoryId, type GmailAddress } from "../../../../lib/gmail-triage-google";
import { emptyGmailPreferences, openGmail, readGmailConnection, withGmailLock, writeGmailConnection } from "../../../../lib/gmail-triage-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const config = gmailConfig();
  if (!config.ready) return Response.json({ error: "Gmail is not configured." }, { status: 503 });
  const url = new URL("/dashboard", config.redirectUri), jar = await cookies();
  const nonce = jar.get("pacifica_gmail_oauth")?.value;
  jar.set("pacifica_gmail_oauth", "", { path: "/api/integrations/gmail", maxAge: 0 });
  try {
    const access = await getPacificaAccess(), query = new URL(request.url).searchParams;
    const state = openGmail<{ ownerId: string; address: GmailAddress; nonce: string; verifier: string; expiresAt: number }>(query.get("state") || "", "oauth");
    const code = query.get("code");
    if (!access.allowed || access.role !== "owner" || access.userId !== access.accountUserId || !isGmailAddress(access.email) ||
        state.ownerId !== access.userId || !isGmailAddress(state.address) || !nonce || state.nonce !== nonce ||
        !Number.isFinite(state.expiresAt) || state.expiresAt < Date.now() || !code || query.has("error")) throw new Error("Invalid Gmail authorization");
    const saved = await withGmailLock(state.address, async () => {
      const before = await readGmailConnection(state.address);
      if (before && before.ownerId !== state.ownerId) throw new Error("Gmail already belongs to another workspace");
      const tokens = await gmailTokens({ grant_type: "authorization_code", code, code_verifier: state.verifier, redirect_uri: config.redirectUri });
      if (!tokens.refreshToken || !tokens.scope?.split(/\s+/).includes(gmailScope)) throw new Error("Gmail permission was not granted");
      const client = gmailClient(tokens.accessToken), profile = await client.profile();
      if (profile.emailAddress?.toLowerCase() !== state.address || !isHistoryId(profile.historyId)) throw new Error("Gmail address did not match");
      const created = Date.now();
      await writeGmailConnection(before ? { ...before, refreshToken: tokens.refreshToken, watchExpiresAt: 0, status: "pending" } : {
        ownerId: state.ownerId, address: state.address, refreshToken: tokens.refreshToken, connectedAt: created, coverageAt: created,
        cursor: profile.historyId, preferences: { ...emptyGmailPreferences }, tasks: [], rechecks: {}, watchExpiresAt: 0, stats: {}, status: "pending",
      });
      return true;
    });
    if (!saved) throw new Error("Gmail connection is busy");
    url.searchParams.set("gmail", "connected");
  } catch { url.searchParams.set("gmail", "failed"); }
  return Response.redirect(url, 303);
}
