import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { docVisibility, proposalScope } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("Unauthorized", { status: 401 });
  const { versionId } = await params;
  // Access is checked through the same proposal scope as every page: id guessing returns 404.
  const v = await db.documentVersion.findFirst({
    where: { id: versionId, document: { AND: [docVisibility(u), { proposal: proposalScope(u) }] } },
    include: { document: true },
  });
  if (!v) return new NextResponse("Not found", { status: 404 });
  const data = await readFile(v.storedName);
  await audit(u.tenantId, { id: u.id, name: u.name, role: u.role }, "DOCUMENT_DOWNLOADED", `${v.document.title} v${v.version}`, v.document.proposalId);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": v.mimeType,
      "content-length": String(data.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(v.fileName)}"`,
      "cache-control": "private, no-store",
    },
  });
}
