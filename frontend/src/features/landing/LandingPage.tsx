import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ArrowUpRight, Factory, Menu, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EditorialHeading, SectionLabel } from '@/components/design-system';
import { publicCapabilities } from './content';
import './landing.css';

const navigation = [
  { label: 'How It Works', id: 'how-it-works' },
  { label: 'Capabilities', id: 'capabilities' },
  { label: 'Why KaarigarLink', id: 'why-kaarigarlink' },
];
const steps = [
  { title: 'Start with a clear requirement.', detail: 'The buyer specifies the process, material, quantity, delivery date and manufacturing requirements.' },
  { title: 'Review relevant workshop matches.', detail: 'Compare the supplied matches against the job requirements and invite suitable workshops.' },
  { title: 'Give workshops room to respond.', detail: 'Invited workshops review the brief, accept or decline, and submit their quotation through their own workspace.' },
  { title: 'Compare quotations with context.', detail: 'Review quoted totals, estimated delivery and notes together before making a workshop decision.' },
  { title: 'Keep delivery stages accountable.', detail: 'Awarding, production, inspection and payment are separate stages, each subject to its authorized workflow.' },
];
const participants = [
  { role: 'Buyers', title: 'Bring the requirement.', detail: 'Create a manufacturing brief, review workshop matches and compare quotations in one workspace.', action: 'Find a Workshop' },
  { role: 'Workshops', title: 'Bring the capability.', detail: 'Review your invitations, respond with a quotation and keep assigned work and quality findings in view.', action: 'Join as a Workshop' },
  { role: 'Inspectors', title: 'Bring an independent view.', detail: 'Review assigned inspections, record findings and make quality decisions with clear rework follow-up.', action: 'Log In as an Inspector' },
];

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sectionToFocus = useRef<string | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const close = (event: MediaQueryListEvent) => { if (event.matches) setMobileOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  useEffect(() => {
    if (mobileOpen || !sectionToFocus.current) return;
    const target = sectionToFocus.current; sectionToFocus.current = null;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [mobileOpen]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.setAttribute('data-revealed', 'true'); observer.unobserve(entry.target);
      }
    }, { threshold: .08 });
    root.current?.querySelectorAll('[data-landing-reveal]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  function sectionLinks(mobile = false) {
    return navigation.map(item => <a key={item.id} href={'#' + item.id} onClick={mobile ? () => { sectionToFocus.current = item.id; setMobileOpen(false); } : undefined}>{item.label}</a>);
  }
  return <div ref={root} className="public-site">
    <header className="public-header"><div className="public-wrap public-header-inner">
      <Link to="/" aria-label="KaarigarLink home" className="public-brand"><Factory aria-hidden="true" className="size-6" /><span>KaarigarLink</span></Link>
      <nav aria-label="Public navigation" className="public-desktop public-links">{sectionLinks()}</nav>
      <div className="public-desktop public-header-actions"><Button asChild variant="outline"><Link to="/login">Log In</Link></Button><Button asChild><Link to="/login">Get Started<ArrowUpRight aria-hidden="true" className="size-4" /></Link></Button></div>
      <Button variant="outline" aria-label="Open public navigation" aria-controls="public-mobile-navigation" aria-expanded={mobileOpen} className="public-menu-trigger size-11 px-0" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" className="size-5" /></Button>
    </div></header>
    <main id="main" tabIndex={-1} className="outline-none">
      <section aria-labelledby="landing-heading" className="public-hero public-wrap" data-enter>
        <div className="public-hero-copy">
          <div className="public-hero-label"><SectionLabel>Manufacturing / SDG 9</SectionLabel></div>
          <div id="landing-heading" className="public-hero-title"><EditorialHeading>Where manufacturing meets <em>opportunity.</em></EditorialHeading></div>
          <p className="public-hero-lead">Connect your manufacturing requirements with capable workshops. Receive quotations, compare your options and keep manufacturing work and quality review in one shared workspace.</p>
          <div className="public-hero-actions"><Button asChild><Link to="/login">Find a Workshop<ArrowUpRight aria-hidden="true" className="size-4" /></Link></Button><Button asChild variant="outline"><Link to="/login">Join as a Workshop</Link></Button></div>
          <p className="public-entry-note">Explore the demo. Choose your role on the sign-in page. No live transactions.</p>
        </div>
        <div className="public-hero-foot"><p>For the people<br />{' '}<strong>who make things happen.</strong></p><span className="public-hero-rule" aria-hidden="true" /><p className="kl-micro">Requirements. Capability. Quality.</p></div>
      </section>

      <section id="capabilities" tabIndex={-1} aria-labelledby="capabilities-heading" className="public-section public-wrap" data-landing-reveal>
        <div className="public-section-head"><div><SectionLabel>Capabilities</SectionLabel><h2 id="capabilities-heading" className="public-heading">Start with<br />{' '}the <em>work.</em></h2></div><p>Manufacturing requirements deserve more than a generic brief. Begin with the capability your part needs.</p></div>
        <div className="public-capability-grid">{publicCapabilities.map(item => <Link to="/login" key={item.name} className="public-capability">
          <span className="kl-micro">{item.code}</span><div><h3>{item.name}</h3><ArrowUpRight aria-hidden="true" className="size-6" /></div><p>{item.detail}</p><span className="public-text-link">Sign in to review capabilities</span>
        </Link>)}</div>
      </section>

      <section id="how-it-works" tabIndex={-1} aria-labelledby="workflow-heading" className="public-section public-wrap" data-landing-reveal>
        <div className="public-section-head"><div><SectionLabel>How It Works</SectionLabel><h2 id="workflow-heading" className="public-heading">A clear brief.<br />{' '}A considered <em>decision.</em></h2></div><p>One shared record of the requirement, the quotation and the quality findings. Each participant works within their own permissions.</p></div>
        <ol className="public-steps">{steps.map((step, index) => <li key={step.title}><span aria-hidden="true" className="kl-micro">0{index + 1}</span><h3>{step.title}</h3><p>{step.detail}</p></li>)}</ol>
        <aside className="public-boundary" aria-label="Current demo availability"><p className="kl-micro">Current demo availability</p><p>New jobs need supplied matching results. Awarding, order creation and production or payment updates are not yet enabled. Assigned inspectors can record QC decisions. Signing in gives access to the tools available for your role.</p></aside>
      </section>

      <section aria-labelledby="participants-heading" className="public-section public-wrap" data-landing-reveal>
        <div className="public-section-head"><div><SectionLabel>Built for every participant</SectionLabel><h2 id="participants-heading" className="public-heading">Different expertise.<br />{' '}One shared <em>purpose.</em></h2></div><p>Good manufacturing depends on a clear handoff between the people specifying, making and inspecting the work.</p></div>
        <div className="public-participants">{participants.map(item => <article key={item.role}><span className="kl-micro">{item.role}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div><Link to="/login" className="public-text-link">{item.action}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></article>)}</div>
      </section>

      <section id="why-kaarigarlink" tabIndex={-1} aria-labelledby="quality-heading" className="public-quality" data-landing-reveal><div className="public-wrap public-quality-inner">
        <div><SectionLabel>Why KaarigarLink</SectionLabel><h2 id="quality-heading" className="public-heading">Quality has an<br />{' '}<em>independent</em> voice.</h2><p className="public-quality-lead">Keep inspection findings, rework requests and responsibilities visible to the people who need them.</p></div>
        <div className="public-quality-details"><ScanLine aria-hidden="true" className="size-10 text-primary" /><h3>Quality decisions stay with inspectors.</h3><p>Assigned inspectors record their findings and decisions. Buyers and workshops can follow submitted outcomes and rework requests in their workspaces.</p><div className="public-quality-note"><span className="kl-micro">Clear responsibilities</span><p>Production, inspection and payment remain distinct. A workshop response never awards a job or creates an order.</p></div></div>
      </div></section>

      <section aria-labelledby="start-heading" className="public-section public-wrap public-final" data-landing-reveal>
        <SectionLabel>Your next connection</SectionLabel><h2 id="start-heading" className="public-heading">Bring your next<br />{' '}manufacturing <em>requirement.</em></h2>
        <div className="public-final-row"><p>Start with a clear brief and a shared workspace. Sign in to explore the tools for your role.</p><Button asChild><Link to="/login">Get Started<ArrowRight aria-hidden="true" className="size-4" /></Link></Button></div>
      </section>
    </main>
    <footer className="public-footer"><div className="public-wrap"><div className="kl-hatch" aria-hidden="true" /><div className="public-footer-main"><Link to="/" className="public-brand"><Factory aria-hidden="true" className="size-6" />KaarigarLink</Link><nav aria-label="Footer navigation" className="public-links">{sectionLinks()}<Link to="/login">Log In</Link></nav></div><div className="public-footer-meta"><p>B2B manufacturing collaboration. An academic SEPM project.</p><p>Aligned with SDG 9 / Industry, innovation and infrastructure.</p></div></div></footer>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen} title="KaarigarLink navigation" className="public-menu mr-0 ml-auto h-dvh max-h-dvh w-[min(23rem,100%)] rounded-none lg:hidden">
      <div id="public-mobile-navigation"><div className="public-menu-top"><span className="kl-micro">Manufacturing / Connected</span><Button autoFocus variant="outline" aria-label="Close public navigation" className="size-11 px-0" onClick={() => setMobileOpen(false)}><X aria-hidden="true" className="size-5" /></Button></div><nav aria-label="Mobile public navigation">{sectionLinks(true)}<Link to="/login" onClick={() => setMobileOpen(false)}>Log In</Link><Button asChild><Link to="/login">Get Started<ArrowUpRight aria-hidden="true" className="size-4" /></Link></Button></nav></div>
    </Dialog>
  </div>;
}
