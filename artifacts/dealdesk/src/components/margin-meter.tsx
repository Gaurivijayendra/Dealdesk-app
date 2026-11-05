import type { Band } from '@workspace/api-client-react';
import { pct, inr } from '@/lib/dd';

type Props = {
  listTotal: number;
  floorTotal: number;
  effective: number;
  original?: number;
  approved?: number | null;
  bands: Band[] | undefined;
  belowFloor?: boolean;
  size?: 'mini' | 'large';
};

export function MarginMeter({ listTotal, floorTotal, effective, original, approved, bands, belowFloor, size = 'large' }: Props) {
  const floorD = listTotal > 0 ? Math.max(0, (1 - floorTotal / listTotal) * 100) : 0;
  const bandMax = (r: string) => { const m = (bands ?? []).filter((b) => b.approver === r).map((b) => b.maxDiscount); return m.length ? Math.max(...m) : 0; };
  const repRaw = bandMax('Rep');
  const shRaw = Math.max(bandMax('Sales Head'), repRaw);
  const rep = Math.min(repRaw, floorD);
  const sh = Math.min(shRaw, floorD);
  const maxScale = Math.min(100, Math.max(floorD * 1.3, (original ?? 0) + 4, effective + 4, 10));
  const pos = (x: number) => `${Math.max(0, Math.min(100, (x / maxScale) * 100))}%`;
  const zone = belowFloor || effective > sh + 0.001 ? 'bad' : effective > rep + 0.001 ? 'warn' : 'ok';
  const toneText = zone === 'bad' ? 'text-bad' : zone === 'warn' ? 'text-warn' : 'text-ok';

  const bar = (h: string) => (
    <div className={`relative w-full ${h} rounded-sm overflow-visible`}>
      <div className="absolute inset-y-0 left-0 bg-[#D7EDE6] rounded-l-sm" style={{ width: pos(rep) }} />
      <div className="absolute inset-y-0 bg-[#F4E4C6]" style={{ left: pos(rep), width: `calc(${pos(sh)} - ${pos(rep)})` }} />
      <div className="absolute inset-y-0 right-0 bg-[#F1D3D0] rounded-r-sm" style={{ left: pos(sh) }} />
      <div className="absolute -inset-y-1 w-px bg-bad" style={{ left: pos(floorD) }} />
      {original !== undefined && (
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-warn bg-white"
          style={{ left: pos(original), width: size === 'mini' ? 9 : 14, height: size === 'mini' ? 9 : 14 }} />
      )}
      {approved != null && (
        <div className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 ${size === 'mini' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} bg-ok border border-white z-10`} style={{ left: pos(approved) }} />
      )}
      <div className="absolute -inset-y-1.5 w-[3px] -translate-x-1/2 bg-ink rounded-sm" style={{ left: pos(effective) }} />
    </div>
  );

  if (size === 'mini') {
    return (
      <div className="w-28" aria-label={`Discount ${pct(effective)}, floor at ${pct(floorD)}`} title={`Discount ${pct(effective)} · requested ${pct(original)} · approved ${approved != null ? pct(approved) : '—'} · Rep to ${pct(repRaw)} · Sales Head to ${pct(shRaw)} · floor ${pct(floorD)}${belowFloor ? ' · below floor' : ''}`}>
        {bar('h-1.5')}
      </div>
    );
  }

  return (
    <div data-testid="margin-meter">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-sub">Discount off list</div>
          <div className={`font-display text-5xl font-semibold tnum ${toneText}`} data-testid="text-effective-discount">{pct(effective)}</div>
        </div>
        <div className="text-right text-sm">
          <div className="text-sub">Headroom to floor</div>
          <div className={`tnum font-semibold ${floorD - effective < 0 ? 'text-bad' : 'text-ink'}`}>{pct(floorD - effective)}</div>
        </div>
      </div>
      <div className="mt-6 mb-2">{bar('h-3')}</div>
      <div className="relative h-9 text-[11px] text-sub tnum">
        <span className="absolute left-0">List 0%</span>
        {rep > 0 && <span className="absolute -translate-x-1/2 text-ok" style={{ left: pos(rep) }}>Rep {pct(rep)}</span>}
        {sh > rep && <span className="absolute -translate-x-1/2 top-4 text-warn" style={{ left: `calc(${pos(sh)} - 0px)`, display: Math.abs(sh - floorD) < maxScale * 0.12 ? 'none' : undefined }}>Sales Head {pct(sh)}</span>}
        <span className="absolute -translate-x-1/2 top-4 text-bad font-medium" style={{ left: pos(floorD) }}>Floor {pct(floorD)}</span>
        <span className="absolute right-0">{pct(maxScale, 0)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-sub mb-3"><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#D7EDE6]" />Rep approves</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#F4E4C6]" />Sales Head</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#F1D3D0]" />Founder / below floor</span></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-line pt-3">
        <dt className="text-sub flex items-center gap-2"><span className="w-[3px] h-3 bg-ink inline-block" />Current</dt><dd className="tnum text-right">{pct(effective)}</dd>
        {original !== undefined && (<><dt className="text-sub flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border-2 border-warn inline-block" />Originally requested</dt><dd className="tnum text-right">{pct(original)}</dd></>)}
        <dt className="text-sub flex items-center gap-2"><span className="w-2 h-2 rotate-45 bg-ok inline-block" />Approved</dt><dd className="tnum text-right">{approved != null ? pct(approved) : 'Not yet'}</dd>
        <dt className="text-sub">List total</dt><dd className="tnum text-right">{inr(listTotal)}</dd>
        <dt className="text-sub">Floor total</dt><dd className="tnum text-right text-bad">{inr(floorTotal)}</dd>
      </dl>
    </div>
  );
}
