import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetPolicy, getGetPolicyQueryKey, useUpdatePolicy, getListQuotesQueryKey, getGetDashboardQueryKey, useGetSession, getGetSessionQueryKey, Role, type Policy } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shell';
import { Skeleton } from '@/components/ui/skeleton';
import { pct, errMsg } from '@/lib/dd';

const cell = 'w-full rounded border border-line bg-white px-2 py-1.5 text-sm';

export default function RulesPage() {
  const qc = useQueryClient();
  const policy = useGetPolicy({ query: { queryKey: getGetPolicyQueryKey() } });
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const update = useUpdatePolicy();
  const [p, setP] = useState<Policy | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    if (policy.data && !init.current) { init.current = true; setP(structuredClone(policy.data)); }
  }, [policy.data]);

  if (policy.isLoading || session.isLoading || (!p && !policy.isError)) return <div className="px-4 md:px-10 py-12 space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-72" /></div>;
  if (policy.isError || session.isError || !p) return <div className="px-10 py-16"><p className="text-bad">{errMsg(policy.isError ? policy.error : session.error)}</p><button onClick={() => { void policy.refetch(); void session.refetch(); }} className="mt-3 text-ok underline" data-testid="button-retry">Retry</button></div>;

  const readOnly = session.data?.role !== Role.Founder;
  const edit = (next: Policy) => { setP(next); setDirty(true); setSaved(false); };
  const setProd = (i: number, k: 'listPrice' | 'floorPrice', v: string) =>
    edit({ ...p, products: p.products.map((x, j) => (j === i ? { ...x, [k]: Number(v) } : x)) });
  const lastBandOk = p.bands.length === 3 && p.bands[2].maxDiscount === 100;
  const setBand = (i: number, k: 'maxDiscount' | 'approver', v: string) =>
    edit({ ...p, bands: p.bands.map((b, j) => (j === i ? { ...b, [k]: k === 'maxDiscount' ? Number(v) : (v as Role) } : b)) });

  const save = () => { if (readOnly) return; update.mutate({ data: p }, {
    onSuccess: (next) => {
      qc.setQueryData(getGetPolicyQueryKey(), next);
      qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setP(structuredClone(next)); setDirty(false); setSaved(true);
    },
  }); };

  const sortedBands = [...p.bands].sort((a, b) => a.maxDiscount - b.maxDiscount);

  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-5xl">
      <PageHeader title="Rules" sub="Deterministic policy. Every quote, including ones Claude drafts, is checked against these numbers.">
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-ok" data-testid="text-saved">Policy saved</span>}
          <button onClick={() => { if (policy.data) { setP(structuredClone(policy.data)); setDirty(false); update.reset(); } }} disabled={readOnly || !dirty} className="rounded-md border border-line bg-white px-4 py-2 text-sm disabled:opacity-50" data-testid="button-reset-policy">Reset</button>
          <button onClick={save} disabled={readOnly || !dirty || update.isPending || !lastBandOk} className="rounded-md bg-ok text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" data-testid="button-save-policy">{update.isPending ? 'Saving…' : 'Save policy'}</button>
        </div>
      </PageHeader>
      {readOnly && <p className="mb-6 rounded-md border border-line bg-white px-4 py-3 text-sm text-sub" data-testid="text-rules-readonly">Only the Founder can change discount rules. Switch the simulated role to Founder to edit.</p>}
      {update.isError && <div role="alert" className="mb-6 border border-[#E8C3C0] bg-[#F8E9E8] text-bad rounded-md px-4 py-3 text-sm" data-testid="text-policy-error">{errMsg(update.error)}</div>}

      <section className="mb-12">
        <h2 className="font-display text-xl font-semibold text-ink">Approval bands</h2>
        <p className="text-sm text-sub mb-4">Exactly three bands, in order. A discount up to a band's maximum is approved by that band's role. The last band must go up to 100%. Any quote below a product floor always needs the Founder.</p>
        <div className="bg-white border border-line rounded-md divide-y divide-line">
          {p.bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center px-4 py-3" data-testid={`row-band-${i}`}>
              <span className="font-display text-lg font-semibold text-sub tnum w-6">{i + 1}</span>
              <label className="text-sm"><span className="text-xs text-sub">Up to discount %{i === p.bands.length - 1 ? ' (must be 100)' : ''}</span>
                <input type="number" min={0} max={100} step={0.5} disabled={readOnly} className={`${cell} tnum disabled:bg-surface disabled:text-sub`} value={b.maxDiscount} onChange={(e) => setBand(i, 'maxDiscount', e.target.value)} data-testid={`input-band-max-${i}`} /></label>
              <label className="text-sm"><span className="text-xs text-sub">Approver</span>
                <select disabled={readOnly} className={`${cell} disabled:bg-surface disabled:text-sub`} value={b.approver} onChange={(e) => setBand(i, 'approver', e.target.value)} data-testid={`select-band-approver-${i}`}>
                  {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
                </select></label>
            </div>
          ))}
        </div>
        {!lastBandOk && <p className="mt-3 text-sm text-bad" data-testid="text-band-warning">The last band's maximum must be 100%.</p>}
        {sortedBands.length > 0 && (
          <p className="mt-4 text-sm text-sub">Reads as: {sortedBands.map((b, i) => `${i === 0 ? '0' : pct(sortedBands[i - 1].maxDiscount)}–${pct(b.maxDiscount)} → ${b.approver}`).join(' · ')}</p>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink">Price book and floors</h2>
        <p className="text-sm text-sub mb-4">Product names and units are fixed. Prices in INR per unit; monthly units are billed ×12 annual prepaid.</p>
        <div className="bg-white border border-line rounded-md overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-sub border-b border-line"><th className="font-medium px-4 py-3">Product</th><th className="font-medium px-3 py-3">Unit</th><th className="font-medium px-3 py-3">List price</th><th className="font-medium px-3 py-3">Floor price</th><th className="font-medium px-3 py-3 text-right">Max off list</th></tr></thead>
            <tbody>
              {p.products.map((x, i) => {
                const max = x.listPrice > 0 ? (1 - x.floorPrice / x.listPrice) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-line last:border-0" data-testid={`row-product-${i}`}>
                    <td className="px-4 py-3 font-medium text-ink" data-testid={`text-product-name-${i}`}>{x.name}</td>
                    <td className="px-3 py-3 text-sub">{x.unit}</td>
                    <td className="px-3 py-2"><input type="number" min={0} disabled={readOnly} className={`${cell} tnum disabled:bg-surface disabled:text-sub`} value={x.listPrice} onChange={(e) => setProd(i, 'listPrice', e.target.value)} aria-label="List price" data-testid={`input-product-list-${i}`} /></td>
                    <td className="px-3 py-2"><input type="number" min={0} disabled={readOnly} className={`${cell} tnum disabled:bg-surface disabled:text-sub ${x.floorPrice > x.listPrice ? 'text-bad' : ''}`} value={x.floorPrice} onChange={(e) => setProd(i, 'floorPrice', e.target.value)} aria-label="Floor price" data-testid={`input-product-floor-${i}`} /></td>
                    <td className={`px-3 py-2 text-right tnum ${max < 0 ? 'text-bad' : 'text-sub'}`}>{pct(max)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
