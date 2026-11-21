import { NavigationTabs } from '@/components/design-system';

export function JobWorkspaceNav({ jobId }: { jobId: string }) {
  const base = '/buyer/jobs/' + encodeURIComponent(jobId);
  return <div className="mb-6"><NavigationTabs label="Job workspace" items={[
    { label: 'Job brief', to: base },
    { label: 'Workshop matches', to: base + '/matches' },
    { label: 'Quotations', to: base + '/quotes' },
  ]} /></div>;
}
