"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin, endSession } from "@/lib/session";
import { provisionTenant } from "@/lib/provision";
import { str } from "@/lib/format";

export async function createTenant(fd: FormData) {
  await requirePlatformAdmin();
  const slug = str(fd, "slug").toLowerCase();
  if (!/^[a-z0-9-]{2,32}$/.test(slug)) redirect("/platform?err=Workspace+code+must+be+2-32+lowercase+letters,+digits+or+dashes.");
  if (await db.tenant.findUnique({ where: { slug } })) redirect("/platform?err=That+workspace+code+is+taken.");
  const password = str(fd, "adminPassword");
  if (password.length < 8) redirect("/platform?err=Admin+password+must+be+at+least+8+characters.");
  await provisionTenant(db, {
    name: str(fd, "name"),
    slug,
    brandColor: str(fd, "brandColor") || undefined,
    admin: { name: str(fd, "adminName"), email: str(fd, "adminEmail"), password, phone: str(fd, "adminPhone") || undefined },
  });
  redirect(`/platform?msg=Workspace+${slug}+created.`);
}

export async function toggleTenant(fd: FormData) {
  await requirePlatformAdmin();
  const t = await db.tenant.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  await db.tenant.update({ where: { id: t.id }, data: { active: !t.active } });
  revalidatePath("/platform");
}

export async function platformLogout() {
  await endSession();
  redirect("/platform/login");
}
