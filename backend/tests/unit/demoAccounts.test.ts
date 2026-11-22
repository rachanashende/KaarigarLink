import { describe, expect, it } from 'vitest';
import { ALL_USERS } from '../../prisma/seed/data';
import { DEMO_ACCOUNTS } from '../../src/services/auth.service';

/** The demo login accounts must be real seeded accounts with the matching role, one per role. */
describe('demo login accounts match the seed', () => {
  it('covers exactly the four roles', () => {
    expect(Object.keys(DEMO_ACCOUNTS).sort()).toEqual(['ADMIN', 'BUYER', 'INSPECTOR', 'WORKSHOP']);
  });
  it.each(Object.entries(DEMO_ACCOUNTS))('the %s demo account is seeded with that role', (role, account) => {
    const seeded = ALL_USERS.find((u) => u.id === account.id);
    expect(seeded, account.id).toBeDefined();
    expect(seeded!.email).toBe(account.email);
    expect(seeded!.role).toBe(role);
  });
});
