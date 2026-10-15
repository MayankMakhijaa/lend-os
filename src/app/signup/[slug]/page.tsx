import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { db } from "@/lib/db";
import { signupDsa } from "../../auth-actions";

export default async function Signup({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await db.tenant.findUnique({ where: { slug } });
  if (!t || !t.active || !t.allowDsaSignup) notFound();
  return (
    <AuthShell title={`Partner with ${t.name}`} sub="Register as a DSA/Partner. Your account is activated after approval.">
      <Flash sp={sp} />
      <form action={signupDsa} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <Field label="Your name"><input name="name" className="input" required /></Field>
        <Field label="Firm / company name"><input name="companyName" className="input" /></Field>
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
        <Field label="Mobile (WhatsApp)"><input name="phone" className="input" placeholder="+91…" /></Field>
        <Field label="Password"><input name="password" type="password" className="input" minLength={8} required /></Field>
        <button className="btn-primary w-full py-2">Register</button>
      </form>
    </AuthShell>
  );
}
