import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/constants";
import { acceptInvite } from "../../auth-actions";

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const u = await db.user.findUnique({ where: { inviteToken: token }, include: { tenant: true } });
  if (!u) notFound();
  return (
    <AuthShell title={`Welcome to ${u.tenant.name}`} sub={`Set a password for your ${ROLE_LABEL[u.role]} login (${u.email})`}>
      <Flash sp={sp} />
      <form action={acceptInvite} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Password"><input name="password" type="password" className="input" minLength={8} required /></Field>
        <button className="btn-primary w-full py-2">Set password</button>
      </form>
    </AuthShell>
  );
}
