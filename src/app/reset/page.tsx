import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { resetPassword } from "../auth-actions";

export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Enter your code" sub="Check your email for the 6-digit code">
      <Flash sp={sp} />
      <form action={resetPassword} className="space-y-4">
        <input type="hidden" name="workspace" value={sp.ws ?? ""} />
        <input type="hidden" name="email" value={sp.email ?? ""} />
        <Field label="One-time code"><input name="otp" className="input" inputMode="numeric" maxLength={6} required /></Field>
        <Field label="New password"><input name="password" type="password" className="input" minLength={8} required /></Field>
        <button className="btn-primary w-full py-2">Update password</button>
      </form>
    </AuthShell>
  );
}
