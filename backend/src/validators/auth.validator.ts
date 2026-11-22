import { z } from 'zod';
import { coordinatesPairCheck, latitudeSchema, longitudeSchema } from './common';

/** Workshop profile fields accepted during WORKSHOP registration. */
export const workshopProfileInputSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(100).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    certifications: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  })
  .superRefine(coordinatesPairCheck);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    // bcrypt only uses the first 72 bytes of a password.
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    // ADMIN accounts cannot self-register; they are created via seed/DB.
    role: z.enum(['BUYER', 'WORKSHOP', 'INSPECTOR']),
    phone: z.string().trim().max(20).optional(),
    workshop: workshopProfileInputSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'WORKSHOP' && !data.workshop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workshop'],
        message: 'Workshop details (at least businessName) are required for WORKSHOP registration',
      });
    }
    if (data.role !== 'WORKSHOP' && data.workshop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workshop'],
        message: 'Workshop details are only allowed for WORKSHOP registration',
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Development-only demo login: a role from a fixed allowlist, nothing else. */
export const demoLoginSchema = z.object({ role: z.enum(['BUYER', 'WORKSHOP', 'INSPECTOR', 'ADMIN']) }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** M11: PATCH /api/auth/me. Strict: email, role and password cannot change here. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: z.string().trim().max(20).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** M12: PATCH /api/auth/me/password. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72),
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
