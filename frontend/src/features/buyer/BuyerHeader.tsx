import type { ComponentProps } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SectionLabel } from '@/components/design-system';
import './buyer.css';

export function BuyerHeader(props: ComponentProps<typeof PageHeader>) {
  return <header className="buyer-heading"><SectionLabel>Buyer / Manufacturing workspace</SectionLabel><PageHeader {...props} /></header>;
}
