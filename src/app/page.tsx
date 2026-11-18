import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { BrowserFrame, Pipeline, Reveal, RotatingWord, ScreenTabs } from "@/components/landing/Motion";

const WHATSAPP = "https://wa.me/919873742314?text=Hello%2C%20This%20is%20an%20enquiry%20regarding%20LOS";

const LIFECYCLE = [
  { label: "Submitted", note: "DSA files the case" },
  { label: "RM assigned", note: "Owner from day one" },
  { label: "Documents", note: "Product checklist" },
  { label: "Feasibility", note: "Go / no-go call" },
  { label: "Query & PD", note: "Credit queries, PD call" },
  { label: "In-principle", note: "Internal approval" },
  { label: "Lenders", note: "Sent in parallel" },
  { label: "Sanctioned", note: "Sanction letter in" },
  { label: "Disbursed", note: "Funds released" },
  { label: "Payout", note: "Partner paid" },
];

const FEATURES = [
  { t: "Configurable checklists", d: "Document checklists per product, with lender-specific asks added on the fly. Nothing goes missing." },
  { t: "Parallel lender tracking", d: "Send one proposal to several banks and NBFCs and watch each response side by side." },
  { t: "TAT monitoring", d: "Turnaround targets for every step, with live countdowns and breach alerts before deals slip." },
  { t: "Queries & PD calls", d: "Raise a query on any document, schedule personal discussions and keep every answer on record." },
  { t: "Encrypted document vault", d: "AES-256 encryption at rest, full version history and re-upload trails for every file." },
  { t: "Role-based workspaces", d: "Purpose-built views for admins, relationship managers, DSA partners and lenders." },
  { t: "Partner onboarding & KYC", d: "Invite DSAs, collect KYC and review partners before they can file a single case." },
  { t: "Reports & audit trail", d: "Conversion funnels, RM and lender performance, CSV exports and a log of every action." },
];

const AUDIENCE = [
  { t: "NBFCs", d: "Run sourcing, credit and lender coordination from one place." },
  { t: "Lending service providers", d: "Give every partner bank a clean, auditable pipeline." },
  { t: "Banks & small finance banks", d: "Receive complete, pre-checked files from your channel." },
  { t: "DSAs & loan aggregators", d: "Track every file and every payout without spreadsheets." },
  { t: "Fintech lenders", d: "Launch new products with checklists and TATs in minutes." },
  { t: "Co-lending partners", d: "Share one record across originator and lender." },
];

const SCREENS = [
  { key: "dashboard", label: "Dashboard", title: "Open cases, unassigned files, TAT breaches and payouts at a glance.", src: "/landing/dashboard.webp" },
  { key: "proposals", label: "Pipeline", title: "Every proposal, its stage, its TAT and every lender's response.", src: "/landing/proposals.webp" },
  { key: "proposal", label: "Proposal", title: "An 11-step tracker, document checklist and activity on one page.", src: "/landing/proposal.webp" },
  { key: "reports", label: "Reports", title: "Conversion funnel, TAT performance, RM, partner and lender scorecards.", src: "/landing/reports.webp" },
  { key: "lender", label: "Lender view", title: "Lenders see only the cases sent to them, and respond in one click.", src: "/landing/lender.webp" },
];

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.76 1.47h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.45-8.44ZM12.07 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.27c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.9 7c0 5.45-4.44 9.89-9.89 9.89Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--lp-accent)]">{children}</div>;
}

