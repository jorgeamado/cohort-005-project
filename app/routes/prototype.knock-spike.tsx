// PROTOTYPE: Throwaway Knock vendor-fit spike for Wayfinder ticket #42
// ("Does Knock hold up against Cadence?"). Lives on a throwaway branch only.

import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type KnockClient from "@knocklabs/client";
import type { Feed, FeedItem, FeedStoreState } from "@knocklabs/client";
import { eq } from "drizzle-orm";
import {
  Bell,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { Route } from "./+types/prototype.knock-spike";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { Button } from "~/components/ui/button";
import {
  getKnockConfig,
  getKnockUserPreferences,
  listRecentRunMessages,
  probeEnhancedSecurity,
  resetKnockUserPreferences,
  setKnockCategoryFeedPreference,
  signCadenceUserToken,
  triggerDiscussionReplyWorkflow,
  triggerNewEnrollmentWorkflow,
} from "~/lib/knock-prototype.server";

function getAllUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .all();
}

function getUserById(id: number) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

export async function loader({ request }: Route.LoaderArgs) {
  const { config, missing } = getKnockConfig();
  const allUsers = getAllUsers();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? (getUserById(currentUserId) ?? null) : null;

  if (!config) {
    return {
      configured: false as const,
      missing,
      allUsers,
      currentUser,
    };
  }

  if (!currentUser) {
    return {
      configured: true as const,
      missing: [],
      allUsers,
      currentUser: null,
      publicApiKey: config.publicApiKey,
      feedChannelId: config.feedChannelId,
      signedToken: null,
      preferences: null,
      preferencesError: null,
    };
  }

  const signedToken = await signCadenceUserToken(currentUser.id);
  let preferences: unknown = null;
  let preferencesError: string | null = null;

  try {
    preferences = await getKnockUserPreferences(currentUser);
  } catch (err) {
    preferencesError = err instanceof Error ? err.message : String(err);
  }

  return {
    configured: true as const,
    missing: [],
    allUsers,
    currentUser,
    publicApiKey: config.publicApiKey,
    feedChannelId: config.feedChannelId,
    signedToken,
    preferences,
    preferencesError,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId ? (getUserById(currentUserId) ?? null) : null;

  try {
    if (intent === "probe-security") {
      if (!currentUser) {
        return { ok: false, intent, error: "Select a user in DevUI first." };
      }
      const probe = await probeEnhancedSecurity(currentUser.id);
      return { ok: true, intent, probe };
    }

    if (intent === "trigger-discussion-reply") {
      const workflowKey = String(
        formData.get("workflowKey") ?? "discussion-reply"
      ).trim();
      const recipientId = Number(formData.get("recipientId"));
      const actorId = Number(formData.get("actorId"));
      const lessonTitle = String(
        formData.get("lessonTitle") ?? "Generics & Type Narrowing"
      ).trim();
      const replyExcerpt = String(
        formData.get("replyExcerpt") ??
          "Great question — you can narrow the union with a discriminated tag."
      ).trim();

      const recipient = getUserById(recipientId);
      const actor = getUserById(actorId);
      if (!recipient || !actor) {
        return { ok: false, intent, error: "Pick both a recipient and an actor." };
      }

      const result = await triggerDiscussionReplyWorkflow({
        workflowKey,
        recipient,
        actor,
        lessonTitle,
        replyExcerpt,
      });

      return {
        ok: true,
        intent,
        workflowKey,
        workflowRunId: result.workflow_run_id,
        recipientName: recipient.name,
        actorName: actor.name,
      };
    }

    if (intent === "trigger-new-enrollment") {
      const workflowKey = String(
        formData.get("workflowKey") ?? "new-enrollment"
      ).trim();
      const instructorId = Number(formData.get("instructorId"));
      const studentId = Number(formData.get("studentId"));
      const courseTitle = String(
        formData.get("courseTitle") ?? "TypeScript Fundamentals"
      ).trim();

      const instructor = getUserById(instructorId);
      const student = getUserById(studentId);
      if (!instructor || !student) {
        return { ok: false, intent, error: "Pick both an Instructor and a Student." };
      }

      const result = await triggerNewEnrollmentWorkflow({
        workflowKey,
        instructor,
        student,
        courseTitle,
      });

      // Small wait so Knock finishes evaluating preferences and creating any feed message
      await new Promise((resolve) => setTimeout(resolve, 900));
      const messages = await listRecentRunMessages(
        instructor.id,
        result.workflow_run_id
      );

      return {
        ok: true,
        intent,
        workflowKey,
        workflowRunId: result.workflow_run_id,
        instructorName: instructor.name,
        studentName: student.name,
        messagesProduced: messages,
      };
    }

    if (intent === "set-enrollment-pref") {
      if (!currentUser) {
        return { ok: false, intent, error: "Select a user in DevUI first." };
      }
      const category = String(formData.get("category") ?? "enrollments").trim();
      const enabled = formData.get("enabled") === "true";
      const updated = await setKnockCategoryFeedPreference({
        user: currentUser,
        category,
        enabled,
      });
      return { ok: true, intent, category, enabled, preferences: updated };
    }

    if (intent === "reset-prefs") {
      if (!currentUser) {
        return { ok: false, intent, error: "Select a user in DevUI first." };
      }
      const updated = await resetKnockUserPreferences(currentUser);
      return { ok: true, intent, preferences: updated };
    }

    return { ok: false, intent, error: `Unknown intent: ${intent}` };
  } catch (err) {
    return {
      ok: false,
      intent,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function renderItemBody(item: FeedItem): string {
  const bodyBlock =
    item.blocks.find((b) => b.name === "body") ??
    item.blocks.find((b) => b.type === "markdown" || b.type === "text");
  if (
    bodyBlock &&
    (bodyBlock.type === "markdown" || bodyBlock.type === "text")
  ) {
    if (bodyBlock.rendered) {
      return bodyBlock.rendered.replace(/<[^>]+>/g, "").trim();
    }
    if (bodyBlock.content) return bodyBlock.content;
  }
  return JSON.stringify(item.data ?? {});
}

function readCategoryFeedEnabled(
  prefs: unknown,
  category: string
): boolean | "unset (Knock default: on)" {
  if (!prefs || typeof prefs !== "object") return "unset (Knock default: on)";
  const categories = (prefs as { categories?: Record<string, unknown> | null })
    .categories;
  if (!categories || !(category in categories)) {
    return "unset (Knock default: on)";
  }
  const entry = categories[category];
  if (typeof entry === "boolean") return entry;
  if (entry && typeof entry === "object" && "channel_types" in entry) {
    const channelTypes = (
      entry as { channel_types?: Record<string, unknown> | null }
    ).channel_types;
    if (channelTypes && typeof channelTypes.in_app_feed === "boolean") {
      return channelTypes.in_app_feed;
    }
  }
  return "unset (Knock default: on)";
}

export default function KnockSpikePrototype({
  loaderData,
}: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const securityFetcher = useFetcher<typeof action>();
  const replyFetcher = useFetcher<typeof action>();
  const enrollmentFetcher = useFetcher<typeof action>();
  const prefFetcher = useFetcher<typeof action>();

  const [replyWorkflowKey, setReplyWorkflowKey] = useState("discussion-reply");
  const [enrollmentWorkflowKey, setEnrollmentWorkflowKey] =
    useState("new-enrollment");
  const [enrollmentCategory, setEnrollmentCategory] = useState("enrollments");

  const [feedState, setFeedState] = useState<FeedStoreState | null>(null);
  const [authStatus, setAuthStatus] = useState<string>("idle");
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<string | null>(null);
  const [clientPrefMessage, setClientPrefMessage] = useState<string | null>(null);

  const knockRef = useRef<KnockClient | null>(null);
  const feedRef = useRef<Feed | null>(null);

  const publicApiKey = loaderData.configured ? loaderData.publicApiKey : null;
  const feedChannelId = loaderData.configured ? loaderData.feedChannelId : null;
  const knockUserId =
    loaderData.configured && loaderData.signedToken
      ? loaderData.signedToken.knockUserId
      : null;
  const userToken =
    loaderData.configured && loaderData.signedToken
      ? loaderData.signedToken.token
      : null;

  useEffect(() => {
    if (!publicApiKey || !feedChannelId || !knockUserId || !userToken) {
      setFeedState(null);
      setAuthStatus("unauthenticated");
      setFeedError(null);
      return;
    }

    let cancelled = false;
    let unsubscribeStore: (() => void) | undefined;
    let client: KnockClient | null = null;
    let feed: Feed | null = null;

    setFeedError(null);
    setAuthStatus("authenticating...");
    setLastRealtimeEvent(null);

    async function connect() {
      const { default: Knock } = await import("@knocklabs/client");
      if (cancelled) return;

      client = new Knock(publicApiKey!);
      client.authenticate({ id: knockUserId! }, userToken!);
      knockRef.current = client;
      setAuthStatus(client.authStatus);

      feed = client.feeds.initialize(feedChannelId!);
      feedRef.current = feed;

      setFeedState(feed.store.getState());
      unsubscribeStore = feed.store.subscribe((nextState) => {
        if (!cancelled) {
          setFeedState({ ...nextState });
        }
      });

      feed.on(
        "items.received.realtime",
        (payload: { items?: unknown[]; entries?: unknown[] }) => {
          if (!cancelled) {
            const count = payload.items?.length ?? payload.entries?.length ?? 0;
            setLastRealtimeEvent(
              `Received ${count} item(s) live over WebSocket at ${new Date().toLocaleTimeString()}`
            );
          }
        }
      );

      feed.listenForUpdates();
      const result = await feed.fetch();
      if (!cancelled) {
        if (result?.status === "error") {
          setFeedError(
            typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data)
          );
        } else {
          setFeedState({ ...feed.store.getState() });
        }
      }
    }

    connect().catch((err) => {
      if (!cancelled) {
        setFeedError(err instanceof Error ? err.message : String(err));
        setAuthStatus("error");
      }
    });

    return () => {
      cancelled = true;
      unsubscribeStore?.();
      feed?.dispose();
      client?.logout();
      feedRef.current = null;
      knockRef.current = null;
    };
  }, [publicApiKey, feedChannelId, knockUserId, userToken]);

  async function toggleClientPreference(enabled: boolean) {
    const client = knockRef.current;
    if (!client) return;
    setClientPrefMessage("Updating via @knocklabs/client...");
    try {
      await client.user.setPreferences({
        categories: {
          [enrollmentCategory]: {
            channel_types: {
              in_app_feed: enabled,
            },
          },
        },
      });
      setClientPrefMessage(
        `Client SDK set categories.${enrollmentCategory}.channel_types.in_app_feed = ${enabled}`
      );
      revalidator.revalidate();
    } catch (err) {
      setClientPrefMessage(
        `Client SDK error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const currentUser = loaderData.currentUser;
  const allUsers = loaderData.allUsers;
  const defaultStudent =
    allUsers.find((u) => u.role === "student") ?? allUsers[0];
  const defaultInstructor =
    allUsers.find((u) => u.role === "instructor") ?? allUsers[0];

  const effectivePreferences =
    prefFetcher.data && "preferences" in prefFetcher.data && prefFetcher.data.preferences
      ? prefFetcher.data.preferences
      : loaderData.configured
        ? loaderData.preferences
        : null;

  const enrollmentPrefState = readCategoryFeedEnabled(
    effectivePreferences,
    enrollmentCategory
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-24">
      <div className="rounded-lg border-2 border-dashed border-amber-500/60 bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <FlaskConical className="size-5" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Throwaway Prototype — Knock Vendor-Fit Spike
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Does Knock hold up against Cadence?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live integration spike against the Knock Development environment. Switch
          users anytime with the DevUI panel (bottom-right) to test per-user
          tokens, triggering, headless feed state, and opt-in category preferences.
        </p>
      </div>

      {!loaderData.configured ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Missing required env vars in <code>.env</code>:{" "}
          <code>{loaderData.missing.join(", ")}</code>
        </div>
      ) : !currentUser ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-base font-medium">No user selected in session.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick any Student, Instructor, or Platform Admin in the DevUI panel at
            the bottom-right to start testing.
          </p>
        </div>
      ) : (
        <>
          {/* Knock dashboard prerequisites */}
          <details className="rounded-lg border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">
              Knock Development dashboard setup needed for Checks 2–4
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>
                Workflow <code>discussion-reply</code>: add an{" "}
                <strong>In-app feed</strong> step targeting your{" "}
                <em>Cadence feed</em> channel (template e.g.{" "}
                <code>
                  {"{{ actor.name }}"} replied to your Discussion Question on{" "}
                  {"{{ data.lesson_title }}"}: {"{{ data.reply_excerpt }}"}
                </code>
                ) and commit/save it in Development.
              </li>
              <li>
                Workflow <code>new-enrollment</code>: under workflow{" "}
                <strong>Settings → Categories</strong>, add category{" "}
                <code>enrollments</code>; add an <strong>In-app feed</strong> step
                targeting <em>Cadence feed</em> (template e.g.{" "}
                <code>
                  {"{{ data.student_name }}"} enrolled in{" "}
                  {"{{ data.course_title }}"}
                </code>
                ).
              </li>
              <li>
                Environment default preferences (
                <strong>Platform → Preferences</strong> in Development): set
                category <code>enrollments</code> →{" "}
                <code>in_app_feed: false</code> so new Enrollment Notifications
                are <strong>off by default (opt-in)</strong>.
              </li>
            </ol>
          </details>

          {/* CHECK 1: Signed user tokens + DevUI switcher */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  Check 1 — Signed User Tokens &amp; DevUI Switcher
                </h2>
              </div>
              <securityFetcher.Form method="post">
                <input type="hidden" name="intent" value="probe-security" />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={securityFetcher.state !== "idle"}
                >
                  <ShieldCheck className="mr-1.5 size-4" />
                  Verify Enhanced Security
                </Button>
              </securityFetcher.Form>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Active Cadence Session (DevUI)
                </div>
                <div className="font-medium">
                  {currentUser.name}{" "}
                  <span className="text-muted-foreground">
                    ({currentUser.role}, id #{currentUser.id})
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Knock user id: {loaderData.signedToken?.knockUserId}
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Server-signed RS256 Token
                </div>
                <div className="font-mono text-xs">
                  alg={loaderData.signedToken?.claims.alg ?? "?"} · sub=
                  {loaderData.signedToken?.claims.sub ?? "?"}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  client authStatus: <strong>{authStatus}</strong> · exp:{" "}
                  {loaderData.signedToken?.claims.exp
                    ? new Date(
                        loaderData.signedToken.claims.exp * 1000
                      ).toLocaleTimeString()
                    : "?"}
                </div>
              </div>
            </div>

            {securityFetcher.data &&
              "probe" in securityFetcher.data &&
              securityFetcher.data.probe && (
                <div className="grid gap-2 sm:grid-cols-3 text-xs font-mono">
                  <div className="rounded border p-2.5">
                    <div className="font-sans font-semibold mb-1">
                      No token header
                    </div>
                    status={securityFetcher.data.probe.withoutToken.status} (
                    {securityFetcher.data.probe.withoutToken.code ?? "ok"})
                  </div>
                  <div className="rounded border p-2.5">
                    <div className="font-sans font-semibold mb-1">
                      Bogus token
                    </div>
                    status={securityFetcher.data.probe.withBadToken.status} (
                    {securityFetcher.data.probe.withBadToken.code ?? "ok"})
                  </div>
                  <div className="rounded border border-green-500/40 bg-green-500/5 p-2.5">
                    <div className="font-sans font-semibold mb-1">
                      RS256 signed token
                    </div>
                    status={securityFetcher.data.probe.withSignedToken.status}{" "}
                    ({securityFetcher.data.probe.withSignedToken.ok ? "PASS" : "FAIL"})
                  </div>
                </div>
              )}

            {securityFetcher.data && !securityFetcher.data.ok && (
              <p className="text-xs text-destructive">
                {securityFetcher.data.error}
              </p>
            )}
          </section>

          {/* CHECK 2: Triggering via Node SDK */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Send className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">
                Check 2 — Triggering (Node SDK → Discussion Reply)
              </h2>
            </div>

            <replyFetcher.Form
              method="post"
              className="grid gap-3 sm:grid-cols-2 text-sm"
            >
              <input
                type="hidden"
                name="intent"
                value="trigger-discussion-reply"
              />
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Workflow key in Knock
                </span>
                <input
                  name="workflowKey"
                  value={replyWorkflowKey}
                  onChange={(e) => setReplyWorkflowKey(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Recipient (question author)
                </span>
                <select
                  name="recipientId"
                  defaultValue={currentUser.id}
                  key={`rec-${currentUser.id}`}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Actor (person replying)
                </span>
                <select
                  name="actorId"
                  defaultValue={defaultInstructor?.id ?? currentUser.id}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Lesson title
                </span>
                <input
                  name="lessonTitle"
                  defaultValue="Generics & Type Narrowing"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Discussion Reply excerpt
                </span>
                <input
                  name="replyExcerpt"
                  defaultValue="Great question — try narrowing with a discriminated union tag."
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
              </label>

              <div className="sm:col-span-2 flex items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={replyFetcher.state !== "idle"}
                >
                  <Send className="mr-1.5 size-4" />
                  Trigger Discussion Reply
                </Button>
                {replyFetcher.data?.ok &&
                  "workflowRunId" in replyFetcher.data && (
                    <span className="font-mono text-xs text-green-700 dark:text-green-400">
                      Triggered! run={replyFetcher.data.workflowRunId} →{" "}
                      {replyFetcher.data.recipientName}
                    </span>
                  )}
                {replyFetcher.data && !replyFetcher.data.ok && (
                  <span className="text-xs text-destructive">
                    {replyFetcher.data.error}
                  </span>
                )}
              </div>
            </replyFetcher.Form>
          </section>

          {/* CHECK 3: Headless Feed API */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  Check 3 — Notification Feed (Headless @knocklabs/client)
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => feedRef.current?.fetch()}
                >
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Refetch
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => feedRef.current?.markAllAsSeen()}
                >
                  <Eye className="mr-1.5 size-3.5" />
                  Mark all seen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => feedRef.current?.markAllAsRead()}
                >
                  <CheckCheck className="mr-1.5 size-3.5" />
                  Mark all read
                </Button>
              </div>
            </div>

            {/* Live metadata counters */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold tabular-nums">
                  {feedState?.metadata.total_count ?? "–"}
                </div>
                <div className="text-xs text-muted-foreground">total_count</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  {feedState?.metadata.unseen_count ?? "–"}
                </div>
                <div className="text-xs text-muted-foreground">unseen_count</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold tabular-nums text-primary">
                  {feedState?.metadata.unread_count ?? "–"}
                </div>
                <div className="text-xs text-muted-foreground">unread_count</div>
              </div>
            </div>

            {lastRealtimeEvent && (
              <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300">
                {lastRealtimeEvent}
              </div>
            )}

            {feedError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Feed error: {feedError}
              </div>
            )}

            {/* Feed items list */}
            {!feedState || feedState.items.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No Notification Feed items for {currentUser.name} yet. Trigger a
                workflow above to watch one arrive live.
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {feedState.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {item.source?.key ?? "unknown-workflow"}
                        </span>
                        <span
                          className={
                            item.read_at
                              ? "text-muted-foreground"
                              : "font-semibold text-primary"
                          }
                        >
                          {item.read_at ? "Read" : "Unread"}
                        </span>
                        <span
                          className={
                            item.seen_at
                              ? "text-muted-foreground"
                              : "font-semibold text-blue-600 dark:text-blue-400"
                          }
                        >
                          {item.seen_at ? "Seen" : "Unseen"}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(item.inserted_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{renderItemBody(item)}</p>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Raw item payload
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                          {JSON.stringify(
                            {
                              id: item.id,
                              source: item.source,
                              data: item.data,
                              blocks: item.blocks,
                              read_at: item.read_at,
                              seen_at: item.seen_at,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          item.read_at
                            ? feedRef.current?.markAsUnread(item)
                            : feedRef.current?.markAsRead(item)
                        }
                      >
                        <Check className="mr-1 size-3" />
                        {item.read_at ? "Unread" : "Read"}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          item.seen_at
                            ? feedRef.current?.markAsUnseen(item)
                            : feedRef.current?.markAsSeen(item)
                        }
                      >
                        {item.seen_at ? (
                          <EyeOff className="mr-1 size-3" />
                        ) : (
                          <Eye className="mr-1 size-3" />
                        )}
                        {item.seen_at ? "Unseen" : "Seen"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => feedRef.current?.markAsArchived(item)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* CHECK 4: Category x Channel Preferences (Off by default & Opt-in) */}
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  Check 4 — Preferences (Category × Channel, Off by Default &amp;
                  Opt-In)
                </h2>
              </div>
              <prefFetcher.Form method="post">
                <input type="hidden" name="intent" value="reset-prefs" />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={prefFetcher.state !== "idle"}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  Reset user preferences (inherit env default)
                </Button>
              </prefFetcher.Form>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Category slug (on <code>{enrollmentWorkflowKey}</code>)
                </span>
                <input
                  value={enrollmentCategory}
                  onChange={(e) => setEnrollmentCategory(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
                />
              </label>

              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Effective state for {currentUser.name}
                </div>
                <div className="mt-1 font-mono text-sm">
                  categories.{enrollmentCategory}.channel_types.in_app_feed ={" "}
                  <strong>{String(enrollmentPrefState)}</strong>
                </div>
              </div>
            </div>

            {/* Toggle buttons (server SDK & client SDK) */}
            <div className="flex flex-wrap items-center gap-2">
              <prefFetcher.Form method="post">
                <input type="hidden" name="intent" value="set-enrollment-pref" />
                <input
                  type="hidden"
                  name="category"
                  value={enrollmentCategory}
                />
                <input type="hidden" name="enabled" value="true" />
                <Button
                  type="submit"
                  size="sm"
                  variant="default"
                  disabled={prefFetcher.state !== "idle"}
                >
                  Opt IN via Server SDK
                </Button>
              </prefFetcher.Form>

              <prefFetcher.Form method="post">
                <input type="hidden" name="intent" value="set-enrollment-pref" />
                <input
                  type="hidden"
                  name="category"
                  value={enrollmentCategory}
                />
                <input type="hidden" name="enabled" value="false" />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={prefFetcher.state !== "idle"}
                >
                  Opt OUT via Server SDK
                </Button>
              </prefFetcher.Form>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => toggleClientPreference(true)}
              >
                Opt IN via Client SDK
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => toggleClientPreference(false)}
              >
                Opt OUT via Client SDK
              </Button>
            </div>

            {clientPrefMessage && (
              <p className="font-mono text-xs text-muted-foreground">
                {clientPrefMessage}
              </p>
            )}

            {/* Trigger new Enrollment to test suppression vs delivery */}
            <enrollmentFetcher.Form
              method="post"
              className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3 text-sm"
            >
              <input
                type="hidden"
                name="intent"
                value="trigger-new-enrollment"
              />
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Enrollment workflow key
                </span>
                <input
                  name="workflowKey"
                  value={enrollmentWorkflowKey}
                  onChange={(e) => setEnrollmentWorkflowKey(e.target.value)}
                  className="w-full rounded-md border bg-background px-2.5 py-1 font-mono text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Instructor (recipient)
                </span>
                <select
                  name="instructorId"
                  defaultValue={currentUser.id}
                  key={`inst-${currentUser.id}`}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-sm"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Enrolling Student (actor)
                </span>
                <select
                  name="studentId"
                  defaultValue={defaultStudent?.id ?? currentUser.id}
                  className="w-full rounded-md border bg-background px-2.5 py-1 text-sm"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={enrollmentFetcher.state !== "idle"}
                >
                  <Send className="mr-1.5 size-4" />
                  Trigger new Enrollment
                </Button>

                {enrollmentFetcher.data?.ok &&
                  "messagesProduced" in enrollmentFetcher.data &&
                  enrollmentFetcher.data.messagesProduced && (
                    <span className="font-mono text-xs">
                      run={enrollmentFetcher.data.workflowRunId} · messages
                      created:{" "}
                      <strong>
                        {enrollmentFetcher.data.messagesProduced.length}
                      </strong>{" "}
                      {enrollmentFetcher.data.messagesProduced.length === 0
                        ? "(suppressed by preferences!)"
                        : "(delivered to feed!)"}
                    </span>
                  )}

                {enrollmentFetcher.data && !enrollmentFetcher.data.ok && (
                  <span className="text-xs text-destructive">
                    {enrollmentFetcher.data.error}
                  </span>
                )}
              </div>
            </enrollmentFetcher.Form>

            {/* Raw effective PreferenceSet JSON */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Effective Knock &quot;default&quot; PreferenceSet for{" "}
                {currentUser.name}
              </div>
              {loaderData.preferencesError ? (
                <div className="text-xs text-destructive">
                  {loaderData.preferencesError}
                </div>
              ) : (
                <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(effectivePreferences, null, 2)}
                </pre>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
