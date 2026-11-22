import { useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Factory, ShieldCheck } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { registerSchema, type RegistrationInput } from '@/services/auth';
import { roles } from '@/app/roles';
import { useAuth } from './context';

const inputClass = 'mt-2 min-h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Live mode only: self-registration for buyers, workshops and inspectors (POST /auth/register). */
export function RegisterPage() {
  const { user, register: createAccount } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const { register, handleSubmit, control, formState: { errors } } = useForm<RegistrationInput>({
    resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '', role: 'buyer', businessName: '', city: '' },
  });
  const role = useWatch({ control, name: 'role' });
  if (user) return <Navigate to={roles[user.role].landing} replace />;
  if (!createAccount) return <Navigate to="/login" replace />;
  const signUp = createAccount;
  async function submit(values: RegistrationInput) {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError(null);
    const { businessName, city, ...rest } = values;
    try { await signUp(rest.role === 'workshop' ? values : { ...rest, ...(city ? { city } : {}), ...(businessName ? { businessName } : {}) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create the account. Please retry.'); }
    finally { submitting.current = false; setPending(false); }
  }
  const field = (id: keyof RegistrationInput, label: string, input: ReactNode, hint?: string) => <div>
    <label htmlFor={id} className="text-sm font-medium">{label}</label>{input}
    {hint && !errors[id] && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    {errors[id] && <p id={id + '-error'} role="alert" className="mt-2 text-sm text-destructive">{errors[id]?.message}</p>}
  </div>;
  return <main id="main" tabIndex={-1} className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
    <section className="flex flex-col justify-between bg-primary px-6 py-6 text-primary-foreground sm:px-12 lg:p-14">
      <Link to="/login" aria-label="KaarigarLink home" className="flex min-h-11 w-fit items-center gap-3 text-xl font-semibold"><Factory aria-hidden="true" className="size-7" />KaarigarLink</Link>
      <div className="hidden max-w-lg py-10 lg:block lg:py-20">
        <p className="mb-5 flex items-center gap-2 text-sm"><span className="size-2 bg-accent" />Manufacturing, connected</p>
        <p className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">Good work starts with the right connection.</p>
        <p className="mt-6 max-w-md text-base leading-relaxed">A shared workspace for buyers, manufacturing workshops and independent quality teams.</p>
      </div>
      <p className="hidden text-xs leading-relaxed lg:block">Built for small manufacturers. Aligned with SDG 9.3.</p>
    </section>
    <section aria-labelledby="register-heading" className="flex items-center justify-center bg-card px-6 py-10 sm:px-12 lg:py-14">
      <div className="w-full max-w-md">
        <div className="mb-8"><p className="mb-3 text-sm text-muted-foreground">Your manufacturing workspace</p><h1 id="register-heading" className="text-3xl font-semibold tracking-tight">Create your account</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Buyers post jobs, workshops quote and produce, inspectors record quality checks.</p></div>
        <form noValidate onSubmit={event => { void handleSubmit(submit)(event); }} aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-5">
            {field('role', 'Account type', <select id="role" {...register('role')} className={inputClass}><option value="buyer">Buyer</option><option value="workshop">Workshop</option><option value="inspector">Inspector</option></select>)}
            {field('name', 'Full name', <input id="name" autoComplete="name" {...register('name')} aria-invalid={!!errors.name} className={inputClass} />)}
            {field('email', 'Email address', <input id="email" type="email" autoComplete="username" {...register('email')} aria-invalid={!!errors.email} className={inputClass} />)}
            {field('password', 'Password', <input id="password" type="password" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} className={inputClass} />, '8 to 72 characters.')}
            {role === 'workshop' && <>
              {field('businessName', 'Workshop business name', <input id="businessName" autoComplete="organization" {...register('businessName')} aria-invalid={!!errors.businessName} className={inputClass} />)}
              {field('city', 'City', <input id="city" autoComplete="address-level2" {...register('city')} className={inputClass} />, 'Optional. An admin verifies new workshops before they can be awarded jobs.')}
            </>}
            <Button type="submit" className="w-full">{pending ? 'Creating account…' : 'Create account'}<ArrowRight aria-hidden="true" className="size-4" /></Button>
          </fieldset>
        </form>
        {error && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <p className="mt-6 text-sm">Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Your role is set by the server and decides what you can access.</p>
      </div>
    </section>
  </main>;
}
