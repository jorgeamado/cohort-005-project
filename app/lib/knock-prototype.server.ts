// PROTOTYPE: Throwaway Knock vendor-fit spike for Wayfinder ticket #42
// ("Does Knock hold up against Cadence?"). Lives on a throwaway branch only.

import Knock, { signUserToken } from "@knocklabs/node";

export interface KnockSpikeConfig {
  publicApiKey: string;
  secretApiKey: string;
  signingKey: string;
  feedChannelId: string;
}

export interface DecodedJwtClaims {
  alg?: string;
  sub?: string;
  iat?: number;
  exp?: number;
}

let envLoaded = false;

export function getKnockConfig(): {
  config: KnockSpikeConfig | null;
  missing: string[];
} {
  if (!envLoaded && !process.env.KNOCK_PUBLIC_API_KEY) {
    envLoaded = true;
    try {
      process.loadEnvFile(".env");
    } catch {
      // .env may not exist or env vars may already be injected
    }
  }

  const required = {
    KNOCK_PUBLIC_API_KEY: process.env.KNOCK_PUBLIC_API_KEY,
    KNOCK_SECRET_API_KEY: process.env.KNOCK_SECRET_API_KEY,
    KNOCK_SIGNING_KEY: process.env.KNOCK_SIGNING_KEY,
    KNOCK_FEED_CHANNEL_ID: process.env.KNOCK_FEED_CHANNEL_ID,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    return { config: null, missing };
  }

  return {
    config: {
      publicApiKey: required.KNOCK_PUBLIC_API_KEY!,
      secretApiKey: required.KNOCK_SECRET_API_KEY!,
      signingKey: required.KNOCK_SIGNING_KEY!,
      feedChannelId: required.KNOCK_FEED_CHANNEL_ID!,
    },
    missing: [],
  };
}

let serverClient: Knock | undefined;

function getKnockClient(): Knock {
  const { config, missing } = getKnockConfig();
  if (!config) {
    throw new Error(`Missing Knock env vars: ${missing.join(", ")}`);
  }
  if (!serverClient) {
    serverClient = new Knock({ apiKey: config.secretApiKey });
  }
  return serverClient;
}

export function toKnockUserId(userId: number): string {
  return `cadence-user-${userId}`;
}

