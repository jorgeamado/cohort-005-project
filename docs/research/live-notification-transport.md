# Keeping the bell count and toasts live: polling vs SSE

Research for [#8](https://github.com/jorgeamado/cohort-005-project/issues/8), part of the Notifications map [#2](https://github.com/jorgeamado/cohort-005-project/issues/2). This page records facts only. The choice belongs on the ticket. It builds on `research/notification-platforms` (docs/research/notification-platforms.md) and does not repeat it.

Sources were read on 2026-11-23. Facts marked **(local)** were checked against `node_modules` in this repo, which pins `react-router` and `@react-router/*` at 8.3.0.

The three options:

- **A.** `useRevalidator()` on an interval and on focus. This reruns the page's active loaders.
- **B.** `useFetcher` polling a small resource route on an interval and on focus/visibilitychange.
- **C.** Server-Sent Events from a resource route, fed by an in-process emitter.

## 1. What well-known products do

| Product | Transport for live in-app updates | Interval / notes | Source |
|---|---|---|---|
| GitHub (REST API for notifications) | Polling with conditional requests | "Notifications are optimized for polling with the `Last-Modified` header." A request with no change gets `304 Not Modified`, "leaving your current rate limit untouched." The `X-Poll-Interval` header "specifies how often (in seconds) you are allowed to poll … In times of high server load, the time may increase." | [docs.github.com REST notifications](https://docs.github.com/en/rest/activity/notifications) |
| GitHub (web UI) | WebSocket ("Alive") | The first-party npm package `@github/alive-client` 1.2.0 wraps `@github/stable-socket`. `AliveSession` takes an `inSharedWorker` flag, so it is built to share one socket across tabs, and its default `maxReconnectBackoff` is 600000 ms. No first-party doc says this socket drives the bell; that link comes only from third-party reverse engineering. | npm tarball of `@github/alive-client` (read locally) |
| GitLab | ETag polling, plus Action Cable WebSockets for some features | "Polling … introduces high load … Instead you should use polling mechanism with ETag caching in Redis." On a match the server returns 304 without touching the database, and the server sets the interval with a `Poll-Interval` header. Separately, Action Cable is "the underlying transport for GraphQL subscriptions", and features should "degrade gracefully when a WebSocket connection isn't available." | [GitLab polling](https://docs.gitlab.com/development/polling/), [GitLab real-time](https://docs.gitlab.com/development/real_time/) |
| Discourse | MessageBus: HTTP long polling, chunked streaming, and plain polling as fallback | The notification state is published on `/notification/#{id}` (`app/models/user.rb`), and the client resumes from `MessageBus.last_id`. Client defaults: long-poll window 25 s. `backgroundCallbackInterval` is 60000 ms and is used when long polling is off or the tab is in the background. `minHiddenPollInterval` is 1500 ms, and "hidden tabs share state through localStorage". Backoff ceiling `maxPollInterval` is 180000 ms. WebSockets appear only as a wished-for contribution. | [discourse/message_bus README](https://github.com/discourse/message_bus), [discourse user.rb](https://github.com/discourse/discourse/blob/main/app/models/user.rb) |
| Mastodon | SSE **and** WebSocket streaming API, with polling as fallback | `GET /api/v1/streaming/user/notification` "Returns events for received notifications". The same streams are offered over a multiplexed WebSocket. When the user stream disconnects, the web client polls (`refreshHomeTimelineAndNotification`): first after a random 0–40 s, then every 20–40 s, and it stops on reconnect. | [Mastodon streaming](https://docs.joinmastodon.org/methods/streaming/), [`actions/streaming.js`](https://github.com/mastodon/mastodon/blob/main/app/javascript/mastodon/actions/streaming.js) |
| Basecamp / HEY (37signals) | Action Cable (WebSocket) + Turbo Streams | DHH's Rails 5 post says Action Cable was extracted from Basecamp 3's chat and notifications. That page returned 403 here, so this comes from a search snippet and is unverified. The Turbo repo says Turbo is used in production in HEY. No first-party source gives intervals. | search results only, treat as weak |
| Linear | Sync engine pushing deltas to clients | Linear's own post ([Scaling the Linear sync engine](https://linear.app/now/scaling-the-linear-sync-engine)) does not name the transport. Only secondary summaries say "WebSocket". Not verified. | weak |

**Verdict (Q1).** The big products push over WebSocket (GitHub web, GitLab subscriptions, Basecamp, Mastodon) or SSE (Mastodon). That is mostly for collaborative features at very large scale. Even so, every documented system keeps **polling as a fallback or as the public contract**:

- GitHub API: `Last-Modified`/304 plus `X-Poll-Interval`.
- GitLab: ETag/304 plus `Poll-Interval`.
- Discourse: 60 s background poll.
- Mastodon: 20–40 s poll while the stream is down.

Recurring patterns are conditional GETs that cost nothing when nothing changed, a server-controlled interval, slower polling in hidden tabs, and jittered or backed-off retries. No source gives a one-size "standard interval". Documented values sit between 15 s and 60 s for background or fallback polling.

## 2. React Router 8 support: SSE and polling

### SSE

- **remix-utils 10.0.1** has the SSE helpers:
  - `eventStream(signal, init, options?, strategy?)` (server)
  - `useEventSource(url, {event})` (client)
  - an optional `<EventSourceProvider>`
  
  Its peer dependency is `react-router ^8.0.0` with `react >=19.2.7`, and the README says apps on React Router 7 should stay on remix-utils 9.x. So it targets React Router 8. [README](https://github.com/sergiodxa/remix-utils), [`src/server/event-stream.ts`](https://github.com/sergiodxa/remix-utils/blob/main/src/server/event-stream.ts)
- **What `eventStream` does** (from the source):
  - It **forces** `Content-Type: text/event-stream`, `Cache-Control: no-cache` and `Connection: keep-alive`. Caller-supplied values for these headers are overridden with a `console.warn`.
  - It runs the cleanup returned by `init` when `request.signal` aborts or the stream is cancelled.
  - It **silently drops** an event when the stream queue is full (`desiredSize <= 0`).
  - It sends no keep-alive comments.
- **`useEventSource`** keeps a global map, so there is one `EventSource` per URL+options **per tab**. The reason given is that "SSE count towards the limit of HTTP connections per domain". Nothing is shared across tabs. The README also says "your server must support HTTP streaming."
- **Remix's own example** `remix-run/examples/sse-counter` uses `eventStream` in a resource route `sse.counter.ts`. The SSE pattern there is a loader-only resource route.
- **Compression is handled (local).** `@react-router/serve` 8.3.0 runs `app.use(compression())`, and `compressible("text/event-stream")` returns `true`, so SSE responses are gzipped. The compression README warns this "does not work out of the box with server-sent events" unless `res.flush()` is called. The React Router 8.3.0 adapters cover this:
  - `@react-router/express` calls `res.flushHeaders()` when the `Content-Type` matches `text/event-stream`.
  - `@react-router/node`'s `writeReadableStreamToWritable` calls `writable.flush()` after **every chunk** when it exists. `compression` adds that method.

  So a stream from a resource route should reach the browser event by event under `react-router-serve`. This was read in the code, not tested.
- **Reverse proxies.** nginx has `proxy_buffering on` by default. Sending `X-Accel-Buffering: no` turns buffering off per response. `proxy_read_timeout` defaults to 60 s *between reads*, so an idle stream gets cut unless the server writes something. [nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html). The HTML spec separately advises a `:` comment line "every 15 seconds or so" because legacy proxies drop idle connections. [HTML §9.2.7](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- **Reconnection** is built into `EventSource`:
  - The browser reconnects after a drop, and the `retry:` field sets the delay. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
  - On reconnect it sends `Last-Event-ID` if an `id:` was sent before, so the server can replay what was missed.
  - A `204 No Content` response stops reconnection. [HTML §9.2.3–9.2.4](https://html.spec.whatwg.org/multipage/server-sent-events.html)
  - `eventStream` supports `id`, but replaying from `Last-Event-ID` is up to us.
- **Six connections per origin.** "When not used over HTTP/2 … the limit is per browser and set to a very low number (6) … marked as 'Won't fix' in Chrome and Firefox." Over HTTP/2 the default is 100 streams. [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource). With one `EventSource` per tab over HTTP/1.1, the 6th tab leaves no connections for normal fetches and navigations. The spec suggests sharing one `EventSource` through a SharedWorker. MDN marks `SharedWorker` "Baseline 2026, newly available (since May 2026)", so older browsers may lack it. [MDN SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker). Whether production traffic is HTTP/2 depends on what sits in front of `react-router-serve`, which is plain HTTP/1.1 Node.
- **In-process emitter.** An in-process `EventEmitter` only reaches subscribers in the same Node process. That matches the single-process, single-SQLite-file setup (ADR-0006) and would stop working if the app ran more than one process. This is an inference, not a cited source.

### Polling

- **`useRevalidator` (A).** The docs describe its purpose as revalidating "for reasons outside of normal data mutations like Window focus or polling on an interval". There is no built-in interval or focus helper, and the docs example uses a placeholder `useFakeWindowFocus`. [useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)
  - It reruns all **active loaders** on the page. A route can opt out with `shouldRevalidate`.
  - The docs warn that "always returning `false` opts that route out … including … explicit `useRevalidator`", and recommend the conditional form that returns `defaultShouldRevalidate`. [Optimize revalidation](https://reactrouter.com/how-to/optimize-revalidation)
  - So with A, every poll also reruns the loaders of the page underneath unless each route filters it out.
- **`useFetcher` (B).** `fetcher.load(url)` loads a loader's data without navigating, and `useFetcher({ key })` shares one fetcher's state across components. [useFetcher](https://reactrouter.com/api/hooks/useFetcher)
  - `fetcher.load` data "only revalidates by default after action submissions and explicit `useRevalidator` calls". [Optimize revalidation](https://reactrouter.com/how-to/optimize-revalidation)
  - So the bell stays current after the user's own actions without extra work, and B's poll touches only the small resource route.
- **No standard community polling hook for React Router 8 was found.** remix-utils has no `useRevalidateOnInterval`/`useRevalidateOnFocus`. Both A and B are a `setInterval` plus a `focus`/`visibilitychange` listener that we write ourselves.
- **Hidden-tab throttling.** "Timers such as `setTimeout()` are throttled in background/inactive tabs." [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). A hidden tab's interval polls are therefore late anyway. Discourse and Knock (previous research) both slow down or disconnect hidden tabs.

**Verdict (Q2).** All three options work on React Router 8.3.0. For C, remix-utils 10 is the established library and explicitly supports React Router 8. The compression middleware in `react-router-serve` does **not** hold SSE back, because the adapter flushes every chunk. The remaining SSE caveats are:

- proxy buffering and idle timeouts (fix with `X-Accel-Buffering: no` and a comment heartbeat under 60 s);
- the 6-connection limit per origin over HTTP/1.1 across tabs;
- catching up after a reconnect (`Last-Event-ID`, or simply refetch the count on `open`).

For polling, React Router documents the pattern (A), but A reruns every active loader. B is the narrower version, built from documented primitives.

## 3. Coordinating several tabs in one browser

| Technique | What it does | Maturity |
|---|---|---|
| **Page Visibility API** (`document.visibilityState`, `visibilitychange`) | Tells a tab when it is hidden, so it can pause or slow down | Baseline, widely available since July 2015 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)) |
| **BroadcastChannel** | Named channel that any same-origin tab, frame or worker can post to and receive from | Baseline, widely available since March 2022 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)) |
| **`storage` event** (localStorage) | Fires in *other* same-origin tabs when localStorage changes, not in the tab that wrote. sessionStorage does not reach other tabs. | Baseline since April 2017 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)). Discourse MessageBus uses it to share state between hidden tabs. |
| **Web Locks** (`navigator.locks.request`) | Exclusive lock per origin across tabs and workers. Usable for leader election: hold a lock named e.g. `notifications-leader` for the tab's lifetime, and the leader polls or holds the single SSE connection. Locks are released when the holder's document unloads. `ifAvailable` returns `null` instead of waiting, and `steal` preempts. Secure contexts only. | Baseline, widely available since March 2022 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [spec](https://w3c.github.io/web-locks/)). The spec says release on termination is "vaguely defined" for workers. |
| **SharedWorker** | One worker shared by all same-origin tabs, holding a single connection. GitHub's `alive-client` has an `inSharedWorker` mode. The HTML spec recommends it for sharing an `EventSource`. | Baseline 2026, newly available ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)) |

**Verdict (Q3).** There is no single standard. The established, widely available building blocks are:

- Visibility, to pause hidden tabs.
- BroadcastChannel, to fan out results.
- Web Locks, to elect one leader tab.

localStorage events are the older fallback, used by Discourse. SharedWorker is the textbook way to share one connection and is used by GitHub, but it only became Baseline in 2026. For a small app, pausing hidden tabs alone already removes most duplicate polling. Leader election mainly matters for SSE over HTTP/1.1, where the 6-connection cap is a hard limit.

## 4. Showing a toast only once, across tabs and devices

- **No web standard covers in-page toasts.** The nearest is the Notifications API `tag`: notifications with the same tag replace each other "to avoid the users' screen being filled up with a huge number of similar notifications." That applies only to OS-level notifications, not in-page toasts, and MDN marks `Notification.tag` as **Limited availability** ("not Baseline"). [MDN Notification.tag](https://developer.mozilla.org/en-US/docs/Web/API/Notification/tag)
- **Across devices, the common practice is a read/seen cursor stored on the server:**
  - GitHub's `PUT /notifications` takes `last_read_at` ("the last point that notifications were checked"), and each thread has `unread` and `last_read_at`. [GitHub REST](https://docs.github.com/en/rest/activity/notifications)
  - Mastodon's Markers API stores `last_read_id` for the notifications timeline ("Save and restore your position in timelines") with a version and a 409 on stale update. [Mastodon markers](https://docs.joinmastodon.org/methods/markers/)
  - Discourse stores `notification_channel_position` from `MessageBus.last_id` and resumes from it.
  - SSE's `id:` / `Last-Event-ID` is the transport-level form of the same cursor.
- **Inferred pattern** (not from a single source): give each Notification a monotonic id. A client toasts only ids newer than the highest id it has seen, initialised from the server-rendered loader data so a fresh page load doesn't toast old items. Across tabs in one browser, the leader (or the first tab to see an id) posts it on a BroadcastChannel and the others record it as seen, or the toasted id is kept in localStorage. Across devices, "toast once" is usually relaxed to "toast once per device/session while unread". The server-side read/seen state (above) is what stops a second device from toasting already-read items. Nothing found enforces exactly-once toasting across devices.

**Verdict (Q4).** No standard exists. The established practice is:

- monotonic ids plus a server-side read/seen cursor (GitHub, Mastodon, Discourse) for cross-device state;
- BroadcastChannel or localStorage to deduplicate between tabs in one browser.

## Things that stood out

- Under `react-router-serve` 8.3.0, the gzip middleware is **not** a blocker for SSE. The adapter flushes each chunk and calls `flushHeaders()` for `text/event-stream` (local). A proxy in front still needs `X-Accel-Buffering: no` and a heartbeat under 60 s.
- remix-utils `eventStream` overrides any `Cache-Control` you pass, drops events when its queue is full, and sends no heartbeat. Write a heartbeat with `send` on a timer, or a hand-rolled `ReadableStream`, if a proxy is involved.
- Every large product that pushes also polls as a fallback. Option C would still need a catch-up fetch on reconnect, which is effectively option B.
- Option A reruns every active loader on each tick. Option B touches only the notification route, and its data is still refreshed automatically after the user's own actions.
