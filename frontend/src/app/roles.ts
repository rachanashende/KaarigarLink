import type { Role } from '@/types';

export const roles: Record<Role, { label: string; landing: string; navigation: string; description: string }> = {
  buyer: { label: 'Buyer', landing: '/buyer/dashboard', navigation: 'Buyer overview', description: 'Your place to coordinate outsourced manufacturing.' },
  workshop: { label: 'Workshop', landing: '/workshop/dashboard', navigation: 'Workshop overview', description: 'A dedicated workspace for your manufacturing team.' },
  inspector: { label: 'Inspector', landing: '/inspector/dashboard', navigation: 'Inspection overview', description: 'Independent quality control, in one workspace.' },
  admin: { label: 'Admin', landing: '/admin/dashboard', navigation: 'Platform overview', description: 'A clear view of platform operations.' },
};
export const roleOrder: Role[] = ['buyer', 'workshop', 'inspector', 'admin'];

export const workshopNavigation = [
  { section: 'invitations', path: '/workshop/invitations', label: 'Invitations' },
  { section: 'orders', path: '/workshop/orders', label: 'My orders' },
  { section: 'profile', path: '/workshop/profile', label: 'Workshop profile' },
  { section: 'settings', path: '/workshop/settings', label: 'Settings' },
  { section: 'onboarding', path: '/workshop/onboarding', label: 'Workshop onboarding' },
] as const;
export type WorkshopSection = 'dashboard' | typeof workshopNavigation[number]['section'];
