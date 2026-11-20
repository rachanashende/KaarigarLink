import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: AuthUser;
    }
  }
}
