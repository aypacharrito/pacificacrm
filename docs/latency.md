# API latency (2026-11-03)

Measured from Los Angeles against production (signed out): requests enter Vercel's `sfo1` edge and run in
`iad1` (Washington, DC). `/api/health` took 150–190 ms; a signed-out `/api/crm/workspace` took 230–800 ms,
most of it the sign-in check.

## What changed
- **Access checks are cached per server instance** (`app/lib/identity-cache.ts`). Every session API request
  used to call Clerk's Backend API twice (middleware `users.getUser` + `currentUser()` in the route), team
  members up to four times, and subscription accounts also listed Stripe customers and subscriptions. Clerk
  user records are now reused for `PACIFICA_IDENTITY_CACHE_MS` (default 30000; `0` turns caching off);
  a paid-subscription "yes" is reused for 5 minutes, a "no" for the same 30 s. Concurrent lookups share one
  request; failures are never cached.
  - Trade-off: an access change made outside Pacifica (Clerk dashboard, Stripe cancellation) applies within
    30 s. Changes made through Pacifica's admin and team routes clear the entry on the instance that made them;
    other warm instances catch up within 30 s.
- **`GET /api/crm/workspace` sends only what clients use**: leads, call logs, profile and `officeItems` (the
  phone app's calendar reminders). Server-owned data (voice-pilot history, miner state, quote intake, document
  insights, SMS ledger, AI control, note reminders/review, conversation calendar) has its own APIs. Responses
  are smaller, and background jobs that touch only that data no longer break the client's ETag, so more
  5-second polls get a `304`.

## Not changed: function region
Functions run in `iad1`, about 60–70 ms each way from Los Angeles. Moving them closer (e.g. `sfo1`) only helps
if Upstash KV and Clerk are not left behind in the east: each request makes 1–3 KV calls, and a West function
talking to an East KV database would be slower overall. Check the KV database's region in Upstash before
changing the Vercel project's Function Region.
