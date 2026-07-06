import {
  handleDeleteAccountRequest,
  type DeleteAccountDependencies,
} from "./index.ts";

type TestUser = {
  readonly id: string;
  readonly email?: string;
  readonly app_metadata?: Record<string, unknown>;
  readonly identities?: readonly { readonly provider?: string }[];
};

type CallLog = {
  readonly events: string[];
  readonly rpc: string[];
  readonly storageRemoved: string[];
  readonly deletedUsers: string[];
  readonly revokedAppleTokens: string[];
  readonly requestHashes: string[];
};

Deno.test(
  "Given no JWT When account deletion is requested Then the handler returns Unauthorized before service-role cleanup",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest({ confirm: true }, ""),
      createDependencies({ user: null, log }),
    );

    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: "Unauthorized" });
    assertEquals(log.rpc.length, 0);
    assertEquals(log.deletedUsers.length, 0);
  },
);

Deno.test(
  "Given a stale JWT When account deletion is requested Then recent-session verification blocks cleanup",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest(
        { confirm: true },
        createUnsignedJwt(Math.floor(Date.now() / 1000) - 3600),
      ),
      createDependencies({ user: createUser("user-1"), log }),
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: "Recent sign-in required" });
    assertEquals(log.rpc.length, 0);
  },
);

Deno.test(
  "Given a body userId that does not match the JWT user When deletion is requested Then no identity state leaks",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest(
        { confirm: true, userId: "other-user" },
        createUnsignedJwt(Math.floor(Date.now() / 1000)),
      ),
      createDependencies({ user: createUser("user-1"), log }),
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: "Forbidden" });
    assertEquals(log.deletedUsers.length, 0);
  },
);

Deno.test(
  "Given a valid non-Apple user When deletion is requested twice Then cleanup is idempotent and audit-safe",
  async () => {
    const log = createCallLog();
    const dependencies = createDependencies({ user: createUser("user-1"), log });
    const request = () =>
      createJsonRequest(
        { confirm: true, userId: "user-1" },
        createUnsignedJwt(Math.floor(Date.now() / 1000)),
      );

    const first = await handleDeleteAccountRequest(request(), dependencies);
    const second = await handleDeleteAccountRequest(request(), dependencies);

    assertEquals(first.status, 200);
    assertEquals(await first.json(), { deleted: true });
    assertEquals(second.status, 200);
    assertEquals(await second.json(), { deleted: true });
    assertEquals(log.rpc, ["user-1", "user-1"]);
    assertEquals(log.deletedUsers, ["user-1", "user-1"]);
    assertEquals(log.storageRemoved, ["user-1/avatar.webp", "user-1/avatar.webp"]);
    assertEquals(log.events, [
      "storage:list:user-1",
      "storage:remove:user-1/avatar.webp",
      "rpc:delete_user_data:user-1",
      "auth:deleteUser:user-1",
      "storage:list:user-1",
      "storage:remove:user-1/avatar.webp",
      "rpc:delete_user_data:user-1",
      "auth:deleteUser:user-1",
    ]);
  },
);

Deno.test(
  "Given an Apple user without a provider token When deletion is requested Then manual revocation is recorded without blocking the request",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest(
        { confirm: true },
        createUnsignedJwt(Math.floor(Date.now() / 1000)),
      ),
      createDependencies({
        user: {
          ...createUser("apple-user"),
          app_metadata: { provider: "apple" },
          identities: [{ provider: "apple" }],
        },
        log,
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      appleManualRevocationRequired: true,
      deleted: true,
    });
    assertEquals(log.requestHashes.length, 1);
    assertEquals(log.deletedUsers, ["apple-user"]);
    assertEquals(log.events, [
      "audit:insert:account_deletion_requests:apple_manual_revocation_required",
      "storage:list:apple-user",
      "storage:remove:apple-user/avatar.webp",
      "rpc:delete_user_data:apple-user",
      "auth:deleteUser:apple-user",
    ]);
  },
);

Deno.test(
  "Given an Apple user with a provider token When deletion succeeds Then an Apple revocation receipt is created before Auth deletion",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest(
        { confirm: true, providerToken: "apple-provider-token" },
        createUnsignedJwt(Math.floor(Date.now() / 1000)),
      ),
      createDependencies({
        user: {
          ...createUser("apple-user"),
          app_metadata: { provider: "apple" },
          identities: [{ provider: "apple" }],
        },
        log,
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { deleted: true, appleRevoked: true });
    assertEquals(log.revokedAppleTokens, ["apple-provider-token"]);
    assertEquals(log.deletedUsers, ["apple-user"]);
    assertEquals(log.events, [
      "apple:revoke:apple-provider-token",
      "storage:list:apple-user",
      "storage:remove:apple-user/avatar.webp",
      "rpc:delete_user_data:apple-user",
      "auth:deleteUser:apple-user",
    ]);
  },
);

