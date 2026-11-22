import { z } from 'zod';
import type { Role, User } from '@/types';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Use no more than 128 characters.'),
});
export type LoginCredentials = z.infer<typeof loginSchema>;
export interface AuthService {
  login(credentials: LoginCredentials): Promise<User>;
  demoLogin(role: Role): Promise<User>;
  restoreSession(): Promise<User | null>;
  logout(): Promise<void>;
}
