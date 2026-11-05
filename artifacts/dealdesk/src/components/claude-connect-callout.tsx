import { Link } from 'wouter';
import { useGetConnectionInfo, getGetConnectionInfoQueryKey } from '@workspace/api-client-react';
import { CopyBtn } from '@/components/copy-button';
import { errMsg } from '@/lib/dd';

export function ClaudeConnectCallout() {
  const info = useGetConnectionInfo({ query: { queryKey: getGetConnectionInfoQueryKey() } });
  const url = info.data ? `${window.location.origin}${info.data.mcpPath}` : '';
  return (
    <section className="mt-5 mx-auto max-w-xl rounded-md border border-line bg-surface p-4 text-left" data-testid="callout-connect-claude">
      <Link href="/connect" className="font-display font-semibold text-ok hover:underline">Connect to Claude</Link>
      <p className="mt-1 text-sm text-sub">Connect your Claude to draft your first DealDesk quote.</p>
      {info.isLoading ? <p className="mt-2 text-sm text-sub">Loading MCP URL…</p> : info.isError ? (
        <div className="mt-2 text-sm"><p role="alert" className="text-bad">{errMsg(info.error)}</p><button type="button" onClick={() => info.refetch()} className="text-ok underline">Retry</button></div>
      ) : url && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded border border-line bg-white px-2 py-2 text-xs text-ink select-all" data-testid="text-empty-mcp-url">{url}</code>
          <CopyBtn text={url} id="empty-mcp-url" />
        </div>
      )}
      <p className="mt-2 text-xs text-sub">Use your published HTTPS URL for Claude. <Link href="/connect" className="text-ok underline">View setup steps</Link></p>
    </section>
  );
}
