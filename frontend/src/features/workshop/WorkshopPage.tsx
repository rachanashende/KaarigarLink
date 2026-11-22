import { Link, useParams } from 'react-router';
import { workshopNavigation, type WorkshopSection } from '@/app/roles';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { ErrorState, LoadingState } from '@/components/feedback';
import { useServices } from '@/app/services';
import { useWorkshopWorkspace } from './queries';
import { WorkshopRecords } from './WorkshopRecords';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context';

const sections: Record<WorkshopSection, { title: string; description: string; actions: string[] }> = {
  dashboard: {
    title: 'Workshop workspace',
    description: 'Your workshop invitations, quotations, production and QC records from the shared workspace.',
    actions: [],
  },
  invitations: {
    title: 'Invitations',
    description: 'Read invitations and quotations addressed to your workshop. Invitation responses and quotation changes are local mock simulations only; order creation still requires buyer award.',
    actions: [],
  },
  orders: {
    title: 'My orders',
    description: 'Track orders assigned to your workshop. Production, inspector QC and payment simulation records are displayed separately; updates remain disabled.',
    actions: ['Update production status'],
  },
  profile: {
    title: 'Workshop profile',
    description: 'Review your workshop profile, machinery and published capacity. Profile editing remains disabled.',
    actions: ['Edit profile'],
  },
  settings: {
    title: 'Settings',
    description: 'Read your shared account information. Notification preferences and account changes are not supported yet.',
    actions: ['Save preferences'],
  },
  onboarding: {
    title: 'Workshop onboarding',
    description: 'Check your canonical profile linkage. Registration and profile creation remain disabled; no draft is saved from this page.',
    actions: ['Submit registration'],
  },
};

/** Live mode (M13): descriptions for sections whose mock wording describes disabled or simulated actions. */
const liveDescriptions: Partial<Record<WorkshopSection, string>> = {
  invitations: 'Read invitations and quotations addressed to your workshop. Responses and quotations are recorded on the server; an order is created only when the buyer awards a quotation.',
  orders: 'Track orders assigned to your workshop. Start production, plan and complete milestones, review QC decisions and record refunds from each order.',
  profile: 'Your workshop profile, machinery, capabilities and published capacity. Edit them from this page.',
  settings: 'Your account details. Edit your name and phone, or change your password. Notification preferences are not supported yet.',
};

export function WorkshopPage({ section = 'dashboard' }: { section?: WorkshopSection }) {
  const { user } = useAuth();
  const { invitationId, orderId } = useParams();
  const workspace = useWorkshopWorkspace();
  const services = useServices();
  const page = sections[section];
  const detail = Boolean(invitationId || orderId);
  // Live mode: production and milestone commands are available on order details.
  const live = !services.demo;
  // Live mode: production commands (order details) and profile editing are available.
  const actions = live ? page.actions.filter(action => action !== 'Update production status' && action !== 'Edit profile') : page.actions;
  return <div className="space-y-6" data-workshop-workspace>
    <PageHeader title={detail ? (section === 'invitations' ? 'Invitation details' : 'Order details') : page.title} description={(live ? liveDescriptions[section] : undefined) ?? page.description} />
    <section aria-label="Workshop integration status" className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 className="font-semibold">Workshop workflow availability</h2>
      <p id="workshop-disabled-reason" className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{live ? 'Connected to the KaarigarLink server. Invitation responses, quotations, production start, milestones, refunds, the workshop profile (machinery, capabilities, capacity) and your account details are recorded live. Notification preferences are not supported.' : 'Invitation responses and supported quotation changes are local mock simulations. Production, QC, payment and account writes remain unavailable pending compatible contracts. No standalone workshop demo store is used.'}</p>
      <p className="mt-3 text-sm text-muted-foreground">Signed in as {user?.name} through your shared KaarigarLink session.</p>
      {actions.length > 0 && <fieldset disabled aria-describedby="workshop-disabled-reason" className="mt-5">
        <legend className="mb-3 text-sm font-medium">Unavailable actions</legend>
        <div className="flex flex-wrap gap-3">{actions.map(action => <Button key={action} disabled variant="outline">{action}</Button>)}</div>
      </fieldset>}
    </section>;
  return <div className="space-y-6" data-workshop-workspace>
    <WorkspaceHeader label="Workshop / Manufacturing operations" title={detail ? (section === 'invitations' ? 'Invitation details' : 'Order details') : page.title} description={page.description} />
    {section !== 'dashboard' && availability}
    {services.demo?.warning && <p role="alert" className="rounded-lg border border-destructive/30 bg-card p-5 text-sm">{services.demo.warning} Use the shared demo reset on the Buyer, Inspector or Admin workspace; it restores the same data for all roles.</p>}
    {workspace.isPending ? <LoadingState label="Loading shared workshop records..." /> : workspace.isError ? <ErrorState message={workspace.error.message} onRetry={() => { void workspace.refetch(); }} /> : workspace.data && <WorkshopRecords key={[user?.id, section, invitationId, orderId].join('/')} data={workspace.data} section={section} {...(invitationId === undefined ? {} : { invitationId })} {...(orderId === undefined ? {} : { orderId })} />}
    {section === 'dashboard' && availability}
    <nav aria-label="Workshop pages" className="flex flex-wrap gap-3">
      {section !== 'dashboard' && <Button asChild variant="outline"><Link to="/workshop/dashboard">Workshop overview</Link></Button>}
      {workshopNavigation.filter(item => item.section !== section).map(item => <Button key={item.path} asChild variant="outline"><Link to={item.path}>{item.label}</Link></Button>)}
    </nav>
  </div>;
}
