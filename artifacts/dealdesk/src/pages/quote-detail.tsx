import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Lock, Copy } from 'lucide-react';
import {
  useGetQuote, getGetQuoteQueryKey, useUpdateQuote, useQuoteAction, useGetPolicy, getGetPolicyQueryKey,
  useGetSession, getGetSessionQueryKey, getListQuotesQueryKey, getGetDashboardQueryKey,
  type Quote, type QuoteInput, type ActionInputAction,
} from '@workspace/api-client-react';
import { QuoteDocument } from '@/components/quote-document';
import { MarginMeter } from '@/components/margin-meter';
import { StatusBadge, SourceTag, SimTag } from '@/components/badges';
import { Skeleton } from '@/components/ui/skeleton';
import { toInput, errMsg, fmtDate, isSeed } from '@/lib/dd';

type StepState = 'done' | 'current' | 'skipped' | 'todo' | 'stopped';

function steps(q: Quote): { label: string; state: StepState; note: string }[] {
  const s = q.status;
  const after = ['approved', 'sent', 'accepted'].includes(s);
  const ap = q.requiredApprover;
  const approverStep = (role: 'Sales Head' | 'Founder'): { state: StepState; note: string } => {
    if (ap === 'Rep') return { state: 'skipped', note: 'Skipped — within rep band' };
    if (ap !== role) return { state: 'skipped', note: role === 'Sales Head' ? 'Skipped — routed straight to Founder' : 'Skipped — Sales Head band covers it' };
    if (after) return { state: 'done', note: q.approvedAt ? `Approved ${fmtDate(q.approvedAt, 'd MMM, HH:mm')}` : 'Approved' };
    if (s === 'pending_approval') return { state: 'current', note: 'Awaiting decision' };
    if (s === 'rejected') return { state: 'stopped', note: 'Rejected' };
    if (s === 'changes_requested') return { state: 'stopped', note: 'Changes requested' };
    return { state: 'todo', note: 'Needed once submitted' };
  };
  return [
    { label: q.source === 'claude' ? 'Created by Claude' : 'Created by rep', state: 'done', note: `${q.repName} · ${fmtDate(q.createdAt)}` },
    { label: 'Sales Head', ...approverStep('Sales Head') },
    { label: 'Founder', ...approverStep('Founder') },
    { label: 'Sent', state: s === 'sent' || s === 'accepted' ? 'done' : s === 'approved' ? 'current' : 'todo', note: s === 'approved' ? 'Ready to send' : s === 'sent' || s === 'accepted' ? 'Link shared with client' : '' },
    { label: 'Accepted', state: s === 'accepted' ? 'done' : s === 'sent' ? 'current' : 'todo', note: s === 'accepted' ? `By ${q.acceptedBy ?? 'client'}` : s === 'sent' ? 'Waiting on client' : '' },
  ];
}

const DOT: Record<StepState, string> = {
  done: 'bg-ok border-ok', current: 'bg-white border-warn border-2', skipped: 'bg-white border-line border-dashed', todo: 'bg-white border-line', stopped: 'bg-bad border-bad',
};

