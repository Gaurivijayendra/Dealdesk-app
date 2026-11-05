import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Plus, Search, Inbox } from 'lucide-react';
import { useListQuotes, getListQuotesQueryKey, useGetPolicy, getGetPolicyQueryKey, useGetSession, getGetSessionQueryKey, QuoteStatus, type ListQuotesParams } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shell';
import { StatusBadge, SourceTag, SimTag } from '@/components/badges';
import { MarginMeter } from '@/components/margin-meter';
import { ClaudeConnectCallout } from '@/components/claude-connect-callout';
import { Skeleton } from '@/components/ui/skeleton';
import { inr, pct, fmtDate, STATUS_LABEL, isSeed, errMsg } from '@/lib/dd';
import { canCurrentRoleDecide } from '@/lib/role-access';

export default function QuotesPage({ approvals = false }: { approvals?: boolean }) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const params: ListQuotesParams | undefined = approvals ? { status: 'pending_approval' } : status ? { status } : undefined;
  const list = useListQuotes(params, { query: { queryKey: getListQuotesQueryKey(params), refetchInterval: 15000 } });
  const policy = useGetPolicy({ query: { queryKey: getGetPolicyQueryKey() } });
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const role = session.data?.role;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data ?? []).filter((r) => !s || [r.clientCompany, r.repName, r.number, r.contactName].some((x) => x?.toLowerCase().includes(s)));
  }, [list.data, q]);
  const hasSeed = rows.some(isSeed);

  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-7xl">
      <PageHeader title={approvals ? 'Approvals' : 'Quotes'}
        sub={approvals ? `Quotes waiting on a decision. You are viewing as ${role ?? '—'}; you can act on those routed to you.` : 'Every quote, from Claude or by hand, measured against the floor.'}>
        {!approvals && <Link href="/quotes/new" className="inline-flex items-center gap-2 rounded-md bg-ok text-white px-4 py-2 text-sm font-semibold hover:bg-[#0c6a52]" data-testid="link-new-quote"><Plus className="w-4 h-4" />New quote</Link>}
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, rep or number" aria-label="Search quotes"
            className="w-full rounded-md border border-line bg-white pl-9 pr-3 py-2 text-sm" data-testid="input-search" />
        </div>
        {!approvals && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-md border border-line bg-white px-3 py-2 text-sm" data-testid="select-status">
            <option value="">All statuses</option>
            {Object.values(QuoteStatus).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        )}
      </div>
      {hasSeed && <p className="text-sm text-sub mb-4 flex items-center gap-2 flex-wrap"><SimTag /> Seeded examples are simulated demo data. Claude-origin seeds were not created by a real MCP call.</p>}

      <div className="bg-white border border-line rounded-md overflow-hidden">
        {list.isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : list.isError ? (
          <div className="p-10 text-center"><p className="text-bad">{errMsg(list.error)}</p><button onClick={() => list.refetch()} className="mt-3 text-ok underline" data-testid="button-retry">Retry</button></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 sm:p-14 text-center">
            <Inbox className="w-8 h-8 mx-auto text-sub" strokeWidth={1.5} />
            <p className="font-display text-xl mt-3 text-ink">{approvals ? 'Nothing waiting on approval' : 'No quotes match'}</p>
            <p className="text-sub text-sm mt-1">{approvals ? 'Quotes above the rep band land here when submitted.' : 'Ask Claude to draft one, or create it by hand.'}</p>
            {!approvals && <ClaudeConnectCallout />}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-sub border-b border-line bg-surface/50">
                <th className="font-medium px-4 py-3">Client</th><th className="font-medium px-3 py-3">Rep</th>
                <th className="font-medium px-3 py-3 text-right">Total</th><th className="font-medium px-3 py-3 text-right">Discount</th>
                <th className="font-medium px-3 py-3">Margin</th><th className="font-medium px-3 py-3">Status</th>
                <th className="font-medium px-3 py-3">Approver</th><th className="font-medium px-4 py-3">Date</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const mine = r.status === 'pending_approval' && canCurrentRoleDecide(role, r.requiredApprover);
                  return (
                    <tr key={r.id} onClick={() => setLocation(`/quotes/${r.id}`)} className="border-b border-line last:border-0 hover:bg-surface/60 cursor-pointer" data-testid={`row-quote-${r.id}`}>
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:underline" data-testid={`link-quote-${r.id}`}>{r.clientCompany}</Link>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1"><span className="text-xs text-sub tnum">{r.number}</span><SourceTag source={r.source} />{isSeed(r) && <SimTag />}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.repName}</td>
                      <td className="px-3 py-3 text-right tnum whitespace-nowrap">{inr(r.total)}</td>
                      <td className={`px-3 py-3 text-right tnum ${r.belowFloor ? 'text-bad font-semibold' : ''}`}>{pct(r.effectiveDiscountPercent)}</td>
                      <td className="px-3 py-3"><MarginMeter size="mini" listTotal={r.listTotal} floorTotal={r.floorTotal} effective={r.effectiveDiscountPercent} original={r.originalDiscountPercent} approved={r.approvedDiscountPercent} bands={policy.data?.bands} belowFloor={r.belowFloor} /></td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.requiredApprover}{mine && <span className="ml-1.5 text-xs text-warn font-medium">Your call</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sub">{fmtDate(r.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
