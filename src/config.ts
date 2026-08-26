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
};
