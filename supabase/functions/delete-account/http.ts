import {
  RECENT_SESSION_SECONDS,
  type AccountDeletionBody,
} from "./contracts.ts";

const baseCorsHeaders = Object.freeze({
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const ALLOWED_CORS_ORIGINS = new Set([
  "https://glimfactory.com",
  "https://www.glimfactory.com",
]);

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

export function isCorsAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return (
    !origin ||
    ALLOWED_CORS_ORIGINS.has(origin) ||
    isApprovedLocalOrigin(origin)
  );
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

export function optionsResponse(request: Request) {
  return new Response(null, {
    headers: getCorsHeaders(request),
    status: 200,
  });
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function parseBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null
      ? parseAccountDeletionBody(body)
      : {};
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function parseAccountDeletionBody(body: object): AccountDeletionBody {
  const record = body as Record<string, unknown>;
  return {
    confirm: record.confirm,
    email: record.email,
    providerToken: record.providerToken,
    requestDeletion: record.requestDeletion,
    userId: record.userId,
  };
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function decodeJwtPayload(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return {};
  try {
    const padded = payload.padEnd(
      payload.length + ((4 - payload.length % 4) % 4),
      "=",
    );
    const parsed: unknown = JSON.parse(
      atob(padded.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) {
      return {};
    }
    throw error;
  }
}

export function hasRecentSession(token: string) {
  const payload = decodeJwtPayload(token);
  const issuedAt = typeof payload.auth_time === "number"
    ? payload.auth_time
    : payload.iat;
  if (typeof issuedAt !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return now - issuedAt <= RECENT_SESSION_SECONDS;
}
