import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Flash } from "@/components/ui";
import { PartnerForm } from "@/components/PartnerForm";
import { db } from "@/lib/db";
import { signupDsa } from "../../auth-actions";

export default async function Signup({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await db.tenant.findUnique({ where: { slug } });
  if (!t || !t.active || !t.allowDsaSignup) notFound();
  return (
    <AuthShell wide title={`Partner with ${t.name}`} sub="Register as a DSA/Partner. Fill in your details and upload your documents.">
      <Flash sp={sp} />
      <form action={signupDsa} className="space-y-5">
        <input type="hidden" name="slug" value={slug} />
        <PartnerForm docs="required" />
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {t.name} reviews your details and documents. Once approved, your User ID and password are sent to your email.
          {" "}You don&apos;t need to choose a password now.
        </p>
        <button className="btn-primary w-full py-2">Submit application</button>
      </form>
      <div className="mt-4 text-center text-sm">
        <Link href={`/login?ws=${slug}`} className="text-blue-700 hover:underline">Already approved? Sign in</Link>
      </div>
    </AuthShell>
  );
}
