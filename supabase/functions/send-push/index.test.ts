import { handleSendPushRequest, type SendPushDependencies } from "./index.ts";

type TestDbError = {
  readonly code?: string;
  readonly message?: string;
};

type TestRow = Record<string, unknown>;

type QueryManyResult = {
  readonly data: readonly TestRow[] | null;
  readonly error: TestDbError | null;
  readonly count?: number | null;
};

type QuerySingleResult = {
  readonly data: TestRow | null;
  readonly error: TestDbError | null;
};

type QueryOptions = {
  readonly count?: "exact";
  readonly head?: boolean;
};

type OrderOptions = {
  readonly ascending?: boolean;
};

type FcmCall = {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: unknown;
};

type FakeAdminState = {
  readonly posts: readonly TestRow[];
  readonly follows: readonly TestRow[];
  readonly roles: readonly TestRow[];
  readonly subscriptions: readonly TestRow[];
  readonly comments: readonly TestRow[];
  readonly deliveryLogCount: number;
  readonly dedupeError: TestDbError | null;
  readonly insertedLogs: TestRow[];
  readonly deletedIds: string[];
  readonly deletedDedupeKeys: string[];
};

type QueryState = {
  readonly filters: Map<string, unknown>;
  readonly containedPreferences: Map<string, boolean>;
  headCount: boolean;
  deleteMode: boolean;
};

class FakeAdminQuery {
  readonly #admin: FakeAdminClient;
  readonly #table: string;
  readonly #state: QueryState = {
    filters: new Map(),
    containedPreferences: new Map(),
    headCount: false,
    deleteMode: false,
  };

  constructor(admin: FakeAdminClient, table: string) {
    this.#admin = admin;
    this.#table = table;
  }

  select(_columns: string, options?: QueryOptions) {
    this.#state.headCount = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    if (
      this.#state.deleteMode && column === "id" && typeof value === "string"
    ) {
      this.#admin.deleteSubscription(value);
      return this;
    }
    if (
      this.#state.deleteMode &&
      column === "dedupe_key" &&
      typeof value === "string"
    ) {
      this.#admin.deleteDedupe(value);
      return this;
    }
    this.#state.filters.set(column, value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.#state.filters.set(column, values);
    return this;
  }

  gt(column: string, value: unknown) {
    this.#state.filters.set(column, value);
    return this;
  }

  contains(_column: string, value: Record<string, boolean>) {
    for (const [key, enabled] of Object.entries(value)) {
      this.#state.containedPreferences.set(key, enabled);
    }
    return this;
  }

  order(_column: string, _options?: OrderOptions) {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  maybeSingle(): Promise<QuerySingleResult> {
    return Promise.resolve(this.#admin.selectSingle(this.#table, this.#state));
  }

  insert(value: Record<string, unknown>) {
    return Promise.resolve(this.#admin.insert(this.#table, value));
  }

  delete() {
    this.#state.deleteMode = true;
    return this;
  }

  then<TResult1 = QueryManyResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryManyResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.#admin.selectMany(this.#table, this.#state))
      .then(
        onfulfilled,
        onrejected,
      );
  }
}

class FakeAdminClient {
  readonly #state: FakeAdminState;

  constructor(state: Partial<FakeAdminState> = {}) {
    this.#state = {
      posts: state.posts ?? [],
      follows: state.follows ?? [],
      roles: state.roles ?? [],
      subscriptions: state.subscriptions ?? [],
      comments: state.comments ?? [],
      deliveryLogCount: state.deliveryLogCount ?? 0,
      dedupeError: state.dedupeError ?? null,
      insertedLogs: state.insertedLogs ?? [],
      deletedIds: state.deletedIds ?? [],
      deletedDedupeKeys: state.deletedDedupeKeys ?? [],
    };
  }

  from(table: string) {
    return new FakeAdminQuery(this, table);
  }

  selectSingle(table: string, query: QueryState): QuerySingleResult {
    return {
      data: this.selectRows(table, query).at(0) ?? null,
      error: null,
    };
  }

  selectMany(table: string, query: QueryState): QueryManyResult {
    if (table === "push_delivery_log" && query.headCount) {
      return { data: null, error: null, count: this.#state.deliveryLogCount };
    }
    return { data: this.selectRows(table, query), error: null };
  }

  insert(table: string, value: Record<string, unknown>) {
    if (table === "push_delivery_log") {
      if (this.#state.dedupeError) {
        return { error: this.#state.dedupeError };
      }
      this.#state.insertedLogs.push(value);
    }
    return { error: null };
  }

  deleteSubscription(id: string) {
    this.#state.deletedIds.push(id);
  }

  deleteDedupe(dedupeKey: string) {
    this.#state.deletedDedupeKeys.push(dedupeKey);
  }

  readonly getInsertedLogs = () => this.#state.insertedLogs;

  readonly selectRows = (table: string, query: QueryState) => {
    const rowsByTable = new Map<string, readonly TestRow[]>([
      ["posts", this.#state.posts],
      ["follows", this.#state.follows],
      ["user_roles", this.#state.roles],
      ["push_subscriptions", this.#state.subscriptions],
      ["comments", this.#state.comments],
    ]);
    const rows = rowsByTable.get(table) ?? [];
    return rows.filter((row) => rowMatches(row, query));
  };
}

Deno.test(
  "Given an allowed browser origin When the request is an OPTIONS preflight Then CORS headers echo the origin",
  async () => {
    const response = await handleSendPushRequest(
      new Request("https://edge.test/send-push", {
        method: "OPTIONS",
        headers: { Origin: "https://glimfactory.com" },
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://glimfactory.com",
    );
    assertEquals(response.headers.get("Vary"), "Origin");
  },
);

Deno.test(
  "Given an unapproved browser origin When the request is an OPTIONS preflight Then the function denies it without wildcard CORS",
  async () => {
    const response = await handleSendPushRequest(
      new Request("https://edge.test/send-push", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      }),
    );

    assertEquals(response.status, 403);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    assertEquals(await response.json(), { error: "Origin not allowed" });
  },
);

Deno.test(
  "Given no authenticated Supabase user When a POST request is handled Then the function returns Unauthorized before admin work",
  async () => {
    const dependencies: SendPushDependencies = {
      createAdminClient: () => {
        throw new Error("admin client should not be created");
      },
      createUserClient: () => ({
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: null },
              error: null,
            }),
        },
      }),
      createAccessToken: () => Promise.resolve("test-access-token"),
      envGet: (name) => `test-${name}`,
      fetchImpl: fetch,
    };

    const response = await handleSendPushRequest(
      new Request("https://edge.test/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://glimfactory.com",
        },
        body: JSON.stringify({ category: "likes" }),
      }),
      dependencies,
    );

    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: "Unauthorized" });
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://glimfactory.com",
    );
  },
);

