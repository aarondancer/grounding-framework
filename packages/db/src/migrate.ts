import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connect } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../../../migrations");

export async function runMigrations(): Promise<void> {
  const { pool, db } = connect();
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  await runMigrations();
  console.log(`migrations applied from ${migrationsFolder}`);
}
