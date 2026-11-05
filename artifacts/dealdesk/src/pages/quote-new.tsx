import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useCreateQuote, useGetPolicy, getGetPolicyQueryKey, useGetSession, getGetSessionQueryKey, getListQuotesQueryKey, getGetDashboardQueryKey, type QuoteInput } from '@workspace/api-client-react';
import { QuoteDocument } from '@/components/quote-document';
import { errMsg } from '@/lib/dd';

function blank(rep: string): QuoteInput {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return { clientCompany: '', contactName: '', contactEmail: '', repName: rep, lineItems: [{ productName: '', quantity: 1, unitPrice: 0 }], discountPercent: 0, discountReason: '', counterOffer: '', billingTerms: 'Annual prepaid, net 15', validityDate: d.toISOString().slice(0, 10), notes: '' };
}

export default function QuoteNewPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const policy = useGetPolicy({ query: { queryKey: getGetPolicyQueryKey() } });
  const create = useCreateQuote();
  const [form, setForm] = useState<QuoteInput>(() => blank(session.data?.name ?? ''));

  const save = (saveAsDraft: boolean) => {
    create.mutate({ data: { ...form, saveAsDraft } }, {
      onSuccess: (q) => {
        qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setLocation(`/quotes/${q.id}`);
      },
    });
  };

  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-5xl">
      <Link href="/quotes" className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink mb-6" data-testid="link-back"><ArrowLeft className="w-4 h-4" />Quotes</Link>
      <h1 className="text-3xl md:text-4xl font-semibold text-ink mb-2">New quote</h1>
      <p className="text-sub mb-8">Created manually. The rules engine prices it against the floor the moment you save.</p>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <QuoteDocument value={form} onChange={setForm} products={policy.data?.products ?? []} />
        {create.isError && <p role="alert" className="mt-4 text-bad text-sm" data-testid="text-create-error">{errMsg(create.error)}</p>}
        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button type="button" onClick={() => save(true)} disabled={create.isPending} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-surface" data-testid="button-save-draft">Save as draft</button>
          <button type="submit" disabled={create.isPending} className="rounded-md bg-ok text-white px-4 py-2 text-sm font-semibold hover:bg-[#0c6a52] disabled:opacity-60" data-testid="button-create">{create.isPending ? 'Saving…' : 'Create quote'}</button>
        </div>
      </form>
    </div>
  );
}
