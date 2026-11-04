# Jarvis integration API

Lets the owner's Jarvis assistant (ForgeMind on the owner's PC) read pending quote requests and record
quote results, so it can prepare carrier quotes (e.g. Mercury) and report back.

## Setup (Vercel → pacificacrm → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `JARVIS_INTEGRATION_TOKEN` | A random secret, 32+ characters (e.g. from a password manager). |
| `JARVIS_WORKSPACE_ID` | The owner's Pacifica workspace ID (the same one used in the lead webhook URL `?workspace=`). |

Redeploy after saving. To revoke Jarvis's access, change or delete `JARVIS_INTEGRATION_TOKEN` and redeploy.

## Security model

- One token, bound to one workspace. Accepted only in the `Authorization: Bearer` header, never in a URL.
- Read: quote requests (the details needed to quote). Write: a result attached to a request, and new agent-entered
  quote requests (see below).
- Jarvis cannot accept, dismiss or delete requests and never edits leads; the owner reviews in Pacifica.
- Results are stored on the quote request, which the server owns, so an open CRM tab's autosave cannot overwrite them.

## Endpoints

`GET /api/integrations/jarvis/quote-requests?filter=needs-quote|pending|all&limit=50`
Default `needs-quote`: pending requests without a `quoted` result yet, newest first.

`POST /api/integrations/jarvis/quote-requests`: start a quote request the owner approved in Doxa
```json
{"customerName": "Ana Ruiz", "product": "Auto", "coverage": "full coverage auto", "phone": "8185551234", "email": "", "requestId": "5b0f8a52-3c1e-4d2a-9f6b-1a2b3c4d5e6f"}
```
- `product`: Auto, Home, Renters, Life, Commercial, Home & Auto, or empty. `phone` (10 digits) and `email` are optional.
  `coverage` (up to 500 chars) shows as "Requested coverage" in Quote requests to review.
- `requestId` (UUID, chosen by Doxa) becomes the request's id. A resend with the same id returns the existing request
  (`200`, `created:false`) instead of a duplicate; a new one returns `201`, `{ok, created:true, request}`.
- The request is `pending`, source `Doxa`, and marked agent-entered: `contactPermission:false` and a consent text that
  says it was not submitted by the customer. Accepting it in Pacifica creates or fills a lead with SMS/email consent off,
  as for every quote request. Doxa never accepts, writes leads, contacts carriers or binds coverage.
- Limits: 50 Doxa-created requests per 24 hours, and none while 400 requests are pending (`429`). Body ≤ 8 KB.

`GET /api/integrations/jarvis/quote-requests/{id}`

`POST /api/integrations/jarvis/quote-requests/{id}`
```json
{"status": "quoted", "carrier": "Mercury", "premium": 1284.50, "termMonths": 6, "quoteNumber": "MQ-77812", "notes": "Full coverage"}
{"status": "needs_info", "missing": ["Driver license number"], "notes": "Mercury requires it for a bindable quote"}
{"status": "failed", "notes": "Carrier portal unavailable"}
```
Each request keeps the latest result in `jarvis` and the last 10 in `jarvisHistory`. Requests include `requestNotes`
(the requested coverage, for Doxa-created requests; otherwise empty).

## Tests

`node --import tsx --import ./tests/review/jarvis-integration-loader.mjs --test tests/review/jarvis-integration-api.test.mjs`
It runs in CI as part of `npm run test:routes`.

Not built yet: showing Jarvis results inside the CRM's Quotes view.
