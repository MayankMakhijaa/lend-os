import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_CHECKLIST, DEFAULT_PRODUCTS, DEFAULT_TATS } from "./constants";

/** Creates a ready-to-use workspace: products, the default checklist per product, TAT settings and the first admin. */
export async function provisionTenant(
  db: PrismaClient,
  input: { name: string; slug: string; brandColor?: string; admin: { name: string; email: string; password: string; phone?: string } },
) {
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.name, slug: input.slug, brandColor: input.brandColor || "#1e40af", supportEmail: input.admin.email },
    });
    for (const p of DEFAULT_PRODUCTS) {
      const product = await tx.product.create({ data: { tenantId: tenant.id, code: p.code, name: p.name } });
      await tx.checklistItem.createMany({
        data: DEFAULT_CHECKLIST.map((c, i) => ({ tenantId: tenant.id, productId: product.id, sortOrder: i, ...c })),
      });
    }
    await tx.tatSetting.createMany({ data: DEFAULT_TATS.map((t, i) => ({ tenantId: tenant.id, sortOrder: i, ...t })) });
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        role: "ADMIN",
        name: input.admin.name,
        email: input.admin.email.toLowerCase(),
        phone: input.admin.phone,
        passwordHash: await bcrypt.hash(input.admin.password, 10),
      },
    });
    await tx.auditLog.create({
      data: { tenantId: tenant.id, actorName: "Platform", actorRole: "PLATFORM", action: "TENANT_CREATED", detail: `Workspace ${tenant.name} created with admin ${admin.email}` },
    });
    return { tenant, admin };
  });
}
