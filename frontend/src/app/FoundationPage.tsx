import { DesignSystemPreview } from './DesignSystemPreview';
import { EditorialHeading } from '@/components/design-system';
import { Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FoundationPage() {
  return (
    <>
      <a href="#main" tabIndex={0} className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-10 focus:bg-card focus:p-3">Skip to content</a>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-10 sm:py-14">
        <header className="flex items-center gap-3 border-b pb-6 font-semibold"><Factory aria-hidden="true" className="text-primary" />KaarigarLink</header>
        <main id="main" tabIndex={-1} className="py-12 sm:py-20">
          <p className="mb-4 text-sm font-semibold text-primary">Phase 0 · Frontend foundation</p>
          <EditorialHeading>A shared foundation for <em>manufacturing job-work.</em></EditorialHeading>
          <p className="mt-6 max-w-2xl leading-relaxed text-muted-foreground">Design tokens, TypeScript contracts and mock services are ready for phased development. Buyer, inspector and admin screens will follow after review.</p>
          <section aria-labelledby="handoff" className="mt-10 rounded-lg border bg-card p-6 sm:p-8">
            <h2 id="handoff" className="text-xl font-semibold">Workshop frontend reserved</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Member 3 owns the workshop module and the /workshop/* route namespace. No workshop pages or workflow transitions are implemented in this phase.</p>
            <Button asChild variant="outline" className="mt-6"><a href="#foundation">View foundation scope</a></Button>
          </section>
          <section id="foundation" tabIndex={-1} aria-labelledby="scope" className="mt-10 scroll-mt-8">
            <h2 id="scope" className="text-xl font-semibold">Foundation scope</h2>
            <ul className="mt-4 grid gap-3 text-muted-foreground sm:grid-cols-2">
              <li>Strict React + TypeScript tooling</li><li>Industrial palette and accessible defaults</li><li>Provisional shared data contracts</li><li>In-memory mock service architecture</li>
            </ul>
          </section>
          <DesignSystemPreview />
        </main>
        <nav aria-label="Foundation navigation"><a href="/" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">Return to workspace</a></nav>
        <footer className="border-t pt-6 text-sm text-muted-foreground">Development preview · No live transactions</footer>
      </div>
    </>
  );
}
