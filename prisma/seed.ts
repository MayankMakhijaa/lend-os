/* Seeds the platform owner and a fully-populated demo workspace ("provik").
   Run: npm run db:seed   (add --reset to wipe and recreate the demo workspace) */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemo } from "../src/lib/demo";

const db = new PrismaClient();

async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || "owner@loanos.local").toLowerCase();
  const pw = process.env.PLATFORM_ADMIN_PASSWORD || "ChangeMe@123";
  await db.platformAdmin.upsert({ where: { email }, update: {}, create: { email, name: "Platform Owner", passwordHash: await bcrypt.hash(pw, 10) } });
  console.log(`Platform console: ${email} / ${pw}`);

  const existing = await db.tenant.findUnique({ where: { slug: "provik" } });
  if (existing && !process.argv.includes("--reset")) {
    console.log("Demo workspace 'provik' already exists (use --reset to recreate).");
    return;
  }
  if (existing) await db.tenant.delete({ where: { id: existing.id } });
  await seedDemo(db);
}

main().finally(() => db.$disconnect());
