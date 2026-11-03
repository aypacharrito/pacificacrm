# Pacifica production release setup

## Required Vercel environment variables

- `CRON_SECRET`: long random secret used to authenticate the scheduled automation worker.
- `TWILIO_A2P_APPROVED`: keep `false` until the messaging campaign is approved; then change to `true` and redeploy.
- `RESEND_API_KEY` and `PACIFICA_EMAIL_FROM`: outbound email delivery and verified sender.
- `RESEND_WEBHOOK_SECRET`: verifies delivery, bounce, complaint, suppression, and inbound-email events.
- `PACIFICA_INBOUND_EMAIL_DOMAIN`: receiving subdomain used for private workspace reply addresses.
- `OPENAI_API_KEY`: AI drafting, CRM analysis, transcription, and call summaries.

Existing Clerk, Upstash Redis, Twilio, Stripe, and lead webhook variables remain required. The production Vercel Pro project runs saved automation every five minutes, including while all browsers are closed. CRON_SECRET is required. The existing browser check remains a supplementary trigger; the server lease and per-action claims prevent duplicate delivery. The miner feed retains its daily schedule. After changing environment variables, redeploy Production.

## Provider callbacks

- Twilio Voice application: `https://pacificacrm.com/api/twilio/voice` using `POST`.
- Twilio number Messaging webhook: `https://pacificacrm.com/api/twilio/inbound` using `POST`. Assigning or repairing a number through Phone Number Center applies this automatically.
- Twilio outbound delivery callbacks are attached automatically at `https://pacificacrm.com/api/twilio/messages/status`.
- Resend webhook: `https://pacificacrm.com/api/email/webhook`; subscribe to received, delivered, bounced, complained, and suppressed email events.

## Turn on a customer workspace

1. Open **Owner Settings → Launch Control** and finish every item marked Setup.
2. Complete business identity, mailing address, callback number, and email identity.
3. Assign a phone number and finish Trust Hub, SHAKEN/STIR, CNAM, Voice Integrity, and A2P where applicable.
4. Open **Pipeline → Automation Studio**, review each prompt and delay, then enable Autopilot.
5. Record SMS/email permission only when the customer has documented consent. DNC, STOP, unsubscribe, bounces, complaints, replies, appointments, and closed records suppress automation.
6. Add team members only after they create a Pacifica sign-in. Their Clerk account is mapped to the shared workspace with an agent or manager role.
7. Enable call recording only after adopting an approved disclosure/consent process. The salesperson must confirm disclosure before each recording.

## Production behavior

- The automation worker runs every five minutes on Vercel Pro. Only enabled workspace rules and eligible, permission-confirmed contacts are processed. It uses deterministic idempotency keys, retries transient failures, and moves repeatedly failing actions to needs-attention status.
- If the preferred provider is unavailable, Pacifica can use another consented and configured channel.
- Incoming text/email replies stop active sequences while Pacifica is closed.
- Email bounce, complaint, and suppression events block additional email.
- Browser saves merge with server-side communications, replies, recordings, transcripts, and new inbound leads instead of overwriting them.
- Call recordings stream through an authenticated workspace route. When enabled, OpenAI transcribes and summarizes completed recordings.
- Launch Control shows production readiness and the most recent automation result without exposing credentials.

## Honest platform boundary

Pacifica is an installable PWA. A true background mobile softphone when the app is completely closed still requires native iOS CallKit, Android Telecom, and push-notification applications.
