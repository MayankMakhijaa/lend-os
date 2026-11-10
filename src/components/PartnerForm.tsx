"use client";

import { useState } from "react";
import { CONSTITUTIONS, PARTNER_DOCS, PARTNER_DOC_ACCEPT } from "@/lib/constants";
import { Field } from "./ui";

type PartnerValues = {
  name?: string | null; companyName?: string | null; email?: string | null; phone?: string | null; constitution?: string | null;
  pan?: string | null; gstin?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
};

/**
 * Partner details plus (optionally) the KYC uploads. Used by self-registration, by staff creating a partner
 * and by staff editing one. `docs`: "required" for self-registration, "optional" when staff may upload later.
 */
export function PartnerForm({ p, docs, emailLocked }: { p?: PartnerValues; docs?: "required" | "optional"; emailLocked?: boolean }) {
  const [constitution, setConstitution] = useState(p?.constitution ?? "");
  const shown = PARTNER_DOCS.filter((d) => !d.onlyFor || d.onlyFor.includes(constitution));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person *"><input name="name" defaultValue={p?.name ?? ""} className="input" required /></Field>
        <Field label="Firm / company name"><input name="companyName" defaultValue={p?.companyName ?? ""} className="input" /></Field>
        <Field label="Email *">
          <input name="email" type="email" defaultValue={p?.email ?? ""} className="input disabled:bg-slate-100" required disabled={emailLocked} />
        </Field>
        <Field label="Mobile (WhatsApp) *"><input name="phone" defaultValue={p?.phone ?? ""} className="input" placeholder="+91…" required /></Field>
        <Field label="Constitution *">
          <select name="constitution" value={constitution} onChange={(e) => setConstitution(e.target.value)} className="input" required>
            <option value="" disabled>Select</option>
            {CONSTITUTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="PAN *">
          <input name="pan" defaultValue={p?.pan ?? ""} className="input uppercase" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="10 characters, e.g. ABCDE1234F" required />
        </Field>
        <Field label="GSTIN"><input name="gstin" defaultValue={p?.gstin ?? ""} className="input uppercase" maxLength={15} /></Field>
        <Field label="PIN code"><input name="pincode" defaultValue={p?.pincode ?? ""} className="input" inputMode="numeric" maxLength={6} pattern="[1-9][0-9]{5}" title="6-digit PIN code" /></Field>
        <Field label="Address *" className="sm:col-span-2"><textarea name="address" defaultValue={p?.address ?? ""} rows={2} className="input" required /></Field>
        <Field label="City *"><input name="city" defaultValue={p?.city ?? ""} className="input" required /></Field>
        <Field label="State *"><input name="state" defaultValue={p?.state ?? ""} className="input" required /></Field>
      </div>
      {docs && (
        <div>
          <div className="label">Documents{docs === "optional" ? " (can also be uploaded later; all are needed before approval)" : ""}</div>
          <div className="divide-y rounded-md border border-slate-200">
            {shown.map((d) => (
              <label key={d.type} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{d.label}{docs === "required" ? " *" : ""}</span>
                  {d.hint && <span className="ml-2 text-xs text-slate-500">{d.hint}</span>}
                </span>
                <input
                  type="file"
                  name={`doc_${d.type}`}
                  accept={PARTNER_DOC_ACCEPT}
                  required={docs === "required"}
                  className="max-w-[240px] text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">PDF, JPG or PNG, up to 5 MB each. MOA and AOA are asked for Private Limited companies.</p>
        </div>
      )}
    </div>
  );
}
