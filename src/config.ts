// Named so a duration reads as "7 * SECONDS_PER_DAY" instead of the
// unexplained literal "604800" — used both as the AppConfig defaults below
// and as the fallback passed to AppConfigUtil.getInt() in config.<env>.ts,
// so the same number is never typed out twice.
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_DAY = 60 * 60 * 24;

export type IAppConfig = typeof AppConfig;

export const AppConfigUtil = {
  /**
   * Reads an integer from an environment variable, falling back to
   * `defaultValue` when the variable is unset or not a valid number.
   */
  getInt: (key: string, defaultValue: number): number => {
    const value = process.env[key];
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  },
};

// `Partial<T>` only makes top-level keys optional — a nested group like
// `Database` would still need every one of its own fields present. This
// makes every level optional, matching what deepMergeConfig actually
// accepts at runtime.
export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges `override` into `base` recursively, so nested groups (e.g.
 * `Database`) only need to list the fields that actually differ — sibling
 * fields from `base` are preserved automatically at every level. Used
 * instead of `@nestjs/config`'s own `load` merge, which is shallow
 * (`Object.assign`) and would otherwise silently drop base fields that a
 * config.<env>.ts file doesn't repeat.
 */
export function deepMergeConfig<T extends Record<string, unknown>>(
  base: T,
  override: DeepPartial<T>,
): T {
  const result: Record<string, unknown> = { ...base };
  const overrideRecord = override as Record<string, unknown>;

  for (const key of Object.keys(overrideRecord)) {
    const overrideValue = overrideRecord[key];
    const baseValue = base[key];

    result[key] =
      isPlainObject(overrideValue) && isPlainObject(baseValue)
        ? deepMergeConfig(baseValue, overrideValue)
        : overrideValue;
  }

  return result as T;
}

// Defaults live here; every environment-specific config.<env>.ts file
// overrides only what actually differs for that environment.
export const AppConfig = {
  Port: 3000,
  // Origin allowed to call the API from the browser (the web app's own
  // URL, not the API's) — needed because CORS is off by default in Nest.
  CorsOrigin: 'http://localhost:3000',
  Database: {
    type: 'postgres' as const,
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    database: '',
    synchronize: false,
    migrationsRun: false,
    // Only set in config.production.ts, when a managed Postgres provider
    // requires it — declared here so that file's override has a real key
    // to target instead of adding one `satisfies DeepPartial<IAppConfig>`
    // would otherwise reject as unknown.
    ssl: undefined as { rejectUnauthorized: boolean } | undefined,
  },
  Auth: {
    // No real default here on purpose — loadEnvironmentConfig() in
    // app.module.ts refuses to boot if JWT_SECRET isn't set, so this
    // value is only ever `undefined` as a type placeholder, never at
    // runtime.
    jwtSecret: undefined as string | undefined,
    jwtAccessTokenLifetime: 15 * SECONDS_PER_MINUTE,
    // Absolute cap from login, unaffected by how often the session refreshes.
    jwtRefreshTokenLifetime: 7 * SECONDS_PER_DAY,
    // Logs the session out early if it goes unused this long.
    refreshInactivityLifetime: 3 * SECONDS_PER_DAY,
    cookieSecure: false,
    cookieSameSite: 'lax' as 'lax' | 'none' | 'strict',
  },
  Uploads: {
    avatarsDir: 'uploads/avatars',
    maxAvatarSizeBytes: 2 * 1024 * 1024,
    allowedAvatarMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
    ] as string[],
  },
  Mail: {
    // No real defaults on purpose — these only matter to a running
    // instance via config.<env>.ts, same reasoning as Auth.jwtSecret.
    host: undefined as string | undefined,
    port: 1025,
    user: undefined as string | undefined,
    password: undefined as string | undefined,
    from: undefined as string | undefined,
  },
};
