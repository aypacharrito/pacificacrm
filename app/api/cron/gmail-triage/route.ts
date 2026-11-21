import { timingSafeEqual } from "node:crypto";
import { syncGmailSchedule } from "../../../lib/gmail-triage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return new Response(null, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") || ""), wanted = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) return new Response(null, { status: 401 });
  try {
    const result = await syncGmailSchedule();
    return Response.json(result, { status: result.results.some(run => run.status === "retry") ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Gmail sync could not complete." }, { status: 503 }); }
}
