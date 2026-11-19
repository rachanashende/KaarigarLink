import { Component, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ErrorState } from '@/components/feedback';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { createApplicationServices, ServicesContext, type ApplicationServices } from './services';
import { AppRoutes } from './router';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="mx-auto max-w-xl p-6"><ErrorState title="Unable to start KaarigarLink" message="The application could not start. Check service configuration and reload." onRetry={() => window.location.reload()} /></div> : this.props.children;
  }
}
export function AppProviders({ children, services }: { children: ReactNode; services?: ApplicationServices }) {
  const [shared] = useState(() => services ?? createApplicationServices());
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }));
  return <QueryClientProvider client={queryClient}><ServicesContext value={shared.data}><AuthProvider service={shared.auth}>{children}</AuthProvider></ServicesContext></QueryClientProvider>;
}
export function App() {
  return <AppErrorBoundary>
    <BrowserRouter><AppProviders><AppRoutes /></AppProviders></BrowserRouter>
  </AppErrorBoundary>;
}
