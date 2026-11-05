import type { QuoteStatus, QuoteSource } from '@workspace/api-client-react';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/dd';

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${STATUS_TONE[status]}`} data-testid={`status-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SourceTag({ source }: { source: QuoteSource }) {
  return source === 'claude' ? (
    <span className="inline-flex items-center gap-1 text-xs text-ink border border-line rounded px-1.5 py-0.5 whitespace-nowrap" data-testid="tag-source-claude">
      <span className="w-1.5 h-1.5 rounded-full bg-ink" />Created via Claude
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-sub border border-line rounded px-1.5 py-0.5 whitespace-nowrap" data-testid="tag-source-manual">
      <span className="w-1.5 h-1.5 rounded-full border border-sub" />Created manually
    </span>
  );
}

export function SimTag() {
  return <span className="text-xs text-warn border border-[#EBD3A8] bg-[#FBF3E6] rounded px-1.5 py-0.5 whitespace-nowrap" data-testid="tag-simulated">Simulated demo data</span>;
}
