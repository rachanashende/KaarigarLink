import { AccountEditor } from '@/components/AccountEditor';
import { PageHeader } from '@/components/PageHeader';

/** M12: account details and password change for inspector and admin accounts. */
export function AccountPage() {
  return <>
    <PageHeader title="My account" description="Your name, phone and password." />
    <AccountEditor />
  </>;
}
