import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';

export function useAdminOverview() {
  const services = useServices(); const { user } = useAuth();
  return useQuery({ queryKey: ['admin', user?.id, 'overview'], queryFn: () => services.admin.getOverview(user!.id), enabled: user?.role === 'admin' });
}