export default async function Home() {
  // The landing page must render even if config is broken, so /api/health can be reached from it.
  const s = await getSession().catch(() => null);
  if (s?.kind === "user") redirect("/app");
  if (s?.kind === "platform") redirect("/platform");
  const app = process.env.APP_NAME || "LoanOS";

  return (
    <div className="lp min-h-screen overflow-x-hidden text-slate-700">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100/80 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">{app.slice(0, 1)}</span>
            {app}
          </a>
          <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
            <a href="#products" className="hover:text-slate-900">Products</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#who" className="hover:text-slate-900">Who it&apos;s for</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900 sm:inline-flex">Sign in</Link>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
              Talk to us
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative">
        <div className="lp-grid-bg pointer-events-none absolute inset-0 -z-0" />
        <div className="lp-glow pointer-events-none absolute left-1/2 top-24 -z-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500">
              <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-emerald-500 text-emerald-500" />
              Loan Origination + Loan Management, in one platform
            </div>
            <h1 className="mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
              The operating system
              <br />
              for <span className="lp-serif italic text-[var(--lp-accent)]"><RotatingWord words={["NBFCs", "LSPs", "lenders", "DSAs"]} /></span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg">
              {app} takes a loan from the first document to the final payout. Partners, relationship managers, credit teams and lenders work on one shared record.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lp-accent)] px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:shadow-xl sm:w-auto">
                <WhatsAppIcon /> Book a demo on WhatsApp
              </a>
              <a href="#product-tour" className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 sm:w-auto">
                See it in action
              </a>
            </div>
          </Reveal>

          {/* Product GIF */}
          <Reveal delay={150} className="relative mx-auto mt-16 max-w-5xl" >
            <div id="product-tour" className="scroll-mt-24" />
            <BrowserFrame>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/loanos-tour.gif" alt={`${app} product tour: dashboard, pipeline, proposal, reports and lender views`} width={960} height={600} className="block h-auto w-full" />
            </BrowserFrame>
            <div className="lp-float absolute -left-6 top-16 hidden rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl lg:block">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Sanctioned</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-900">₹90,00,000</div>
              <div className="text-xs text-emerald-600">Meridian Bank · 2 days</div>
            </div>
            <div className="lp-float-2 absolute -right-6 bottom-20 hidden rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl lg:block">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-amber-500 text-amber-500" /> TAT watch
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">Feasibility · 12h left</div>
            </div>
          </Reveal>
        </div>

        {/* Marquee */}
        <div className="relative border-y border-slate-100 bg-slate-50/60 py-4">
          <div className="flex w-max lp-marquee gap-10 whitespace-nowrap text-sm text-slate-400">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-10" aria-hidden={k === 1}>
                {["Business loans", "Purchase invoice discounting", "Working capital", "Term loans", "Vendor finance", "Dealer finance", "Supply chain finance", "LAP", "Co-lending"].map((x) => (
                  <span key={x} className="flex items-center gap-10">
                    {x} <span className="text-slate-300">·</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products: LOS + LMS */}
      <section id="products" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
        <Reveal className="max-w-2xl">
          <Eyebrow>Two products, one platform</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Originate with confidence. <span className="lp-serif italic text-slate-500">Manage with clarity.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {[
            {
              tag: "LOS",
              name: "Loan Origination System",
              lead: "From lead to sanction, without the email chains.",
              pts: ["Proposal intake by DSAs and partners", "Product-wise document checklists", "Feasibility, credit queries and PD calls", "In-principle approval and multi-lender routing", "Sanction tracking per lender"],
            },
            {
              tag: "LMS",
              name: "Loan Management System",
              lead: "From disbursal to closure, every rupee accounted for.",
              pts: ["Disbursement tracking", "Repayment schedules and EMI tracking", "Collections and overdue follow-ups", "Partner payouts after disbursal", "Portfolio reports and exports"],
            },
          ].map((p, i) => (
            <Reveal key={p.tag} delay={i * 120}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 transition duration-500 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] sm:p-10">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-blue-100/70 to-transparent opacity-0 transition duration-700 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-baseline gap-3">
                    <span className="lp-serif text-5xl italic text-[var(--lp-accent)]">{p.tag}</span>
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-900">{p.name}</div>
                  <p className="mt-1 text-slate-500">{p.lead}</p>
                  <ul className="mt-8 space-y-3 border-t border-slate-100 pt-6">
                    {p.pts.map((x) => (
                      <li key={x} className="flex items-start gap-3 text-sm text-slate-600">
                        <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-accent)]" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="max-w-2xl">
            <Eyebrow>How {app} works</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">One record, ten clear stages.</h2>
            <p className="mt-4 text-slate-500">
              Every proposal moves through the same visible path. Everyone involved sees where it stands, what is pending and who owns the next step.
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-14">
            <Pipeline steps={LIFECYCLE} />
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
        <Reveal className="max-w-2xl">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Everything a lending desk needs. Nothing it doesn&apos;t.</h2>
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 4) * 80} className="bg-white">
              <div className="group h-full p-7 transition-colors duration-300 hover:bg-slate-50/70">
                <div className="lp-serif text-sm italic text-slate-400 transition-colors group-hover:text-[var(--lp-accent)]">{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-6 font-medium text-slate-900">{f.t}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Screens */}
      <section className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>Inside the platform</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Calm screens for busy desks.</h2>
          </Reveal>
          <Reveal delay={100} className="mx-auto mt-10 max-w-5xl">
            <ScreenTabs tabs={SCREENS} />
          </Reveal>
        </div>
      </section>

      {/* Audience */}
      <section id="who" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <Reveal>
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Built for everyone <span className="lp-serif italic text-slate-500">in the lending chain.</span>
            </h2>
            <p className="mt-4 text-slate-500">
              Whether you source loans, underwrite them or fund them, {app} gives your team a single source of truth, with each workspace isolated and secure.
            </p>
          </Reveal>
          <div className="grid gap-x-10 sm:grid-cols-2">
            {AUDIENCE.map((a, i) => (
              <Reveal key={a.t} delay={(i % 2) * 100}>
                <div className="group border-t border-slate-200 py-6 transition-colors hover:border-[var(--lp-accent)]">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-900">{a.t}</div>
                    <span className="text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--lp-accent)]">→</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">{a.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-900 px-6 py-20 text-center sm:px-12 sm:py-24">
          <div className="lp-glow pointer-events-none absolute left-1/2 top-0 h-80 w-[640px] -translate-x-1/2 rounded-full opacity-80" style={{ background: "radial-gradient(closest-side, rgba(96,165,250,.35), transparent)" }} />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Ready to run lending <span className="lp-serif italic text-blue-300">the calm way?</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-slate-400">See {app} with your own products and checklists. Message us and we will set up a walkthrough.</p>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:shadow-xl">
              <WhatsAppIcon className="h-5 w-5" /> Chat with us on WhatsApp
            </a>
            <div className="mt-4 text-xs text-slate-500">+91 98737 42314</div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:px-6">
          <div>© {new Date().getFullYear()} {app}</div>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-slate-700">Sign in</Link>
            <Link href="/platform/login" className="hover:text-slate-700">Platform console</Link>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="hover:text-slate-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
