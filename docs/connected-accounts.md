# Connected accounts in Pacifica

## What members see

- **Settings → Integrations → Connected accounts** manages personal Google, Microsoft, and iCloud connections. Each account has its own Mail, Calendar, and optional mailbox action permissions.
- **Messages → Connected mail** opens on Starred until the member saves a different view. An account selection persists with that view. All Mail includes sent and archived messages. Drafts, Spam or Junk, and Trash have dedicated views. Reading uses text or text extracted from HTML. Reading and background sync preserve the provider’s unread state.
- **Office → Calendar** overlays visible calendars with Pacifica appointments, payments, and scheduled Today tasks. It supports Day, Week, Month, and Agenda. Calendar visibility and color are private member preferences. Free/busy calendars show Busy. Calendar Settings still manages the existing writable Pacifica sync destinations.
- The floating **Pacifica assistant** opens typed chat and push-to-talk. Finish recording and review the transcript before sending. Read aloud is explicit and can be muted. The connected calendar, starred mail, and carrier follow-up answers use authorized sources and show coverage. The private mail content used by those three reads never goes to an AI model.

Each account connects with automation off. The separately configured Gmail triage pilot keeps its own grant, task rules, starred protections, SMS and cleanup settings, and seven-day review.

## Isolated preview

Use an Akroven preview with its own Clerk development instance, Redis database, provider app registrations and test users. Set the application origin to that preview’s exact HTTPS address. Treat the public production health endpoint as release evidence, independent of this preview.

| Setting | Required value |
| --- | --- |
| PACIFICA_CONNECTED_ORIGIN | Exact preview origin with no trailing slash or path |
| PACIFICA_CONNECTED_ENCRYPTION_KEY | Dedicated random 32-byte key as 64 hex characters, stored as a secret |
| KV_REST_API_URL and KV_REST_API_TOKEN | Matching preview Redis REST URL and token. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are also supported. |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY | Preview Clerk development keys |
| PACIFICA_CONNECTED_GOOGLE_CLIENT_ID and PACIFICA_CONNECTED_GOOGLE_CLIENT_SECRET | Google web OAuth client in the preview project with Gmail API and Calendar API enabled |
| PACIFICA_CONNECTED_MICROSOFT_CLIENT_ID and PACIFICA_CONNECTED_MICROSOFT_CLIENT_SECRET | Entra web application configured for work or school accounts and personal Microsoft accounts |
| PACIFICA_CONNECTED_ICLOUD_MAIL and PACIFICA_CONNECTED_ICLOUD_CALENDAR | Set each to true in the preview when that service is being tested there |
| CRON_SECRET and PACIFICA_CONNECTED_SYNC_ENABLED | Matching scheduler bearer secret and true in the preview when ready to run reconciliation |

In Google Cloud, register **/api/connected/oauth/google** on the exact origin under the OAuth client’s authorized redirect URIs. Add authorized preview participants in the Google Auth Platform audience. The delegated sign-in grant is separate from Clerk. Pacifica requests Gmail read-only and Calendar read-only as selected. The explicit action toggle uses the Gmail Modify grant. Review Google’s restricted-scope verification and data handling requirements for a production OAuth audience.
[Google Gmail scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes)

In the Microsoft Entra app registration, add the **Web** redirect **/api/connected/oauth/microsoft** on the same preview origin. Allow personal Microsoft and organizational accounts. Add delegated User.Read, Mail.Read, Mail.ReadWrite and Calendars.Read with Calendars.Read.Shared as applicable. Test one Outlook.com account and one organization’s account and shared calendar. If the tenant requires admin consent, have its administrator approve the preview application for its test user.
[Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)

Use an Apple test account with iCloud Mail, Calendar and two-factor authentication. In Apple Account → Sign-In and Security → App-Specific Passwords, create a password for Pacifica’s preview. Enter only the app-specific password in Pacifica. The same credential verifies the CalDAV account principal even for a Mail-only connection and then opens IMAP only if Mail was selected. Check outbound TLS to imap.mail.me.com:993, CalDAV HTTPS discovery, a recurring event with an edited instance, and revocation. The Workers build uses the outbound socket runtime for IMAP. Apple access and recurrence expansion need a real-host test before each service is enabled in production. iCloud mailbox actions are limited to read or unread and flag or unflag. Updates uses a user-selected mailbox.
[Apple third-party access](https://support.apple.com/en-us/121539) · [iCloud IMAP settings](https://support.apple.com/en-gb/102525)

## Reconciliation and Gmail push

The portable entry point is **GET /api/cron/connected-accounts** with **Authorization: Bearer CRON_SECRET** every five minutes. The existing Workers release configurator enables its trigger when PACIFICA_CONNECTED_SYNC_ENABLED is true. The same periodic endpoint can be invoked by another host scheduler. The route checks the member’s current workspace access before each grant is processed. Sync now runs one bounded pass and the scheduler continues pending pages. Job leases, grant state, and cursors are durable in the preview’s Redis database.

Gmail history and Google Calendar sync tokens recover after expiration. Microsoft mail uses Graph delta by folder. Microsoft’s primary calendar uses the v1.0 calendar delta and other calendars reconcile through bounded CalendarView pages. iCloud initially reconciles a recent mailbox window and uses CalDAV expansion for upcoming events. Older mail and calendars load on demand. Outlook category choices come from observed provider messages. Mailbox search may need additional pages when filters are evaluated across multiple provider folders.

To enable Gmail push, configure a separate authenticated subscription and **/api/connected/google/push**. Use PACIFICA_CONNECTED_GMAIL_TOPIC, PACIFICA_CONNECTED_GMAIL_SUBSCRIPTION, PACIFICA_CONNECTED_GMAIL_PUSH_AUDIENCE, and PACIFICA_CONNECTED_GMAIL_PUSH_SERVICE_ACCOUNT. Grant Gmail’s publishing service account access to the preview topic. The subscription must use the configured identity and audience. Notifications only move an existing matching job forward. The job itself verifies the current grant and advances Gmail history. If a watch expires or its renewal fails, reconciliation continues. The two-mailbox pilot has separate paths and credentials.
[Gmail push setup](https://developers.google.com/workspace/gmail/api/guides/push) · [Graph mail delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)

## Migration and rollback

The new Redis namespace is created lazily. It stores member- and workspace-scoped grants, short-lived search cursors, job leases and bounded caches. Keep a durable copy of the encryption key in the deployment’s secret settings. Credential rotation for a preview uses a new store or requires reauthorization of its accounts.

Existing Google and Outlook sync grants may lack the external account identity or permissions required for this feature. Pacifica surfaces an explicit reconnect path for the grant’s original owner. Connect with the verified original identity before using the new calendar view. The old route continues to manage Pacifica’s writable target. Mapped CRM events are removed from the overlay using their stored provider IDs. Sharing a workspace does not grant access to another member’s new connections.

For rollback, disable PACIFICA_CONNECTED_SYNC_ENABLED and deploy the last verified revision on the preview target. Keep the previous revision’s Calendar vault and triage scheduler settings. Reuse the new encrypted store only with its matching key. Disconnect in Pacifica to remove an account’s grant, cached data and pending sync. Revoke exclusive provider consent or the individual Apple app-specific password through the owning test account.

## Verification

Run the repository’s lint, typecheck, unit, route and UI tests. Use the Worker build for Akroven. The focused account fixtures exercise five grants, wrong-account reconnects, private resource links, mixed filters, read-state preservation, a lost response to a provider write, history recovery, throttling, concurrent workers, and duplicate calendar names. Use blank preview accounts for live checks. Fill the live report with provider, account type, preview release, operation, and observed result before approving a production rollout.
