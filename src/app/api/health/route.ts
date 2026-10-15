import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Deployment self-check: reports what's misconfigured without revealing secrets. Open /api/health after deploying.
const mask = (s: string) => s.replace(/(mysql|postgres(?:ql)?):\/\/[^@\s]+@/gi, "$1://***@");

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const env = process.env;
  checks.node = { ok: Number(process.versions.node.split(".")[0]) >= 20, detail: process.versions.node };
  checks.DATABASE_URL = { ok: !!env.DATABASE_URL?.startsWith("mysql://"), detail: env.DATABASE_URL ? "set" : "missing" };
  checks.SESSION_SECRET = { ok: (env.SESSION_SECRET?.length ?? 0) >= 16, detail: env.SESSION_SECRET ? `${env.SESSION_SECRET.length} chars` : "missing" };
  checks.FILE_ENCRYPTION_KEY = { ok: /^[0-9a-fA-F]{64}$/.test(env.FILE_ENCRYPTION_KEY ?? ""), detail: env.FILE_ENCRYPTION_KEY ? `${env.FILE_ENCRYPTION_KEY.length} chars (needs 64 hex)` : "missing" };
  checks.PLATFORM_ADMIN = { ok: !!env.PLATFORM_ADMIN_EMAIL && (env.PLATFORM_ADMIN_PASSWORD?.length ?? 0) >= 8, detail: env.PLATFORM_ADMIN_EMAIL ?? "missing" };
  checks.APP_URL = { ok: !!env.APP_URL, detail: env.APP_URL ?? "missing" };

  try {
    const dir = path.resolve(env.UPLOAD_DIR || "./storage");
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, ".write-test");
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    checks.UPLOAD_DIR = { ok: true, detail: dir };
  } catch (e) {
    checks.UPLOAD_DIR = { ok: false, detail: (e as Error).message };
  }

  try {
    const { db } = await import("@/lib/db");
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, detail: "connected" };
    try {
      const { ensureSchema } = await import("@/lib/schema-bootstrap");
      const r = await ensureSchema();
      const owners = await db.platformAdmin.count();
      const tenants = await db.tenant.count();
      checks.tables = { ok: true, detail: `${r === "created" ? "created now" : "present"} · ${tenants} workspaces · ${owners} owner logins` };
    } catch (e) {
      checks.tables = { ok: false, detail: mask((e as Error).message).slice(0, 500) };
    }
  } catch (e) {
    checks.database = { ok: false, detail: mask((e as Error).message).slice(0, 800) };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
