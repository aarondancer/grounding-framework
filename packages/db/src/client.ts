import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;
export { schema };

export function createPool(config?: PoolConfig): Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://grounding:grounding@localhost:5432/grounding",
    ...config,
  });
}

export function createDatabase(pool: Pool = createPool()): Database {
  return drizzle(pool, { schema });
}

/** Convenience: pool + drizzle database pair sharing one connection pool. */
export function connect(config?: PoolConfig): { pool: Pool; db: Database } {
  const pool = createPool(config);
  return { pool, db: drizzle(pool, { schema }) };
}
