import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';

export function useInspections() {
  const services = useServices(); const { user } = useAuth();
  return useQuery({ queryKey: ['inspector', user?.id, 'inspections'], queryFn: () => services.inspector.listInspections(user!.id), enabled: user?.role === 'inspector' });
}
export function useInspection(id: string) {
  const services = useServices(); const { user } = useAuth();
  return useQuery({ queryKey: ['inspector', user?.id, 'inspection', id], queryFn: () => services.inspector.getInspection(user!.id, id), enabled: user?.role === 'inspector' });
}