Deno.test(
  "Given a native caller without an Origin When the POST request is unauthenticated Then CORS allows normal auth handling without a wildcard",
  async () => {
    const dependencies: SendPushDependencies = {
      createAdminClient: () => {
        throw new Error("admin client should not be created");
      },
      createUserClient: () => ({
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: null },
              error: null,
            }),
        },
      }),
      createAccessToken: () => Promise.resolve("test-access-token"),
      envGet: (name) => `test-${name}`,
      fetchImpl: fetch,
    };

    const response = await handleSendPushRequest(
      new Request("https://edge.test/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category: "likes" }),
      }),
      dependencies,
    );

    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: "Unauthorized" });
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    assertEquals(response.headers.get("Vary"), "Origin");
  },
);

Deno.test(
  "Given an authenticated user When the POST body is malformed JSON Then the function returns a 400 response before admin work",
  async () => {
    const dependencies: SendPushDependencies = {
      createAdminClient: () => {
        throw new Error("admin client should not be created");
      },
      createUserClient: () => ({
        auth: {
          getUser: () =>
            Promise.resolve({
              data: {
                user: {
                  id: "user-1",
                  user_metadata: {},
                },
              },
              error: null,
            }),
        },
      }),
      createAccessToken: () => Promise.resolve("test-access-token"),
      envGet: (name) => `test-${name}`,
      fetchImpl: fetch,
    };

    const response = await handleSendPushRequest(
      new Request("https://edge.test/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://glimfactory.com",
        },
        body: "{",
      }),
      dependencies,
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "Invalid JSON" });
  },
);

Deno.test(
  "Given a valid likes event When the target has one enabled subscription Then the function sends one FCM message",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      posts: [{ id: "post-1", user_id: "target-1" }],
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { likes: true },
          user_id: "target-1",
        },
      ],
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "likes",
        postId: "post-1",
        targetUserId: "target-1",
      }),
      dependencies,
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { sent: 1, failed: 0 });
    assertEquals(calls.length, 1);
    assertEquals(calls[0]?.authorization, "Bearer test-access-token");
    assertEquals(admin.getInsertedLogs().length, 1);
  },
);

