import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";

// Each migration with the table that proves it has been applied.
const MIGRATIONS: { dir: string; table: string }[] = [
  { dir: "0001_init", table: "Tenant" },
  { dir: "0002_partner_onboarding", table: "PartnerDocument" },
];

async function tableExists(name: string) {
  const rows = await db.$queryRawUnsafe<{ n: bigint | number }[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    name,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Safety net for hosts that don't run `npm start` (which applies migrations): if a migration's tables are
 * missing, apply its SQL directly. No-op once the schema is current.
 */
export async function ensureSchema(): Promise<"exists" | "created"> {
  let result: "exists" | "created" = "exists";
  for (const m of MIGRATIONS) {
    if (await tableExists(m.table)) continue;
    const file = path.join(process.cwd(), "prisma", "migrations", m.dir, "migration.sql");
    const sql = await fs.readFile(file, "utf8");
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const st of statements) {
      try {
        await db.$executeRawUnsafe(st);
      } catch (e) {
        // A half-applied earlier attempt leaves some columns/keys behind; skip those and carry on.
        if (m.dir === "0001_init" || !/Duplicate (column|key|foreign key)|already exists/i.test((e as Error).message)) throw e;
      }
    }
    result = "created";
  }
  return result;
}