Deno.test(
  "Given an unauthenticated public deletion request When the email is submitted Then the response does not expose account existence",
  async () => {
    const log = createCallLog();
    const response = await handleDeleteAccountRequest(
      createJsonRequest({ requestDeletion: true, email: "Person@Example.COM" }, ""),
      createDependencies({ user: null, log }),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), { received: true });
    assertEquals(log.requestHashes.length, 1);
    assertEquals(log.requestHashes[0]?.length, 64);
  },
);

Deno.test(
  "Given public deletion requests for plausible existing and unknown emails When submitted Then both return the same non-enumerating receipt",
  async () => {
    const log = createCallLog();
    const dependencies = createDependencies({ user: null, log });

    const existingLikeResponse = await handleDeleteAccountRequest(
      createJsonRequest({ requestDeletion: true, email: "known@example.test" }, ""),
      dependencies,
    );
    const unknownLikeResponse = await handleDeleteAccountRequest(
      createJsonRequest({ requestDeletion: true, email: "unknown@example.test" }, ""),
      dependencies,
    );

    assertEquals(existingLikeResponse.status, 202);
    assertEquals(await existingLikeResponse.json(), { received: true });
    assertEquals(unknownLikeResponse.status, 202);
    assertEquals(await unknownLikeResponse.json(), { received: true });
    assertEquals(log.requestHashes.length, 2);
    assertEquals(log.requestHashes.every((hash) => hash.length === 64), true);
  },
);

function createCallLog(): CallLog {
  return {
    deletedUsers: [],
    events: [],
    requestHashes: [],
    revokedAppleTokens: [],
    rpc: [],
    storageRemoved: [],
  };
}

function createUser(id: string): TestUser {
  return {
    app_metadata: { provider: "google" },
    email: `${id}@example.test`,
    id,
    identities: [{ provider: "google" }],
  };
}

function createDependencies(input: {
  readonly user: TestUser | null;
  readonly log: CallLog;
}): DeleteAccountDependencies {
  return {
    createAdminClient: () => ({
      auth: {
        admin: {
          deleteUser: (userId: string) => {
            input.log.deletedUsers.push(userId);
            input.log.events.push(`auth:deleteUser:${userId}`);
            const alreadyDeleted = input.log.deletedUsers.filter(
              (deletedUserId) => deletedUserId === userId,
            ).length > 1;
            return Promise.resolve({
              error: alreadyDeleted ? { code: "user_not_found" } : null,
            });
          },
        },
      },
      from: (table: string) => ({
        insert: (value: Record<string, unknown>) => {
          if (table === "account_deletion_requests") {
            input.log.requestHashes.push(String(value.email_sha256));
            input.log.events.push(
              `audit:insert:${table}:${String(value.request_source)}`,
            );
          }
          return Promise.resolve({ error: null });
        },
      }),
      rpc: (name: string, params: Record<string, unknown>) => {
        if (name === "delete_user_data") {
          const targetUserId = String(params.target_user_id);
          input.log.rpc.push(targetUserId);
          input.log.events.push(`rpc:${name}:${targetUserId}`);
        }
        return Promise.resolve({ data: null, error: null });
      },
      storage: {
        from: () => ({
          list: (prefix: string) => {
            input.log.events.push(`storage:list:${prefix}`);
            return Promise.resolve({
              data: [{ name: "avatar.webp" }],
              error: null,
              prefix,
            });
          },
          remove: (paths: readonly string[]) => {
            input.log.storageRemoved.push(...paths);
            input.log.events.push(`storage:remove:${paths.join(",")}`);
            return Promise.resolve({ data: [], error: null });
          },
        }),
      },
    }),
    createUserClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: input.user },
            error: null,
          }),
      },
    }),
    envGet: (name) => `test-${name}`,
    revokeAppleCredential: (token) => {
      input.log.revokedAppleTokens.push(token);
      input.log.events.push(`apple:revoke:${token}`);
      return Promise.resolve({ revoked: true });
    },
  };
}

function createJsonRequest(body: Record<string, unknown>, token: string) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: "https://glimfactory.com",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://edge.test/delete-account", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createUnsignedJwt(iat: number) {
  return [
    encodeBase64Url(JSON.stringify({ alg: "none" })),
    encodeBase64Url(JSON.stringify({ iat })),
    "",
  ].join(".");
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = stableJsonStringify(actual);
  const expectedJson = stableJsonStringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}
