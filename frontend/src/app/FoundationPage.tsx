import { ArrowRight, ClipboardList, Factory, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { Role } from '@/types';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context';
import { useServices } from './services';
import { roles, workshopNavigation } from './roles';

/**
 * Platform guide (route /foundation, "Platform guide" in every workspace menu): what
 * KaarigarLink does, the order workflow and what each role can do. Signed-in users see
 * it inside their workspace with links to their own areas; signed-out visitors get the
 * same overview with sign-in and registration entry points.
 */
const workflow = [
  ['Post a job', 'The buyer describes the part, material, quantity and deadline, and attaches design files.'],
  ['Match and invite', 'Verified workshops are ranked by capability, capacity, rating, distance and deadline. The buyer invites the best fits.'],
  ['Quote and award', 'Invited workshops accept and quote. The buyer compares quotations and awards one, which creates the order.'],
  ['Produce in milestones', 'The workshop starts production, plans milestones and completes them; the buyer approves completed milestones.'],
  ['Independent QC', 'An inspector assigned by an admin records a structured checklist with evidence: passed, failed or rework required.'],
  ['Pay, complete and rate', 'The buyer records simulated payments, completes the order after a passed inspection and rates the workshop.'],
] as const;

const modules: Record<Role, { icon: typeof Users; summary: string; can: string[]; links: { to: string; label: string }[] }> = {
  buyer: {
    icon: ClipboardList,
    summary: 'Source manufacturing work and follow it to delivery.',
    can: ['Post, publish and cancel jobs with design files', 'Review ranked workshop matches and send invitations', 'Compare quotations and award orders', 'Approve milestones, pay, complete, cancel and rate orders'],
    links: [{ to: '/buyer/jobs/new', label: 'Post a job' }, { to: '/buyer/jobs', label: 'Manufacturing jobs' }, { to: '/buyer/orders', label: 'Manufacturing orders' }, { to: '/buyer/profile', label: 'My profile' }],
  },
  workshop: {
    icon: Factory,
    summary: 'Win work that fits your machines and capacity, then deliver it.',
    can: ['Accept or decline invitations and read buyer design files', 'Submit, edit and withdraw quotations', 'Start production and manage milestones, including rework', 'Maintain machinery, capabilities and published capacity'],
    links: workshopNavigation.filter(item => item.section !== 'onboarding').map(item => ({ to: item.path, label: item.label })),
  },
  inspector: {
    icon: ShieldCheck,
    summary: 'Independent quality control for the orders you are assigned.',
    can: ['See only the orders currently assigned to you', 'Save private checklist drafts and attach evidence', 'Record passed, failed or rework-required decisions', 'Follow rework and your inspection history'],
    links: [{ to: '/inspector/inspections', label: 'Assigned inspections' }, { to: '/inspector/rework', label: 'Rework follow-up' }, { to: '/inspector/history', label: 'Inspection history' }],
  },
  admin: {
    icon: Users,
    summary: 'Oversee the marketplace and keep it trustworthy.',
    can: ['Verify workshops before they appear in matching', 'Assign, reassign and unassign inspectors', 'Review users, jobs, quotations, orders and inspections', 'Search the append-only audit history'],
    links: [{ to: '/admin/workshops', label: 'Workshops' }, { to: '/admin/orders', label: 'Manufacturing orders' }, { to: '/admin/quality', label: 'Quality operations' }, { to: '/admin/audit', label: 'Audit history' }],
  },
};

export function FoundationPage() {
  const { user } = useAuth();
  const live = !useServices().demo;
  return <>
    <PageHeader title="Platform guide" description="KaarigarLink connects buyers who need parts made with verified workshops, with independent inspectors checking quality before an order is completed."
      action={user ? <Button asChild><Link to={roles[user.role].landing}>Go to my workspace<ArrowRight aria-hidden="true" className="size-4" /></Link></Button> : undefined} />

    <section aria-labelledby="guide-mode" className="mb-6 rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="guide-mode" className="text-lg font-semibold">{live ? 'Connected to the KaarigarLink server' : 'Demo workspace'}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{live
        ? 'Accounts, jobs, quotations, orders, inspections, uploaded documents, notifications and the audit history are stored on the server. Every action is authorised by the server for your role.'
        : 'Sample data runs in this browser, so nothing is sent to a server. Sign in as any demo role to explore. Attachments are recorded as file details only, and some commands are available only when connected to the server.'}</p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Payments are simulated: no money moves. Notifications appear in the app only.</p>
      {!user && <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild><Link to="/login">Sign in</Link></Button>
        {live && <Button asChild variant="outline"><Link to="/register">Create an account</Link></Button>}
      </div>}
    </section>

    <section aria-labelledby="guide-workflow" className="mb-6 rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="guide-workflow" className="text-lg font-semibold">How an order moves</h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workflow.map(([title, detail], index) => <li key={title} className="rounded-md border bg-background p-4">
          <p className="text-xs font-semibold text-primary">Step {index + 1}</p>
          <h3 className="mt-1 font-semibold">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
        </li>)}
      </ol>
    </section>

    <section aria-labelledby="guide-roles">
      <h2 id="guide-roles" className="mb-4 text-lg font-semibold">What each role can do</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(modules) as Role[]).map(role => {
          const { icon: Icon, summary, can, links } = modules[role];
          const mine = user?.role === role;
          return <section key={role} aria-labelledby={'guide-role-' + role} className={'rounded-lg border bg-card p-5 sm:p-6' + (mine ? ' border-primary' : '')}>
            <div className="flex items-center gap-3"><Icon aria-hidden="true" className="size-5 text-primary" />
              <h3 id={'guide-role-' + role} className="font-semibold">{roles[role].label}{mine && <span className="ml-2 text-xs font-medium text-primary">Your role</span>}</h3></div>
            <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{can.map(item => <li key={item}>{item}</li>)}</ul>
            {mine && <nav aria-label={roles[role].label + ' shortcuts'} className="mt-5 flex flex-wrap gap-2">
              <Button asChild><Link to={roles[role].landing}>{roles[role].navigation}</Link></Button>
              {links.map(link => <Button key={link.to} asChild variant="outline"><Link to={link.to}>{link.label}</Link></Button>)}
            </nav>}
          </section>;
        })}
      </div>
    </section>
  </>;
}
