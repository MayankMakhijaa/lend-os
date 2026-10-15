import Link from "next/link";
import { fmtINR } from "@/lib/format";
import type { TatInfo } from "@/lib/tat";
import { Empty, LenderBadge, StatusBadge } from "./ui";
import { TatPill } from "./TatPill";

type Row = {
  id: string; refNo: string; companyName: string; status: string; loanAmount: number | null;
  product: { code: string }; tat: TatInfo | null; assignments: { id: string; status: string; lender: { name: string } }[];
};

export function ProposalTable({ rows, empty, showLenders }: { rows: Row[]; empty: string; showLenders?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Ref</th><th>Company</th><th>Product</th><th>Amount</th><th>Status</th><th>TAT</th>{showLenders && <th>Lender</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link className="whitespace-nowrap font-mono text-xs text-blue-700 hover:underline" href={`/app/proposals/${r.id}`}>{r.refNo}</Link></td>
              <td><Link className="font-medium hover:underline" href={`/app/proposals/${r.id}`}>{r.companyName}</Link></td>
              <td>{r.product.code}</td>
              <td>{fmtINR(r.loanAmount)}</td>
              <td><StatusBadge status={r.status} /></td>
              <td><TatPill tat={r.tat} /></td>
              {showLenders && <td>{r.assignments.map((a) => <div key={a.id}><LenderBadge status={a.status} /></div>)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
