import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./session";

/**
 * Row-level scope for proposals. Every proposal read goes through this so a user can never
 * reach another tenant's (or, for DSA/RM/Lender, another person's) proposal by changing an id.
 */
export function proposalScope(u: Pick<CurrentUser, "id" | "tenantId" | "role" | "lenderId">): Prisma.ProposalWhereInput {
  const base: Prisma.ProposalWhereInput = { tenantId: u.tenantId };
  switch (u.role) {
    case "ADMIN":
      return base;
    case "RM":
      return { ...base, rmId: u.id };
    case "DSA":
      return { ...base, dsaId: u.id };
    case "LENDER":
      // Lenders only see proposals actually sent to their institution.
      return { ...base, status: { not: "DRAFT" }, assignments: { some: { lenderId: u.lenderId ?? "__none__" } } };
    default:
      return { id: "__none__" };
  }
}

export async function getScopedProposal(u: CurrentUser, id: string) {
  const p = await db.proposal.findFirst({ where: { AND: [{ id }, proposalScope(u)] } });
  if (!p) notFound();
  return p;
}

/** Lenders see the common checklist plus their own lender-specific lines, never another lender's (e.g. sanction letters). */
export function docVisibility(u: Pick<CurrentUser, "role" | "lenderId">): Prisma.ProposalDocumentWhereInput {
  return u.role === "LENDER" ? { OR: [{ lenderId: null }, { lenderId: u.lenderId ?? "__none__" }] } : {};
}

/** Lenders only see queries their institution raised. */
export function queryVisibility(u: Pick<CurrentUser, "role" | "lenderId">): Prisma.QueryWhereInput {
  return u.role === "LENDER" ? { lenderId: u.lenderId ?? "__none__" } : {};
}
