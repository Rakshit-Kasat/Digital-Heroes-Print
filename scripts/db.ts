/**
 * Migration runner: applies every supabase/migrations/*.sql file once, in
 * name order, recording each in public._migrations.
 * Why our own runner: avoids needing the Supabase CLI login on this machine;
 * it only needs SUPABASE_DB_PASSWORD from .env.local.
 * Run: node scripts/db.ts            (Node 24 runs TypeScript directly)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

export async function connect(): Promise<pg.Client> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = new URL(url).hostname.split(".")[0];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD");
  // Session-mode pooler (IPv4). Supabase uses aws-0 or aws-1 hosts per project.
  let lastError: unknown;
  for (const host of ["aws-1-ap-south-1.pooler.supabase.com", "aws-0-ap-south-1.pooler.supabase.com"]) {
    const client = new pg.Client({
      host, port: 5432, database: "postgres", user: `postgres.${ref}`, password,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function migrate() {
  const client = await connect();
  try {
    await client.query("create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())");
    await client.query("alter table public._migrations enable row level security"); // no policies: server only
    const done = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));
    const dir = join("supabase", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      process.stdout.write(`applying ${file} ... `);
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
        await client.query("insert into public._migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("db.ts")) {
  migrate().catch((e) => {
    console.error("migration failed:", e.message);
    process.exit(1);
  });
}
