import type { ComponentProps } from 'react';
import { PageHeader } from './PageHeader';
import { SectionLabel } from './design-system';
import './workspace.css';
import { cn } from './utils';

export function WorkspaceHeader({ label, className, ...props }: ComponentProps<typeof PageHeader> & { label: string; className?: string }) {
  return <header className={cn("workspace-heading", className)}><SectionLabel>{label}</SectionLabel><PageHeader {...props} /></header>;
}
