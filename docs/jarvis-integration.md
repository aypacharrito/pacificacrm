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
- Read: quote requests (the customer-submitted details needed to quote). Write: a result attached to a request.
- Jarvis cannot accept, dismiss or delete requests and never edits leads; the owner reviews in Pacifica.
- Results are stored on the quote request, which the server owns, so an open CRM tab's autosave cannot overwrite them.

## Endpoints

`GET /api/integrations/jarvis/quote-requests?filter=needs-quote|pending|all&limit=50`
Default `needs-quote`: pending requests without a `quoted` result yet, newest first.

`GET /api/integrations/jarvis/quote-requests/{id}`

`POST /api/integrations/jarvis/quote-requests/{id}`
```json
{"status": "quoted", "carrier": "Mercury", "premium": 1284.50, "termMonths": 6, "quoteNumber": "MQ-77812", "notes": "Full coverage"}
{"status": "needs_info", "missing": ["Driver license number"], "notes": "Mercury requires it for a bindable quote"}
{"status": "failed", "notes": "Carrier portal unavailable"}
```
Each request keeps the latest result in `jarvis` and the last 10 in `jarvisHistory`.

## Tests

`node --import tsx --import ./tests/review/jarvis-integration-loader.mjs --test tests/review/jarvis-integration-api.test.mjs`
It runs in CI as part of `npm run test:routes`.

Not built yet: showing Jarvis results inside the CRM's Quotes view.
