import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader } from "@/components/ui";
import { PartnerForm } from "@/components/PartnerForm";
import { createPartner } from "../actions";

export default async function NewPartner({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN", "RM"]);
  const sp = await searchParams;
  const isAdmin = u.role === "ADMIN";
  return (
    <div className="max-w-3xl">
      <PageHeader title="Add partner" sub="Enter the partner's details and upload their documents on their behalf. They receive their User ID and password once the account is approved." />
      <Flash sp={sp} />
      <form action={createPartner} className="card card-b space-y-5">
        <PartnerForm docs="optional" />
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <button name="intent" value="submit" className="btn-primary">Save &amp; send for approval</button>
          {isAdmin && <button name="intent" value="approve" className="btn-success">Save &amp; approve now</button>}
          <Link href="/app/partners" className="btn-secondary">Cancel</Link>
        </div>
        <p className="text-xs text-slate-500">
          {isAdmin
            ? "“Save & approve now” needs every required document attached; you confirm them as verified, and the login details go to the partner straight away."
            : "An Admin or another RM approves partner accounts you create."}
        </p>
      </form>
    </div>
  );
}
