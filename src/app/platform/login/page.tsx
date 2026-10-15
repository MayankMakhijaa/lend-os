import { AuthShell } from "@/components/AuthShell";
import { Field, Flash } from "@/components/ui";
import { platformLogin } from "../../auth-actions";

export default async function PlatformLogin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Platform console" sub="For the SaaS owner: create and manage customer workspaces">
      <Flash sp={sp} />
      <form action={platformLogin} className="space-y-4">
        <Field label="Email"><input name="email" type="email" className="input" required /></Field>
        <Field label="Password"><input name="password" type="password" className="input" required /></Field>
        <button className="btn-primary w-full py-2">Sign in</button>
      </form>
    </AuthShell>
  );
}