Deno.test(
  "Given a forged likes event When the actor targets a post owned by someone else Then the function denies it before FCM",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      posts: [{ id: "post-1", user_id: "different-target" }],
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { likes: true },
          user_id: "target-1",
        },
      ],
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "likes",
        postId: "post-1",
        targetUserId: "target-1",
      }),
      dependencies,
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), {
      error: "Invalid notification event",
    });
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "Given a duplicate delivery log insert When the event is otherwise valid Then the function reports deduplication before FCM",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      posts: [{ id: "post-1", user_id: "target-1" }],
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { likes: true },
          user_id: "target-1",
        },
      ],
      dedupeError: { code: "23505" },
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "likes",
        postId: "post-1",
        targetUserId: "target-1",
      }),
      dependencies,
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { sent: 0, deduplicated: true });
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "Given a rate-limited actor When the event is valid Then the function returns 429 before FCM",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      posts: [{ id: "post-1", user_id: "target-1" }],
      deliveryLogCount: 30,
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { likes: true },
          user_id: "target-1",
        },
      ],
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "likes",
        postId: "post-1",
        targetUserId: "target-1",
      }),
      dependencies,
    );

    assertEquals(response.status, 429);
    assertEquals(await response.json(), { error: "Rate limit exceeded" });
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "Given a non-moderator actor When requesting an announcement broadcast Then the function denies it before FCM",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      roles: [],
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { announcements: true },
          user_id: "target-1",
        },
      ],
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "announcements",
        broadcast: true,
        postId: "notice-1",
        title: "공지",
      }),
      dependencies,
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: "Admin only" });
    assertEquals(calls.length, 0);
  },
);

Deno.test(
  "Given a moderator actor When broadcasting an announcement Then the function sends to enabled announcement subscriptions",
  async () => {
    const calls: FcmCall[] = [];
    const admin = new FakeAdminClient({
      roles: [{ user_id: "user-1", role: "moderator" }],
      subscriptions: [
        {
          id: "sub-1",
          enabled: true,
          firebase_installation_id: "fid-1",
          preferences: { announcements: true },
          user_id: "target-1",
        },
        {
          id: "sub-2",
          enabled: true,
          firebase_installation_id: "fid-2",
          preferences: { announcements: true },
          user_id: "target-2",
        },
        {
          id: "sub-disabled",
          enabled: false,
          firebase_installation_id: "fid-disabled",
          preferences: { announcements: true },
          user_id: "target-3",
        },
        {
          id: "sub-pref-off",
          enabled: true,
          firebase_installation_id: "fid-pref-off",
          preferences: { announcements: false },
          user_id: "target-4",
        },
      ],
    });
    const dependencies = createDependencies({ admin, calls });

    const response = await handleSendPushRequest(
      createPostRequest({
        category: "announcements",
        broadcast: true,
        postId: "notice-1",
        title: "공지",
      }),
      dependencies,
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { sent: 2, failed: 0 });
    assertEquals(calls.length, 2);
    assertEquals(admin.getInsertedLogs().at(0)?.target_user_id, null);
  },
);

function createDependencies(input: {
  readonly admin: FakeAdminClient;
  readonly calls: FcmCall[];
}): SendPushDependencies {
  return {
    createAdminClient: () => input.admin,
    createUserClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: {
              user: {
                id: "user-1",
                user_metadata: { random_nickname: "테스터" },
              },
            },
            error: null,
          }),
      },
    }),
    createAccessToken: () => Promise.resolve("test-access-token"),
    envGet: (name) => {
      if (name === "FIREBASE_SERVICE_ACCOUNT_JSON") {
        return JSON.stringify({
          client_email: "firebase@example.test",
          private_key: "test-private-key",
          project_id: "test-project",
        });
      }
      return `test-${name}`;
    },
    fetchImpl: (requestInput, init) => {
      const requestBody = typeof init?.body === "string" ? init.body : "{}";
      input.calls.push({
        url: requestInput.toString(),
        authorization: new Headers(init?.headers).get("Authorization"),
        body: JSON.parse(requestBody),
      });
      return Promise.resolve(
        new Response(JSON.stringify({ name: "projects/test/messages/1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    },
  };
}

function createPostRequest(body: Record<string, unknown>) {
  return new Request("https://edge.test/send-push", {
    method: "POST",
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
      Origin: "https://glimfactory.com",
    },
    body: JSON.stringify(body),
  });
}

function rowMatches(row: TestRow, query: QueryState) {
  for (const [column, value] of query.filters) {
    if (column === "created_at") continue;
    if (Array.isArray(value)) {
      if (!value.includes(row[column])) return false;
    } else if (row[column] !== value) {
      return false;
    }
  }
  for (const [category, enabled] of query.containedPreferences) {
    const preferences = row.preferences;
    if (!isPreferenceRecord(preferences) || preferences[category] !== enabled) {
      return false;
    }
  }
  return true;
}

function isPreferenceRecord(value: unknown): value is Record<string, boolean> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((item) => typeof item === "boolean")
  );
}

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}
