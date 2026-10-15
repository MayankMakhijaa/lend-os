import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listProposals } from "@/lib/proposals";
import { LENDER_STATUS_LABEL, STATUS_LABEL } from "@/lib/constants";
import { audit } from "@/lib/audit";

const esc = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });
  const f = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await listProposals(u, f);
  const header = ["Ref No", "Company", "Product", "Constitution", "PAN", "GSTIN", "City", "Loan Amount", "Status", "TAT Breached", "DSA", "DSA Firm", "RM",
    "Lenders", "Submitted", "Disbursed Amount", "Disbursed On", "Payout Amount", "Payout On", "Created", "Updated"];
  const lines = rows.map((r) => [
    r.refNo, r.companyName, r.product.name, r.constitution, r.pan, r.gstin, r.city, r.loanAmount, STATUS_LABEL[r.status], r.tat?.breached ? "Yes" : "No",
    r.dsa.name, r.dsa.companyName, r.rm?.name, r.assignments.map((a) => `${a.lender.name}: ${LENDER_STATUS_LABEL[a.status]}`).join("; "),
    r.submittedAt, r.disbursedAmount, r.disbursedAt, r.payoutAmount, r.payoutAt, r.createdAt, r.updatedAt,
  ].map(esc).join(","));
  await audit(u.tenantId, { id: u.id, name: u.name, role: u.role }, "EXPORT", `${rows.length} proposals`);
  return new NextResponse("﻿" + [header.join(","), ...lines].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="proposals-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
