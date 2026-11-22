import type { ComponentProps } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import './buyer.css';

export function BuyerHeader(props: ComponentProps<typeof PageHeader>) {
  return <WorkspaceHeader className="buyer-heading" label="Buyer / Manufacturing workspace" {...props} />;
}
