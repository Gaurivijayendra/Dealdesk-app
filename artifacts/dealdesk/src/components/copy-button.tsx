import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyBtn({ text, id }: { text: string; id: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setState('ok'); } catch { setState('fail'); } setTimeout(() => setState('idle'), 2500); }}
      className="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-surface" data-testid={`button-copy-${id}`}>
      {state === 'ok' ? <><Check className="w-4 h-4 text-ok" />Copied</> : state === 'fail' ? 'Copy failed — select manually' : <><Copy className="w-4 h-4" />Copy</>}
    </button>
  );
}
