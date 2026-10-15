import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { Field, Flash, PageHeader } from "@/components/ui";
import { changePassword } from "../../auth-actions";
import { updateProfile } from "../admin-actions";

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My account" sub={`${ROLE_LABEL[u.role]} · ${u.email} · workspace ${u.tenant.slug}`} />
      {(sp.must || u.mustChangePassword) && <Flash sp={{ err: "Please set a new password before continuing." }} />}
      <Flash sp={sp} />
      <form action={changePassword} className="card card-b space-y-3">
        <div className="font-semibold text-slate-700">Change password</div>
        {!u.mustChangePassword && <Field label="Current password"><input name="current" type="password" className="input" required /></Field>}
        <Field label="New password"><input name="password" type="password" className="input" minLength={8} required /></Field>
        <button className="btn-primary">Update password</button>
      </form>
      <form action={updateProfile} className="card card-b space-y-3">
        <div className="font-semibold text-slate-700">Profile</div>
        <Field label="Name"><input name="name" defaultValue={u.name} className="input" /></Field>
        <Field label="Mobile (WhatsApp notifications)"><input name="phone" defaultValue={u.phone ?? ""} className="input" /></Field>
        {u.role === "DSA" && <Field label="Firm name"><input name="companyName" defaultValue={u.companyName ?? ""} className="input" /></Field>}
        <button className="btn-secondary">Save profile</button>
      </form>
    </div>
  );
}
