import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function encodeBase64Url(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
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
  const assertion = `${unsignedToken}.${encodeBase64Url(
    new Uint8Array(signature),
  )}`;

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
) {
  if (category === "likes") {
    return {
      title: "마음이 머물렀어요",
      body: `${actorNickname}님이 회원님의 글에 공감했어요.`,
    };
  }
  if (category === "comments") {
    return {
      title: "새로운 생각이 도착했어요",
      body: `${actorNickname}님이 회원님의 글에 댓글을 남겼어요.`,
    };
  }
  if (category === "follows") {
    return {
      title: "새로운 구독자가 생겼어요",
      body: `${actorNickname}님이 회원님의 글 흐름을 구독하기 시작했어요.`,
    };
  }
  return {
    title: "글림의 새로운 소식",
    body: noticeTitle ? `새 공지 · ${noticeTitle}` : "새로운 공지가 도착했어요.",
  };
}

async function validateEvent(
  admin: ReturnType<typeof createClient>,
  actorUserId: string,
  body: PushRequest,
) {
  if (!body.targetUserId || body.targetUserId === actorUserId) return false;

  if (body.category === "follows") {
    const { data } = await admin
      .from("follows")
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
    const { data } = await admin
      .from("posts")
      .select("id")
      .eq("id", body.postId)
      .eq("user_id", body.targetUserId)
      .maybeSingle();
    return Boolean(data);
  }

  return false;
}

function getDedupeKey(
  actorUserId: string,
  body: PushRequest,
  now = new Date(),
) {
  if (body.category === "announcements") {
    return `announcements:${body.postId || now.toISOString().slice(0, 16)}`;
  }
  if (body.category === "comments") {
    const minute = now.toISOString().slice(0, 16);
    return `comments:${actorUserId}:${body.postId}:${minute}`;
  }
  return `${body.category}:${actorUserId}:${body.postId || body.targetUserId}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await request.json()) as PushRequest;
    const category = String(body.category || "");
    if (!ALLOWED_CATEGORIES.has(category)) {
      return jsonResponse({ error: "Invalid category" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const isAdmin = user.email?.toLowerCase() === "weardockm@gmail.com";
    const isBroadcast = category === "announcements" && body.broadcast === true;
    if (isBroadcast && !isAdmin) {
      return jsonResponse({ error: "Admin only" }, 403);
    }
    if (!isBroadcast && !(await validateEvent(admin, user.id, body))) {
      return jsonResponse({ error: "Invalid notification event" }, 403);
    }

    let subscriptionQuery = admin
      .from("push_subscriptions")
      .select("id, firebase_installation_id")
      .eq("enabled", true)
      .contains("preferences", { [category]: true });
    if (!isBroadcast) {
      subscriptionQuery = subscriptionQuery.eq("user_id", body.targetUserId);
    }
    const { data: subscriptions, error: subscriptionError } =
      await subscriptionQuery;
    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) return jsonResponse({ sent: 0 });

    const account = JSON.parse(
      Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || "",
    ) as ServiceAccount;
    if (!account.client_email || !account.private_key || !account.project_id) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    }

    const actorNickname =
      user.user_metadata?.random_nickname ||
      user.user_metadata?.name ||
      "누군가";
    const copy = getPushCopy(
      category,
      String(actorNickname).slice(0, 40),
      String(body.title || "").slice(0, 70),
    );
    const accessToken = await createServiceAccountAccessToken(account);
    const dedupeKey = getDedupeKey(user.id, body);
    const { error: dedupeError } = await admin.from("push_delivery_log").insert({
      dedupe_key: dedupeKey,
      actor_user_id: user.id,
      target_user_id: isBroadcast ? null : body.targetUserId,
      category,
    });
    if (dedupeError?.code === "23505") {
      return jsonResponse({ sent: 0, deduplicated: true });
    }
    if (dedupeError) throw dedupeError;

    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      account.project_id,
    )}/messages:send`;

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              fid: subscription.firebase_installation_id,
              data: {
                title: copy.title,
                body: copy.body,
                category,
                postId: String(body.postId || ""),
                url: "./",
              },
              webpush: {
                headers: { Urgency: category === "announcements" ? "normal" : "high" },
              },
            },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 404) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        }
        return { ok: response.ok, status: response.status, result };
      }),
    );

    const sent = results.filter((result) => result.ok).length;
    const failed = results.length - sent;
    if (!sent && failed) {
      await admin
        .from("push_delivery_log")
        .delete()
        .eq("dedupe_key", dedupeKey);
      console.error("FCM delivery failed", results);
      return jsonResponse({ sent, failed }, 502);
    }
    return jsonResponse({ sent, failed });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
