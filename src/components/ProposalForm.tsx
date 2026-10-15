import type { Proposal } from "@prisma/client";
import { CONSTITUTIONS } from "@/lib/constants";
import { Field } from "./ui";

export function ProposalFields({ p }: { p?: Partial<Proposal> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name *" className="sm:col-span-2"><input name="companyName" defaultValue={p?.companyName ?? ""} className="input" required /></Field>
      <Field label="Constitution">
        <select name="constitution" defaultValue={p?.constitution ?? ""} className="input">
          <option value="">—</option>
          {CONSTITUTIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="City"><input name="city" defaultValue={p?.city ?? ""} className="input" /></Field>
      <Field label="Business PAN"><input name="pan" defaultValue={p?.pan ?? ""} className="input uppercase" maxLength={10} /></Field>
      <Field label="GSTIN"><input name="gstin" defaultValue={p?.gstin ?? ""} className="input uppercase" maxLength={15} /></Field>
      <Field label="Loan amount required (₹)"><input name="loanAmount" defaultValue={p?.loanAmount ?? ""} className="input" inputMode="numeric" /></Field>
      <Field label="Annual turnover (₹)"><input name="turnover" defaultValue={p?.turnover ?? ""} className="input" inputMode="numeric" /></Field>
      <Field label="Client contact person"><input name="contactName" defaultValue={p?.contactName ?? ""} className="input" /></Field>
      <Field label="Client mobile"><input name="contactPhone" defaultValue={p?.contactPhone ?? ""} className="input" /></Field>
      <Field label="Client email"><input name="contactEmail" type="email" defaultValue={p?.contactEmail ?? ""} className="input" /></Field>
      <Field label="Purpose of loan"><input name="purpose" defaultValue={p?.purpose ?? ""} className="input" /></Field>
      <Field label="Notes for the RM" className="sm:col-span-2"><textarea name="notes" defaultValue={p?.notes ?? ""} rows={3} className="input" /></Field>
    </div>
  );
}
