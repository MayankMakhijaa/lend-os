import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { proposalScope } from "./access";
import type { CurrentUser } from "./session";
import { tatFor } from "./tat";

export type ProposalFilters = { status?: string; rmId?: string; dsaId?: string; lenderId?: string; productId?: string; q?: string; tat?: string };

export async function listProposals(u: CurrentUser, f: ProposalFilters) {
  const and: Prisma.ProposalWhereInput[] = [proposalScope(u)];
  if (f.status === "OPEN") and.push({ status: { notIn: ["NOT_FEASIBLE", "ALL_REJECTED", "PAYOUT_RELEASED"] } });
  else if (f.status) and.push({ status: f.status });
  if (f.rmId) and.push({ rmId: f.rmId === "none" ? null : f.rmId });
  if (f.dsaId) and.push({ dsaId: f.dsaId });
  if (f.productId) and.push({ productId: f.productId });
  if (f.lenderId) and.push({ assignments: { some: { lenderId: f.lenderId } } });
  if (f.q) and.push({ OR: [{ companyName: { contains: f.q } }, { refNo: { contains: f.q } }, { pan: { contains: f.q.toUpperCase() } }] });

  const [rows, tats] = await Promise.all([
    db.proposal.findMany({
      where: { AND: and },
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: {
        product: true,
        dsa: { select: { id: true, name: true, companyName: true } },
        rm: { select: { id: true, name: true } },
        assignments: { include: { lender: true } },
      },
    }),
    db.tatSetting.findMany({ where: { tenantId: u.tenantId } }),
  ]);
  const withTat = rows.map((r) => ({
    ...r,
    // Lenders only ever see their own assignment.
    assignments: u.role === "LENDER" ? r.assignments.filter((a) => a.lenderId === u.lenderId) : r.assignments,
    tat: r.status === "DRAFT" ? null : tatFor(r, tats),
  }));
  return f.tat === "breached" ? withTat.filter((r) => r.tat?.breached) : withTat;
}
