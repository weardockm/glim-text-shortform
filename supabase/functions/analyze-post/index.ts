import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://glimfactory.com",
  "https://www.glimfactory.com",
]);
const DEFAULT_MODEL = "gpt-4.1-mini";
const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DbError = { readonly code?: string; readonly message?: string };
type QueryResult<Row> = { readonly data?: Row | null; readonly error: DbError | null };
type AuthenticatedUser = { readonly id: string };
type QueryLike = PromiseLike<QueryResult<ReadonlyArray<Record<string, unknown>>>> & {
  readonly eq: (column: string, value: unknown) => QueryLike;
  readonly maybeSingle: () => PromiseLike<QueryResult<Record<string, unknown>>>;
};
type TableLike = {
  readonly select: (columns: string) => QueryLike;
  readonly upsert: (
    value: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => PromiseLike<{ readonly error: DbError | null }>;
};
type ClientLike = {
  readonly auth: {
    readonly getUser: () => Promise<{
      readonly data: { readonly user: AuthenticatedUser | null };
      readonly error: unknown | null;
    }>;
  };
  readonly from: (table: string) => TableLike;
};
type AnalyzePostDependencies = {
  readonly createClient: (
    supabaseUrl: string,
    key: string,
    options?: Record<string, unknown>,
  ) => ClientLike;
  readonly envGet: (name: string) => string | undefined;
  readonly fetchImpl: typeof fetch;
  readonly now: () => Date;
};
type AnalysisResult = {
  readonly summary: string;
  readonly topics: readonly string[];
  readonly emotions: readonly string[];
  readonly tone: string;
  readonly keywords: readonly string[];
  readonly safety_labels: readonly string[];
  readonly intensity: number;
};

const defaultDependencies: AnalyzePostDependencies = {
  createClient: (supabaseUrl, key, options) =>
    createClient(supabaseUrl, key, options) as unknown as ClientLike,
  envGet: (name) => Deno.env.get(name),
  fetchImpl: fetch,
  now: () => new Date(),
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });
  if (ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function isCorsRequestAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: Headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      ...Object.fromEntries(headers.entries()),
      "Content-Type": "application/json",
    }),
  });
}

function requireEnv(envGet: AnalyzePostDependencies["envGet"], name: string) {
  const value = envGet(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function parseBody(request: Request) {
  try {
    const value = await request.json();
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return null;
    throw error;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compactTextArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = String(item || "").trim().replace(/\s+/g, " ").slice(0, 28);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function getObjectValue(source: unknown, key: string) {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function extractResponseText(result: unknown) {
  const outputText = getObjectValue(result, "output_text");
  if (typeof outputText === "string" && outputText.trim()) return outputText;
  const output = getObjectValue(result, "output");
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = getObjectValue(item, "content");
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = getObjectValue(part, "text");
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return "";
}

function parseAnalysis(result: unknown): AnalysisResult {
  const text = extractResponseText(result);
  if (!text) throw new Error("OpenAI response did not include output text");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    summary: asString(parsed.summary).trim().slice(0, 120),
    topics: compactTextArray(parsed.topics, 6),
    emotions: compactTextArray(parsed.emotions, 5),
    tone: asString(parsed.tone).trim().slice(0, 28),
    keywords: compactTextArray(parsed.keywords, 8),
    safety_labels: compactTextArray(parsed.safety_labels, 5),
    intensity: Math.min(Math.max(asNumber(parsed.intensity), 0), 1),
  };
}

function getAnalysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "topics", "emotions", "tone", "keywords", "safety_labels", "intensity"],
    properties: {
      summary: { type: "string" },
      topics: { type: "array", maxItems: 6, items: { type: "string" } },
      emotions: { type: "array", maxItems: 5, items: { type: "string" } },
      tone: { type: "string" },
      keywords: { type: "array", maxItems: 8, items: { type: "string" } },
      safety_labels: { type: "array", maxItems: 5, items: { type: "string" } },
      intensity: { type: "number", minimum: 0, maximum: 1 },
    },
  };
}

async function analyzePostWithOpenAi(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  content: string,
  mood: string,
) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 500,
      instructions:
        "너는 한국어 텍스트 숏폼 추천용 분류기다. 사용자의 글을 과장하지 말고 추천에 쓸 수 있는 짧은 태그만 JSON으로 반환한다. 개인정보를 추론하거나 민감한 속성을 단정하지 않는다.",
      input: [{
        role: "user",
        content: [{ type: "input_text", text: `선택 감성: ${mood || "없음"}\n글: ${content}` }],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "glim_post_ai_profile",
          strict: true,
          schema: getAnalysisSchema(),
        },
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorValue = getObjectValue(result, "error");
    const message = typeof errorValue === "object" && errorValue !== null
      ? asString(getObjectValue(errorValue, "message"))
      : `OpenAI request failed with ${response.status}`;
    throw new Error(message || `OpenAI request failed with ${response.status}`);
  }
  return parseAnalysis(result);
}

export async function handleAnalyzePostRequest(
  request: Request,
  dependencies: AnalyzePostDependencies = defaultDependencies,
) {
  const corsHeaders = getCorsHeaders(request);
  if (!isCorsRequestAllowed(request)) return jsonResponse({ error: "Origin not allowed" }, 403, corsHeaders);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    const body = await parseBody(request);
    if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
    const postId = asString(body.postId).trim();
    if (!POST_ID_PATTERN.test(postId)) return jsonResponse({ error: "Invalid post id" }, 400, corsHeaders);

    const supabaseUrl = requireEnv(dependencies.envGet, "SUPABASE_URL");
    const anonKey = requireEnv(dependencies.envGet, "SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv(dependencies.envGet, "SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = requireEnv(dependencies.envGet, "OPENAI_API_KEY");
    const model = dependencies.envGet("OPENAI_RECOMMENDATION_MODEL") || DEFAULT_MODEL;

    const userClient = dependencies.createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const admin = dependencies.createClient(supabaseUrl, serviceRoleKey);
    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, content, mood, user_id")
      .eq("id", postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) return jsonResponse({ error: "Post not found" }, 404, corsHeaders);
    if (post.user_id !== userData.user.id) return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);

    const { data: existing, error: existingError } = await admin
      .from("post_ai_profiles")
      .select("post_id")
      .eq("post_id", postId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && body.force !== true) return jsonResponse({ analyzed: true, cached: true }, 200, corsHeaders);

    const content = asString(post.content).trim().slice(0, 1400);
    const mood = asString(post.mood).trim().slice(0, 40);
    const analysis = await analyzePostWithOpenAi(dependencies.fetchImpl, openAiKey, model, content, mood);
    const now = dependencies.now().toISOString();

    const { error: upsertError } = await admin.from("post_ai_profiles").upsert({
      post_id: postId,
      model,
      summary: analysis.summary,
      topics: analysis.topics,
      emotions: analysis.emotions,
      tone: analysis.tone,
      safety_labels: analysis.safety_labels,
      recommendation_vector: {
        topics: analysis.topics,
        emotions: analysis.emotions,
        tone: analysis.tone,
        keywords: analysis.keywords,
        intensity: analysis.intensity,
        selected_mood: mood,
      },
      analyzed_at: now,
      updated_at: now,
    }, { onConflict: "post_id" });
    if (upsertError) throw upsertError;

    return jsonResponse({ analyzed: true, cached: false }, 200, corsHeaders);
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
  Deno.serve((request) => handleAnalyzePostRequest(request));
}
