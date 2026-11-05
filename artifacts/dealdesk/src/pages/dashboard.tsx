import { useGetDashboard, getGetDashboardQueryKey, useGetPolicy, getGetPolicyQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shell';
import { Skeleton } from '@/components/ui/skeleton';
import { inr, pct, fmtDate, repLimit, errMsg } from '@/lib/dd';

export default function DashboardPage() {
  const d = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 30000 } });
  const policy = useGetPolicy({ query: { queryKey: getGetPolicyQueryKey() } });
  const repMax = repLimit(policy.data?.bands);

  if (d.isLoading) return <div className="px-4 md:px-10 py-12 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (d.isError || !d.data) return <div className="px-10 py-16"><p className="text-bad">{errMsg(d.error)}</p><button onClick={() => d.refetch()} className="mt-3 text-ok underline" data-testid="button-retry">Retry</button></div>;
  const x = d.data;

  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-6xl">
      <PageHeader title="Dashboard" sub={<>Quarter <span className="tnum font-medium text-ink" data-testid="text-quarter">{x.quarter}</span>. What was asked for, what was given, what the rules held back.</>} />

      <div className="grid md:grid-cols-[1.3fr_1fr] gap-px bg-line border border-line rounded-md overflow-hidden mb-8">
        <div className="bg-white p-6 md:p-8">
          <div className="text-sm text-sub">Margin protected</div>
          <div className="font-display text-5xl md:text-6xl font-semibold text-ok tnum mt-1" data-testid="text-margin-protected">{inr(x.marginProtected)}</div>
          <p className="text-sm text-sub mt-2">Difference between discounts requested and discounts approved.</p>
        </div>
        <div className="bg-white p-6 md:p-8">
          <div className="text-sm text-sub">Discount given</div>
          <div className="font-display text-4xl font-semibold text-ink tnum mt-1" data-testid="text-discount-given">{inr(x.discountGiven)}</div>
          <div className="text-sm text-sub mt-2">Average discount <span className="tnum text-ink font-medium" data-testid="text-average-discount">{pct(x.averageDiscount)}</span></div>
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-12">
        {[
          ['Pipeline value', inr(x.pipelineValue), 'pipeline'],
          ['Total quotes', String(x.totalQuotes), 'total'],
          ['Pending approval', String(x.pendingCount), 'pending'],
          ['Above-policy requests', String(x.abovePolicyRequests), 'above-policy'],
          ['Median approval time', `${x.medianApprovalHours.toFixed(1)} h`, 'median-hours'],
        ].map(([k, v, t]) => (
          <div key={t} className="border-t border-ink pt-3">
            <dt className="text-sm text-sub">{k}</dt>
            <dd className={`font-display text-2xl font-semibold tnum mt-1 ${t === 'above-policy' && x.abovePolicyRequests > 0 ? 'text-bad' : t === 'pending' && x.pendingCount > 0 ? 'text-warn' : 'text-ink'}`} data-testid={`text-${t}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        <section>
          <h2 className="font-display text-xl font-semibold text-ink mb-1">By rep</h2>
          <p className="text-sm text-sub mb-4">Average discount compared to the rep self-approval limit of <span className="tnum text-ink">{pct(repMax)}</span>.</p>
          <div className="bg-white border border-line rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-sub border-b border-line">
                <th className="font-medium px-4 py-3">Rep</th><th className="font-medium px-3 py-3 text-right">Quotes</th>
                <th className="font-medium px-3 py-3 text-right">Avg discount</th><th className="font-medium px-3 py-3">Vs policy</th>
                <th className="font-medium px-3 py-3 text-right">Discount given</th><th className="font-medium px-4 py-3 text-right">Margin protected</th>
              </tr></thead>
              <tbody>
                {x.byRep.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sub">No quotes this quarter yet.</td></tr>}
                {x.byRep.map((r) => {
                  const diff = r.discountPercent - repMax;
                  return (
                    <tr key={r.rep} className="border-b border-line last:border-0" data-testid={`row-rep-${r.rep}`}>
                      <td className="px-4 py-3 font-medium">{r.rep}</td>
                      <td className="px-3 py-3 text-right tnum">{r.quoteCount}</td>
                      <td className="px-3 py-3 text-right tnum">{pct(r.discountPercent)}</td>
                      <td className={`px-3 py-3 tnum whitespace-nowrap ${diff > 0 ? 'text-warn' : 'text-ok'}`}>{diff > 0 ? `${pct(diff)} above rep limit` : 'Within rep limit'}</td>
                      <td className="px-3 py-3 text-right tnum">{inr(r.discountGiven)}</td>
                      <td className="px-4 py-3 text-right tnum text-ok">{inr(r.marginProtected)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold text-ink mb-4">Recent activity</h2>
          <ol className="bg-white border border-line rounded-md divide-y divide-line text-sm" data-testid="list-activity">
            {x.recentActivity.length === 0 && <li className="p-4 text-sub">Quiet so far.</li>}
            {x.recentActivity.map((a, i) => (
              <li key={i} className="p-4"><div className="text-ink">{a.message}</div><div className="text-xs text-sub mt-0.5">{a.actor} · {fmtDate(a.at, 'd MMM, HH:mm')}</div></li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
