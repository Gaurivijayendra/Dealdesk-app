import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, CheckSquare, BarChart3, Scale, Plug, LogOut } from 'lucide-react';
import { useGetSession, getGetSessionQueryKey, useLogout, useSwitchRole, Role } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';

const NAV = [
  { href: '/quotes', label: 'Quotes', icon: FileText, match: (l: string) => l === '/' || l.startsWith('/quotes') },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, match: (l: string) => l.startsWith('/approvals') },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3, match: (l: string) => l.startsWith('/dashboard') },
  { href: '/rules', label: 'Rules', icon: Scale, match: (l: string) => l.startsWith('/rules') },
  { href: '/connect', label: 'Connect to Claude', icon: Plug, match: (l: string) => l.startsWith('/connect') },
];

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-semibold text-ink ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="4" fill="none" stroke="#18233A" strokeWidth="1.5" /><rect x="5" y="13" width="12" height="2.5" fill="#F1D3D0" /><rect x="5" y="13" width="7" height="2.5" fill="#0F7B5F" /><rect x="5" y="7" width="8" height="1.5" fill="#18233A" /></svg>
      DealDesk
    </span>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-4 text-sm text-sub text-center" data-testid="text-footer">
      No AI inside — Claude does the thinking, DealDesk does the rest.
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), refetchInterval: 60000 } });
  const logout = useLogout();
  const switchRole = useSwitchRole();

  useEffect(() => {
    if (session.data && !session.data.authenticated) setLocation('/login');
    if (session.isError) setLocation('/login');
  }, [session.data, session.isError, setLocation]);

  if (session.isLoading || !session.data?.authenticated) {
    return <div className="min-h-[100dvh] bg-surface p-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full mt-6" /></div>;
  }
  const s = session.data;

  const doLogout = () => logout.mutate(undefined, { onSettled: () => { qc.clear(); setLocation('/login'); } });
  const doSwitch = (role: Role) => switchRole.mutate({ data: { role } }, {
    onSuccess: (next) => { qc.setQueryData(getGetSessionQueryKey(), next); qc.invalidateQueries(); },
  });

  return (
    <div className="min-h-[100dvh] bg-surface md:flex">
      <aside className="md:w-56 md:shrink-0 md:h-[100dvh] md:sticky md:top-0 bg-white border-b md:border-b-0 md:border-r border-line flex md:flex-col">
        <div className="hidden md:block px-5 pt-6 pb-8"><Link href="/quotes" data-testid="link-home"><Logo className="text-lg" /></Link></div>
        <nav className="flex md:flex-col gap-0.5 px-2 md:px-3 overflow-x-auto py-2 md:py-0 flex-1" aria-label="Main">
          {NAV.map((n) => {
            const active = n.match(location);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(/ /g, '-')}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${active ? 'bg-surface text-ink font-semibold' : 'text-sub hover:text-ink hover:bg-surface/60'}`}
                aria-current={active ? 'page' : undefined}>
                <n.icon className={`w-4 h-4 ${active ? 'text-ok' : ''}`} strokeWidth={1.75} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block p-4 border-t border-line">
          <button onClick={doLogout} className="flex items-center gap-2 text-sm text-sub hover:text-ink" data-testid="button-logout"><LogOut className="w-4 h-4" />Sign out</button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col min-h-[100dvh] md:min-h-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 md:px-10 h-12 bg-white/95 border-b border-line text-sm" data-testid="bar-top">
          <span className="font-medium text-ink truncate hidden sm:inline" data-testid="text-user-name">{s.name}</span>
          <label className="ml-auto flex items-center gap-2 text-sub">
            <span className="whitespace-nowrap">Viewing as <span className="hidden sm:inline">(Simulated demo role)</span></span>
            <select value={s.role} onChange={(e) => doSwitch(e.target.value as Role)} disabled={switchRole.isPending}
              className="border border-line rounded-md bg-white px-2 py-1 text-ink" data-testid="select-role">
              {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <span className="sm:hidden text-xs text-sub">(Simulated)</span>
          <button onClick={doLogout} className="md:hidden p-1 text-sub" aria-label="Sign out" data-testid="button-logout-mobile"><LogOut className="w-4 h-4" /></button>
        </header>
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold text-ink">{title}</h1>
        {sub && <p className="text-sub mt-1.5 max-w-2xl">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
