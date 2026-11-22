/**
 * Demo login shortcuts. In live mode they call the backend's development-only
 * POST /api/auth/demo-login with a role; the backend decides whether demo login is
 * enabled and which seeded account to use. No emails, passwords or tokens live here.
 */

/** Live mode shows the shortcuts unless VITE_DEMO_LOGIN is "false". The backend still enforces. */
export function liveDemoLoginEnabled(value: string | undefined = import.meta.env.VITE_DEMO_LOGIN): boolean {
  return value?.trim().toLowerCase() !== 'false';
}
