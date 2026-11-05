import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { QuoteInput, Product } from '@workspace/api-client-react';
import { inr, isRecurring } from '@/lib/dd';

type Totals = { subtotal: number; listTotal: number; discountAmount: number; total: number } | null;

type Props = {
  value: QuoteInput;
  onChange?: (v: QuoteInput) => void;
  readOnly?: boolean;
  products: Product[];
  number?: string;
  header?: ReactNode;
  totals?: Totals;
  dirty?: boolean;
};

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-sub mb-0.5">{label}</span>
      {children}
    </label>
  );
}

export function QuoteDocument({ value, onChange, readOnly, products, number, header, totals, dirty }: Props) {
  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => onChange?.({ ...value, [k]: v });
  const prod = (n: string) => products.find((p) => p.name.toLowerCase() === n.trim().toLowerCase());
  const setLine = (i: number, patch: Partial<QuoteInput['lineItems'][number]>) => {
    const lines = value.lineItems.map((l, j) => (j === i ? { ...l, ...patch } : l));
    set('lineItems', lines);
  };
  const txt = (k: 'clientCompany' | 'contactName' | 'contactEmail' | 'repName' | 'billingTerms', type = 'text', cls = '') =>
    readOnly ? <div className={`py-0.5 ${cls}`}>{value[k] || '—'}</div> : (
      <input type={type} className={`doc-input ${cls}`} value={value[k]} onChange={(e) => set(k, e.target.value)} data-testid={`input-${k}`} required />
    );
  const area = (k: 'discountReason' | 'counterOffer' | 'notes', ph: string) =>
    readOnly ? <div className="py-0.5 whitespace-pre-wrap text-ink/90">{value[k] || '—'}</div> : (
      <textarea className="doc-input min-h-[60px] resize-y" placeholder={ph} value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} data-testid={`input-${k}`} />
    );

  const draftLines = value.lineItems.map((l) => {
    const p = prod(l.productName);
    const unit = p?.unit ?? (l.productName === 'Onboarding package' ? 'one-time' : 'month');
    const mult = /annual/i.test(value.billingTerms) && isRecurring(unit) ? 12 : 1;
    return { amount: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * mult, mult, p };
  });
  const draftSub = draftLines.reduce((a, b) => a + b.amount, 0);
  const draftTotal = draftSub * (1 - (Number(value.discountPercent) || 0) / 100);
  const showServer = totals && !dirty;

  return (
    <article className="paper min-w-0 w-full rounded-md px-5 py-7 md:px-12 md:py-12 text-ink break-words" data-testid="quote-document">
      <header className="flex flex-wrap justify-between gap-4 pb-8 border-b border-ink/80">
        <div>
          <div className="text-sm font-semibold text-ok mb-2">Northwind Analytics</div>
          <div className="font-display text-3xl font-semibold">Quotation</div>
          <div className="text-sub tnum mt-1" data-testid="text-quote-number">{number ?? 'New quote — number assigned on save'}</div>
        </div>
        {header}
      </header>

      <section className="grid sm:grid-cols-2 gap-x-10 gap-y-4 py-8 border-b border-line">
        <Field label="Client company">{txt('clientCompany', 'text', 'font-display text-xl font-semibold')}</Field>
        <Field label="Prepared by (rep)">{txt('repName')}</Field>
        <Field label="Contact name">{txt('contactName')}</Field>
        <Field label="Contact email">{txt('contactEmail', 'email')}</Field>
      </section>

      <section className="py-8 border-b border-line">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-sub border-b border-line">
                <th className="font-medium py-2">Product</th>
                <th className="font-medium py-2 w-20 text-right">Qty</th>
                <th className="font-medium py-2 w-32 text-right">Unit price</th>
                <th className="font-medium py-2 w-36 text-right">{/annual/i.test(value.billingTerms) ? 'Annual amount' : 'Amount'}</th>
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {value.lineItems.map((l, i) => {
                const d = draftLines[i];
                const belowFloor = d.p && Math.round(Number(l.unitPrice) * (1 - Number(value.discountPercent) / 100) * 100) / 100 < d.p.floorPrice;
                return (
                  <tr key={i} className="border-b border-line/70 align-top" data-testid={`row-line-${i}`}>
                    <td className="py-2 pr-2">
                      {readOnly ? <div className="py-0.5 font-medium">{l.productName}</div> : (
                        <input className="doc-input font-medium" list="dd-products" value={l.productName}
                          onChange={(e) => {
                            const p = prod(e.target.value);
                            setLine(i, { productName: e.target.value, ...(p && !Number(l.unitPrice) ? { unitPrice: p.listPrice } : {}) });
                          }} data-testid={`input-product-${i}`} aria-label="Product" />
                      )}
                      <div className="text-xs text-sub px-0">
                        {readOnly ? (l.productName === 'Onboarding package' ? 'One-time' : 'Per month') : d.p ? `${d.p.unit} · list ${inr(d.p.listPrice)} · floor ${inr(d.p.floorPrice)}` : 'Choose a product from the price book'}
                        {d.mult === 12 && ' · ×12 annual prepaid'}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {readOnly ? <div className="tnum py-0.5">{l.quantity}</div> : (
                        <input type="number" min={1} className="doc-input text-right tnum" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} data-testid={`input-qty-${i}`} aria-label="Quantity" />
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {readOnly ? <div className="tnum py-0.5">{inr(l.unitPrice)}</div> : (
                        <input type="number" min={0} className={`doc-input text-right tnum ${belowFloor ? 'text-bad' : ''}`} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} data-testid={`input-price-${i}`} aria-label="Unit price" />
                      )}
                      {belowFloor && <div className="text-xs text-bad">Below floor</div>}
                    </td>
                    <td className="py-2 text-right tnum py-2.5">{inr(d.amount)}</td>
                    {!readOnly && (
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => set('lineItems', value.lineItems.filter((_, j) => j !== i))} disabled={value.lineItems.length <= 1}
                          className="p-1.5 text-sub hover:text-bad disabled:opacity-30" aria-label="Remove line" data-testid={`button-remove-line-${i}`}><Trash2 className="w-4 h-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <>
            <datalist id="dd-products">{products.map((p) => <option key={p.name} value={p.name} />)}</datalist>
            <button type="button" onClick={() => set('lineItems', [...value.lineItems, { productName: products[0]?.name ?? '', quantity: 1, unitPrice: products[0]?.listPrice ?? 0 }])}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-ok hover:underline" data-testid="button-add-line"><Plus className="w-4 h-4" />Add line</button>
          </>
        )}

        <div className="mt-8 ml-auto max-w-sm space-y-1.5 text-sm">
          {showServer ? (
            <>
              <Row k="List value" v={inr(totals.listTotal)} muted />
              <Row k="Subtotal" v={inr(totals.subtotal)} />
              <Row k={`Discount (${value.discountPercent}%)`} v={`− ${inr(totals.discountAmount)}`} />
            </>
          ) : (
            <>
              <Row k="Subtotal (estimate)" v={inr(draftSub)} />
              <Row k={`Discount (${value.discountPercent || 0}%)`} v={`− ${inr(draftSub - draftTotal)}`} />
            </>
          )}
          <div className="flex justify-between items-baseline border-t border-ink/80 pt-3 mt-3">
            <span className="font-display text-lg font-semibold">{/annual/i.test(value.billingTerms) ? 'Total, annual prepaid' : 'Total'}</span>
            <span className="font-display text-2xl font-semibold tnum" data-testid="text-total">{inr(showServer ? totals.total : draftTotal)}</span>
          </div>
          {!showServer && <p className="text-xs text-sub text-right">Recalculated by the rules engine when saved.</p>}
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-x-10 gap-y-5 py-8">
        <Field label="Discount percent">
          {readOnly ? <div className="tnum py-0.5">{value.discountPercent}%</div> : (
            <div className="flex items-center gap-1"><input type="number" min={0} max={100} step={0.5} className="doc-input tnum w-28" value={value.discountPercent} onChange={(e) => set('discountPercent', Number(e.target.value))} data-testid="input-discountPercent" /><span>%</span></div>
          )}
        </Field>
        <Field label="Valid until">
          {readOnly ? <div className="py-0.5">{value.validityDate}</div> : (
            <input type="date" className="doc-input" value={value.validityDate} onChange={(e) => set('validityDate', e.target.value)} data-testid="input-validityDate" required />
          )}
        </Field>
        <Field label="Billing terms" className="sm:col-span-2">{txt('billingTerms')}</Field>
        <Field label="Discount reason">{area('discountReason', 'Why this discount? Competitor, volume, strategic logo…')}</Field>
        <Field label="Counter offer">{area('counterOffer', 'What we offer instead if the ask is above policy')}</Field>
        <Field label="Notes" className="sm:col-span-2">{area('notes', 'Terms, scope, implementation notes')}</Field>
      </section>
    </article>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? 'text-sub' : ''}`}><span>{k}</span><span className="tnum">{v}</span></div>;
}
