# LoanOS

Multi-tenant loan proposal platform: DSA/Partner → RM → credit → multiple lenders → disbursement → DSA payout.
Built from the Provik "Loan Proposal Platform" spec; each customer you sell to gets an isolated **workspace**.

## Quick start

```bash
npm install
cp .env.example .env        # set SESSION_SECRET and FILE_ENCRYPTION_KEY (openssl rand -hex 32)
npm run setup               # creates the database + demo data
npm run dev                 # http://localhost:3000
```

| Login | Where | Credentials |
|---|---|---|
| Platform owner (you) | `/platform/login` | `owner@loanos.local` / `ChangeMe@123` (from `.env`) |
| Admin | `/login`, workspace `provik` | `admin@provik.demo` / `Demo@1234` |
| RM | same | `rm@provik.demo`, `rm2@provik.demo` |
| DSA / Partner | same | `dsa@provik.demo`, `dsa2@provik.demo` (`dsa3` is pending approval) |
| Lender | same | `lender@meridian.demo`, `lender@northstar.demo`, `lender@kaveri.demo` |

`npm run db:seed -- --reset` rebuilds the demo workspace.

## What's in it (mapped to the spec)

- **Multi-tenant SaaS** — platform console creates workspaces (company, code, brand colour, first admin). Every row carries `tenantId`; all reads go through `src/lib/access.ts`.
- **Four logins** — Admin / RM / DSA / Lender. Admin creates any login (temp password or invite link); RMs can onboard DSAs; DSAs can self-register at `/signup/<workspace>` and are activated after Admin/RM approval. OTP password reset, forced password change on first login, 30-min sliding session timeout.
- **12-step flow** — create → assign RM → feasibility → checklist auto-shared → uploads → queries → PD call → in-principle approval → send to many lenders at once → sanction letter → disbursement → payout.
- **Statuses** — full top-level lifecycle plus per-lender sub-status (Sent / Under Review / Query / Credit Assessment / IPA / Sanctioned / Rejected / Withdrawn). Once with lenders, the top-level status is **derived** from the best lender. Docs Complete and Query Resolved are also automatic.
- **Checklists** — admin-editable per product, plus lender-specific extras that are requested from the DSA automatically when the case goes to that lender. Seeded from Provik's checklist for all 9 products (PID, SID, BL, VF, DF, FF, TL, DL, Factoring).
- **Documents** — Pending → Uploaded → Query Raised → Re-uploaded → Verified. Every version kept (who, when). Files encrypted at rest (AES-256-GCM).
- **Queries** — RM or lender raises against a line item or the whole case; DSA re-uploads/replies on their own login; whoever raised it is notified.
- **Notifications** — every step in the spec's table, in-app + email (SMTP) + WhatsApp (generic webhook to any BSP). Without credentials they're logged.
- **TATs** — configurable per workspace; live "hours left / breached" on every case; historical TAT performance in reports.
- **Reports** — funnel/conversion, TAT by step, RM / DSA / lender performance, CSV export.
- **Security** — role + ownership checks on every page, action and file download (server-side, so changing an id in the URL returns 404); lenders never see other lenders' status or sanction letters; full audit log (status changes, uploads, queries, downloads, logins, exports).

## Production notes

- Switch `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`.
- Replace `src/lib/storage.ts` with S3/GCS if you deploy on serverless hosting (local disk is used now).
- Set `APP_URL` so links in emails are correct; set `SMTP_*` and `WHATSAPP_*` to turn on real delivery.
