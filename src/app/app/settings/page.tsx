import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { appUrl } from "@/lib/notify";
import { Field, Flash, PageHeader } from "@/components/ui";
import { saveTats, saveWorkspace } from "../admin-actions";

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const tats = await db.tatSetting.findMany({ where: { tenantId: u.tenantId }, orderBy: { sortOrder: "asc" } });
  const t = u.tenant;
  return (
    <div className="max-w-4xl">
      <PageHeader title="TAT & settings" />
      <Flash sp={sp} />
      <form action={saveTats} className="card mb-6">
        <div className="card-h">Turnaround time targets <span className="text-xs font-normal text-slate-500">days · 0 = same day</span></div>
        <table className="table">
          <thead><tr><th>Step</th><th className="w-32">Target (days)</th></tr></thead>
          <tbody>
            {tats.map((x) => (
              <tr key={x.id}>
                <td>{x.label}</td>
                <td><input name={`tat_${x.key}`} type="number" min={0} defaultValue={x.days} className="input" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4"><button className="btn-primary">Save TATs</button></div>
      </form>

      <form action={saveWorkspace} className="card">
        <div className="card-h">Workspace</div>
        <div className="card-b grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><input name="name" defaultValue={t.name} className="input" /></Field>
          <Field label="Workspace code"><input value={t.slug} disabled className="input bg-slate-50" /></Field>
          <Field label="Brand colour"><input type="color" name="brandColor" defaultValue={t.brandColor} className="h-9 w-full rounded border" /></Field>
          <Field label="Support email"><input name="supportEmail" defaultValue={t.supportEmail ?? ""} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="allowDsaSignup" defaultChecked={t.allowDsaSignup} /> Allow DSA/Partner self-signup (activated after Admin/RM approval)
          </label>
          <div className="text-xs text-slate-500 sm:col-span-2">Sign-in link: <span className="font-mono">{appUrl(`/login?ws=${t.slug}`)}</span><br />DSA sign-up link: <span className="font-mono">{appUrl(`/signup/${t.slug}`)}</span></div>
          <div><button className="btn-primary">Save workspace</button></div>
        </div>
      </form>
    </div>
  );
}
