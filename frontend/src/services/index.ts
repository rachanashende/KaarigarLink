import { createMockStore } from './mock/store';
import { fixtures } from './mock/fixtures';
import { createMockService } from './adapters/mock';
import { createLiveService } from './live';
import { ServiceError, type DataService } from './contracts';

export type ServiceMode = 'mock' | 'live';
/** VITE_SERVICE_MODE: "mock" (default, no backend needed) or "live" (Express backend at VITE_API_BASE_URL). */
export function serviceMode(mode: string = import.meta.env.VITE_SERVICE_MODE ?? 'mock'): ServiceMode {
  if (mode === 'mock' || mode === 'live') return mode;
  throw new ServiceError('NOT_CONFIGURED', 'VITE_SERVICE_MODE must be "mock" or "live" (received "' + mode + '").');
}

export function createServices(mode: string = import.meta.env.VITE_SERVICE_MODE ?? 'mock'): DataService {
  if (serviceMode(mode) === 'live') return createLiveService();
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    let storage: Storage;
    try { storage = window.localStorage; } catch { throw new ServiceError('SERVER', 'Development demo storage is unavailable. Allow browser storage and reload.'); }
    return createMockService(createMockStore(fixtures, storage));
  }
  return createMockService();
}
export type { DataService } from './contracts';
export { ServiceError } from './contracts';
