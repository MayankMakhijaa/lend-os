import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";

let transporter: nodemailer.Transporter | null | undefined;
function mailer() {
  if (transporter !== undefined) return transporter;
  transporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;
  return transporter;
}

async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const t = mailer();
  if (!t) {
    console.log(`[email:logged] to=${to} subject="${subject}"\n${text}\n`);
    return "LOGGED";
  }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    return "SENT";
  } catch (e) {
    console.error("[email:failed]", e);
    return "FAILED";
  }
}

// Provider-agnostic WhatsApp: POSTs {to, message} to a webhook (an adapter for Gupshup/Interakt/Twilio etc.).
async function sendWhatsApp(to: string, message: string): Promise<string> {
  const url = process.env.WHATSAPP_WEBHOOK_URL;
  if (!url) {
    console.log(`[whatsapp:logged] to=${to} ${message}`);
    return "LOGGED";
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ""}` },
      body: JSON.stringify({ to, message }),
    });
    return r.ok ? "SENT" : "FAILED";
  } catch (e) {
    console.error("[whatsapp:failed]", e);
    return "FAILED";
  }
}

export function appUrl(path = "") {
  return `${process.env.APP_URL || "http://localhost:3000"}${path}`;
}

/** In-app + email + WhatsApp notification to each user. Never throws: delivery failures are recorded per channel. */
export async function notify(
  tenantId: string,
  userIds: (string | null | undefined)[],
  subject: string,
  body: string,
  proposalId?: string,
) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  const users = await db.user.findMany({ where: { id: { in: ids }, tenantId, status: "ACTIVE" } });
  const link = proposalId ? `\n\nOpen: ${appUrl(`/app/proposals/${proposalId}`)}` : "";
  await Promise.all(
    users.map(async (u) => {
      const [emailStatus, whatsappStatus] = await Promise.all([
        sendEmail(u.email, subject, `Hi ${u.name},\n\n${body}${link}`),
        u.phone ? sendWhatsApp(u.phone, `${subject}\n${body}`) : Promise.resolve("SKIPPED"),
      ]);
      await db.notification.create({
        data: { tenantId, userId: u.id, proposalId, subject, body, emailStatus, whatsappStatus },
      });
    }),
  );
}

export async function lenderUserIds(tenantId: string, lenderId: string) {
  const us = await db.user.findMany({ where: { tenantId, lenderId, role: "LENDER", status: "ACTIVE" }, select: { id: true } });
  return us.map((u) => u.id);
}

export async function adminIds(tenantId: string) {
  const us = await db.user.findMany({ where: { tenantId, role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  return us.map((u) => u.id);
}

/** Transactional email to an address that may not be a user yet (invites, OTP). */
export async function sendDirectEmail(to: string, subject: string, text: string) {
  return sendEmail(to, subject, text);
}
