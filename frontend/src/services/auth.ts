import { z } from 'zod';
import type { Role, User } from '@/types';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Use no more than 128 characters.'),
});
export type LoginCredentials = z.infer<typeof loginSchema>;
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100, 'Use no more than 100 characters.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Use no more than 72 characters.'),
  role: z.enum(['buyer', 'workshop', 'inspector'], { error: 'Choose an account type.' }),
  businessName: z.string().trim().max(120, 'Use no more than 120 characters.').optional(),
  city: z.string().trim().max(100, 'Use no more than 100 characters.').optional(),
}).refine(value => value.role !== 'workshop' || (value.businessName ?? '').length >= 2, { path: ['businessName'], message: 'Enter your workshop business name (at least 2 characters).' });
export type RegistrationInput = z.infer<typeof registerSchema>;
export interface AuthService {
  /** 'live' for backend JWT authentication; absent or 'mock' for the demo identity switch. */
  readonly kind?: 'mock' | 'live';
  /** Live mode only: create an account (admins are never self-registered). */
  register?(input: RegistrationInput): Promise<User>;
  /** Live mode only: called when the backend rejects the session (expired or invalid JWT). */
  onSessionExpired?(listener: () => void): () => void;
  login(credentials: LoginCredentials): Promise<User>;
  demoLogin(role: Role): Promise<User>;
  restoreSession(): Promise<User | null>;
  logout(): Promise<void>;
}
