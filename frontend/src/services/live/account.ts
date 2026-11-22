import { z } from 'zod';
import { ServiceError } from '../contracts';
import { accountInputSchema, passwordChangeSchema, type AccountProfile, type AccountService } from '../account';
import { api, session } from './http';
import { authResultSchema, role, userSchema, userView } from './mappers';

const accountSchema = userSchema.extend({ phone: z.string().nullable().optional() });

function profileView(user: z.infer<typeof accountSchema>): AccountProfile {
  return { id: user.id, name: user.name, email: user.email, role: role(user.role), phone: user.phone ?? null, ...(user.createdAt ? { createdAt: user.createdAt } : {}) };
}

/** GET / PATCH /api/auth/me: the signed-in user's own name and phone. */
export function createLiveAccount(): AccountService {
  return {
    async get() { return profileView((await api('/auth/me', z.object({ user: accountSchema }))).user); },
    async update(input) {
      const parsed = accountInputSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your profile details.');
      const { user } = await api('/auth/me', z.object({ user: accountSchema }), {
        method: 'PATCH', body: { name: parsed.data.name, phone: parsed.data.phone ? parsed.data.phone : null },
      });
      // Keep the signed-in identity (shown in the shell) in step with the saved name.
      session.setUser(userView(user));
      return profileView(user);
    },
    async changePassword(input) {
      const parsed = passwordChangeSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the passwords.');
      // The server signs out every earlier token and returns a fresh one for this session.
      const result = await api('/auth/me/password', authResultSchema, {
        method: 'PATCH', body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
      });
      session.start(result.token, userView(result.user));
    },
  };
}
