# Intentional follow-up and backup replies

Backup replies are separate from sales sequences. Enable them in the smart warming settings. They cover only incoming texts received after activation, after at least 60 minutes without an outbound response, during weekday business hours in the saved workspace time zone. Sales AI-off and Interested chats may use this permission. A per-contact “Never auto-reply”, closed/DNC/deleted/opted-out contact, newer conversation activity or missing SMS permission still blocks sending.

The plan reserves estimated outbound SMS spend before calling Twilio: $2/day, $10/calendar week (Monday–Sunday), and $30/month. One automated SMS segment includes the sender and opt-out footer. Existing explicit limits remain until changed; the preset button applies the plan. Actual carrier adjustments, inbound messages, number rental and calls are separate invoice items.

A cold eligible lead gets one short opening and at most one unanswered follow-up after 72 hours. It then rests. Renewal outreach needs customer timing and permission. Backup replies answer a specific inbound message and never reopen a cold sequence. They are limited to one per contact per day and two per week. Plain acknowledgments do not trigger another paid model call or text. Unknown provider outcomes are retained for review rather than retried.

The five-minute follow-up job includes backup replies. A separate five-minute conversation-review job refreshes factual tasks and calendar candidates using the existing evidence, freshness, deduplication and manual-decision guards. Calendar auto-review still requires its saved enabled setting; Google sync uses the existing connection. Message content cannot alter permissions, credentials, budgets or code.

## Android business calling

The app uses the official Twilio native SDK, a server-issued short-lived voice token and the existing assigned business number. Android incoming push needs a Firebase Android app for `com.pacificacrm.app`, matching `google-services.json`, a Firebase service-account-backed Twilio Push Credential, and `TWILIO_ANDROID_PUSH_CREDENTIAL_SID` in production. Keep service-account keys out of source and chat. `GOOGLE_SERVICES_JSON` is an EAS file variable; do not paste its contents into source.

One generated native FCM service routes voice payloads to Twilio and normal notifications to Expo. Enable incoming calls in the app and allow microphone/call notifications. A signed Android development/internal APK and a real-device test are required before claiming background or locked-screen ringing works. Expo Go and a mobile browser cannot validate this. Force-stop, unavailable network, disabled notifications or device power management can prevent delivery; this is not an always-on guarantee.
