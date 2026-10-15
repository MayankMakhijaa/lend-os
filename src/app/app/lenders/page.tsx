import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Field, Flash, PageHeader } from "@/components/ui";
import { saveLender } from "../admin-actions";

export default async function Lenders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const [lenders, products] = await Promise.all([
    db.lender.findMany({
      where: { tenantId: u.tenantId },
      orderBy: { name: "asc" },
      include: { products: true, _count: { select: { users: true, assignments: true } }, assignments: { select: { status: true } } },
    }),
    db.product.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: "asc" } }),
  ]);

  const form = (l?: (typeof lenders)[number]) => (
    <form action={saveLender} className="space-y-3">
      {l && <input type="hidden" name="id" value={l.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name"><input name="name" defaultValue={l?.name} className="input" required /></Field>
        <Field label="Type">
          <select name="type" defaultValue={l?.type ?? "Bank"} className="input">{["Bank", "NBFC", "Fintech", "Other"].map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Contact email"><input name="contactEmail" defaultValue={l?.contactEmail ?? ""} className="input" /></Field>
      </div>
      <div>
        <div className="label">Lender panel: products this lender is offered for</div>
        <div className="grid gap-1 sm:grid-cols-3">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="productId" value={p.id} defaultChecked={l ? l.products.some((x) => x.productId === p.id) : true} /> {p.name}
            </label>
          ))}
        </div>
      </div>
      {l && (
        <label className="flex items-center gap-2 text-sm">
          <select name="active" defaultValue={l.active ? "on" : "off"} className="input w-auto"><option value="on">Active</option><option value="off">Inactive</option></select>
        </label>
      )}
      <button className="btn-primary">{l ? "Save" : "Add lender"}</button>
    </form>
  );

  return (
    <div>
      <PageHeader title="Lenders" sub="Partner banks and NBFCs. Add lender logins from Users. Lender-specific documents are set per product." />
      <Flash sp={sp} />
      <div className="space-y-3">
        {lenders.map((l) => {
          const sanc = l.assignments.filter((a) => a.status === "SANCTIONED").length;
          return (
            <details key={l.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-semibold">{l.name}</span> <span className="text-slate-500">· {l.type}</span> {!l.active && <span className="badge bg-slate-100 text-slate-500">inactive</span>}</span>
                <span className="text-xs text-slate-500">{l.products.length} products · {l._count.users} logins · {l._count.assignments} proposals · {sanc} sanctioned</span>
              </summary>
              <div className="border-t p-4">{form(l)}</div>
            </details>
          );
        })}
      </div>
      <div className="card mt-6">
        <div className="card-h">Add a lender</div>
        <div className="card-b">{form()}</div>
      </div>
    </div>
  );
}
