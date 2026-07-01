import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  let body: { confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  if (body.confirm !== true) {
    return jsonResponse({ error: "Deletion confirmation required" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Invalid user session" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Auth deletion fails while the user owns Storage objects, so remove the
  // user's avatar folder through the Storage API first.
  const { data: avatarObjects, error: avatarListError } =
    await adminClient.storage.from("avatars").list(user.id, { limit: 1000 });
  if (
    avatarListError &&
    !avatarListError.message.toLowerCase().includes("bucket not found")
  ) {
    return jsonResponse({ error: "Could not inspect profile images" }, 500);
  }
  if (avatarObjects?.length) {
    const objectPaths = avatarObjects.map(
      (object) => `${user.id}/${object.name}`,
    );
    const { error: avatarDeleteError } = await adminClient.storage
      .from("avatars")
      .remove(objectPaths);
    if (avatarDeleteError) {
      return jsonResponse({ error: "Could not delete profile images" }, 500);
    }
  }

  const { error: dataDeleteError } = await adminClient.rpc(
    "delete_user_data",
    { target_user_id: user.id },
  );
  if (dataDeleteError) {
    console.error("User data deletion failed:", dataDeleteError);
    return jsonResponse({ error: "Could not delete user data" }, 500);
  }

  const { error: authDeleteError } =
    await adminClient.auth.admin.deleteUser(user.id, false);
  if (authDeleteError) {
    console.error("Auth user deletion failed:", authDeleteError);
    return jsonResponse({ error: "Could not delete Auth user" }, 500);
  }

  return jsonResponse({ deleted: true }, 200);
});
