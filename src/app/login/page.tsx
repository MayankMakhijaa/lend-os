import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { login } from "../auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Sign in" sub="Admin, RM, DSA/Partner and Lender logins">
      {sp.expired && !sp.err && <Flash sp={{ err: "Your session timed out. Please sign in again." }} />}
      <Flash sp={sp} />
      <form action={login} className="space-y-4">
        <Field label="Workspace code">
          <input name="workspace" className="input" defaultValue={sp.ws ?? ""} placeholder="e.g. provik" required />
        </Field>
        <Field label="Email">
          <input name="email" type="email" className="input" required autoComplete="username" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" className="input" required autoComplete="current-password" />
        </Field>
        <button className="btn-primary w-full py-2">Sign in</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href={`/forgot${sp.ws ? `?ws=${sp.ws}` : ""}`} className="text-blue-700 hover:underline">Forgot password?</Link>
        {sp.ws && <Link href={`/signup/${sp.ws}`} className="text-blue-700 hover:underline">Register as DSA/Partner</Link>}
      </div>
    </AuthShell>
  );
}
