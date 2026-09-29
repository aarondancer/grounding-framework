/**
 * Valkey deployment configuration (implementation/runtime-configuration.md).
 * The cache package is the only place that interprets Valkey env vars.
 */
export type CacheConfig = {
  mode: "standalone" | "cluster";
  addresses: { host: string; port: number }[];
  useTLS: boolean;
  username?: string;
  password?: string;
  /** Per-command timeout. Short by contract: failures degrade to cache miss. */
  requestTimeoutMs: number;
};

export function cacheConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): CacheConfig {
  const addresses = (env.VALKEY_ADDRESSES ?? "localhost:6379").split(",").map((entry) => {
    const [host, port] = entry.trim().split(":");
    if (!host) throw new Error(`invalid VALKEY_ADDRESSES entry: ${entry}`);
    return { host, port: port ? Number(port) : 6379 };
  });
  const mode = env.VALKEY_MODE === "cluster" ? "cluster" : "standalone";
  const config: CacheConfig = {
    mode,
    addresses,
    useTLS: env.VALKEY_TLS === "true",
    requestTimeoutMs: env.VALKEY_REQUEST_TIMEOUT_MS ? Number(env.VALKEY_REQUEST_TIMEOUT_MS) : 500,
  };
  if (env.VALKEY_USERNAME) config.username = env.VALKEY_USERNAME;
  if (env.VALKEY_PASSWORD) config.password = env.VALKEY_PASSWORD;
  return config;
}
