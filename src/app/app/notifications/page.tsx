import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { markAllRead } from "../admin-actions";

const chan = (s: string) => (s === "SENT" ? "sent" : s === "LOGGED" ? "logged" : s === "FAILED" ? "failed" : "—");

export default async function Notifications() {
  const u = await requireUser();
  const items = await db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div className="max-w-4xl">
      <PageHeader title="Notifications" sub="Everything we've sent you by email and WhatsApp">
        <form action={markAllRead}><button className="btn-secondary">Mark all read</button></form>
      </PageHeader>
      <div className="card divide-y">
        {items.length === 0 && <Empty>No notifications yet.</Empty>}
        {items.map((n) => (
          <div key={n.id} className={`px-4 py-3 text-sm ${n.readAt ? "" : "bg-blue-50/50"}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="font-medium text-slate-800">{!n.readAt && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />}{n.subject}</div>
              <div className="text-xs text-slate-400">{fmtDate(n.createdAt, true)} · email {chan(n.emailStatus)} · WhatsApp {chan(n.whatsappStatus)}</div>
            </div>
            <div className="mt-1 whitespace-pre-wrap text-slate-600">{n.body}</div>
            {n.proposalId && <Link href={`/app/proposals/${n.proposalId}`} className="mt-1 inline-block text-xs text-blue-700 hover:underline">Open proposal →</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
