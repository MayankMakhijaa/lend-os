export function AuthShell({ title, sub, wide, children }: { title: string; sub?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-6 text-center">
          <div className="text-sm font-semibold uppercase tracking-widest text-blue-700">{process.env.APP_NAME || "LoanOS"}</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
          {sub && <p className="muted mt-1">{sub}</p>}
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
