# Hosted notification platform vs our own inbox: what each offers

Research for [#4](https://github.com/jorgeamado/cohort-005-project/issues/4), part of the Notifications map [#2](https://github.com/jorgeamado/cohort-005-project/issues/2). Facts only; the choice is a separate ticket.

Sources were read on 2026-11-23. Pricing pages change often, so re-check them before deciding.

## Cadence context

- Stack: `react-router` 8.3.0 and `react` 19.2 in `package.json`, served by `@react-router/serve`. The ticket says "React Router 7", but the repo is on 8.x. The loader/action/resource-route model is the same.
- SQLite through Drizzle (ADR-0006). Email goes through `sendEmail` in `app/lib/mailer.server.ts`, using a `MailTransport` that is either Postmark or a `.outbox/` writer (ADR-0013).
- Scale: low thousands of users. No in-app notification UI exists.

## Summary table

| | Knock | Novu Cloud | Novu self-hosted (Community) | Courier | MagicBell | Build our own |
|---|---|---|---|---|---|---|
| **Free tier** | 10,000 messages/mo | 10,000 workflow runs/mo, 5 workflows, 3 team members | Free (MIT core); you pay for infrastructure | 10,000 sends/mo | 1,000 deliveries/mo | Free; Postmark costs as today |
| **First paid step** | Starter $250/mo (50k messages, then $0.005 each) | Pro from $30/mo (30k runs, then $1.20 per 1k) | Enterprise self-hosted: contact sales | Business $0.005 per send from the first send (50k = $250) | Startup $249/mo (50k, then $0.0025) | n/a |
| **Free-tier branding** | Knock branding; removal needs Starter | Novu branding; removal needs Pro | Branding removal not available | Not stated on pricing page | Not stated | n/a |
| **React inbox/bell** | `@knocklabs/react`: `NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed` | `@novu/react`: `<Inbox />` with Bell, Notifications, Preferences | Same `@novu/react` | `@trycourier/courier-react` v9 (inbox, toasts) | `@magicbell/react`: `FloatingInbox`, `Inbox`, `UserPreferences` | Build ourselves |
| **Prebuilt preferences UI** | No React component; hosted page (default set only) or build on API / `usePreferences` hook | Yes, inside `<Inbox />` | Yes | Hosted page plus embeddable SDK component | Yes, `UserPreferences` | Build ourselves |
| **Self-hosting** | Not offered | Community (MIT) or paid Enterprise | MongoDB, 2x Redis, S3, 4 services | Not offered | Not offered | Runs in the existing app and SQLite file |
| **Realtime transport** | Socket connection to Knock's realtime service | WebSocket (`wss://…socket.novu.co`) | WebSocket (`ws` service) | WebSocket (`wss://realtime.courier.com`) | WebSocket | Our choice: revalidate on poll/focus, or SSE from a resource route |
| **Email via our Postmark** | Yes, Postmark integration (server token) | Yes, Postmark integration | Yes | Yes, Postmark integration | No Postmark integration; generic SMTP only | Yes, existing `sendEmail` |
| **Client auth** | Backend signs RS256 user-token JWT ("enhanced security") | Backend HMAC-SHA256 `subscriberHash` | Same | Backend issues scoped JWT via `POST /auth/issue-token` | Backend signs HS256 user JWT | Existing session |
| **RR SSR fit** | Client-side components; token minted in a loader | Client-side; hash computed in a loader | Same | Needs a client boundary (custom element); token minted server-side | Client-side; JWT minted in a loader | Native: unread count in root loader, SSR'd |

## Knock

- **Pricing.** Free is $0/mo with up to 10,000 messages. Knock "doesn't hard cap messages" and will contact you if you exceed the limit without billing set up. Starter is $250/mo with 50,000 messages, then $0.005 each. Preferences and in-app feeds are on every plan. Removing Knock branding needs Starter. Per-tenant branding/preferences and translations need Enterprise. Logs are kept 30 days on Free. [knock.app/pricing](https://knock.app/pricing)
- **React components.** `@knocklabs/react` ships `NotificationIconButton` (bell with unread/unseen count), `NotificationFeedPopover` and `NotificationFeed`. [React overview](https://docs.knock.app/in-app-ui/react/overview). The feed is wrapped in `KnockProvider` (takes `apiKey`, `user`) and `KnockFeedProvider` (takes `feedId`). [Feed component](https://docs.knock.app/in-app-ui/react/feed)
- **Security.** By default, "Knock feeds are accessible to anyone who has the feed ID" and "a request with your public key can act as any user". Production should turn on enhanced security. In that mode the backend signs an RS256 JWT with `sub` = user id, and the client passes it as `userToken`. [Security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication)
- **Realtime.** Socket connection to "the Knock real-time service". With auto-management on, the feed disconnects inactive tabs and reconnects when they become active. [Feed component](https://docs.knock.app/in-app-ui/react/feed)
- **Preferences.** Can be set per channel type, channel, category and workflow, with environment, tenant and recipient defaults. A `false` category blocks the notification even if a channel is set to `true`. The UI options are a Knock-hosted page reached by signed URL (supports only the `default` set) or a custom UI built on the preferences API. [Preferences overview](https://docs.knock.app/preferences/overview). There is a React tutorial and a headless `usePreferences` hook, but no packaged preferences component. [Build a preference center for React](https://docs.knock.app/in-app-ui/react/preferences)
- **Postmark.** Yes. You configure the Postmark server API key and a From address, and Knock sends on the default `outbound` transactional stream. Delivery and bounce status come back through a Postmark webhook. [Knock Postmark integration](https://docs.knock.app/integrations/email/postmark)
- **Self-hosting.** Not offered. The pricing page has no self-hosted option.
- **RR fit.** The docs have no SSR guidance. The components rely on hooks and a browser public key, so they render on the client. A server loader can sign the user token and pass it to the component.

## Novu (cloud)

- **Pricing.** Free is $0 with no credit card: 10,000 workflow runs/mo, 5 workflows, 2 environments, up to 3 team members, 24h activity-feed retention, all channels. Pro starts at $30/mo with 30,000+ runs, 7-day retention and branding removal. Team starts at $250/mo with 250,000+ runs. Overage on Pro and Team is $1.20 per 1k runs. The page doesn't say what happens when Free hits its limit. [novu.co/pricing](https://novu.co/pricing)
- **React components.** `@novu/react` (React 18+, React 19 supported) provides `<Inbox />`, made of Bell, Notifications, InboxContent and Preferences. `@novu/js` is there for a custom UI. The preferences UI is built in. [Inbox overview](https://docs.novu.co/platform/inbox/overview)
- **Security.** When HMAC is on, the backend computes `createHmac('sha256', NOVU_SECRET_KEY).update(subscriberId).digest('hex')` and passes it as `subscriberHash`. Without the hash, "the Inbox will not load". [Prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)
- **Realtime.** WebSocket. The Inbox takes a `socketUrl`, for example `wss://eu.socket.novu.co`. [Setup Inbox](https://docs.novu.co/platform/inbox/setup-inbox)
- **Postmark.** Yes. Add the Postmark server API token and a verified From address on the Integrations page. [Novu Postmark integration](https://docs.novu.co/platform/integrations/email/postmark)
- **RR fit.** The Next.js example uses `'use client'`, so the component renders on the client. A server loader can compute `subscriberHash` so the secret stays on the server.

## Novu (self-hosted)

- **License.** Open core. The core is MIT, and the `enterprise` folder is under a commercial licence. [github.com/novuhq/novu](https://github.com/novuhq/novu)
- **Infrastructure.** MongoDB (Atlas M20+ recommended, or 2 GB RAM / 20 GB disk on a single VM), two Redis instances (one for queues, AOF recommended), S3-compatible storage (10 GB+), and four services: API, Worker, WS and Dashboard. All of it fits on a single VM with 4 vCPU and 8 GB RAM. [Self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview)
- **Gaps versus cloud.** The Community edition lacks custom environments, translations, branding removal, snooze, email activity tracking, SSO, RBAC and social login, and allows one team member. Channels, digests, workflows and the Inbox components are available. [Self-Hosted and Novu Cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud). Enterprise self-hosted (paid, contact sales) has cloud parity. [novu.co/pricing](https://novu.co/pricing)
- **Note.** Self-hosting adds MongoDB and Redis next to Cadence's single SQLite file (ADR-0006).

## Courier

- **Pricing.** The Developer plan is free up to 10,000 sends/mo, and test environments count toward the cap. Business charges $0.005 per send from the first send, so 50,000 sends cost $250. Enterprise is custom. Plan gating for Inbox and Preferences isn't stated. [courier.com/pricing](https://www.courier.com/pricing)
- **React components.** `@trycourier/courier-react` v9 for React 18+, or `-react-17`. The older `@trycourier/react-inbox` and related packages are deprecated. [Inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview)
- **Security.** The backend calls `POST /auth/issue-token` with scopes `user_id:<id> inbox:read:messages inbox:write:events` and an `expires_in`. Omitting `expires_in` "mints a token that never expires". [Add an inbox to Next.js](https://www.courier.com/docs/guides/add-an-inbox-to-nextjs)
- **SSR.** "The inbox renders as a custom element that only exists in the browser". Courier says `"use client"` is the whole requirement and `ssr: false` is not needed. [Add an inbox to Next.js](https://www.courier.com/docs/guides/add-an-inbox-to-nextjs)
- **Realtime.** WebSocket. A CSP must allow `wss://realtime.courier.com` and `wss://realtime.courier.io`. The socket doesn't push a numeric unread total, so the client refetches counts. [Inbox runtime behavior](https://www.courier.com/docs/in-app/how-the-inbox-behaves)
- **Preferences.** You define topics with defaults, and a topic can be set to Required for messages users can't turn off. Users choose channels per topic, and "Courier enforces those choices on every send". The preference center comes as a hosted per-user page (reachable from email without sign-in) or as an embedded SDK component. [Preference center](https://www.courier.com/docs/in-app/preference-center)
- **Postmark.** Yes: "Keep Postmark as your email provider. Courier sends through your Postmark account." You configure the server token and a From address. [Courier Postmark integration](https://www.courier.com/docs/external-integrations/email/postmark)
- **Self-hosting.** Not offered.

## MagicBell

- **Pricing.** Builder is $0 with 1,000 deliveries/mo and 1 project. Startup is $249/mo with 50,000 deliveries, then $0.0025 each. Deliveries are counted across channels, so 100 in-app plus 50 emails = 150. [magicbell.com/pricing](https://www.magicbell.com/pricing)
- **React components.** `@magicbell/react` provides `ContextProvider` (requires a user JWT `token`), `FloatingInbox`/`Inbox`, `UserPreferences` ("toggle notification channels per category"), `ToastContainer` and others. [React library](https://www.magicbell.com/docs/libraries/magicbell-react)
- **Security.** The backend signs an HS256 JWT with the project Secret Key. Claims are `user_email` or `user_external_id`, plus `api_key`. [User JWT](https://www.magicbell.com/docs/api/authentication/user)
- **Realtime.** WebSocket, through the `Realtime` class in `magicbell-js`. [Browser/Node client](https://www.magicbell.com/docs/libraries/magicbell-js)
- **Postmark.** There is no Postmark integration. The listed email providers are SendGrid, Ping Email, Mailgun, SMTP and Amazon SES. [Email channel](https://www.magicbell.com/docs/channels/email). The generic SMTP integration takes host, port, username and password. [SMTP](https://www.magicbell.com/docs/channels/email/smtp). Postmark does offer SMTP, but MagicBell doesn't document that combination.
- **Self-hosting.** Not offered.

## Build our own (SQLite + Postmark)

- **Pricing.** No vendor fee. Email volume goes through the existing Postmark account.
- **UI.** Nothing prebuilt: the bell, list, read/unread and preferences screen would all be our own components.
- **Data.** A Drizzle table for Notifications and one for preferences in the existing SQLite file (ADR-0006). Delivery would call `sendEmail` through the existing `MailTransport` (ADR-0013), so dev and tests keep the `.outbox/` behaviour.
- **Realtime options in React Router.**
  - `useRevalidator()` reloads page data "for reasons outside of normal data mutations like Window focus or polling on an interval", and data revalidates automatically after actions. [useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)
  - Resource routes (a loader with no default export) can return a raw `Response` [resource routes](https://reactrouter.com/how-to/resource-routes), so a `text/event-stream` endpoint is possible. The docs don't cover streaming or SSE explicitly, and it is untested here.
- **RR fit.** The unread count and the list can be read in a loader and server-rendered with the existing session. No third-party token, socket host or CSP change is needed.
- **Costs of this option (facts, not a verdict).** Preferences, digests/batching, retries, delivery tracking (Postmark webhooks) and the UI are all ours to build. The hosted platforms ship these.

## Things that stood out

- MagicBell is the only hosted option with no Postmark integration (SMTP only). It also has the smallest free tier: 1,000 deliveries, counted across in-app and email.
- Knock and Novu put their branding on the free tier. Removing it costs $250/mo on Knock (Starter) and $30/mo on Novu (Pro).
- Every hosted inbox is a client-rendered widget authenticated by a server-signed token or hash. Each one needs a loader to mint the credential and an allowance for an external WebSocket.
- Self-hosted Novu requires MongoDB, two Redis instances and S3, a big step up from Cadence's single SQLite file.
- The repo runs React Router 8.3.0, not 7 as the ticket states.
