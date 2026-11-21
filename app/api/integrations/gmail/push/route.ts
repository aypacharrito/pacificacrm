import { authenticateGmailPush, gmailConfig, isGmailAddress, isHistoryId } from "../../../../lib/gmail-triage-google";
import { syncGmail } from "../../../../lib/gmail-triage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const config = gmailConfig();
  if (!await authenticateGmailPush(request.headers.get("authorization"), config)) return new Response(null, { status: 401 });
  let address: unknown;
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response(null, { status: 400 });
    const envelope = JSON.parse(text) as { subscription?: string; message?: { data?: string } };
    const data = envelope.message?.data;
    if (envelope.subscription !== config.subscription || !data || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) return new Response(null, { status: 400 });
    const notice = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { emailAddress?: string; historyId?: string };
    if (!isHistoryId(notice.historyId) || typeof notice.emailAddress !== "string") return new Response(null, { status: 400 });
    address = notice.emailAddress.toLowerCase();
  } catch { return new Response(null, { status: 400 }); }
  if (!isGmailAddress(address)) return new Response(null, { status: 204 });
  try {
    const { status } = await syncGmail(address);
    return new Response(null, { status: ["busy", "retry", "pending"].includes(status) ? 503 : 204 });
  } catch { return new Response(null, { status: 503 }); }
}
