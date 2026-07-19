import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};
const ALLOWED_CORS_ORIGINS = new Set([
  "https://glimfactory.com",
  "https://www.glimfactory.com",
]);

const FIREBASE_MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const ALLOWED_CATEGORIES = new Set([
  "likes",
  "comments",
  "follows",
  "announcements",
]);

type PushRequest = {
  targetUserId?: string;
  category?: string;
  postId?: string;
  broadcast?: boolean;
  title?: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type PushDatabase = {
  readonly public: {
    readonly Tables: {
      readonly comments: {
        readonly Row: {
          readonly content: string;
          readonly created_at: string;
          readonly post_id: string;
          readonly user_id: string;
        };
        readonly Insert: never;
        readonly Update: never;
        readonly Relationships: [];
      };
      readonly follows: {
        readonly Row: {
          readonly follower_id: string;
          readonly following_id: string;
        };
        readonly Insert: never;
        readonly Update: never;
        readonly Relationships: [];
      };
      readonly posts: {
        readonly Row: {
          readonly id: string;
          readonly user_id: string;
        };
        readonly Insert: never;
        readonly Update: never;
        readonly Relationships: [];
      };
      readonly push_delivery_log: {
        readonly Row: {
          readonly actor_user_id: string;
          readonly category: string;
          readonly created_at: string;
          readonly dedupe_key: string;
          readonly target_user_id: string | null;
        };
        readonly Insert: {
          readonly actor_user_id: string;
          readonly category: string;
          readonly created_at?: string;
          readonly dedupe_key: string;
          readonly target_user_id?: string | null;
        };
        readonly Update: never;
        readonly Relationships: [];
      };
      readonly push_subscriptions: {
        readonly Row: {
          readonly delivery_channel: "web" | "native";
          readonly enabled: boolean;
          readonly firebase_installation_id: string;
          readonly id: string;
          readonly preferences: Record<string, boolean>;
          readonly user_id: string;
        };
        readonly Insert: never;
        readonly Update: never;
        readonly Relationships: [];
      };
      readonly user_roles: {
        readonly Row: {
          readonly role: string;
          readonly user_id: string;
        };
        readonly Insert: never;
        readonly Update: never;
        readonly Relationships: [];
      };
    };
    readonly Views: Record<string, never>;
    readonly Functions: Record<string, never>;
    readonly Enums: Record<string, never>;
    readonly CompositeTypes: Record<string, never>;
  };
};

type DbError = {
  readonly code?: string;
  readonly message?: string;
};

type QueryResult<Row> = {
  readonly data?: Row | null;
  readonly error?: DbError | null;
  readonly count?: number | null;
};

type QueryOptions = {
  readonly count?: "exact";
  readonly head?: boolean;
};

type OrderOptions = {
  readonly ascending?: boolean;
};

type AdminTableQuery = {
  readonly select: (columns: string, options?: QueryOptions) => AdminQuery;
  readonly insert: (
    value: Record<string, unknown>,
  ) => PromiseLike<{ readonly error: DbError | null }>;
  readonly delete: () => AdminQuery;
};

type AdminQuery =
  & PromiseLike<QueryResult<ReadonlyArray<Record<string, unknown>>>>
  & {
    readonly eq: (column: string, value: unknown) => AdminQuery;
    readonly in: (column: string, values: readonly unknown[]) => AdminQuery;
    readonly gt: (column: string, value: unknown) => AdminQuery;
    readonly contains: (
      column: string,
      value: Record<string, boolean>,
    ) => AdminQuery;
    readonly order: (column: string, options?: OrderOptions) => AdminQuery;
    readonly limit: (count: number) => AdminQuery;
    readonly maybeSingle: () => PromiseLike<
      QueryResult<Record<string, unknown>>
    >;
  };

type AdminClient = {
  readonly from: (table: string) => unknown;
};

type AuthenticatedUser = {
  readonly id: string;
  readonly user_metadata?: Record<string, unknown> | null;
};

type UserClient = {
  readonly auth: {
    readonly getUser: () => Promise<{
      readonly data: { readonly user: AuthenticatedUser | null };
      readonly error: unknown | null;
    }>;
  };
};

export type SendPushDependencies = {
  readonly createAdminClient: (
    supabaseUrl: string,
    serviceRoleKey: string,
  ) => AdminClient;
  readonly createUserClient: (
    supabaseUrl: string,
    anonKey: string,
    authorization: string,
  ) => UserClient;
  readonly envGet: (name: string) => string | undefined;
  readonly createAccessToken: (account: ServiceAccount) => Promise<string>;
  readonly fetchImpl: typeof fetch;
};

const defaultSendPushDependencies = {
  createAdminClient: (supabaseUrl, serviceRoleKey) =>
    createClient(supabaseUrl, serviceRoleKey),
  createUserClient: (supabaseUrl, anonKey, authorization) =>
    createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    }),
  createAccessToken: createServiceAccountAccessToken,
  envGet: (name) => Deno.env.get(name),
  fetchImpl: fetch,
} satisfies SendPushDependencies;

function isApprovedLocalOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  if (
    origin &&
    (ALLOWED_CORS_ORIGINS.has(origin) || isApprovedLocalOrigin(origin))
  ) {
    return {
      ...baseCorsHeaders,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }

  return { ...baseCorsHeaders, Vary: "Origin" };
}

function isCorsRequestAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return (
    !origin ||
    ALLOWED_CORS_ORIGINS.has(origin) ||
    isApprovedLocalOrigin(origin)
  );
}

function jsonResponse(
  body: unknown,
  status = 200,
  corsHeaders: Record<string, string> = baseCorsHeaders,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(
  envGet: SendPushDependencies["envGet"],
  name: string,
) {
  const value = envGet(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isMethodRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getAdminTable(admin: AdminClient, table: string) {
  const query = admin.from(table);
  if (
    isMethodRecord(query) &&
    typeof query.select === "function" &&
    typeof query.insert === "function" &&
    typeof query.delete === "function"
  ) {
    return query as AdminTableQuery;
  }
  throw new Error(`Supabase table query is unavailable: ${table}`);
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function createServiceAccountAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const header = encodeBase64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: FIREBASE_MESSAGING_SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${
    encodeBase64Url(
      new Uint8Array(signature),
    )
  }`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(`Firebase OAuth failed: ${JSON.stringify(result)}`);
  }
  return result.access_token as string;
}

function getPushCopy(
  category: string,
  actorNickname: string,
  noticeTitle = "",
  commentPreview = "",
) {
  if (category === "likes") {
    return {
      title: actorNickname,
      body: "회원님의 글에 좋아요를 눌렀습니다.",
    };
  }
  if (category === "comments") {
    return {
      title: actorNickname,
      body: commentPreview
        ? `댓글을 남겼습니다: “${commentPreview}”`
        : "회원님의 글에 댓글을 남겼습니다.",
    };
  }
  if (category === "follows") {
    return {
      title: actorNickname,
      body: "회원님을 구독하기 시작했습니다.",
    };
  }
  return {
    title: "글림의 새로운 소식",
    body: noticeTitle
      ? `새 공지 · ${noticeTitle}`
      : "새로운 공지가 도착했어요.",
  };
}

async function validateEvent(
  admin: AdminClient,
  actorUserId: string,
  body: PushRequest,
) {
  if (!body.targetUserId || body.targetUserId === actorUserId) return false;

  if (body.category === "follows") {
    const { data } = await getAdminTable(admin, "follows")
      .select("following_id")
      .eq("follower_id", actorUserId)
      .eq("following_id", body.targetUserId)
      .maybeSingle();
    return Boolean(data);
  }

  if (
    (body.category === "likes" || body.category === "comments") &&
    body.postId
  ) {
    const { data } = await getAdminTable(admin, "posts")
      .select("id")
      .eq("id", body.postId)
      .eq("user_id", body.targetUserId)
      .maybeSingle();
    return Boolean(data);
  }

  return false;
}

async function isModerator(
  admin: AdminClient,
  userId: string,
) {
  const { data, error } = await getAdminTable(admin, "user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"])
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function isPushRateLimited(
  admin: AdminClient,
  actorUserId: string,
  category: string,
) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await getAdminTable(admin, "push_delivery_log")
    .select("dedupe_key", { count: "exact", head: true })
    .eq("actor_user_id", actorUserId)
    .eq("category", category)
    .gt("created_at", since);
  if (error) throw error;
  return (count || 0) >= 30;
}

function getDedupeKey(
  actorUserId: string,
  body: PushRequest,
  now = new Date(),
) {
  if (body.category === "announcements") {
    return `announcements:${body.postId || now.toISOString().slice(0, 16)}`;
  }
  const minute = now.toISOString().slice(0, 16);
  return `${body.category}:${actorUserId}:${body.postId || body.targetUserId}:${minute}`;
}

export async function handleSendPushRequest(
  request: Request,
  dependencies: SendPushDependencies = defaultSendPushDependencies,
) {
  const corsHeaders = getCorsHeaders(request);
  if (!isCorsRequestAllowed(request)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, corsHeaders);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  try {
    const supabaseUrl = requireEnv(dependencies.envGet, "SUPABASE_URL");
    const anonKey = requireEnv(dependencies.envGet, "SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv(
      dependencies.envGet,
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const authorization = request.headers.get("Authorization") || "";
    const userClient = dependencies.createUserClient(
      supabaseUrl,
      anonKey,
      authorization,
    );
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }

    let body: PushRequest;
    try {
      body = (await request.json()) as PushRequest;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) {
        return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
      }
      throw error;
    }
    const category = String(body.category || "");
    if (!ALLOWED_CATEGORIES.has(category)) {
      return jsonResponse({ error: "Invalid category" }, 400, corsHeaders);
    }
    console.log("push-request", {
      category,
      broadcast: body.broadcast === true,
      hasTarget: Boolean(body.targetUserId),
      hasPost: Boolean(body.postId),
    });

    const admin = dependencies.createAdminClient(supabaseUrl, serviceRoleKey);
    const isBroadcast = category === "announcements" && body.broadcast === true;
    if (isBroadcast && !(await isModerator(admin, user.id))) {
      return jsonResponse({ error: "Admin only" }, 403, corsHeaders);
    }
    if (!isBroadcast && !(await validateEvent(admin, user.id, body))) {
      return jsonResponse(
        { error: "Invalid notification event" },
        403,
        corsHeaders,
      );
    }
    if (await isPushRateLimited(admin, user.id, category)) {
      return jsonResponse(
        { error: "Rate limit exceeded" },
        429,
        corsHeaders,
      );
    }

    let subscriptionQuery = getAdminTable(admin, "push_subscriptions")
      .select("id, firebase_installation_id, delivery_channel")
      .eq("enabled", true)
      .contains("preferences", { [category]: true });
    if (!isBroadcast) {
      const targetUserId = body.targetUserId;
      if (!targetUserId) {
        return jsonResponse(
          { error: "Invalid notification event" },
          403,
          corsHeaders,
        );
      }
      subscriptionQuery = subscriptionQuery.eq("user_id", targetUserId);
    }
    const { data: subscriptions, error: subscriptionError } =
      await subscriptionQuery;
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) {
      console.log("push-skipped", { category, reason: "no-subscription" });
      return jsonResponse({ sent: 0 }, 200, corsHeaders);
    }

    const account = JSON.parse(
      dependencies.envGet("FIREBASE_SERVICE_ACCOUNT_JSON") || "",
    ) as ServiceAccount;
    if (!account.client_email || !account.private_key || !account.project_id) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    }

    const actorNickname = user.user_metadata?.random_nickname ||
      user.user_metadata?.name ||
      "누군가";
    let commentPreview = "";
    if (category === "comments" && body.postId) {
      const { data: latestComment } = await getAdminTable(admin, "comments")
        .select("content")
        .eq("post_id", body.postId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      commentPreview = String(latestComment?.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
    }
    const copy = getPushCopy(
      category,
      String(actorNickname).slice(0, 40),
      String(body.title || "").slice(0, 70),
      commentPreview,
    );
    const accessToken = await dependencies.createAccessToken(account);
    const dedupeKey = getDedupeKey(user.id, body);
    const { error: dedupeError } = await getAdminTable(
      admin,
      "push_delivery_log",
    ).insert({
      dedupe_key: dedupeKey,
      actor_user_id: user.id,
      target_user_id: isBroadcast ? null : body.targetUserId,
      category,
    });
    if (dedupeError?.code === "23505") {
      return jsonResponse({ sent: 0, deduplicated: true }, 200, corsHeaders);
    }
    if (dedupeError) throw dedupeError;

    const endpoint = `https://fcm.googleapis.com/v1/projects/${
      encodeURIComponent(
        account.project_id,
      )
    }/messages:send`;

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        const response = await dependencies.fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: subscription.firebase_installation_id,
              data: {
                title: copy.title,
                body: copy.body,
                category,
                postId: String(body.postId || ""),
                url: body.postId
                  ? `./?notificationPost=${
                    encodeURIComponent(
                      String(body.postId),
                    )
                  }&notificationType=${encodeURIComponent(category)}`
                  : "./?tab=noti",
              },
              ...(subscription.delivery_channel === "native"
                ? {
                  notification: {
                    title: copy.title,
                    body: copy.body,
                  },
                  android: {
                    priority: "high",
                  },
                }
                : {
                  webpush: {
                    headers: {
                      Urgency: category === "announcements" ? "normal" : "high",
                    },
                  },
                }),
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 404) {
          await getAdminTable(admin, "push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        }
        return { ok: response.ok, status: response.status, result };
      }),
    );

    const sent = results.filter((result) => result.ok).length;
    const failed = results.length - sent;
    console.log("push-result", {
      category,
      subscriptions: subscriptions.length,
      sent,
      failed,
    });
    if (!sent && failed) {
      await getAdminTable(admin, "push_delivery_log")
        .delete()
        .eq("dedupe_key", dedupeKey);
      console.error("FCM delivery failed", results);
      return jsonResponse({ sent, failed }, 502, corsHeaders);
    }
    return jsonResponse({ sent, failed }, 200, corsHeaders);
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
      corsHeaders,
    );
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleSendPushRequest(request));
}