export async function signCadenceUserToken(userId: number): Promise<{
  knockUserId: string;
  token: string;
  claims: DecodedJwtClaims;
}> {
  const { config, missing } = getKnockConfig();
  if (!config) {
    throw new Error(`Missing Knock env vars: ${missing.join(", ")}`);
  }

  const knockUserId = toKnockUserId(userId);
  const token = await signUserToken(knockUserId, {
    signingKey: config.signingKey,
    expiresInSeconds: 3600,
  });

  const parts = token.split(".");
  let claims: DecodedJwtClaims = {};
  try {
    const header = JSON.parse(
      Buffer.from(parts[0] ?? "", "base64url").toString("utf8")
    ) as { alg?: string };
    const payload = JSON.parse(
      Buffer.from(parts[1] ?? "", "base64url").toString("utf8")
    ) as { sub?: string; iat?: number; exp?: number };
    claims = {
      alg: header.alg,
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    claims = {};
  }

  return { knockUserId, token, claims };
}

export async function ensureKnockUser(user: {
  id: number;
  name: string;
  email: string;
}) {
  const client = getKnockClient();
  const knockUserId = toKnockUserId(user.id);
  return client.users.update(knockUserId, {
    name: user.name,
    email: user.email,
  });
}

export async function triggerDiscussionReplyWorkflow(params: {
  workflowKey: string;
  recipient: { id: number; name: string; email: string };
  actor: { id: number; name: string; email: string };
  lessonTitle: string;
  replyExcerpt: string;
}) {
  const client = getKnockClient();
  return client.workflows.trigger(params.workflowKey, {
    recipients: [
      {
        id: toKnockUserId(params.recipient.id),
        name: params.recipient.name,
        email: params.recipient.email,
      },
    ],
    actor: {
      id: toKnockUserId(params.actor.id),
      name: params.actor.name,
      email: params.actor.email,
    },
    data: {
      lesson_title: params.lessonTitle,
      reply_excerpt: params.replyExcerpt,
      course_title: "TypeScript Fundamentals",
    },
  });
}

export async function triggerNewEnrollmentWorkflow(params: {
  workflowKey: string;
  instructor: { id: number; name: string; email: string };
  student: { id: number; name: string; email: string };
  courseTitle: string;
}) {
  const client = getKnockClient();
  return client.workflows.trigger(params.workflowKey, {
    recipients: [
      {
        id: toKnockUserId(params.instructor.id),
        name: params.instructor.name,
        email: params.instructor.email,
      },
    ],
    actor: {
      id: toKnockUserId(params.student.id),
      name: params.student.name,
      email: params.student.email,
    },
    data: {
      student_name: params.student.name,
      course_title: params.courseTitle,
    },
  });
}

export async function getKnockUserPreferences(user: {
  id: number;
  name: string;
  email: string;
}) {
  const client = getKnockClient();
  const knockUserId = toKnockUserId(user.id);
  await ensureKnockUser(user);
  return client.users.getPreferences(knockUserId, "default");
}

export async function setKnockCategoryFeedPreference(params: {
  user: { id: number; name: string; email: string };
  category: string;
  enabled: boolean;
}) {
  const client = getKnockClient();
  const knockUserId = toKnockUserId(params.user.id);
  await ensureKnockUser(params.user);
  return client.users.setPreferences(knockUserId, "default", {
    __persistence_strategy__: "merge",
    categories: {
      [params.category]: {
        channel_types: {
          in_app_feed: params.enabled,
        },
      },
    },
  });
}

export async function resetKnockUserPreferences(user: {
  id: number;
  name: string;
  email: string;
}) {
  const client = getKnockClient();
  const knockUserId = toKnockUserId(user.id);
  await ensureKnockUser(user);
  try {
    await client.users.unsetPreferences(knockUserId, "default");
  } catch (err) {
    if (err instanceof Knock.APIError && err.status === 404) {
      // Already unset; fall through to read effective defaults.
    } else {
      throw err;
    }
  }
  return client.users.getPreferences(knockUserId, "default");
}

export async function probeEnhancedSecurity(userId: number) {
  const { config, missing } = getKnockConfig();
  if (!config) {
    throw new Error(`Missing Knock env vars: ${missing.join(", ")}`);
  }

  const { knockUserId, token } = await signCadenceUserToken(userId);
  const url = `https://api.knock.app/v1/users/${encodeURIComponent(knockUserId)}/feeds/${encodeURIComponent(config.feedChannelId)}`;

  async function probe(headers: Record<string, string>) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config!.publicApiKey}`,
        ...headers,
      },
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    return {
      status: res.status,
      ok: res.ok,
      code:
        typeof parsed === "object" && parsed !== null && "code" in parsed
          ? String((parsed as { code?: unknown }).code)
          : undefined,
    };
  }

  const [withoutToken, withBadToken, withSignedToken] = await Promise.all([
    probe({}),
    probe({ "X-Knock-User-Token": "not.a.valid.jwt" }),
    probe({ "X-Knock-User-Token": token }),
  ]);

  return {
    knockUserId,
    withoutToken,
    withBadToken,
    withSignedToken,
  };
}

export async function listRecentRunMessages(userId: number, workflowRunId: string) {
  const client = getKnockClient();
  const knockUserId = toKnockUserId(userId);
  const page = await client.users.listMessages(knockUserId, {
    workflow_run_id: workflowRunId,
  });
  return page.items.map((m) => ({
    id: m.id,
    status: m.status,
    channel_id: m.channel_id,
    source: m.source,
    inserted_at: m.inserted_at,
  }));
}
