import { AccountEditor } from '@/components/AccountEditor';
import { PageHeader } from '@/components/PageHeader';

export function BuyerProfilePage() {
  return <>
    <PageHeader title="My profile" description="Your KaarigarLink account details. Workshops see your name on invitations and orders." />
    <AccountEditor />
  </>;
}
