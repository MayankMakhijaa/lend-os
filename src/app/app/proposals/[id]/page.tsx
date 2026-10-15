import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { docVisibility, getScopedProposal, queryVisibility } from "@/lib/access";
import { CLOSED_STATUSES, LENDER_STATUS, LENDER_STATUS_LABEL, ROLE_LABEL, STATUS, STATUS_LINE } from "@/lib/constants";
import { fmtBytes, fmtDate, fmtINR } from "@/lib/format";
import { tatFor } from "@/lib/tat";
import { DocBadge, Empty, Field, Flash, LenderBadge, StatusBadge } from "@/components/ui";
import { TatPill } from "@/components/TatPill";
import { ProposalFields } from "@/components/ProposalForm";
import * as A from "../actions";

const Hidden = ({ id }: { id: string }) => <input type="hidden" name="proposalId" value={id} />;

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  await getScopedProposal(u, id); // 404 if outside the caller's scope

  const p = await db.proposal.findUniqueOrThrow({
    where: { id },
    include: {
      product: true,
      dsa: true,
      rm: true,
      documents: { where: docVisibility(u), orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { versions: { orderBy: { version: "desc" } } } },
      queries: { where: queryVisibility(u), orderBy: { createdAt: "desc" }, include: { document: true } },
      pdCalls: { orderBy: { scheduledAt: "desc" } },
      assignments: { where: u.role === "LENDER" ? { lenderId: u.lenderId ?? "" } : {}, include: { lender: true }, orderBy: { sentAt: "asc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  const tats = await db.tatSetting.findMany({ where: { tenantId: u.tenantId } });
  const tat = p.status === STATUS.DRAFT || CLOSED_STATUSES.includes(p.status as never) ? null : tatFor(p, tats);

  const staff = u.role === "RM" || u.role === "ADMIN";
  const isDsa = u.role === "DSA";
  const isLender = u.role === "LENDER";
  const closed = CLOSED_STATUSES.includes(p.status as never);
  const canUpload = (isDsa || staff) && !closed && p.status !== STATUS.DRAFT && p.documents.length > 0;

  const rms = u.role === "ADMIN" ? await db.user.findMany({ where: { tenantId: u.tenantId, role: "RM", status: "ACTIVE" }, orderBy: { name: "asc" } }) : [];
  const sentIds = new Set(p.assignments.map((a) => a.lenderId));
  let panel: { id: string; name: string; type: string }[] = [];
  if (staff) {
    const linked = await db.lender.findMany({ where: { tenantId: u.tenantId, active: true, products: { some: { productId: p.productId } } }, orderBy: { name: "asc" } });
    panel = linked.length ? linked : await db.lender.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { name: "asc" } });
  }
  const sanctioned = p.assignments.filter((a) => a.status === LENDER_STATUS.SANCTIONED);
  const lineIdx = STATUS_LINE.findIndex((s) => s.statuses.includes(p.status));
  const categories = [...new Set(p.documents.map((d) => d.category))];
  const docsDone = p.documents.filter((d) => d.status !== "PENDING").length;
  const openQueries = p.queries.filter((q) => q.status === "OPEN").length;

  return (
    <div>
      <Flash sp={sp} />
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-500">{p.refNo} · {p.product.name}</div>
          <h1 className="h1 mt-0.5">{p.companyName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={p.status} />
            {tat && <TatPill tat={tat} />}
            {tat && <span className="text-xs text-slate-500">{tat.label} · due {fmtDate(tat.due, true)}</span>}
          </div>
        </div>
        <div className="text-right text-sm text-slate-600">
          {!isLender && <div>DSA: <span className="font-medium">{p.dsa.companyName ? `${p.dsa.companyName} (${p.dsa.name})` : p.dsa.name}</span></div>}
          <div>RM: <span className="font-medium">{p.rm?.name ?? "Unassigned"}</span>{p.rm?.phone && isLender ? ` · ${p.rm.phone}` : ""}</div>
          <div className="text-xs text-slate-400">Created {fmtDate(p.createdAt)}</div>
        </div>
      </div>

      {/* Status line */}
      {!closed || p.status === STATUS.PAYOUT_RELEASED ? (
        <ol className="card mb-6 flex overflow-x-auto p-3 text-xs">
          {STATUS_LINE.map((s, i) => (
            <li key={s.label} className="flex min-w-[92px] flex-1 flex-col items-center gap-1 text-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                i < lineIdx || p.status === STATUS.PAYOUT_RELEASED ? "bg-emerald-500 text-white" : i === lineIdx ? "text-white" : "bg-slate-200 text-slate-500"}`}
                style={i === lineIdx && p.status !== STATUS.PAYOUT_RELEASED ? { background: "var(--brand)" } : undefined}>{i + 1}</span>
              <span className={i === lineIdx ? "font-semibold text-slate-800" : "text-slate-500"}>{s.label}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This case is closed.{p.closedReason ? ` Reason: ${p.closedReason}` : ""}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Draft editing */}
          {p.status === STATUS.DRAFT && !isLender && (
            <form action={A.updateDraft} className="card">
              <div className="card-h">Draft · complete and submit</div>
              <div className="card-b space-y-4">
                <Hidden id={p.id} />
                <ProposalFields p={p} />
                <div className="flex gap-2">
                  <button name="intent" value="submit" className="btn-primary">Submit proposal</button>
                  <button name="intent" value="save" className="btn-secondary">Save draft</button>
                </div>
              </div>
            </form>
          )}

          {/* Basic details */}
          {p.status !== STATUS.DRAFT && (
            <div className="card">
              <div className="card-h">Proposal details</div>
              <dl className="card-b grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  ["Constitution", p.constitution], ["City", p.city], ["Loan amount", fmtINR(p.loanAmount)],
                  ["PAN", p.pan], ["GSTIN", p.gstin], ["Turnover", fmtINR(p.turnover)],
                  ["Contact", p.contactName], ["Mobile", p.contactPhone], ["Email", p.contactEmail],
                  ["Purpose", p.purpose], ["Feasibility remark", p.feasibilityRemark], ["IPA remark", p.ipaRemark],
                ].map(([k, v]) => (
                  <div key={k as string}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v || "—"}</dd></div>
                ))}
                {p.notes && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{p.notes}</dd></div>}
                {p.disbursedAmount != null && <div><dt className="text-xs text-slate-500">Disbursed</dt><dd className="font-medium">{fmtINR(p.disbursedAmount)} on {fmtDate(p.disbursedAt)}</dd></div>}
                {p.payoutAmount != null && !isLender && <div><dt className="text-xs text-slate-500">DSA payout</dt><dd className="font-medium">{fmtINR(p.payoutAmount)} on {fmtDate(p.payoutAt)}{p.payoutRef ? ` · ${p.payoutRef}` : ""}</dd></div>}
              </dl>
            </div>
          )}

          {/* Documents */}
          {p.documents.length > 0 && (
            <div className="card">
              <div className="card-h">
                <span>Document checklist</span>
                <span className="text-xs font-normal text-slate-500">{docsDone}/{p.documents.length} received</span>
              </div>
              <div className="divide-y">
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</div>
                    {p.documents.filter((d) => d.category === cat).map((d) => {
                      const latest = d.versions[0];
                      const docQueries = p.queries.filter((q) => q.documentId === d.id && q.status === "OPEN");
                      return (
                        <div key={d.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-800">
                                {d.title} {!d.mandatory && <span className="text-xs font-normal text-slate-400">(if applicable)</span>}
                              </div>
                              {d.description && <div className="mt-0.5 text-xs text-slate-500">{d.description}</div>}
                              {latest && (
                                <div className="mt-1 text-xs">
                                  <a href={`/api/files/${latest.id}?inline=1`} target="_blank" className="text-blue-700 hover:underline">{latest.fileName}</a>
                                  <span className="text-slate-400"> · v{latest.version} · {fmtBytes(latest.size)} · {latest.uploadedByName} · {fmtDate(latest.createdAt, true)}</span>
                                </div>
                              )}
                              {docQueries.map((q) => (
                                <div key={q.id} className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Query by {q.raisedByName}: {q.message}</div>
                              ))}
                            </div>
                            <DocBadge status={d.status} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {canUpload && (
                              <form action={A.uploadDocument} className="flex flex-wrap items-center gap-2">
                                <Hidden id={p.id} />
                                <input type="hidden" name="documentId" value={d.id} />
                                <input type="file" name="file" multiple required className="max-w-[220px] text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
                                <button className="btn-secondary py-1 text-xs">{latest ? "Re-upload" : "Upload"}</button>
                              </form>
                            )}
                            {staff && (d.status === "UPLOADED" || d.status === "REUPLOADED") && (
                              <form action={A.verifyDocument}>
                                <Hidden id={p.id} />
                                <input type="hidden" name="documentId" value={d.id} />
                                <button className="btn-success py-1 text-xs">Verify</button>
                              </form>
                            )}
                            {(staff || isLender) && !closed && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-amber-700 hover:underline">Raise query</summary>
                                <form action={A.raiseQuery} className="mt-2 flex gap-2">
                                  <Hidden id={p.id} />
                                  <input type="hidden" name="documentId" value={d.id} />
                                  <input name="message" className="input py-1 text-xs" placeholder="What's wrong or missing?" required />
                                  <button className="btn-secondary py-1 text-xs">Send</button>
                                </form>
                              </details>
                            )}
                            {d.versions.length > 1 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-slate-500 hover:underline">History ({d.versions.length})</summary>
                                <ul className="mt-1 space-y-0.5">
                                  {d.versions.map((v) => (
                                    <li key={v.id}>
                                      v{v.version} · <a href={`/api/files/${v.id}`} className="text-blue-700 hover:underline">{v.fileName}</a> · {v.uploadedByName} · {fmtDate(v.createdAt, true)}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queries */}
          {(p.queries.length > 0 || ((staff || isLender) && !closed && p.status !== STATUS.DRAFT)) && (
            <div className="card">
              <div className="card-h"><span>Queries</span><span className="text-xs font-normal text-slate-500">{openQueries} open</span></div>
              {(staff || isLender) && !closed && p.status !== STATUS.DRAFT && (
                <form action={A.raiseQuery} className="flex gap-2 border-b p-4">
                  <Hidden id={p.id} />
                  <input name="message" className="input" placeholder="Raise a general query on this proposal…" required />
                  <button className="btn-secondary whitespace-nowrap">Raise query</button>
                </form>
              )}
              {p.queries.length === 0 ? <Empty>No queries yet.</Empty> : (
                <ul className="divide-y">
                  {p.queries.map((q) => (
                    <li key={q.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-500">
                          {q.raisedByName} ({q.lenderId ? "Lender" : ROLE_LABEL[q.raisedByRole]}) · {fmtDate(q.createdAt, true)}
                          {q.document && <> · on <span className="font-medium text-slate-700">{q.document.title}</span></>}
                        </div>
                        <span className={`badge ${q.status === "OPEN" ? "bg-amber-100 text-amber-800" : q.status === "RESPONDED" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{q.status === "RESPONDED" ? "Responded" : q.status === "OPEN" ? "Open" : "Closed"}</span>
                      </div>
                      <div className="mt-1 text-slate-800">{q.message}</div>
                      {q.response && <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-slate-700"><span className="text-xs text-slate-500">{q.respondedByName}:</span> {q.response}</div>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {q.status !== "CLOSED" && (isDsa || staff) && (
                          <form action={A.respondQuery} className="flex flex-1 gap-2">
                            <Hidden id={p.id} />
                            <input type="hidden" name="queryId" value={q.id} />
                            <input name="response" className="input py-1 text-xs" placeholder={q.documentId ? "Reply (or re-upload the document above)" : "Reply"} required />
                            <button className="btn-secondary py-1 text-xs">Reply</button>
                          </form>
                        )}
                        {q.status !== "CLOSED" && ((staff && !q.lenderId) || (staff && q.lenderId) || (isLender && q.lenderId === u.lenderId)) && (
                          <form action={A.closeQuery}>
                            <Hidden id={p.id} />
                            <input type="hidden" name="queryId" value={q.id} />
                            <button className="btn-secondary py-1 text-xs">Close query</button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Lender tracker */}
          {p.assignments.length > 0 && (
            <div className="card">
              <div className="card-h">{isLender ? "Your decision" : "Lender tracker"}</div>
              <ul className="divide-y">
                {p.assignments.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{a.lender.name} <span className="text-xs font-normal text-slate-400">{a.lender.type} · sent {fmtDate(a.sentAt)}</span></div>
                      <LenderBadge status={a.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {a.sanctionAmount != null && <>Sanctioned {fmtINR(a.sanctionAmount)}{a.sanctionRoi ? ` @ ${a.sanctionRoi}` : ""} · </>}
                      {a.sanctionVersionId && <><a className="text-blue-700 hover:underline" href={`/api/files/${a.sanctionVersionId}?inline=1`} target="_blank">Sanction letter</a> · </>}
                      {a.remarks && <>Remarks: {a.remarks} · </>}Updated {fmtDate(a.updatedAt, true)}
                    </div>
                    {(staff || (isLender && a.lenderId === u.lenderId)) && !closed && p.status !== STATUS.DISBURSED && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-blue-700 hover:underline">Update status</summary>
                        <form action={A.updateLenderStatus} className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Hidden id={p.id} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <Field label="Status">
                            <select name="status" defaultValue={a.status} className="input">
                              {Object.values(LENDER_STATUS).filter((s) => staff || s !== "WITHDRAWN").map((s) => <option key={s} value={s}>{LENDER_STATUS_LABEL[s]}</option>)}
                            </select>
                          </Field>
                          <Field label="Remarks"><input name="remarks" className="input" /></Field>
                          <Field label="Sanction amount (₹)"><input name="sanctionAmount" className="input" inputMode="numeric" defaultValue={a.sanctionAmount ?? ""} /></Field>
                          <Field label="Rate / pricing"><input name="sanctionRoi" className="input" defaultValue={a.sanctionRoi ?? ""} placeholder="e.g. 11.5% p.a." /></Field>
                          <Field label="Sanction letter (required for Sanctioned)" className="sm:col-span-2"><input type="file" name="sanctionLetter" className="text-xs" /></Field>
                          <div><button className="btn-primary">Save</button></div>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PD calls */}
          {p.pdCalls.length > 0 && !isLender && (
            <div className="card">
              <div className="card-h">PD call log</div>
              <ul className="divide-y">
                {p.pdCalls.map((c) => (
                  <li key={c.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between">
                      <span>{fmtDate(c.scheduledAt, true)}{c.attendees ? ` · ${c.attendees}` : ""}</span>
                      <span className={`badge ${c.completedAt ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{c.completedAt ? "Completed" : "Scheduled"}</span>
                    </div>
                    {c.notes && <div className="mt-1 whitespace-pre-wrap text-slate-700">{c.notes}</div>}
                    {!c.completedAt && staff && (
                      <form action={A.completePd} className="mt-2 flex gap-2">
                        <Hidden id={p.id} />
                        <input type="hidden" name="pdCallId" value={c.id} />
                        <input name="notes" className="input py-1 text-xs" placeholder="PD call notes / observations" />
                        <button className="btn-success py-1 text-xs">Mark completed</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right column: next actions + timeline */}
        <div className="space-y-6">
          <NextActions />
          {!isLender && (
            <div className="card">
              <div className="card-h">Activity</div>
              <ul className="max-h-[480px] space-y-3 overflow-y-auto p-4 text-xs">
                {p.auditLogs.map((l) => (
                  <li key={l.id}>
                    <div className="text-slate-800"><span className="font-medium">{l.actorName}</span> · {l.action.replace(/_/g, " ").toLowerCase()}</div>
                    {l.detail && <div className="text-slate-600">{l.detail}</div>}
                    <div className="text-slate-400">{fmtDate(l.createdAt, true)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function NextActions() {
    const blocks: React.ReactNode[] = [];
    if (u.role === "ADMIN" && p.status !== STATUS.DRAFT && !closed) {
      blocks.push(
        <form key="rm" action={A.assignRm} className="space-y-2">
          <Hidden id={p.id} />
          <Field label={p.rmId ? "Reassign RM" : "Assign RM (step 2)"}>
            <select name="rmId" defaultValue={p.rmId ?? ""} className="input" required>
              <option value="" disabled>Select RM</option>
              {rms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <button className="btn-primary w-full">{p.rmId ? "Reassign" : "Assign"}</button>
        </form>,
      );
    }
    if (staff && p.status === STATUS.RM_ASSIGNED) {
      blocks.push(
        <form key="feas" action={A.decideFeasibility} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">Feasibility check (step 3)</div>
          <textarea name="remark" rows={2} className="input" placeholder="Remark (optional)" />
          <div className="flex gap-2">
            <button name="decision" value="feasible" className="btn-success flex-1">Feasible</button>
            <button name="decision" value="not" className="btn-danger flex-1">Not feasible</button>
          </div>
          <p className="text-xs text-slate-500">Feasible shares the {p.product.code} document checklist with the DSA.</p>
        </form>,
      );
    }
    if (staff && ([STATUS.DOCS_COMPLETE, STATUS.QUERY_RAISED, STATUS.QUERY_RESOLVED, STATUS.PD_SCHEDULED] as string[]).includes(p.status)) {
      blocks.push(
        <form key="pd" action={A.schedulePd} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">Schedule PD call</div>
          <input type="datetime-local" name="scheduledAt" className="input" required />
          <input name="attendees" className="input" placeholder="Attendees (client, DSA, RM…)" />
          <button className="btn-secondary w-full">Schedule</button>
        </form>,
      );
    }
    if (staff && p.status === STATUS.PD_COMPLETED) {
      blocks.push(
        <form key="ipa" action={A.approveIpa} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">Credit assessment (step 8)</div>
          <textarea name="remark" rows={3} className="input" placeholder="Assessment summary / conditions" />
          <button className="btn-success w-full">Give in-principle approval</button>
        </form>,
      );
    }
    if (staff && ([STATUS.IPA_DONE, STATUS.SENT_TO_LENDERS, STATUS.ALL_REJECTED, STATUS.SANCTIONED] as string[]).includes(p.status)) {
      const avail = panel.filter((l) => !sentIds.has(l.id));
      blocks.push(
        <form key="lenders" action={A.sendToLenders} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">{p.status === STATUS.IPA_DONE ? "Shortlist lenders & send (step 9)" : "Send to more lenders"}</div>
          {avail.length === 0 ? <p className="text-xs text-slate-500">No other lenders on the {p.product.code} panel.</p> : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
              {avail.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="lenderId" value={l.id} /> {l.name} <span className="text-xs text-slate-400">{l.type}</span></label>
              ))}
            </div>
          )}
          {avail.length > 0 && <button className="btn-primary w-full">Send to selected</button>}
        </form>,
      );
    }
    if (staff && p.status === STATUS.SANCTIONED) {
      blocks.push(
        <form key="disb" action={A.logDisbursement} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">Log disbursement (step 11)</div>
          <select name="lenderId" className="input" required>
            {sanctioned.map((a) => <option key={a.lenderId} value={a.lenderId}>{a.lender.name}</option>)}
          </select>
          <input name="amount" className="input" placeholder="Amount disbursed (₹)" inputMode="numeric" defaultValue={sanctioned[0]?.sanctionAmount ?? ""} required />
          <input type="date" name="date" className="input" />
          <button className="btn-success w-full">Log disbursement</button>
        </form>,
      );
    }
    if (u.role === "ADMIN" && p.status === STATUS.DISBURSED) {
      blocks.push(
        <form key="payout" action={A.releasePayout} className="space-y-2">
          <Hidden id={p.id} />
          <div className="label">Release DSA payout (step 12)</div>
          <input name="amount" className="input" placeholder="Payout amount (₹)" inputMode="numeric" required />
          <input name="reference" className="input" placeholder="UTR / payment reference" />
          <button className="btn-success w-full">Release payout</button>
        </form>,
      );
    }
    if (staff && !closed && !([STATUS.DRAFT, STATUS.DISBURSED] as string[]).includes(p.status)) {
      blocks.push(
        <details key="close" className="text-sm">
          <summary className="cursor-pointer text-red-700 hover:underline">Close this case…</summary>
          <form action={A.closeCase} className="mt-2 space-y-2">
            <Hidden id={p.id} />
            <input name="reason" className="input" placeholder="Reason" required />
            <button className="btn-danger w-full">Close case</button>
          </form>
        </details>,
      );
    }
    let hint: string | null = null;
    if (isDsa) {
      if (p.status === STATUS.SUBMITTED) hint = "Waiting for an RM to be assigned.";
      else if (p.status === STATUS.RM_ASSIGNED) hint = "Your RM is checking feasibility.";
      else if (p.status === STATUS.DOCS_PENDING) hint = "Upload the documents in the checklist. The RM is notified when all mandatory documents are in.";
      else if (openQueries) hint = `You have ${openQueries} open quer${openQueries > 1 ? "ies" : "y"}. Reply or re-upload the document.`;
      else if (p.status === STATUS.SENT_TO_LENDERS) hint = "With lenders. You'll be notified as each lender updates.";
    }
    if (isLender) hint = "Review the documents, raise queries on any line, and update your decision in the panel on the left.";
    if (!blocks.length && !hint) return null;
    return (
      <div className="card">
        <div className="card-h">Next steps</div>
        <div className="card-b space-y-5">
          {hint && <p className="text-sm text-slate-600">{hint}</p>}
          {blocks}
        </div>
      </div>
    );
  }
}
