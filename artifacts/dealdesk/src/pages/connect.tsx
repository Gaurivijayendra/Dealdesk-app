import { useGetConnectionInfo, getGetConnectionInfoQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shell';
import { CopyBtn } from '@/components/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { errMsg } from '@/lib/dd';

const PROMPTS = [
  'Draft a DealDesk quote for Brightline Analytics: 40 Growth seats, annual prepaid. They want 25% off because a competitor quoted ₹450 per seat. Include the reason, and if it lands above policy, add a counter offer we can live with.',
  'List my DealDesk quotes waiting on Sales Head approval and tell me which ones are below floor.',
  'Update quote for Kaveri Logistics: drop the discount to 12% and add 6 onboarding hours, then submit it for approval.',
  'Which DealDesk quotes are waiting for my approval? Summarise each in one line.',
];

export default function ConnectPage() {
  const info = useGetConnectionInfo({ query: { queryKey: getGetConnectionInfoQueryKey() } });
  const url = info.data ? `${window.location.origin}${info.data.mcpPath}` : '';

  return (
    <div className="px-4 md:px-10 py-8 md:py-12 max-w-4xl">
      <PageHeader title="Connect to Claude" sub="AI writes the deal. Rules and people protect the margin. Your reps use their own Claude; DealDesk exposes a connector so every draft goes through your rules." />
      {info.isLoading ? <Skeleton className="h-40" /> : info.isError || !info.data ? (
        <div><p className="text-bad">{errMsg(info.error)}</p><button onClick={() => info.refetch()} className="mt-2 text-ok underline" data-testid="button-retry">Retry</button></div>
      ) : (
        <>
          <section className="bg-white border border-line rounded-md p-5 md:p-6 mb-8">
            <div className="text-sm font-semibold text-ink">MCP URL</div>
            <div className="mt-2 flex flex-wrap gap-3 items-center">
              <code className="flex-1 min-w-0 break-all font-mono text-ink bg-surface border border-line rounded px-3 py-2" data-testid="text-mcp-url">{url}</code>
              <CopyBtn text={url} id="url" />
            </div>
            <p className="mt-3 text-sm text-sub">This is the URL of the environment you are viewing. Once the app is published, use the published HTTPS URL followed by <code className="font-mono">{info.data.mcpPath}</code> instead.</p>
            <div className="mt-4 text-sm flex flex-wrap gap-x-6 gap-y-1"><span><span className="text-sub">Transport</span> <span className="text-ink" data-testid="text-transport">{info.data.transport}</span></span></div>
            {info.data.warning && <p className="mt-4 text-sm border border-[#EBD3A8] bg-[#FBF3E6] text-[#8A5A12] rounded px-3 py-2" data-testid="text-warning">{info.data.warning}</p>}
          </section>

          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-4">Connect DealDesk to your Claude (about 1 minute)</h2>
            <ol className="space-y-4">
              {[
                'Open Claude (claude.ai, the desktop app, or the mobile app) and go to Customize → Connectors.',
                'Click "+ Add", then "Add custom connector".',
                'Name it "DealDesk" and paste the MCP URL shown above (with a Copy button), then click "Continue".',
                'Under Authentication choose "No sign in", then click "Add".',
                'Open a new chat, click the "+" button at the lower left, select "Connectors", and switch DealDesk on.',
                'Try one of the example prompts below.',
              ].map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span className="font-display text-2xl font-semibold text-ok tnum w-8">{i + 1}</span>
                  <p className="flex-1 text-ink">{step}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm text-sub">Works on Free, Pro, Max, Team and Enterprise plans. Free plans allow one custom connector. On Team or Enterprise, an organisation Owner adds it once under Organization settings → Connectors, then each member clicks Connect.</p>
          </section>

          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-4">Try these prompts</h2>
            <div className="space-y-3">
              {PROMPTS.map((p, i) => (
                <div key={i} className="bg-white border border-line rounded-md p-4 flex flex-col sm:flex-row gap-3 sm:items-start" data-testid={`card-prompt-${i}`}>
                  <p className="flex-1 text-ink">{p}</p><CopyBtn text={p} id={`prompt-${i}`} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Tools Claude can call</h2>
            <ul className="flex flex-wrap gap-2" data-testid="list-tools">
              {info.data.tools.map((t) => <li key={t} className="font-mono text-sm border border-line bg-white rounded px-2 py-1">{t}</li>)}
            </ul>
            <p className="text-sm text-sub mt-4">DealDesk itself contains no AI. Quotes created through these tools are tagged Created via Claude and go through the same rules and approvals.</p>
          </section>
        </>
      )}
    </div>
  );
}
