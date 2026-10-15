export const ROLES = ["ADMIN", "RM", "DSA", "LENDER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  RM: "Relationship Manager",
  DSA: "DSA / Partner",
  LENDER: "Lender",
};

// Top-level proposal status, in lifecycle order.
export const STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  RM_ASSIGNED: "RM_ASSIGNED",
  FEASIBLE: "FEASIBLE",
  NOT_FEASIBLE: "NOT_FEASIBLE",
  DOCS_PENDING: "DOCS_PENDING",
  DOCS_COMPLETE: "DOCS_COMPLETE",
  QUERY_RAISED: "QUERY_RAISED",
  QUERY_RESOLVED: "QUERY_RESOLVED",
  PD_SCHEDULED: "PD_SCHEDULED",
  PD_COMPLETED: "PD_COMPLETED",
  IPA_DONE: "IPA_DONE",
  SENT_TO_LENDERS: "SENT_TO_LENDERS",
  SANCTIONED: "SANCTIONED",
  ALL_REJECTED: "ALL_REJECTED",
  DISBURSED: "DISBURSED",
  PAYOUT_RELEASED: "PAYOUT_RELEASED",
} as const;

export const STATUS_ORDER: string[] = Object.values(STATUS);

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RM_ASSIGNED: "RM Assigned · Feasibility Pending",
  FEASIBLE: "Feasible · Checklist Shared",
  NOT_FEASIBLE: "Not Feasible · Closed",
  DOCS_PENDING: "Documents Pending",
  DOCS_COMPLETE: "Documents Complete",
  QUERY_RAISED: "Query Raised",
  QUERY_RESOLVED: "Query Resolved",
  PD_SCHEDULED: "PD Call Scheduled",
  PD_COMPLETED: "PD Call Completed",
  IPA_DONE: "In-Principle Approval Done",
  SENT_TO_LENDERS: "Sent to Lender(s)",
  SANCTIONED: "Sanctioned",
  ALL_REJECTED: "All Lenders Rejected · Closed",
  DISBURSED: "Disbursed",
  PAYOUT_RELEASED: "Payout Released · Complete",
};

export const CLOSED_STATUSES = [STATUS.NOT_FEASIBLE, STATUS.ALL_REJECTED, STATUS.PAYOUT_RELEASED];

// The simplified status line shown on proposal pages (from the client spec).
export const STATUS_LINE: { label: string; statuses: string[] }[] = [
  { label: "Submitted", statuses: ["SUBMITTED"] },
  { label: "RM Assigned", statuses: ["RM_ASSIGNED"] },
  { label: "Feasibility", statuses: ["FEASIBLE"] },
  { label: "Docs Pending", statuses: ["DOCS_PENDING"] },
  { label: "Docs Complete", statuses: ["DOCS_COMPLETE"] },
  { label: "Query / PD", statuses: ["QUERY_RAISED", "QUERY_RESOLVED", "PD_SCHEDULED", "PD_COMPLETED"] },
  { label: "Approved Internally", statuses: ["IPA_DONE"] },
  { label: "Sent to Lenders", statuses: ["SENT_TO_LENDERS"] },
  { label: "Sanctioned", statuses: ["SANCTIONED"] },
  { label: "Disbursed", statuses: ["DISBURSED"] },
  { label: "Payout Complete", statuses: ["PAYOUT_RELEASED"] },
];

export function statusTone(s: string): string {
  if (s === "DRAFT") return "bg-slate-100 text-slate-600";
  if (s === "NOT_FEASIBLE" || s === "ALL_REJECTED") return "bg-red-100 text-red-700";
  if (s === "QUERY_RAISED") return "bg-amber-100 text-amber-800";
  if (s === "SANCTIONED" || s === "DISBURSED" || s === "PAYOUT_RELEASED") return "bg-emerald-100 text-emerald-700";
  if (s === "SENT_TO_LENDERS" || s === "IPA_DONE") return "bg-indigo-100 text-indigo-700";
  return "bg-blue-100 text-blue-700";
}

// Per-lender sub-status
export const LENDER_STATUS = {
  SENT: "SENT",
  UNDER_REVIEW: "UNDER_REVIEW",
  QUERY: "QUERY",
  CREDIT_ASSESSMENT: "CREDIT_ASSESSMENT",
  IPA: "IPA",
  SANCTIONED: "SANCTIONED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export const LENDER_STATUS_LABEL: Record<string, string> = {
  SENT: "Sent",
  UNDER_REVIEW: "Under Review",
  QUERY: "Query Raised by Lender",
  CREDIT_ASSESSMENT: "Credit Assessment",
  IPA: "In-Principle Approval",
  SANCTIONED: "Sanction Letter Issued",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

// Rank used to derive the proposal's top-level status from its best lender.
export const LENDER_STATUS_RANK: Record<string, number> = {
  REJECTED: -1,
  WITHDRAWN: -1,
  SENT: 1,
  UNDER_REVIEW: 2,
  QUERY: 3,
  CREDIT_ASSESSMENT: 4,
  IPA: 5,
  SANCTIONED: 6,
};

export function lenderTone(s: string): string {
  if (s === "SANCTIONED") return "bg-emerald-100 text-emerald-700";
  if (s === "REJECTED" || s === "WITHDRAWN") return "bg-red-100 text-red-700";
  if (s === "QUERY") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-700";
}

export const DOC_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  UPLOADED: "Uploaded",
  QUERY: "Query Raised",
  REUPLOADED: "Re-uploaded · pending re-verification",
  VERIFIED: "Verified",
};

