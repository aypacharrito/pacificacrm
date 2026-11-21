# Gmail triage in Pacifica

The workspace owner can connect Pacifica Legal Insurance and David’s Insurance under **Settings → Integrations → Gmail triage**. Each connection verifies the Google mailbox address, starts with every action disabled, and can be managed separately. **Check now** runs a bounded check and saves its place if any more messages remain. Enable follow-up tasks to start reviewing existing starred messages and use **Review existing stars** to repeat the review. Open Gmail tasks appear in the owner's Today view.

Rules use Gmail labels, the sender authentication result, the decoded text in each MIME body part, and the latest thread. Gmail retains starred messages, insured and carrier correspondence with business value, payment records, and suspected incidents. Routine authenticated security notices can move to Gmail Trash at or after 168 hours when the owner enables cleanup and the current thread still qualifies. The automation holds multi-message threads, unresolved cases, user-labeled messages, and attachments when evaluating Trash. Gmail read status is preserved.

Optional OpenAI classification sends bounded text from ambiguous, authenticated follow-ups to the configured API to extract a short quote and determine whether the owner needs to act. The rules handle the known carrier and cleanup templates directly. Model classifications can suggest a task, and the application validates the quoted evidence before accepting it. The application does not store email bodies or model quotes. Gmail task links open the original thread in the correct mailbox.

## Server setup

Create a dedicated Google OAuth web client and enable Gmail API and Cloud Pub/Sub in that project. Add the exact `/api/integrations/gmail/callback` HTTPS URL to the OAuth client's allowed redirects. Grant the two mailbox owners access to the OAuth app and use the `gmail.modify` scope. Complete any Google OAuth verification required for the project's publishing mode.

| Environment variable | Value |
| --- | --- |
| `GMAIL_TRIAGE_CLIENT_ID` and `GMAIL_TRIAGE_CLIENT_SECRET` | OAuth web client credentials |
| `GMAIL_TRIAGE_REDIRECT_URI` | Deployed HTTPS OAuth callback URL |
| `GMAIL_TRIAGE_MAILBOXES` | Comma-separated Gmail addresses for Pacifica Legal Insurance and David’s Insurance |
| `GMAIL_TRIAGE_ENCRYPTION_KEY` | Dedicated, stable 32-byte key encoded as 64 hexadecimal characters |
| `GMAIL_TRIAGE_TOPIC` | Full Pub/Sub topic, `projects/PROJECT/topics/TOPIC` |
| `GMAIL_TRIAGE_SUBSCRIPTION` | Full Pub/Sub subscription, `projects/PROJECT/subscriptions/SUBSCRIPTION` |
| `GMAIL_TRIAGE_PUSH_AUDIENCE` | Exact audience configured for the authenticated push subscription |
| `GMAIL_TRIAGE_PUSH_SERVICE_ACCOUNT` | Exact service-account email for the push subscription |
| `CRON_SECRET` | Existing protected cron secret |
| `GMAIL_TRIAGE_ENABLE_SMS` | Optional `true` after the existing Pacifica texting provider is ready |
| `OPENAI_API_KEY` and `GMAIL_TRIAGE_MODEL` | Optional OpenAI credentials and model override. The classifier defaults to `gpt-5-nano`. |

The connection store uses the CRM’s existing Redis configuration. Store credentials in the host's secret manager. Grant `gmail-api-push@system.gserviceaccount.com` publisher access to the topic in the OAuth project. Set the subscription to send authenticated, wrapped POSTs to `/api/integrations/gmail/push`. The route checks the Google signature, audience, service account and subscription before reading Gmail history.

Run `GET /api/cron/gmail-triage` every five minutes with `Authorization: Bearer <CRON_SECRET>` to renew watches, catch missed notifications, and process due rechecks and starred-mail reminders. On the Cloudflare release path, `PACIFICA_GMAIL_CRON_ENABLED=true` at release configuration adds this schedule to the Worker. Other hosts can use their authenticated scheduler. The scheduled job also works as polling if Pub/Sub has yet to be configured.

To enable texts, the owner selects SMS for that mailbox and enables the existing owner texting preference using the same E.164 number as their verified primary Clerk phone. The existing provider's account approval and sending switch apply. Backfills can create tasks and skip new-arrival texts. Texts contain a short generic alert and no client or message details.

## Verification

Connect both Google addresses in their intended workspace and check each mailbox in preview. Confirm a carrier appointment reply can be starred and produce one owner Today task when those actions are enabled. Check that a second run and an existing-star review keep one task per thread. Verify at least one signed push delivery and one scheduled check before enabling cleanup or texting on live mail. Useful Google setup references are [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push) and [authenticated Pub/Sub push](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
