import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PARTNER_DOCS, PARTNER_DOC_ACCEPT, PARTNER_SOURCE_LABEL, PARTNER_STATUS_LABEL, partnerTone } from "@/lib/constants";
import { partnerDocGaps, partnerDocs } from "@/lib/partners";
import { fmtBytes, fmtDate } from "@/lib/format";
import { Field, Flash } from "@/components/ui";
import { PartnerForm } from "@/components/PartnerForm";
import * as A from "../actions";

export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN", "RM"]);
  const { id } = await params;
  const sp = await searchParams;
  const p = await db.user.findFirst({ where: { id, tenantId: u.tenantId, role: "DSA" }, include: { _count: { select: { dsaProposals: true } } } });
  if (!p) notFound();

  const { all, current } = await partnerDocs(p.id);
  const gaps = partnerDocGaps(p.constitution, current);
  const requiredTypes = new Set(gaps.required.map((d) => d.type));
  // Show every required document, plus anything else that was uploaded.
  const lines = PARTNER_DOCS.filter((d) => requiredTypes.has(d.type) || current.has(d.type));
  const creator = p.createdById ? await db.user.findFirst({ where: { id: p.createdById, tenantId: u.tenantId }, select: { name: true } }) : null;
  const logs = await db.auditLog.findMany({
    where: { tenantId: u.tenantId, action: { startsWith: "PARTNER_" }, detail: { startsWith: p.email } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const selfCreated = u.role !== "ADMIN" && p.onboardingSource === "STAFF" && p.createdById === u.id;
  const ready = !gaps.missing.length && !gaps.unverified.length;
  const Pid = () => <input type="hidden" name="partnerId" value={p.id} />;

  return (
    <div>
      <Flash sp={sp} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/app/partners" className="text-xs text-blue-700 hover:underline">← DSA / Partners</Link>
          <h1 className="h1 mt-1">{p.name}{p.companyName ? <span className="font-normal text-slate-500"> · {p.companyName}</span> : null}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`badge ${partnerTone(p.status)}`}>{PARTNER_STATUS_LABEL[p.status] ?? p.status}</span>
            {p.partnerCode && <span className="font-mono text-xs text-slate-600">User ID {p.partnerCode}</span>}
            <span className="text-xs text-slate-500">
              {PARTNER_SOURCE_LABEL[p.onboardingSource ?? ""] ?? "Added"}{creator ? ` (${creator.name})` : ""} on {fmtDate(p.createdAt)}
            </span>
          </div>
        </div>
        {p.status === "ACTIVE" && <Link href={`/app/proposals?dsaId=${p.id}`} className="btn-secondary">{p._count.dsaProposals} proposals</Link>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <div className="card-h">Partner details</div>
            <dl className="card-b grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ["Contact person", p.name], ["Firm", p.companyName], ["Constitution", p.constitution],
                ["Email", p.email], ["Mobile", p.phone], ["PAN", p.pan],
                ["GSTIN", p.gstin], ["City", p.city], ["State", p.state],
                ["PIN code", p.pincode],
              ].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words font-medium text-slate-800">{v || "—"}</dd></div>
              ))}
              <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Address</dt><dd className="whitespace-pre-wrap font-medium text-slate-800">{p.address || "—"}</dd></div>
            </dl>
            <details className="border-t px-4 py-3">
              <summary className="cursor-pointer text-sm text-blue-700 hover:underline">Edit details</summary>
              <form action={A.updatePartner} className="mt-3 space-y-4">
                <Pid />
                {/* Only the form fields cross to the browser, never the whole user record. */}
                <PartnerForm
                  p={{ name: p.name, companyName: p.companyName, email: p.email, phone: p.phone, constitution: p.constitution, pan: p.pan, gstin: p.gstin, address: p.address, city: p.city, state: p.state, pincode: p.pincode }}
                  emailLocked={u.role !== "ADMIN"}
                />
                <button className="btn-primary">Save changes</button>
              </form>
            </details>
          </div>

          <div className="card">
            <div className="card-h">
              <span>Documents</span>
              <span className="text-xs font-normal text-slate-500">
                {gaps.required.length - gaps.missing.length}/{gaps.required.length} uploaded · {gaps.required.length - gaps.missing.length - gaps.unverified.length} verified
              </span>
            </div>
            <div className="divide-y">
              {lines.map((d) => {
                const doc = current.get(d.type);
                const history = all.filter((x) => x.type === d.type);
                return (
                  <div key={d.type} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800">
                          {d.label} {d.hint && <span className="text-xs font-normal text-slate-400">({d.hint})</span>}
                        </div>
                        {doc ? (
                          <div className="mt-1 text-xs">
                            <a href={`/api/partner-files/${doc.id}?inline=1`} target="_blank" className="text-blue-700 hover:underline">{doc.fileName}</a>
                            <span className="text-slate-400"> · {fmtBytes(doc.size)} · {doc.uploadedByName} · {fmtDate(doc.createdAt, true)}</span>
                            {doc.verifiedByName && <span className="text-slate-400"> · verified by {doc.verifiedByName}</span>}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-400">Not uploaded yet.</div>
                        )}
                      </div>
                      <span className={`badge ${!doc ? "bg-slate-100 text-slate-600" : doc.status === "VERIFIED" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                        {!doc ? "Pending" : doc.status === "VERIFIED" ? "Verified" : "Uploaded · to verify"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form action={A.uploadPartnerDoc} className="flex flex-wrap items-center gap-2">
                        <Pid />
                        <input type="file" name={`doc_${d.type}`} accept={PARTNER_DOC_ACCEPT} required className="max-w-[220px] text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
                        <button className="btn-secondary py-1 text-xs">{doc ? "Replace" : "Upload"}</button>
                      </form>
                      {doc && doc.status !== "VERIFIED" && (
                        <form action={A.verifyPartnerDoc}>
                          <Pid />
                          <input type="hidden" name="docId" value={doc.id} />
                          <button className="btn-success py-1 text-xs">Verify</button>
                        </form>
                      )}
                      {history.length > 1 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-500 hover:underline">History ({history.length})</summary>
                          <ul className="mt-1 space-y-0.5">
                            {history.map((h) => (
                              <li key={h.id}><a href={`/api/partner-files/${h.id}`} className="text-blue-700 hover:underline">{h.fileName}</a> · {h.uploadedByName} · {fmtDate(h.createdAt, true)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="card-h">{p.status === "PENDING" ? "Review application" : "Account"}</div>
            <div className="card-b space-y-5">
              {p.status === "PENDING" && (
                <>
                  <ul className="space-y-1 text-sm">
                    <li className={gaps.missing.length ? "text-amber-700" : "text-emerald-700"}>
                      {gaps.missing.length ? `Missing: ${gaps.missing.map((d) => d.label).join(", ")}` : "All required documents uploaded"}
                    </li>
                    {!gaps.missing.length && (
                      <li className={gaps.unverified.length ? "text-amber-700" : "text-emerald-700"}>
                        {gaps.unverified.length ? `To verify: ${gaps.unverified.map((d) => d.label).join(", ")}` : "All documents verified"}
                      </li>
                    )}
                  </ul>
                  {selfCreated ? (
                    <p className="text-sm text-slate-600">You created this account, so an Admin or another RM has to approve it.</p>
                  ) : (
                    <form action={A.approvePartner} className="space-y-2">
                      <Pid />
                      <Field label="Approve"><input name="remark" className="input" placeholder="Remark (optional)" /></Field>
                      <button className="btn-success w-full" disabled={!ready}>Approve &amp; send login details</button>
                      <p className="text-xs text-slate-500">
                        {ready ? "Creates the partner's User ID and a temporary password and emails them to the partner." : "Available once every required document is uploaded and verified."}
                      </p>
                    </form>
                  )}
                  <form action={A.rejectPartner} className="space-y-2 border-t pt-4">
                    <Pid />
                    <Field label="Reject"><textarea name="reason" rows={2} className="input" placeholder="Reason (emailed to the partner)" required /></Field>
                    <button className="btn-danger w-full">Reject application</button>
                  </form>
                </>
              )}
              {p.status === "REJECTED" && (
                <>
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    Rejected by {p.reviewedByName ?? "—"} on {fmtDate(p.reviewedAt)}.<br />Reason: {p.reviewRemark ?? "—"}
                  </div>
                  <form action={A.reopenPartner} className="space-y-2">
                    <Pid />
                    <button className="btn-secondary w-full">Reopen for review</button>
                    <p className="text-xs text-slate-500">Use this after correcting the details or documents. The application returns to the pending queue.</p>
                  </form>
                </>
              )}
              {(p.status === "ACTIVE" || p.status === "DISABLED") && (
                <>
                  <dl className="space-y-2 text-sm">
                    <div><dt className="text-xs text-slate-500">User ID</dt><dd className="font-mono font-medium">{p.partnerCode ?? "— (signs in with email)"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Approved</dt><dd className="font-medium">{p.reviewedAt ? `${fmtDate(p.reviewedAt)} by ${p.reviewedByName ?? "—"}` : "—"}</dd></div>
                    {p.reviewRemark && <div><dt className="text-xs text-slate-500">Remark</dt><dd>{p.reviewRemark}</dd></div>}
                    <div><dt className="text-xs text-slate-500">Last sign-in</dt><dd className="font-medium">{p.lastLoginAt ? fmtDate(p.lastLoginAt, true) : "Never"}</dd></div>
                  </dl>
                  {p.status === "ACTIVE" && (
                    <form action={A.resendPartnerCredentials} className="space-y-1 border-t pt-4">
                      <Pid />
                      <button className="btn-secondary w-full">Send new login details</button>
                      <p className="text-xs text-slate-500">Emails the User ID with a new temporary password. The current password stops working.</p>
                    </form>
                  )}
                  <form action={A.setPartnerActive}>
                    <Pid />
                    <input type="hidden" name="active" value={p.status === "ACTIVE" ? "0" : "1"} />
                    <button className={`${p.status === "ACTIVE" ? "btn-danger" : "btn-success"} w-full`}>{p.status === "ACTIVE" ? "Disable login" : "Enable login"}</button>
                  </form>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">Activity</div>
            {logs.length === 0 ? <div className="p-4 text-xs text-slate-500">No activity yet.</div> : (
              <ul className="max-h-[420px] space-y-3 overflow-y-auto p-4 text-xs">
                {logs.map((l) => (
                  <li key={l.id}>
                    <div className="text-slate-800"><span className="font-medium">{l.actorName}</span> · {l.action.replace(/^PARTNER_/, "").replace(/_/g, " ").toLowerCase()}</div>
                    {l.detail && l.detail !== p.email && <div className="text-slate-600">{l.detail.replace(`${p.email} · `, "")}</div>}
                    <div className="text-slate-400">{fmtDate(l.createdAt, true)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
