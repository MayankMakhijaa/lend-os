/** Builds the fully-populated "provik" demo workspace (used by the seed script and the platform console). */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { provisionTenant } from "./provision";
import { saveFile } from "./storage";
import { STATUS } from "./constants";

const DEMO_PASSWORD = "Demo@1234";
const day = 864e5;
const ago = (d: number) => new Date(Date.now() - d * day);

function tinyPdf(text: string) {
  const body = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out);
}

export async function seedDemo(db: PrismaClient, slug = "provik") {

  const { tenant, admin } = await provisionTenant(db, {
    name: "Provik Fintech Solutions",
    slug,
    brandColor: "#0f4c81",
    admin: { name: "Anil Verma", email: "admin@provik.demo", password: DEMO_PASSWORD, phone: "+919800000001" },
  });
  const T = tenant.id;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mk = (role: string, name: string, email: string, extra: Record<string, unknown> = {}) =>
    db.user.create({ data: { tenantId: T, role, name, email, passwordHash: hash, ...extra } });

  const rm1 = await mk("RM", "Riya Sharma", "rm@provik.demo", { phone: "+919800000002" });
  const rm2 = await mk("RM", "Arjun Mehta", "rm2@provik.demo");
  const dsa1 = await mk("DSA", "Vikram Kapoor", "dsa@provik.demo", { companyName: "Kapoor Finserv", phone: "+919800000003" });
  const dsa2 = await mk("DSA", "Neha Shah", "dsa2@provik.demo", { companyName: "Shah Loan Associates" });
  await mk("DSA", "Rohit Gupta", "dsa3@provik.demo", { companyName: "Gupta Capital Advisors", status: "PENDING" });

  const products = Object.fromEntries((await db.product.findMany({ where: { tenantId: T } })).map((p) => [p.code, p]));
  const lenderDefs = [["Meridian Bank", "Bank"], ["Northstar Finance", "NBFC"], ["Kaveri Capital", "NBFC"], ["Unity Small Finance Bank", "Bank"]];
  const lenders: Record<string, { id: string; name: string }> = {};
  for (const [name, type] of lenderDefs) {
    const l = await db.lender.create({ data: { tenantId: T, name, type, contactEmail: `credit@${name.split(" ")[0].toLowerCase()}.demo` } });
    await db.lenderProduct.createMany({ data: Object.values(products).map((p) => ({ lenderId: l.id, productId: p.id })) });
    lenders[name.split(" ")[0]] = l;
  }
  await mk("LENDER", "Meera Iyer", "lender@meridian.demo", { lenderId: lenders.Meridian.id });
  const nsUser = await mk("LENDER", "Sanjay Rao", "lender@northstar.demo", { lenderId: lenders.Northstar.id });
  await mk("LENDER", "Farah Khan", "lender@kaveri.demo", { lenderId: lenders.Kaveri.id });
  await db.checklistItem.create({
    data: { tenantId: T, productId: products.PID.id, lenderId: lenders.Meridian.id, category: "Meridian Bank", title: "Meridian invoice-discounting application form (bank format)", mandatory: true, sortOrder: 0 },
  });

  const checklist = await db.checklistItem.findMany({ where: { tenantId: T, lenderId: null }, orderBy: { sortOrder: "asc" } });
  const pathTo = (target: string): string[] => {
    const order = [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.RM_ASSIGNED, STATUS.FEASIBLE, STATUS.DOCS_PENDING, STATUS.DOCS_COMPLETE, STATUS.PD_SCHEDULED, STATUS.PD_COMPLETED, STATUS.IPA_DONE, STATUS.SENT_TO_LENDERS, STATUS.SANCTIONED, STATUS.DISBURSED, STATUS.PAYOUT_RELEASED];
    return order.slice(0, order.indexOf(target as never) + 1);
  };
  let n = 0;

  async function proposal(o: {
    company: string; product: string; dsa: typeof dsa1; rm?: typeof rm1; status: string; startedDaysAgo: number; amount: number;
    constitution: string; city: string; uploaded?: number; lenderStates?: [string, string, number?][]; disbursed?: number; payout?: number;
  }) {
    n++;
    const path = pathTo(o.status);
    const step = o.startedDaysAgo / Math.max(path.length, 1);
    const p = await db.proposal.create({
      data: {
        tenantId: T, refNo: `PROV-${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(n).padStart(4, "0")}`,
        dsaId: o.dsa.id, rmId: o.rm?.id, productId: products[o.product].id, companyName: o.company, constitution: o.constitution, city: o.city,
        pan: `AAB${o.company.slice(0, 2).toUpperCase()}${1000 + n}K`, loanAmount: o.amount, turnover: o.amount * 8,
        contactName: "Promoter", contactPhone: "+9198" + String(10000000 + n * 1111), purpose: "Working capital",
        status: o.status, statusChangedAt: ago(o.startedDaysAgo - step * (path.length - 1)), createdAt: ago(o.startedDaysAgo),
        submittedAt: path.length > 1 ? ago(o.startedDaysAgo - step) : null,
        feasibilityRemark: path.includes(STATUS.FEASIBLE) ? "Vintage 6+ yrs, healthy GST trend. Feasible." : null,
        ipaRemark: path.includes(STATUS.IPA_DONE) ? "DSCR 1.6x, clean banking. Approved in-principle." : null,
        disbursedAmount: o.disbursed ?? null, disbursedAt: o.disbursed ? ago(3) : null,
        disbursedLenderId: o.disbursed ? lenders.Kaveri.id : null,
        payoutAmount: o.payout ?? null, payoutAt: o.payout ? ago(1) : null, payoutRef: o.payout ? "UTR4482910" : null,
      },
    });
    for (let i = 0; i < path.length; i++)
      await db.statusEvent.create({ data: { proposalId: p.id, status: path[i], at: ago(o.startedDaysAgo - step * i) } });
    await db.auditLog.createMany({
      data: path.map((s, i) => ({ tenantId: T, proposalId: p.id, actorName: i < 2 ? o.dsa.name : o.rm?.name ?? admin.name, actorRole: i < 2 ? "DSA" : "RM", action: "STATUS_CHANGED", detail: `→ ${s}`, createdAt: ago(o.startedDaysAgo - step * i) })),
    });
    if (path.includes(STATUS.FEASIBLE)) {
      const upto = o.uploaded ?? checklist.length;
      for (const [i, c] of checklist.entries()) {
        const d = await db.proposalDocument.create({
          data: { tenantId: T, proposalId: p.id, checklistItemId: c.id, category: c.category, title: c.title, description: c.description, mandatory: c.mandatory, sortOrder: c.sortOrder, status: i < upto ? (path.includes(STATUS.PD_COMPLETED) ? "VERIFIED" : "UPLOADED") : "PENDING" },
        });
        if (i < upto) {
          const buf = tinyPdf(`${o.company} - ${c.title}`);
          await db.documentVersion.create({
            data: { documentId: d.id, version: 1, fileName: `${c.title.slice(0, 40).replace(/[^\w]+/g, "_")}.pdf`, storedName: await saveFile(T, buf), mimeType: "application/pdf", size: buf.length, uploadedById: o.dsa.id, uploadedByName: o.dsa.name, createdAt: ago(o.startedDaysAgo - 1) },
          });
        }
      }
    }
    for (const [lk, st, amt] of o.lenderStates ?? []) {
      await db.lenderAssignment.create({ data: { tenantId: T, proposalId: p.id, lenderId: lenders[lk].id, status: st, sanctionAmount: amt ?? null, sanctionRoi: amt ? "11.25% p.a." : null, sentAt: ago(4) } });
    }
    return p;
  }

  await proposal({ company: "Sunrise Textiles", product: "PID", dsa: dsa1, status: STATUS.DRAFT, startedDaysAgo: 0.2, amount: 7500000, constitution: "Partnership", city: "Surat" });
  await proposal({ company: "Om Agro Foods", product: "BL", dsa: dsa2, status: STATUS.SUBMITTED, startedDaysAgo: 2, amount: 2500000, constitution: "Proprietorship", city: "Indore" });
  await proposal({ company: "Bluewave Logistics", product: "SID", dsa: dsa1, rm: rm1, status: STATUS.RM_ASSIGNED, startedDaysAgo: 0.5, amount: 12000000, constitution: "Private Limited", city: "Mumbai" });
  const k = await proposal({ company: "Kalpana Pharma", product: "TL", dsa: dsa1, rm: rm1, status: STATUS.DOCS_PENDING, startedDaysAgo: 3, amount: 30000000, constitution: "Private Limited", city: "Ahmedabad", uploaded: 9 });
  const gst = await db.proposalDocument.findFirst({ where: { proposalId: k.id, title: "GST Registration Certificate" } });
  await db.proposalDocument.update({ where: { id: gst!.id }, data: { status: "QUERY" } });
  await db.query.create({ data: { tenantId: T, proposalId: k.id, documentId: gst!.id, raisedById: rm1.id, raisedByName: rm1.name, raisedByRole: "RM", message: "GST certificate uploaded is for the old address. Please share the amended certificate." } });
  await proposal({ company: "Metro Auto Parts", product: "DF", dsa: dsa2, rm: rm2, status: STATUS.PD_COMPLETED, startedDaysAgo: 6, amount: 5000000, constitution: "LLP", city: "Pune" });
  const g = await proposal({ company: "Greenleaf Packaging", product: "PID", dsa: dsa1, rm: rm1, status: STATUS.SENT_TO_LENDERS, startedDaysAgo: 9, amount: 15000000, constitution: "Private Limited", city: "Delhi", lenderStates: [["Meridian", "UNDER_REVIEW"], ["Northstar", "QUERY"]] });
  await db.query.create({ data: { tenantId: T, proposalId: g.id, lenderId: lenders.Northstar.id, raisedById: nsUser.id, raisedByName: nsUser.name, raisedByRole: "LENDER", message: "Please share the top 10 debtor ledger for the last 6 months." } });
  await proposal({ company: "Apex Electricals", product: "VF", dsa: dsa2, rm: rm2, status: STATUS.DISBURSED, startedDaysAgo: 16, amount: 8000000, constitution: "Private Limited", city: "Chennai", lenderStates: [["Kaveri", "SANCTIONED", 7500000], ["Unity", "REJECTED"]], disbursed: 7500000 });
  await proposal({ company: "Shree Ganesh Traders", product: "FACT", dsa: dsa1, rm: rm1, status: STATUS.PAYOUT_RELEASED, startedDaysAgo: 28, amount: 4000000, constitution: "Proprietorship", city: "Jaipur", lenderStates: [["Kaveri", "SANCTIONED", 4000000]], disbursed: 4000000, payout: 40000 });

  console.log(`\nDemo workspace "provik" ready. Password for all demo users: ${DEMO_PASSWORD}`);
  console.log("  Admin   admin@provik.demo\n  RM      rm@provik.demo, rm2@provik.demo\n  DSA     dsa@provik.demo, dsa2@provik.demo (dsa3 is pending approval)\n  Lender  lender@meridian.demo, lender@northstar.demo, lender@kaveri.demo");
}
