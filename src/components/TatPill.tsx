import type { TatInfo } from "@/lib/tat";

export function TatPill({ tat }: { tat: TatInfo | null }) {
  if (!tat) return <span className="text-xs text-slate-400">—</span>;
  if (tat.breached)
    return <span className="badge bg-red-100 text-red-700" title={tat.label}>TAT breached · {Math.abs(tat.hoursLeft)}h over</span>;
  return (
    <span className={`badge ${tat.hoursLeft < 6 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} title={tat.label}>
      {tat.hoursLeft}h left
    </span>
  );
}
