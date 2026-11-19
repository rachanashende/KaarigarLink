import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';

export function useWorkshopWorkspace() {
  const services = useServices();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workshop', user?.id, 'workspace'],
    queryFn: () => services.workshop.getWorkspace(user!.id),
    enabled: user?.role === 'workshop',
  });
}
