import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { requestOtp } from "../auth-actions";

export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Reset password" sub="We'll email you a one-time code">
      <Flash sp={sp} />
      <form action={requestOtp} className="space-y-4">
        <Field label="Workspace code"><input name="workspace" className="input" defaultValue={sp.ws ?? ""} required /></Field>
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
        <button className="btn-primary w-full py-2">Send code</button>
      </form>
    </AuthShell>
  );
}