export default function QuoteDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const quote = useGetQuote(id, { query: { queryKey: getGetQuoteQueryKey(id), enabled: !!id, refetchInterval: 15000 } });
  const policy = useGetPolicy({ query: { queryKey: getGetPolicyQueryKey() } });
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const update = useUpdateQuote();
  const action = useQuoteAction();

  const [form, setForm] = useState<QuoteInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [comment, setComment] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [link, setLink] = useState<{ url: string; copied: boolean } | null>(null);
  const syncedVersion = useRef<string>('');

  const q = quote.data;
  useEffect(() => {
    if (!q) return;
    const key = `${q.id}:${q.version}`;
    if (syncedVersion.current !== key && !dirty) {
      syncedVersion.current = key;
      setForm(toInput(q));
    }
  }, [q, dirty]);

  const invalidate = (next: Quote) => {
    qc.setQueryData(getGetQuoteQueryKey(id), next);
    qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  if (quote.isLoading || (!form && !quote.isError)) {
    return <div className="px-4 md:px-10 py-12 grid lg:grid-cols-[1fr_360px] gap-8"><Skeleton className="h-[700px]" /><Skeleton className="h-[500px]" /></div>;
  }
  if (quote.isError || !q || !form) {
    return <div className="px-10 py-16"><p className="text-bad">{errMsg(quote.error)}</p><button onClick={() => quote.refetch()} className="mt-3 text-ok underline" data-testid="button-retry">Retry</button> <Link href="/quotes" className="ml-4 text-sub underline">Back to quotes</Link></div>;
  }

  const role = session.data?.role;
  const locked = q.status === 'accepted';
  const canDecide = q.status === 'pending_approval' && role === q.requiredApprover;
  const canSubmit = q.status === 'draft' || q.status === 'changes_requested';
  const canSend = q.status === 'approved';
  const shareUrl = `${window.location.origin}/client/${q.publicToken}`;

  const save = () => update.mutate({ id, data: { ...form, version: form.version } }, {
    onSuccess: (next) => { setDirty(false); syncedVersion.current = `${next.id}:${next.version}`; setForm(toInput(next)); invalidate(next); },
  });

  const act = (a: ActionInputAction) => action.mutate({ id, data: { action: a, comment: comment.trim() || undefined, version: form.version ?? q.version } }, {
    onSuccess: async (next) => {
      invalidate(next);
      setComment('');
      if (a === 'approve' && next.status === 'approved') { setCelebrate(true); setTimeout(() => setCelebrate(false), 2200); }
      if (a === 'send') {
        const url = `${window.location.origin}/client/${next.publicToken}`;
        try { await navigator.clipboard.writeText(url); setLink({ url, copied: true }); }
        catch { setLink({ url, copied: false }); }
      }
    },
  });

  return (
    <div className="px-4 md:px-10 py-8 md:py-10">
      <Link href="/quotes" className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink mb-5" data-testid="link-back"><ArrowLeft className="w-4 h-4" />Quotes</Link>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-ink mr-2">{q.clientCompany}</h1>
        <StatusBadge status={q.status} /><SourceTag source={q.source} />{isSeed(q) && <SimTag />}
        {locked && <span className="inline-flex items-center gap-1 text-xs text-sub"><Lock className="w-3.5 h-3.5" />Accepted quotes are locked</span>}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
        <div className="min-w-0">
          <QuoteDocument value={form} onChange={(v) => { setForm(v); setDirty(true); }} readOnly={locked} products={policy.data?.products ?? []}
            number={q.number} totals={q} dirty={dirty}
            header={<div className="text-sm text-right text-sub"><div>Issued {fmtDate(q.createdAt)}</div><div>Version {q.version}</div></div>} />
          {!locked && (
            <div className={`sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-3 py-3 bg-surface/95 ${dirty ? '' : 'opacity-80'}`}>
              {update.isError && <p role="alert" className="text-bad text-sm mr-auto" data-testid="text-save-error">{errMsg(update.error)}</p>}
              {dirty && !update.isError && <span className="text-sm text-warn mr-auto">Unsaved changes</span>}
              <button onClick={() => { setForm(toInput(q)); setDirty(false); update.reset(); }} disabled={!dirty} className="rounded-md border border-line bg-white px-4 py-2 text-sm disabled:opacity-50" data-testid="button-discard">Discard</button>
              <button onClick={save} disabled={!dirty || update.isPending} className="rounded-md bg-ok text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" data-testid="button-save">{update.isPending ? 'Saving…' : 'Save changes'}</button>
            </div>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <section className="bg-white border border-line rounded-md p-5">
            <MarginMeter listTotal={q.listTotal} floorTotal={q.floorTotal} effective={q.effectiveDiscountPercent} original={q.originalDiscountPercent} approved={q.approvedDiscountPercent} bands={policy.data?.bands} belowFloor={q.belowFloor} />
            {q.belowFloor && <p className="mt-3 text-sm text-bad font-medium" data-testid="text-below-floor">Below floor — this quote gives away margin past policy.</p>}
          </section>

          <section className="bg-white border border-line rounded-md p-5">
            <div className="text-sm text-sub">Active rule</div>
            <p className="mt-1 text-ink" data-testid="text-rule">{q.ruleDescription}</p>
            <div className="mt-3 flex justify-between text-sm"><span className="text-sub">Required approver</span><span className="font-semibold" data-testid="text-approver">{q.requiredApprover}</span></div>
          </section>

          <section className="bg-white border border-line rounded-md p-5 relative overflow-hidden">
            {celebrate && <div className="absolute right-4 top-4 dd-pop w-10 h-10 rounded-full bg-ok text-white flex items-center justify-center" aria-hidden="true"><Check className="w-5 h-5" /></div>}
            <ol className="space-y-0" aria-label="Approval path">
              {steps(q).map((st, i, arr) => (
                <li key={st.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-3.5 h-3.5 rounded-full border mt-1 ${DOT[st.state]}`} />
                    {i < arr.length - 1 && <span className="w-px flex-1 bg-line my-1 min-h-[22px]" />}
                  </div>
                  <div className="pb-4">
                    <div className={`text-sm font-medium ${st.state === 'skipped' || st.state === 'todo' ? 'text-sub' : 'text-ink'}`}>{st.label}</div>
                    {st.note && <div className={`text-xs ${st.state === 'stopped' ? 'text-bad' : st.state === 'current' ? 'text-warn' : 'text-sub'}`}>{st.note}</div>}
                  </div>
                </li>
              ))}
            </ol>

            {!locked && (
              <div className="border-t border-line pt-4 space-y-3">
                {(canDecide || canSubmit) && (
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" aria-label="Comment"
                    className="w-full rounded-md border border-line px-3 py-2 text-sm min-h-[60px]" data-testid="input-comment" />
                )}
                {dirty && (canDecide || canSubmit || canSend) && <p className="text-xs text-warn">Save your edits before taking a workflow action.</p>}
                {canSubmit && <button onClick={() => act('submit')} disabled={action.isPending || dirty} className="w-full rounded-md bg-ink text-white py-2 text-sm font-semibold disabled:opacity-50" data-testid="button-submit">Submit for approval</button>}
                {canDecide && (
                  <div className="grid gap-2">
                    <button onClick={() => act('approve')} disabled={action.isPending || dirty} className="rounded-md bg-ok text-white py-2 text-sm font-semibold disabled:opacity-50" data-testid="button-approve">Approve quote</button>
                    <p className="text-xs text-sub">Deciding as {role} (simulated demo role)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => act('request_changes')} disabled={action.isPending || dirty} className="rounded-md border border-[#EBD3A8] text-[#8A5A12] py-2 text-sm disabled:opacity-50" data-testid="button-request-changes">Request changes</button>
                      <button onClick={() => act('reject')} disabled={action.isPending || dirty} className="rounded-md border border-[#E8C3C0] text-bad py-2 text-sm disabled:opacity-50" data-testid="button-reject">Reject</button>
                    </div>
                  </div>
                )}
                {q.status === 'pending_approval' && !canDecide && <p className="text-sm text-sub">Only the {q.requiredApprover} can decide. Switch the simulated role to act.</p>}
                {canSend && <button onClick={() => act('send')} disabled={action.isPending || dirty} className="w-full rounded-md bg-ok text-white py-2 text-sm font-semibold disabled:opacity-50" data-testid="button-send">Send to client</button>}
                {action.isError && <p role="alert" className="text-sm text-bad" data-testid="text-action-error">{errMsg(action.error)}</p>}
              </div>
            )}

            {(link || q.status === 'sent' || q.status === 'accepted') && (
              <div className="border-t border-line pt-4 mt-2 text-sm">
                {link && (link.copied
                  ? <p className="text-ok font-medium" data-testid="text-link-copied">Client link copied to clipboard.</p>
                  : <p className="text-warn" data-testid="text-copy-failed">Couldn't copy automatically — select and copy the link below.</p>)}
                <div className="mt-2 flex gap-2">
                  <input readOnly value={link?.url ?? shareUrl} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 rounded border border-line px-2 py-1.5 text-xs tnum bg-surface" aria-label="Client link" data-testid="input-client-link" />
                  <button onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setLink({ url: shareUrl, copied: true }); } catch { setLink({ url: shareUrl, copied: false }); } }}
                    className="p-2 border border-line rounded" aria-label="Copy link" data-testid="button-copy-link"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border border-line rounded-md p-5">
            <h2 className="font-display font-semibold text-ink mb-3">Audit log</h2>
            <ol className="space-y-3 text-sm max-h-80 overflow-y-auto" data-testid="list-audit">
              {[...q.history].reverse().map((h, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <div className="text-ink">{h.message}</div>
                  <div className="text-xs text-sub">{h.actor} · {fmtDate(h.at, 'd MMM yyyy, HH:mm')}</div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
