import type { Role } from '@/types';

export const roles: Record<Role, { label: string; landing: string; navigation: string; description: string; next: string }> = {
  buyer: { label: 'Buyer', landing: '/buyer/dashboard', navigation: 'Buyer overview', description: 'Your place to coordinate outsourced manufacturing.', next: 'Jobs and production requests arrive in Phase 2.' },
  workshop: { label: 'Workshop', landing: '/workshop/dashboard', navigation: 'Workshop overview', description: 'A dedicated workspace for your manufacturing team.', next: 'Member 3 will build workshop onboarding, quotations and production tracking.' },
  inspector: { label: 'Inspector', landing: '/inspector/dashboard', navigation: 'Inspection overview', description: 'Independent quality control, in one workspace.', next: 'Assigned inspections and QC decisions arrive in Phase 5.' },
  admin: { label: 'Admin', landing: '/admin/dashboard', navigation: 'Platform overview', description: 'A clear view of platform operations.', next: 'Platform metrics and moderation arrive in Phase 6.' },
};
export const roleOrder: Role[] = ['buyer', 'workshop', 'inspector', 'admin'];
