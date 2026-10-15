import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Field, Flash, PageHeader } from "@/components/ui";
import { ProposalFields } from "@/components/ProposalForm";
import { createProposal } from "../actions";

export default async function NewProposal({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["DSA", "ADMIN", "RM"]);
  const sp = await searchParams;
  const products = await db.product.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { name: "asc" } });
  const dsas = u.role === "DSA" ? [] : await db.user.findMany({ where: { tenantId: u.tenantId, role: "DSA", status: "ACTIVE" }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-3xl">
      <PageHeader title="New proposal" sub="The product you choose decides the document checklist and lender panel." />
      <Flash sp={sp} />
      <form action={createProposal} className="card card-b space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product *">
            <select name="productId" className="input" required defaultValue="">
              <option value="" disabled>Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </Field>
          {u.role !== "DSA" && (
            <Field label="DSA / Partner *">
              <select name="dsaId" className="input" required defaultValue="">
                <option value="" disabled>Select DSA</option>
                {dsas.map((d) => <option key={d.id} value={d.id}>{d.companyName ? `${d.companyName} · ${d.name}` : d.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <ProposalFields />
        <div className="flex gap-2 border-t pt-4">
          <button name="intent" value="submit" className="btn-primary">Submit proposal</button>
          <button name="intent" value="draft" className="btn-secondary" formNoValidate>Save as draft</button>
        </div>
      </form>
    </div>
  );
}
