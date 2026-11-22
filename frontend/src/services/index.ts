import { createMockStore } from './mock/store';
import { fixtures } from './mock/fixtures';
import { createMockService } from './adapters/mock';
import { ServiceError, type DataService } from './contracts';

export function createServices(mode: string = import.meta.env.VITE_SERVICE_MODE ?? 'mock'): DataService {
  if (mode === 'mock') {
    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      let storage: Storage;
      try { storage = window.localStorage; } catch { throw new ServiceError('SERVER', 'Development demo storage is unavailable. Allow browser storage and reload.'); }
      return createMockService(createMockStore(fixtures, storage));
    }
    return createMockService();
  }
  throw new ServiceError('NOT_CONFIGURED', 'Live services are not configured. Backend contracts must be approved before integration.');
}
export type { DataService } from './contracts';
export { ServiceError } from './contracts';
