import { createContext, useContext } from 'react';
import { createServices, type DataService } from '@/services';
import { createMockAuthService } from '@/services/adapters/mockAuth';
import type { AuthService } from '@/services/auth';

export interface ApplicationServices { data: DataService; auth: AuthService }
export function createApplicationServices(): ApplicationServices {
  const data = createServices();
  return { data, auth: createMockAuthService(data) };
}
export const ServicesContext = createContext<DataService | null>(null);
export function useServices() {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside the application provider.');
  return services;
}
