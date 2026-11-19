import type { WorkshopService } from './workshop';
import type { AdminService } from './admin';
import type { InspectorService } from './inspections';
import type { BuyerService } from './jobs';
import type { Collections } from '@/types';

export type ServiceErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'NETWORK' | 'SERVER' | 'NOT_CONFIGURED';
export class ServiceError extends Error {
  constructor(public readonly code: ServiceErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'ServiceError';
  }
}
// Domain commands are added only in their implementation phase.
export interface DataService {
  buyer: BuyerService;
  inspector: InspectorService;
  admin: AdminService;
  workshop: WorkshopService;
  demo?: { readonly description: string; readonly warning: string | null; reset(): Promise<void> };
  list<K extends keyof Collections>(collection: K): Promise<Collections[K]>;
}
