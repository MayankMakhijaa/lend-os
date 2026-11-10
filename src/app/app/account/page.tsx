import { requireUser } from "@/lib/session";
import { PARTNER_DOCS, PARTNER_DOC_ACCEPT, ROLE_LABEL, requiredPartnerDocs } from "@/lib/constants";
import { partnerDocs } from "@/lib/partners";
import { fmtDate } from "@/lib/format";
import { Field, Flash, PageHeader } from "@/components/ui";
import { changePassword } from "../../auth-actions";
import { updateProfile } from "../admin-actions";
import { uploadMyPartnerDoc } from "../partners/actions";

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const isPartner = u.role === "DSA";
  const docs = isPartner ? (await partnerDocs(u.id)).current : null;
  const required = new Set(requiredPartnerDocs(u.constitution).map((d) => d.type));
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="My account" sub={`${ROLE_LABEL[u.role]} · ${u.partnerCode ? `User ID ${u.partnerCode} · ` : ""}${u.email} · workspace ${u.tenant.slug}`} />
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input name="name" defaultValue={u.name} className="input" /></Field>
          <Field label="Mobile (WhatsApp notifications)"><input name="phone" defaultValue={u.phone ?? ""} className="input" /></Field>
          {isPartner && (
            <>
              <Field label="Firm name"><input name="companyName" defaultValue={u.companyName ?? ""} className="input" /></Field>
              <Field label="PIN code"><input name="pincode" defaultValue={u.pincode ?? ""} className="input" inputMode="numeric" maxLength={6} /></Field>
              <Field label="Address" className="sm:col-span-2"><textarea name="address" defaultValue={u.address ?? ""} rows={2} className="input" /></Field>
              <Field label="City"><input name="city" defaultValue={u.city ?? ""} className="input" /></Field>
              <Field label="State"><input name="state" defaultValue={u.state ?? ""} className="input" /></Field>
            </>
          )}
        </div>
        {isPartner && (
          <p className="text-xs text-slate-500">
            Constitution: {u.constitution ?? "—"} · PAN: {u.pan ?? "—"} · GSTIN: {u.gstin ?? "—"}. To change these, contact {u.tenant.supportEmail ?? "your admin"}.
          </p>
        )}
        <button className="btn-secondary">Save profile</button>
      </form>
      {isPartner && docs && (
        <div className="card">
          <div className="card-h">My documents</div>
          <div className="divide-y">
            {PARTNER_DOCS.filter((d) => required.has(d.type) || docs.has(d.type)).map((d) => {
              const doc = docs.get(d.type);
              return (
                <div key={d.type} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{d.label}</div>
                    <div className="text-xs text-slate-500">
                      {doc ? (
                        <>
                          <a href={`/api/partner-files/${doc.id}?inline=1`} target="_blank" className="text-blue-700 hover:underline">{doc.fileName}</a>
                          {" "}· {fmtDate(doc.createdAt)} · {doc.status === "VERIFIED" ? "Verified" : "Awaiting verification"}
                        </>
                      ) : "Not uploaded yet"}
                    </div>
                  </div>
                  <form action={uploadMyPartnerDoc} className="flex flex-wrap items-center gap-2">
                    <input type="file" name={`doc_${d.type}`} accept={PARTNER_DOC_ACCEPT} required className="max-w-[200px] text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
                    <button className="btn-secondary py-1 text-xs">{doc ? "Replace" : "Upload"}</button>
                  </form>
                </div>
              );
            })}
          </div>
          <p className="border-t px-4 py-2 text-xs text-slate-500">PDF, JPG or PNG, up to 5 MB. A replaced document is verified again by the team.</p>
        </div>
      )}
    </div>
  );
}
