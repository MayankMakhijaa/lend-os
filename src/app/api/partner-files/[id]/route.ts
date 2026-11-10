import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { readFile } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { PARTNER_DOCS } from "@/lib/constants";

// Partner KYC files: readable by the workspace's Admin/RM and by the partner they belong to. Anything else is 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const staff = u.role === "ADMIN" || u.role === "RM";
  const d = await db.partnerDocument.findFirst({
    where: { id, tenantId: u.tenantId, ...(staff ? {} : { userId: u.id }) },
    include: { user: { select: { email: true } } },
  });
  if (!d) return new NextResponse("Not found", { status: 404 });
  const data = await readFile(d.storedName);
  const label = PARTNER_DOCS.find((x) => x.type === d.type)?.label ?? d.type;
  await audit(u.tenantId, { id: u.id, name: u.name, role: u.role }, "PARTNER_DOC_DOWNLOADED", `${d.user.email} · ${label}`);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": d.mimeType,
      "content-length": String(data.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.fileName)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
