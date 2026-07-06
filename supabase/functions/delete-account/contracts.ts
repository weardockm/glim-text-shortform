export const RECENT_SESSION_SECONDS = 15 * 60;

export type AccountDeletionBody = {
  readonly confirm?: unknown;
  readonly userId?: unknown;
  readonly providerToken?: unknown;
  readonly requestDeletion?: unknown;
  readonly email?: unknown;
};

export type AuthenticatedUser = {
  readonly id: string;
  readonly email?: string;
  readonly app_metadata?: Record<string, unknown> | null;
  readonly identities?: readonly { readonly provider?: string | null }[];
};

export type QueryError = {
  readonly code?: string;
  readonly message?: string;
};

export type AdminClient = {
  readonly auth: {
    readonly admin: {
      readonly deleteUser: (
        userId: string,
      ) => Promise<{ readonly error: QueryError | null }>;
    };
  };
  readonly from: (table: string) => {
    readonly insert: (
      value: Record<string, unknown>,
    ) => PromiseLike<{ readonly error: QueryError | null }>;
  };
  readonly rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ readonly error: QueryError | null }>;
  readonly storage: {
    readonly from: (bucket: string) => {
      readonly list: (
        prefix: string,
      ) => PromiseLike<{
        readonly data: readonly { readonly name: string }[] | null;
        readonly error: QueryError | null;
      }>;
      readonly remove: (
        paths: readonly string[],
      ) => PromiseLike<{ readonly error: QueryError | null }>;
    };
  };
};

export type UserClient = {
  readonly auth: {
    readonly getUser: () => Promise<{
      readonly data: { readonly user: AuthenticatedUser | null };
      readonly error: unknown | null;
    }>;
  };
};

export type DeleteAccountDependencies = {
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
  readonly revokeAppleCredential: (
    providerToken: string,
    envGet: (name: string) => string | undefined,
  ) => Promise<{ readonly revoked: boolean }>;
};
