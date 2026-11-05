import type { Quote, QuoteInput, QuoteStatus, Band } from '@workspace/api-client-react';
import { format, parseISO, isValid } from 'date-fns';

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = (n: number | null | undefined) => inrFmt.format(Math.round(Number(n) || 0));
export const pct = (n: number | null | undefined, d = 1) => `${(Number(n) || 0).toFixed(d).replace(/\.0$/, '')}%`;

export function fmtDate(s?: string | null, f = 'd MMM yyyy') {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, f) : s;
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  sent: 'Sent',
  accepted: 'Accepted',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
};

export const STATUS_TONE: Record<QuoteStatus, string> = {
  draft: 'bg-surface text-sub border-line',
  pending_approval: 'bg-[#FBF3E6] text-[#8A5A12] border-[#EBD3A8]',
  approved: 'bg-[#E6F3EF] text-ok border-[#B9DDD2]',
  sent: 'bg-[#E8EEF7] text-ink border-[#C9D4E6]',
  accepted: 'bg-ok text-white border-ok',
  changes_requested: 'bg-[#FBF3E6] text-[#8A5A12] border-[#EBD3A8]',
  rejected: 'bg-[#F8E9E8] text-bad border-[#E8C3C0]',
};

export function isRecurring(unit?: string) {
  return !!unit && /month|monthly|\/mo\b/i.test(unit);
}

export function toInput(q: Quote): QuoteInput {
  return {
    clientCompany: q.clientCompany,
    contactName: q.contactName,
    contactEmail: q.contactEmail,
    repName: q.repName,
    lineItems: q.lineItems.map((l) => ({ productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice })),
    discountPercent: q.discountPercent,
    discountReason: q.discountReason ?? '',
    counterOffer: q.counterOffer ?? '',
    billingTerms: q.billingTerms,
    validityDate: q.validityDate?.slice(0, 10) ?? '',
    notes: q.notes ?? '',
    version: q.version,
  };
}

export function errMsg(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong.';
}

export function repLimit(bands: Band[] | undefined) {
  if (!bands?.length) return 0;
  const rep = bands.filter((b) => b.approver === 'Rep').map((b) => b.maxDiscount);
  return rep.length ? Math.max(...rep) : 0;
}

export function isSeed(q: Quote) {
  const first = q.history?.[0];
  const t = `${first?.actor ?? ''} ${first?.message ?? ''} ${q.notes ?? ''}`.toLowerCase();
  return /simulated|seed|demo data/.test(t);
}
