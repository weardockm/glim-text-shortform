import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  AccountDeletionBody,
  AdminClient,
  AuthenticatedUser,
  DeleteAccountDependencies,
} from "./contracts.ts";
export type { DeleteAccountDependencies } from "./contracts.ts";
import {
  getBearerToken,
  hasRecentSession,
  isCorsAllowed,
  jsonResponse,
  optionsResponse,
  parseBody,
} from "./http.ts";

const defaultDependencies = {
  createAdminClient: (supabaseUrl, serviceRoleKey) => {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    return {
      auth: {
        admin: {
          deleteUser: async (userId) => {
            const { error } = await supabase.auth.admin.deleteUser(userId);
            return { error };
          },
        },
      },
      from: (table) => ({
        insert: async (value) => {
          const { error } = await supabase.from(table).insert(value);
          return { error };
        },
      }),
      rpc: async (name, params) => {
        const { error } = await supabase.rpc(name, params);
        return { error };
      },
      storage: {
        from: (bucket) => {
          const storageBucket = supabase.storage.from(bucket);
          return {
            list: async (prefix) => {
              const { data, error } = await storageBucket.list(prefix);
              return { data, error };
            },
            remove: async (paths) => {
              const { error } = await storageBucket.remove([...paths]);
              return { error };
            },
          };
        },
      },
    };
  },
  createUserClient: (supabaseUrl, anonKey, authorization) => {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    return {
      auth: {
        getUser: async () => {
          const { data, error } = await supabase.auth.getUser();
          return { data, error };
        },
      },
    };
  },
  envGet: (name) => Deno.env.get(name),
  revokeAppleCredential,
} satisfies DeleteAccountDependencies;

function requireEnv(
  envGet: DeleteAccountDependencies["envGet"],
  name: string,
) {
  const value = envGet(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isAppleUser(user: AuthenticatedUser) {
  const provider = user.app_metadata?.provider;
  return (
    provider === "apple" ||
    user.identities?.some((identity) => identity.provider === "apple") === true
  );
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recordPublicDeletionRequest(
  admin: AdminClient,
  body: AccountDeletionBody,
) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return;
  const emailHash = await sha256Hex(email);
  const { error } = await admin.from("account_deletion_requests").insert({
    email_sha256: emailHash,
    request_source: "public_account_delete",
  });
  if (error && error.code !== "23505") throw error;
}

async function recordAppleManualRevocationRequired(
  admin: AdminClient,
  user: AuthenticatedUser,
) {
  const emailHash = user.email ? await sha256Hex(user.email.toLowerCase()) : null;
  const { error } = await admin.from("account_deletion_requests").insert({
    email_sha256: emailHash,
    provider: "apple",
    request_source: "apple_manual_revocation_required",
    status: "manual_provider_revocation_required",
    user_id: user.id,
  });
  if (error && error.code !== "23505") throw error;
}

async function removeAvatarObjects(admin: AdminClient, userId: string) {
  const bucket = admin.storage.from("avatars");
  const { data, error } = await bucket.list(userId);
  if (error) throw error;
  const paths = (data || []).map((item) => `${userId}/${item.name}`);
  if (paths.length === 0) return;
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) throw removeError;
}

async function deleteAccount(
  admin: AdminClient,
  user: AuthenticatedUser,
) {
  await removeAvatarObjects(admin, user.id);
  const { error: rpcError } = await admin.rpc("delete_user_data", {
    target_user_id: user.id,
  });
  if (rpcError) throw rpcError;
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError && authError.code !== "user_not_found") throw authError;
}

async function revokeAppleCredential(
  providerToken: string,
  envGet: DeleteAccountDependencies["envGet"],
) {
  const endpoint = envGet("APPLE_REVOKE_ENDPOINT") ||
    "https://appleid.apple.com/auth/revoke";
  const clientId = requireEnv(envGet, "APPLE_CLIENT_ID");
  const clientSecret = requireEnv(envGet, "APPLE_CLIENT_SECRET");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: providerToken,
      token_type_hint: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Apple credential revocation failed");
  return { revoked: true };
}

export async function handleDeleteAccountRequest(
  request: Request,
  dependencies: DeleteAccountDependencies = defaultDependencies,
) {
  if (!isCorsAllowed(request)) {
    return jsonResponse(request, { error: "Origin not allowed" }, 403);
  }
  if (request.method === "OPTIONS") {
    return optionsResponse(request);
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }

  const body = await parseBody(request);
  if (!body) return jsonResponse(request, { error: "Invalid JSON" }, 400);

  const supabaseUrl = requireEnv(dependencies.envGet, "SUPABASE_URL");
  const serviceRoleKey = requireEnv(
    dependencies.envGet,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const admin = dependencies.createAdminClient(supabaseUrl, serviceRoleKey);

  if (body.requestDeletion === true) {
    await recordPublicDeletionRequest(admin, body);
    return jsonResponse(request, { received: true }, 202);
  }

  const token = getBearerToken(request);
  if (!token) return jsonResponse(request, { error: "Unauthorized" }, 401);
  if (!hasRecentSession(token)) {
    return jsonResponse(request, { error: "Recent sign-in required" }, 403);
  }

  const anonKey = requireEnv(dependencies.envGet, "SUPABASE_ANON_KEY");
  const userClient = dependencies.createUserClient(
    supabaseUrl,
    anonKey,
    `Bearer ${token}`,
  );
  const { data, error: userError } = await userClient.auth.getUser();
  if (userError || !data.user) {
    return jsonResponse(request, { error: "Unauthorized" }, 401);
  }
  if (body.confirm !== true) {
    return jsonResponse(request, { error: "Confirmation required" }, 400);
  }
  if (typeof body.userId === "string" && body.userId !== data.user.id) {
    return jsonResponse(request, { error: "Forbidden" }, 403);
  }

  let appleRevoked = false;
  let appleManualRevocationRequired = false;
  if (isAppleUser(data.user)) {
    if (typeof body.providerToken !== "string" || !body.providerToken) {
      await recordAppleManualRevocationRequired(admin, data.user);
      appleManualRevocationRequired = true;
    } else {
      const receipt = await dependencies.revokeAppleCredential(
        body.providerToken,
        dependencies.envGet,
      );
      appleRevoked = receipt.revoked;
    }
  }

  await deleteAccount(admin, data.user);
  if (appleRevoked) {
    return jsonResponse(request, { deleted: true, appleRevoked: true });
  }
  if (appleManualRevocationRequired) {
    return jsonResponse(request, {
      deleted: true,
      appleManualRevocationRequired: true,
    });
  }
  return jsonResponse(
    request,
    { deleted: true },
  );
}

if (import.meta.main) {
  Deno.serve((request: Request) => handleDeleteAccountRequest(request));
}
