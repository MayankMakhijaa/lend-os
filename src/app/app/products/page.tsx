import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Field, Flash, PageHeader } from "@/components/ui";
import { createProduct, toggleProduct } from "../admin-actions";

export default async function Products({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const products = await db.product.findMany({
    where: { tenantId: u.tenantId },
    orderBy: { name: "asc" },
    include: { checklist: { select: { lenderId: true, active: true } }, _count: { select: { lenders: true, proposals: true } } },
  });
  return (
    <div>
      <PageHeader title="Products & document checklists" sub="The product a DSA picks decides the checklist and lender panel. Changes apply to new cases." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="table">
            <thead><tr><th>Product</th><th>Base documents</th><th>Lender-specific</th><th>Lenders</th><th>Cases</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td><Link href={`/app/products/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.name}</Link> <span className="font-mono text-xs text-slate-400">{p.code}</span></td>
                  <td>{p.checklist.filter((c) => !c.lenderId && c.active).length}</td>
                  <td>{p.checklist.filter((c) => c.lenderId && c.active).length}</td>
                  <td>{p._count.lenders}</td>
                  <td>{p._count.proposals}</td>
                  <td className="flex gap-2">
                    <Link href={`/app/products/${p.id}`} className="btn-secondary py-1 text-xs">Edit checklist</Link>
                    <form action={toggleProduct}><input type="hidden" name="id" value={p.id} /><button className="btn-secondary py-1 text-xs">{p.active ? "Deactivate" : "Activate"}</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={createProduct} className="card h-fit">
          <div className="card-h">Add product</div>
          <div className="card-b space-y-3">
            <Field label="Code"><input name="code" className="input uppercase" placeholder="e.g. WCDL" required /></Field>
            <Field label="Name"><input name="name" className="input" required /></Field>
            <Field label="Start checklist from">
              <select name="copyFrom" className="input" defaultValue="__default">
                <option value="__default">Standard lending checklist</option>
                {products.map((p) => <option key={p.id} value={p.id}>Copy of {p.name}</option>)}
                <option value="">Empty</option>
              </select>
            </Field>
            <button className="btn-primary w-full">Create product</button>
          </div>
        </form>
      </div>
    </div>
  );
}
