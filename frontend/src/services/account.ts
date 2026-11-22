import { z } from 'zod';
import type { Role } from '@/types';

/** The signed-in user's own account (live mode: GET/PATCH /api/auth/me). */
export interface AccountProfile { id: string; name: string; email: string; role: Role; phone: string | null; createdAt?: string }
/** Only name and phone are editable; email, role and password have no change flow. */
export const accountInputSchema = z.strictObject({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100, 'Use no more than 100 characters.'),
  phone: z.string().trim().max(20, 'Use no more than 20 characters.'),
});
export type AccountInput = z.infer<typeof accountInputSchema>;
export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use no more than 72 characters.'),
  confirmPassword: z.string(),
}).refine(value => value.newPassword === value.confirmPassword, { path: ['confirmPassword'], message: 'The new passwords do not match.' });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export interface AccountService {
  get(): Promise<AccountProfile>;
  update(input: AccountInput): Promise<AccountProfile>;
  /** M12: changes the password; other sessions are signed out, this one continues. */
  changePassword?(input: PasswordChangeInput): Promise<void>;
}
