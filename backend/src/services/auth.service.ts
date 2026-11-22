import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { signToken } from '../utils/jwt';
import { publicUserSelect, type PublicUser } from '../utils/selects';
import { env } from '../config/env';
import type { ChangePasswordInput, DemoLoginInput, LoginInput, RegisterInput, UpdateProfileInput } from '../validators/auth.validator';
import { recordEvent } from './events';

export interface AuthResult {
  user: PublicUser;
  token: string;
}

/** Every token carries the user's current tokenVersion (M13); see authenticate. */
function issueToken(user: PublicUser, tokenVersion: number): string {
  return signToken({ sub: user.id, email: user.email, role: user.role, tv: tokenVersion });
}

/**
 * Registers a user. WORKSHOP users get their Workshop profile created in the
 * same transaction (nested create), so there is never a workshop user without
 * a profile.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      phone: input.phone,
      ...(input.role === 'WORKSHOP' &&
        input.workshop && {
          workshop: {
            create: {
              businessName: input.workshop.businessName,
              description: input.workshop.description,
              address: input.workshop.address,
              city: input.workshop.city,
              latitude: input.workshop.latitude,
              longitude: input.workshop.longitude,
              certifications: input.workshop.certifications ?? [],
            },
          },
        }),
    },
    select: publicUserSelect,
  });

  return { user, token: issueToken(user, 0) }; // new accounts start at tokenVersion 0
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true, tokenVersion: true },
  });

  // Same message for unknown email and wrong password (no account enumeration).
  const valid = record ? await bcrypt.compare(input.password, record.passwordHash) : false;
  if (!record || !valid) throw ApiError.unauthorized('Invalid email or password');

  const { passwordHash: _omit, tokenVersion, ...user } = record;
  return { user, token: issueToken(user, tokenVersion) };
}

/**
 * The seeded demo account for each role (backend/prisma/seed/data.ts; checked by
 * tests/unit/demoAccounts.test.ts). Fixed here: callers choose a role, never a user.
 */
export const DEMO_ACCOUNTS: Record<DemoLoginInput['role'], { id: string; email: string }> = {
  BUYER: { id: 'seed-user-buyer-asha', email: 'asha.rao@kaarigarlink.test' },
  WORKSHOP: { id: 'seed-user-ws-precision-works', email: 'precision-works@kaarigarlink.test' },
  INSPECTOR: { id: 'seed-user-inspector', email: 'priya.inspector@kaarigarlink.test' },
  ADMIN: { id: 'seed-user-admin', email: 'admin@kaarigarlink.test' },
};

/**
 * Development-only demo login (gated by demoLoginGuard). Signs in the existing seeded
 * account for the role with a normal token (current tokenVersion), exactly like login.
 * Never creates or changes an account; a missing or altered seed account is a 404.
 */
export async function demoLogin(input: DemoLoginInput): Promise<AuthResult> {
  const account = DEMO_ACCOUNTS[input.role];
  const record = await prisma.user.findUnique({ where: { id: account.id }, select: { ...publicUserSelect, tokenVersion: true } });
  if (!record || record.email !== account.email || record.role !== input.role) {
    throw ApiError.notFound('The demo account for this role is not seeded. Run npm run db:seed in backend/.');
  }
  const { tokenVersion, ...user } = record;
  await recordEvent(prisma, { actor: { id: user.id, role: user.role }, action: 'DEMO_LOGIN', entityType: 'User', entityId: user.id, metadata: { role: input.role } });
  return { user, token: issueToken(user, tokenVersion) };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * M11: the signed-in user edits their own account details (any role).
 * Only name and phone: email and role changes are not supported, and passwords
 * have no change flow yet. A missing user (deleted after the token was issued) is 404.
 */
export async function updateCurrentUser(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw ApiError.notFound('User not found');
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: input, select: publicUserSelect });
    // Field names only: the values are personal data and stay out of the audit log.
    await recordEvent(tx, { actor: { id: user.id, role: user.role }, action: 'PROFILE_UPDATED', entityType: 'User', entityId: user.id, metadata: { fields: Object.keys(input) } });
    return user;
  });
}

/**
 * M12: change the signed-in user's password. The current password must match.
 * Incrementing `tokenVersion` makes every earlier token invalid immediately (see
 * authenticate), with no timestamp-precision window; the response carries a fresh
 * token with the new version for this session.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<AuthResult> {
  const record = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, passwordHash: true } });
  if (!record) throw ApiError.notFound('User not found');
  if (!(await bcrypt.compare(input.currentPassword, record.passwordHash))) throw ApiError.badRequest('The current password is incorrect');
  if (await bcrypt.compare(input.newPassword, record.passwordHash)) throw ApiError.badRequest('The new password must be different from the current one');
  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);
  const { tokenVersion, ...user } = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
      select: { ...publicUserSelect, tokenVersion: true },
    });
    await recordEvent(tx, { actor: { id: record.id, role: record.role }, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId });
    return updated;
  });
  return { user, token: issueToken(user, tokenVersion) };
}
