export const supabaseBrowserStub = `
(() => {
  const adminFixture =
    new URL(window.location.href).searchParams.get("adminFixture") === "1";
  window.__supabaseRows = Object.create(null);
  if (adminFixture) {
    window.__supabaseRows.reports = [{
      id: "report-fixture",
      target_type: "post",
      reason: "spam",
      content_snapshot: "<img src=x onerror=window.__xss=1>",
      author_snapshot: "신고대상",
      details: "<script>window.__xss=1</script>",
      created_at: "2026-07-04T00:00:00Z",
      status: "pending",
      review_due_at: "2026-07-05T00:00:00Z",
      appeal_status: "requested",
      retention_until: "2028-07-04T00:00:00Z",
    }];
  }
  window.__supabaseCalls = [];
  window.__oauthProvider = "";
  window.__authCallback = null;
  window.__emitAuth = async (session) => {
    if (!window.__authCallback) throw new Error("auth callback is not registered");
    return window.__authCallback("SIGNED_IN", session);
  };
  const record = (boundary, name, detail = null) => {
    window.__supabaseCalls.push({ boundary, name, detail });
  };
  const builderFor = (table) => {
    const builder = {
      select(...args) { record("table", table + ".select", args); return this; },
      eq(...args) { record("table", table + ".eq", args); return this; },
      neq(...args) { record("table", table + ".neq", args); return this; },
      in(...args) { record("table", table + ".in", args); return this; },
      order(...args) { record("table", table + ".order", args); return this; },
      limit(...args) { record("table", table + ".limit", args); return this; },
      insert(rows) {
        record("table", table + ".insert", rows);
        if (table === "blocks") {
          window.__supabaseRows.blocks = rows.map(({ blocked_id }) => ({ blocked_id }));
        }
        return this;
      },
      upsert(rows) { record("table", table + ".upsert", rows); return this; },
      update(rows) { record("table", table + ".update", rows); return this; },
      delete() { record("table", table + ".delete"); return this; },
      single() {
        const data =
          table === "posts"
            ? { author: "픽스처 사용자", user_id: "fixture-user" }
            : (window.__supabaseRows[table] || [])[0] || null;
        return Promise.resolve({ data, error: null });
      },
      maybeSingle() {
        const data =
          table === "posts"
            ? { author: "픽스처 사용자", user_id: "fixture-user" }
            : (window.__supabaseRows[table] || [])[0] || null;
        return Promise.resolve({ data, error: null });
      },
      then(resolve) {
        const data = window.__supabaseRows[table] || [];
        resolve({ data, error: null, count: data.length });
      },
    };
    return builder;
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: adminFixture
            ? { user: { id: "moderator-fixture", email: "moderator@example.test" } }
            : null,
        },
      }),
      updateUser: async ({ data }) => {
        record("auth", "updateUser", data);
        return {
          data: {
            user: {
              id: "fixture-user",
              email: "fixture@example.test",
              user_metadata: data,
            },
          },
          error: null,
        };
      },
      signInWithOAuth: async ({ provider }) => {
        window.__oauthProvider = provider;
        return { data: {}, error: null };
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: (callback) => {
        window.__authCallback = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: (table) => {
      record("table", table);
      return builderFor(table);
    },
    rpc: async (name, detail) => {
      record("rpc", name, detail);
      if (name === "toggle_post_like") {
        return { data: { liked: true, total_count: 1 }, error: null };
      }
      if (name === "toggle_post_bookmark") return { data: true, error: null };
      if (name === "submit_content_report") {
        return { data: "report-fixture", error: null };
      }
      if (name === "is_moderator") return { data: adminFixture, error: null };
      if (name === "moderate_report") return { data: true, error: null };
      return { data: false, error: null };
    },
    functions: { invoke: async () => ({ data: {}, error: null }) },
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        remove: async () => ({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
  window.supabase = { createClient: () => client };
})();
`;
