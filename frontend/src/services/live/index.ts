import { ServiceError, type DataService } from '../contracts';
import { createLiveAdmin } from './admin';
import { createLiveBuyer } from './buyer';
import { createLiveInspector } from './inspector';
import { createLiveWorkshop } from './workshop';
import { createLiveAccount } from './account';
import { createLiveAudit, createLiveFiles, createLiveNotifications } from './platform';

/**
 * DataService backed by the Express/Prisma backend (VITE_SERVICE_MODE=live).
 * Every read and command is a real HTTP call; authorisation is decided by the
 * backend from the JWT (the actor ids the UI passes are not trusted).
 */
export function createLiveService(): DataService {
  return {
    buyer: createLiveBuyer(),
    workshop: createLiveWorkshop(),
    inspector: createLiveInspector(),
    admin: createLiveAdmin(),
    account: createLiveAccount(),
    files: createLiveFiles(),
    audit: createLiveAudit(),
    notifications: createLiveNotifications(),
    async list() {
      throw new ServiceError('NOT_CONFIGURED', 'Raw collection snapshots exist only in mock mode. Live mode reads through the role services.');
    },
  };
}
export { createLiveAuthService } from './auth';
