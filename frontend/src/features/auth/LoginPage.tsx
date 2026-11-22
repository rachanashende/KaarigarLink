import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Factory, ArrowRight, ShieldCheck, Eye, EyeOff, ClipboardList, ShieldHalf, UserCog, type LucideIcon } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { loginSchema, type LoginCredentials } from '@/services/auth';
import { roles, roleOrder } from '@/app/roles';
import type { Role } from '@/types';
import { cn } from '@/components/utils';
import { useAuth } from './context';
import { liveDemoLoginEnabled } from './demoAccounts';

/** Each demo role gets its own icon and accent so the four shortcuts are easy to tell apart. */
const demoStyle: Record<Role, { icon: LucideIcon; accent: string }> = {
  buyer: { icon: ClipboardList, accent: 'border-l-sky-600 [&_svg]:text-sky-700' },
  workshop: { icon: Factory, accent: 'border-l-amber-600 [&_svg]:text-amber-700' },
  inspector: { icon: ShieldHalf, accent: 'border-l-emerald-600 [&_svg]:text-emerald-700' },
  admin: { icon: UserCog, accent: 'border-l-violet-600 [&_svg]:text-violet-700' },
};
const inputClass = 'mt-2 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
export function LoginPage() {
  const { user, signIn, demoSignIn, kind, notice } = useAuth();
  const live = kind === 'live';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const showDemo = !live || liveDemoLoginEnabled();
  const submitting = useRef(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginCredentials>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={roles[user.role].landing} replace />;
  async function authenticate(action: () => Promise<unknown>, label: string) {
    if (submitting.current) return;
    submitting.current = true; setPending(label); setError(null);
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in. Please retry.'); }
    finally { submitting.current = false; setPending(null); }
  }
  /**
   * One click in both modes. Live: POST /auth/demo-login with the role only; the backend
   * (development servers with ENABLE_DEMO_LOGIN=true) picks the seeded account and issues a
   * normal token, and the workspace follows the role in its reply. Mock: demo identities.
   * authenticate() ignores further clicks while a sign-in is in progress.
   */
  function chooseDemo(role: Role) {
    void authenticate(() => demoSignIn(role), role);
  }
  return <main id="main" tabIndex={-1} className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
    <section className="flex flex-col justify-between bg-primary px-6 py-6 text-primary-foreground sm:px-12 lg:p-14">
      <Link to="/" aria-label="KaarigarLink home" className="flex min-h-11 w-fit items-center gap-3 text-xl font-semibold"><Factory aria-hidden="true" className="size-7" />KaarigarLink</Link>
      <div className="hidden max-w-lg py-10 lg:block lg:py-20">
        <p className="mb-5 flex items-center gap-2 text-sm"><span className="size-2 bg-primary-foreground" />Manufacturing, connected</p>
        <p className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">Good work starts with the right connection.</p>
        <p className="mt-6 max-w-md text-base leading-relaxed">A shared workspace for buyers, manufacturing workshops and independent quality teams.</p>
        <div className="mt-10 hidden border-t border-primary-foreground/25 pt-6 lg:block">
          <p className="text-sm font-medium">From requirement to finished work</p>
          <p className="mt-3 text-sm leading-relaxed">Specify the job. Find a workshop. Keep production and quality in view.</p>
        </div>
      </div>
      <p className="hidden text-xs leading-relaxed lg:block">Built for small manufacturers. Aligned with SDG 9.3.</p>
    </section>
    <section aria-labelledby="sign-in-heading" className="flex items-center justify-center bg-card px-6 py-10 sm:px-12 lg:py-14">
      <div className="w-full max-w-md">
        <div className="mb-8"><p className="mb-3 text-sm text-muted-foreground">Your manufacturing workspace</p><h1 id="sign-in-heading" className="text-3xl font-semibold tracking-tight">Sign in to KaarigarLink</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{live ? 'Sign in with your KaarigarLink account.' : 'Continue with a demo account to explore your role.'}</p></div>
        {notice && <p role="status" className="mb-5 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
        <form noValidate onSubmit={event => { void handleSubmit(values => authenticate(() => signIn(values), 'login'))(event); }} aria-busy={pending !== null}>
          <fieldset disabled={pending !== null} className="space-y-5">
            <div><label htmlFor="email" className="text-sm font-medium">Email address</label>
              <input id="email" type="email" autoComplete="username" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} className={inputClass} />
              {errors.email && <p id="email-error" role="alert" className="mt-2 text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div><label htmlFor="password" className="text-sm font-medium">Password</label>
              <div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} className={inputClass + ' pr-12'} />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-0 bottom-0 flex size-11 items-center justify-center text-muted-foreground">{showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}</button>
              </div>
              {errors.password && <p id="password-error" role="alert" className="mt-2 text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full">{pending === 'login' ? 'Signing in…' : 'Sign in'}<ArrowRight aria-hidden="true" className="size-4" /></Button>
          </fieldset>
        </form>
        {error && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {live && <div className="mt-8 border-t pt-6">
          <h3 className="text-sm font-semibold">New to KaarigarLink?</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Create a buyer, workshop or inspector account. Admin accounts are created by the platform team.</p>
          <Button asChild variant="outline" className="mt-4 w-full"><Link to="/register">Create an account</Link></Button>
        </div>}
        {showDemo && <section aria-labelledby="demo-accounts-heading" className="mt-8 border-t pt-6">
          <h3 id="demo-accounts-heading" className="text-sm font-semibold">{live ? 'Demo accounts' : 'Explore a demo workspace'}</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{live ? 'Development servers only: sign in instantly as the seeded demo account for a role.' : 'Choose a role. No registration or real data required.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">{roleOrder.map(role => {
            const { icon: Icon, accent } = demoStyle[role];
            return <Button key={role} variant="outline" disabled={pending !== null} aria-busy={pending === role} onClick={() => chooseDemo(role)}
              className={cn('justify-start border-l-4', accent)}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />{pending === role ? 'Opening…' : 'Demo ' + roles[role].label}
            </Button>;
          })}</div>
          {!live && <details className="mt-4 text-xs leading-relaxed text-muted-foreground"><summary className="flex min-h-11 cursor-pointer items-center underline decoration-border underline-offset-4">View demo credentials</summary><p>Use buyer, workshop, inspector or admin @kaarigarlink.example with password <span className="font-semibold">DemoPass123!</span>. Example: buyer@kaarigarlink.example.</p></details>}
        </section>}
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />{live ? 'Connected to the KaarigarLink server. Payments are simulated; no money moves.' : 'Mock environment. Use demo credentials only; no live transactions.'}</p>
      </div>
    </section>
  </main>;
}
