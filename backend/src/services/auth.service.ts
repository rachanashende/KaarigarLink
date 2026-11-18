import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { signToken } from '../utils/jwt';
import { publicUserSelect, type PublicUser } from '../utils/selects';
import { env } from '../config/env';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';

export interface AuthResult {
  user: PublicUser;
  token: string;
}

function issueToken(user: PublicUser): string {
  return signToken({ sub: user.id, email: user.email, role: user.role });
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

  return { user, token: issueToken(user) };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  // Same message for unknown email and wrong password (no account enumeration).
  const valid = record ? await bcrypt.compare(input.password, record.passwordHash) : false;
  if (!record || !valid) throw ApiError.unauthorized('Invalid email or password');

  const { passwordHash: _omit, ...user } = record;
  return { user, token: issueToken(user) };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}
