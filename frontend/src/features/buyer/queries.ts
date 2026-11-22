import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';

export function useBuyerDashboard() {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'dashboard'], queryFn: () => services.buyer.getDashboard(user!.id), enabled: user?.role === 'buyer' });
}
export function useBuyerJobs() {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'jobs'], queryFn: () => services.buyer.listJobs(user!.id), enabled: user?.role === 'buyer' });
}
export function useBuyerJob(id: string) {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'job', id], queryFn: () => services.buyer.getJob(user!.id, id), enabled: user?.role === 'buyer' });
}

export function useBuyerMatches(id: string) {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'matches', id], queryFn: () => services.buyer.getMatches(user!.id, id), enabled: user?.role === 'buyer' });
}
export function useBuyerQuotes(id: string) {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'quotes', id], queryFn: () => services.buyer.getQuotes(user!.id, id), enabled: user?.role === 'buyer' });
}

export function useBuyerOrders() {
  const services = useServices(); const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'orders'], queryFn: () => services.buyer.listOrders(user!.id), enabled: user?.role === 'buyer' });
}
export function useBuyerOrder(id: string) {
  const services = useServices(); const { user } = useAuth();
  return useQuery({ queryKey: ['buyer', user?.id, 'order', id], queryFn: () => services.buyer.getOrder(user!.id, id), enabled: user?.role === 'buyer' });
}
