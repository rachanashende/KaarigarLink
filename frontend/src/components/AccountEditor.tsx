import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { FormField, controlClass } from '@/components/FormField';
import { ErrorState, LoadingState } from '@/components/feedback';
import { accountInputSchema, passwordChangeSchema, type AccountProfile } from '@/services/account';

/**
 * The signed-in user's own account (any role). Live mode: GET/PATCH /api/auth/me
 * (name and phone are editable; email and role are fixed). Mock mode has no
 * account service, so it shows the demo identity read-only.
 */
export function AccountEditor() {
  const { account } = useServices(); const { user } = useAuth();
  const query = useQuery({ queryKey: ['account', user?.id], queryFn: () => account!.get(), enabled: !!account && !!user });
  if (!account) return <section className="rounded-lg border bg-card p-5 sm:p-6">
    {facts([['Name', user?.name ?? ''], ['Email', user?.email ?? ''], ['Role', user?.role ?? '']])}
    <p className="mt-5 text-xs text-muted-foreground">Demo account. Profile editing is available when connected to the KaarigarLink server.</p>
  </section>;
  if (query.isPending) return <LoadingState label="Loading your profile…" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} />;
  // Keyed by account: the form takes the loaded values once, so a background refetch
  // never overwrites what the user is typing.
  return <AccountForm key={query.data.id} profile={query.data} />;
}

const facts = (rows: [string, string][]) => <dl className="grid gap-5 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-sm font-medium">{value}</dd></div>)}</dl>;

function AccountForm({ profile }: { profile: AccountProfile }) {
  const { account } = useServices(); const { user, refreshUser } = useAuth(); const cache = useQueryClient();
  const [name, setName] = useState(profile.name); const [phone, setPhone] = useState(profile.phone ?? '');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const save = useMutation({
    mutationFn: () => account!.update({ name, phone }),
    async onSuccess() { setNotice('Profile saved.'); await Promise.all([cache.invalidateQueries({ queryKey: ['account', user?.id] }), refreshUser()]); },
  });
  function submit() {
    setError(''); setNotice('');
    const parsed = accountInputSchema.safeParse({ name, phone });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check your details.'); return; }
    save.mutate();
  }
  return <section className="space-y-6 rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="account-details">
    <h2 id="account-details" className="text-lg font-semibold">Account details</h2>
    {facts([['Email', profile.email], ['Role', profile.role], ['Member since', profile.createdAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(profile.createdAt)) : 'Not recorded']])}
    <form noValidate className="grid gap-5 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); submit(); }}>
      <FormField id="account-name" label="Full name">{props => <input {...props} autoComplete="name" maxLength={100} className={controlClass} value={name} onChange={event => setName(event.target.value)} />}</FormField>
      <FormField id="account-phone" label="Phone" optional>{props => <input {...props} type="tel" autoComplete="tel" maxLength={20} className={controlClass} value={phone} onChange={event => setPhone(event.target.value)} />}</FormField>
      {(error || save.error) && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error || save.error?.message}</p>}
      {notice && <p role="status" className="rounded-md border bg-secondary p-3 text-sm sm:col-span-2">{notice}</p>}
      <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save profile'}</Button></div>
    </form>
    <p className="text-xs text-muted-foreground">Email and role cannot be changed here.</p>
    <PasswordChange />
  </section>;
}

/** M12: password change (live mode). Other sessions are signed out; this one continues with a new token. */
export function PasswordChange() {
  const { account } = useServices();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const change = useMutation({
    mutationFn: () => account!.changePassword!(values),
    onSuccess: () => { setValues({ currentPassword: '', newPassword: '', confirmPassword: '' }); setNotice('Password changed. Other signed-in sessions have been signed out.'); },
  });
  if (!account?.changePassword) return null;
  function submit() {
    setError(''); setNotice('');
    const parsed = passwordChangeSchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the passwords.'); return; }
    change.mutate();
  }
  const field = (key: keyof typeof values, label: string, autoComplete: string) => <FormField id={'password-' + key} label={label}>{props => <input {...props} type="password" autoComplete={autoComplete} maxLength={72} className={controlClass} value={values[key]} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} />}</FormField>;
  return <section className="mt-6 space-y-4 rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="password-change">
    <h2 id="password-change" className="text-lg font-semibold">Change password</h2>
    <form noValidate className="grid gap-4 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); submit(); }}>
      {field('currentPassword', 'Current password', 'current-password')}
      {field('newPassword', 'New password', 'new-password')}
      {field('confirmPassword', 'Confirm new password', 'new-password')}
      {(error || change.error) && <p role="alert" className="text-sm text-destructive sm:col-span-3">{error || change.error?.message}</p>}
      {notice && <p role="status" className="rounded-md border bg-secondary p-3 text-sm sm:col-span-3">{notice}</p>}
      <div className="sm:col-span-3"><Button type="submit" disabled={change.isPending}>{change.isPending ? 'Changing…' : 'Change password'}</Button></div>
    </form>
    <p className="text-xs text-muted-foreground">8 to 72 characters. Password reset by email is not available yet, so keep your password safe.</p>
  </section>;
}
