import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";

/**
 * Safety net for hosts that don't run `npm start` (which applies migrations): if the core tables are
 * missing, apply the initial migration SQL directly. No-op once the schema exists.
 */
export async function ensureSchema(): Promise<"exists" | "created"> {
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'Tenant'",
  );
  if (Number(rows[0]?.n ?? 0) > 0) return "exists";
  const file = path.join(process.cwd(), "prisma", "migrations", "0001_init", "migration.sql");
  const sql = await fs.readFile(file, "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const st of statements) await db.$executeRawUnsafe(st);
  return "created";
}
