import type { Collections } from '@/types';
import { fixtures } from './fixtures';
import { DEMO_DATA_KEY, restoreDemo, saveDemo } from './persistence';
import { ServiceError } from '../contracts';

export function createMockStore(seed: Collections = fixtures, storage?: Storage) {
  let state = structuredClone(seed);
  let warning: string | null = null;
  if (storage) {
    try {
      const raw = storage.getItem(DEMO_DATA_KEY);
      if (raw) state = restoreDemo(raw, seed);
    } catch {
      warning = 'Saved demo data could not be restored. Showing the original demo seed. Reset demo data before continuing.';
    }
  }
  return {
    get persistenceDescription() { return storage ? 'Development demo saved on this browser. Use synthetic data only. Attachment metadata stays in memory.' : 'Memory-only demo. Business data resets on reload in this build.'; },
    get warning() { return warning; },
    snapshot: (): Collections => structuredClone(state),
    commit(update: (draft: Collections) => void): void {
      if (warning) throw new ServiceError('SERVER', warning);
      const draft = structuredClone(state);
      update(draft);
      if (storage) saveDemo(storage, draft);
      state = structuredClone(draft);
    },
    reset(): void {
      try { storage?.removeItem(DEMO_DATA_KEY); }
      catch { throw new ServiceError('SERVER', 'Demo data could not be reset. Check browser storage permissions and retry.'); }
      state = structuredClone(seed);
      warning = null;
    },
  };
}
export type MockStore = ReturnType<typeof createMockStore>;
