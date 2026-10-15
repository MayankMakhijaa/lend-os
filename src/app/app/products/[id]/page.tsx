import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Field, Flash, PageHeader } from "@/components/ui";
import { deleteChecklistItem, saveChecklistItem } from "../../admin-actions";

type Item = { id: string; category: string; title: string; description: string | null; mandatory: boolean; sortOrder: number; active: boolean; lenderId: string | null };

export default async function ProductChecklist({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findFirst({ where: { id, tenantId: u.tenantId } });
  if (!product) notFound();
  const [items, lenders] = await Promise.all([
    db.checklistItem.findMany({ where: { productId: id, tenantId: u.tenantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.lender.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: "asc" } }),
  ]);
  const categories = [...new Set(items.map((i) => i.category))];

  const editor = (it?: Item, lenderId?: string | null) => (
    <form action={saveChecklistItem} className="grid gap-2 sm:grid-cols-12">
      <input type="hidden" name="productId" value={id} />
      {it && <input type="hidden" name="id" value={it.id} />}
      <input type="hidden" name="lenderId" value={(it ? it.lenderId : lenderId) ?? ""} />
      <input name="category" defaultValue={it?.category} list="cats" placeholder="Category" className="input sm:col-span-2" required />
      <input name="title" defaultValue={it?.title} placeholder="Document" className="input sm:col-span-3" required />
      <input name="description" defaultValue={it?.description ?? ""} placeholder="Acceptable documents / notes" className="input sm:col-span-4" />
      <input name="sortOrder" defaultValue={it?.sortOrder ?? items.length} className="input sm:col-span-1" title="Order" />
      <label className="flex items-center gap-1 text-xs sm:col-span-1"><input type="checkbox" name="mandatory" defaultChecked={it ? it.mandatory : true} /> Req.</label>
      <div className="flex gap-1 sm:col-span-1">
        {it && (
          <select name="active" defaultValue={it.active ? "on" : "off"} className="input px-1 text-xs"><option value="on">On</option><option value="off">Off</option></select>
        )}
        <button className="btn-primary py-1 text-xs">{it ? "Save" : "Add"}</button>
      </div>
    </form>
  );

  return (
    <div>
      <PageHeader title={`${product.name} checklist`} sub={<Link href="/app/products" className="text-blue-700 hover:underline">← All products</Link>} />
      <Flash sp={sp} />
      <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="card mb-6">
        <div className="card-h">Base checklist <span className="text-xs font-normal text-slate-500">shared with the DSA when the RM marks a case feasible</span></div>
        <div className="divide-y">
          {items.filter((i) => !i.lenderId).map((it) => (
            <div key={it.id} className={`px-4 py-2 ${it.active ? "" : "opacity-50"}`}>
              {editor(it)}
              <form action={deleteChecklistItem} className="mt-1 text-right"><input type="hidden" name="id" value={it.id} /><button className="text-xs text-red-600 hover:underline">Remove</button></form>
            </div>
          ))}
          <div className="bg-slate-50 px-4 py-3"><div className="label">Add a document</div>{editor(undefined, null)}</div>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Lender-specific requirements</h2>
      <p className="muted mb-3">Extra documents a lender wants in its own format. They're requested from the DSA automatically when the case is sent to that lender.</p>
      <div className="space-y-3">
        {lenders.map((l) => {
          const li = items.filter((i) => i.lenderId === l.id);
          return (
            <details key={l.id} className="card" open={li.length > 0}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{l.name} <span className="text-xs font-normal text-slate-500">· {li.length} extra</span></summary>
              <div className="divide-y border-t">
                {li.map((it) => (
                  <div key={it.id} className="px-4 py-2">
                    {editor(it)}
                    <form action={deleteChecklistItem} className="mt-1 text-right"><input type="hidden" name="id" value={it.id} /><button className="text-xs text-red-600 hover:underline">Remove</button></form>
                  </div>
                ))}
                <div className="bg-slate-50 px-4 py-3">{editor(undefined, l.id)}</div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