export function docTone(s: string): string {
  if (s === "PENDING") return "bg-slate-100 text-slate-600";
  if (s === "QUERY") return "bg-amber-100 text-amber-800";
  if (s === "VERIFIED") return "bg-emerald-100 text-emerald-700";
  return "bg-blue-100 text-blue-700";
}

export const CONSTITUTIONS = ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other"];

// ---- Defaults used to provision a new tenant ----

export const DEFAULT_PRODUCTS: { code: string; name: string }[] = [
  { code: "PID", name: "Purchase Invoice Discounting" },
  { code: "SID", name: "Sales Invoice Discounting" },
  { code: "BL", name: "Business Loan" },
  { code: "VF", name: "Vendor Financing" },
  { code: "DF", name: "Dealer Financing" },
  { code: "FF", name: "Franchisee Financing" },
  { code: "TL", name: "Term Loan" },
  { code: "DL", name: "Demand Loan" },
  { code: "FACT", name: "Factoring" },
];

// TAT keys map to the status a proposal is waiting in (see src/lib/tat.ts).
export const DEFAULT_TATS: { key: string; label: string; days: number }[] = [
  { key: "assign_rm", label: "Brief shared with RM (RM assignment)", days: 0 },
  { key: "feasibility", label: "Feasibility check", days: 1 },
  { key: "docs_upload", label: "Documents uploaded by DSA", days: 1 },
  { key: "credit_queries", label: "Credit queries shared", days: 2 },
  { key: "query_pd", label: "Query resolution + PD call", days: 2 },
  { key: "credit_approval", label: "Credit assessment & in-principle approval", days: 1 },
  { key: "send_lenders", label: "Proposal sent to lenders after approval", days: 0 },
  { key: "sanction", label: "Lender sanction letter", days: 0 },
  { key: "disbursement", label: "Disbursement after sanction", days: 2 },
  { key: "payout", label: "Payout to DSA after disbursement", days: 7 },
];

// Provik's existing lending checklist, used as the starting template for every product.
export const DEFAULT_CHECKLIST: { category: string; title: string; description?: string; mandatory: boolean }[] = [
  { category: "Business KYC", title: "Copy of PAN", mandatory: true },
  { category: "Business KYC", title: "GST Registration Certificate", mandatory: true },
  { category: "Business KYC", title: "Udyam Registration Certificate", description: "Wherever applicable", mandatory: false },
  {
    category: "Business KYC",
    title: "Partnership Deed / MOA & AOA / Certificate of Incorporation",
    description: "Partnership deed for partnership firms; MOA/AOA and Certificate of Incorporation for Pvt Ltd companies",
    mandatory: true,
  },
  {
    category: "Business KYC",
    title: "CA/Management certified list of directors and shareholding pattern",
    description:
      "Not older than 60 days. If management-certified shareholding is submitted at log-in, CA-certified copy is a subjectivity to be submitted before limit set-up.",
    mandatory: true,
  },
  {
    category: "Individual KYC",
    title: "Age proof",
    description: "Aadhaar (if complete DOB mentioned) / Indian Passport / Laminated Driving License (Permanent) / PAN",
    mandatory: true,
  },
  { category: "Individual KYC", title: "Identity proof", description: "Copy of PAN (mandatory)", mandatory: true },
  {
    category: "Individual KYC",
    title: "Address proof",
    description:
      "Aadhaar (if complete DOB mentioned) / Indian Passport / Laminated Driving License (Permanent) / Voter ID issued by ECI / any other document as defined in KYC policy",
    mandatory: true,
  },
  {
    category: "Business Vintage Proof",
    title: "Business vintage proof",
    description: "GST Registration Certificate / ITR / any other legal document establishing the vintage of business",
    mandatory: true,
  },
  {
    category: "Ownership Proof",
    title: "Ownership proof (residence or business)",
    description: "Property Tax Receipt / Electricity Bill / Water Tax Bill",
    mandatory: true,
  },
  {
    category: "Banking",
    title: "Latest 12 months banking PDF & Perfios (all operative accounts incl. WC limits)",
    description:
      "1) Banking for CC/OD (primary WC banker) irrespective of % transactions routed. 2) Banking for key current account through which BTO is routed (min 80%).",
    mandatory: true,
  },
  {
    category: "Banking",
    title: "Latest sanction letters for all WC loans",
    description:
      "Applicable for exposure above INR 50 lacs. Mandatory for primary WC banker at log-in; others on case-to-case basis (post log-in).",
    mandatory: true,
  },
  {
    category: "Financials",
    title: "Audited financials for latest 2 financial years",
    description:
      "ITR, COI, Auditor's Report, Tax Audit Report (3CB/3CD), P&L, Balance Sheet & schedules, plotted financials (for cases > 75 lakhs or Jocata score below BBB+)",
    mandatory: true,
  },
  { category: "Financials", title: "Latest provisional and audited balance sheet", mandatory: true },
  { category: "Financials", title: "Latest debt sheet", mandatory: true },
  {
    category: "Details for FI/FCU",
    title: "FI/FCU details for applicant and co-applicant",
    description: "Complete address with landmark and contact number (also to be shared over email at log-in)",
    mandatory: true,
  },
  {
    category: "Shareholding Pattern",
    title: "Latest shareholding pattern with promoters' contact details",
    mandatory: true,
  },
];
