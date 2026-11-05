import { useState, type FormEvent } from 'react';
import { useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useGetPublicQuote, getGetPublicQuoteQueryKey, useAcceptPublicQuote } from '@workspace/api-client-react';
import { QuoteDocument } from '@/components/quote-document';
import { Logo, Footer } from '@/components/shell';
import { Skeleton } from '@/components/ui/skeleton';
import { toInput, inr, fmtDate, errMsg } from '@/lib/dd';

export default function ClientPage() {
  const { token = '' } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const pub = useGetPublicQuote(token, { query: { queryKey: getGetPublicQuoteQueryKey(token), enabled: !!token } });
  const accept = useAcceptPublicQuote();
  const [name, setName] = useState('');
  const [justAccepted, setJustAccepted] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    accept.mutate({ token, data: { name } }, {
      onSuccess: (res) => { qc.setQueryData(getGetPublicQuoteQueryKey(token), res); setJustAccepted(true); },
    });
  };

  const q = pub.data?.quote;
  const pay = pub.data?.payment;

  return (
    <div className="min-h-[100dvh] bg-surface flex flex-col">
      <header className="bg-white border-b border-line px-4 md:px-10 py-4 flex items-center justify-between"><Logo /><span className="text-sm text-sub">Quote for review</span></header>
      <main className="flex-1 px-4 md:px-10 py-8 md:py-12 max-w-6xl w-full mx-auto">
        {pub.isLoading ? <Skeleton className="h-[600px]" /> : pub.isError || !q ? (
          <div className="text-center py-20"><p className="font-display text-2xl text-ink">This quote link isn't available.</p><p className="text-sub mt-2">{errMsg(pub.error)}</p><button onClick={() => pub.refetch()} className="mt-4 text-ok underline" data-testid="button-retry">Try again</button></div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
            <QuoteDocument value={toInput(q)} readOnly products={[]} number={q.number} totals={q}
              header={<div className="text-sm text-right text-sub"><div>Issued {fmtDate(q.createdAt)}</div><div>Valid until {fmtDate(q.validityDate)}</div></div>} />
            <aside className="space-y-5 lg:sticky lg:top-6">
              <section className="bg-white border border-line rounded-md p-5">
                <div className="text-sm text-sub">Total, annual prepaid</div>
                <div className="font-display text-4xl font-semibold tnum text-ink mt-1">{inr(q.total)}</div>
                {q.status === 'accepted' ? (
                  <div className="mt-5 flex items-center gap-3" data-testid="text-accepted">
                    <span className={`w-10 h-10 rounded-full bg-ok text-white flex items-center justify-center ${justAccepted ? 'dd-pop' : ''}`}><Check className="w-5 h-5" /></span>
                    <div><div className="font-semibold text-ok">Accepted</div><div className="text-sm text-sub">by {q.acceptedBy ?? 'client'}</div></div>
                  </div>
                ) : q.status === 'sent' ? (
                  <form onSubmit={submit} className="mt-5 space-y-3">
                    <label className="block text-sm"><span className="font-medium text-ink">Your full name</span>
                      <input required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-input px-3 py-2" data-testid="input-accept-name" /></label>
                    <p className="text-xs text-sub">Typing your name and accepting confirms this quotation on behalf of {q.clientCompany}.</p>
                    {accept.isError && <p role="alert" className="text-sm text-bad" data-testid="text-accept-error">{errMsg(accept.error)}</p>}
                    <button type="submit" disabled={accept.isPending} className="w-full rounded-md bg-ok text-white py-2.5 font-semibold disabled:opacity-60" data-testid="button-accept">{accept.isPending ? 'Accepting…' : 'Accept quote'}</button>
                  </form>
                ) : <p className="mt-4 text-sm text-sub">This quote is not open for acceptance.</p>}
              </section>
              {pay && (
                <section className="bg-white border border-line rounded-md p-5" data-testid="section-payment">
                  <span className="inline-block text-xs font-medium text-[#8A5A12] border border-[#EBD3A8] bg-[#FBF3E6] rounded px-1.5 py-0.5" data-testid="tag-simulated-volopay">Simulated — Volopay integration</span>
                  <h2 className="font-display font-semibold text-ink mt-2 leading-snug" data-testid="text-payment-heading">Payment request created in Northwind’s Volopay business account</h2>
                  <p className="mt-2 text-sm text-bad font-medium" data-testid="text-payment-disclaimer">No real payment request or bank account has been created. Do not transfer funds.</p>
                  {pay.label && <p className="text-sm text-sub mt-1">{pay.label}</p>}
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-sub">Amount</dt><dd className="tnum text-right font-semibold">{inr(pay.amount)}</dd>
                    <dt className="text-sub">Reference</dt><dd className="tnum text-right">{pay.reference}</dd>
                    <dt className="text-sub">Account name</dt><dd className="text-right">{pay.accountName}</dd>
                    <dt className="text-sub">Account no.</dt><dd className="tnum text-right">{pay.accountNumber}</dd>
                    <dt className="text-sub">IFSC</dt><dd className="tnum text-right">{pay.ifsc}</dd>
                  </dl>
                </section>
              )}
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
