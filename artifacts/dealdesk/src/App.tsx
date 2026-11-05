import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AppShell } from '@/components/shell';
import LoginPage from '@/pages/login';
import QuotesPage from '@/pages/quotes';
import QuoteNewPage from '@/pages/quote-new';
import QuoteDetailPage from '@/pages/quote-detail';
import DashboardPage from '@/pages/dashboard';
import RulesPage from '@/pages/rules';
import ConnectPage from '@/pages/connect';
import ClientPage from '@/pages/client';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

function Router() {
  return (
    <Switch>
      <Route path="/login"><RoutedErrorBoundary><LoginPage /></RoutedErrorBoundary></Route>
      <Route path="/client/:token"><RoutedErrorBoundary><ClientPage /></RoutedErrorBoundary></Route>
      <Route>
        <AppShell>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/"><QuotesPage /></Route>
              <Route path="/quotes"><QuotesPage /></Route>
              <Route path="/approvals">{() => <QuotesPage approvals />}</Route>
              <Route path="/quotes/new" component={QuoteNewPage} />
              <Route path="/quotes/:id" component={QuoteDetailPage} />
              <Route path="/dashboard" component={DashboardPage} />
              <Route path="/rules" component={RulesPage} />
              <Route path="/connect" component={ConnectPage} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </AppShell>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
