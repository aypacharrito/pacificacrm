# Doxa branding and the owner’s Archon workspace

## Current change

Use Doxa for the Pacifica CRM assistant in shared UI, demo copy, diagnostics, errors, assistant prompts, and language strings. This is a naming change across existing CRM roles. The current assistant settings, tenant access and custom names continue through the existing paths.

## Implementation scope

- Pacifica adds one **Archon** item to the designated owner's sidebar and phone navigation. The `/dashboard/archon` server page checks the current Clerk member and workspace IDs, owner role, full access and pause state. Configure `PACIFICA_ARCHON_OWNER_USER_ID` and `PACIFICA_ARCHON_WORKSPACE_ID` for the verified account. Set `PACIFICA_ARCHON_WORKSPACE_URL` to the authenticated Archon application URL for that environment. The page opens the retained module links on that application, where the owner still uses its normal authorization. When the URL is missing the designated owner sees connection setup. The CRM sends no owner or CRM data through these links.
- In the Archon interface, remove **Websites**, **Pacifica**, and **Mneme**, along with the sites-live home summary and their redundant direct links. Website operations belong in Akroven, quoting belongs in Pacifica CRM, and Mneme has its own app. Keep Stores and Stenos. Maintain existing website resources, CRM records, and vault access. Use the same visible module list in the desktop, phone and CRM surfaces.
- Make Vyra reachable in Archon through Marketing Studio. Use separate authorized gym and meme account connections, account-specific Insights and private content queues. Resolve the current owner-approved handles from private configuration. Reuse existing metrics and render workflows. Keep the current paper arena and bot-policy work in their own implementation phases.

## Voice and personal assistance

- Use the most recent explicit spelling, typed handle, user correction, link, or verified account identity to ground a dictated name. Confirm it in the current authorized source when available. Respect mid-sentence corrections such as “Stores, no, websites.” Preserve the raw transcript and resolved intent in their appropriate scopes. Hold consequential ambiguous actions for a focused user clarification.
- Implement dot-style personal responsibilities for the owner through the existing Doxa workstream. Test a scoped inbox goal, proactive event and schedule triggers, persistent preferences, visible activity, owner steering, pause, reconnection and source revocation. Record the inputs and observable results in a test workspace. [ChatGPT dot behavior](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot)
- Verify the planned Linq iMessage/RCS transport for opt-in private owner texting. Keep regular CRM SMS and voice on their approved provider paths. Use test events and fake transports for development until the owner configures providers. Keep private jobs, sources, messages and memories scoped to the owner.
- Ship cross-repo implementation in reviewable GitHub pull requests. Show test evidence for the branding, role checks, single Archon doorway, retained and retired navigation, cross-channel follow-through, and provider-disabled states. Follow normal release controls.
