import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createServices } from '@/services';
import { createMockAuthService } from '@/services/adapters/mockAuth';
import { createLiveAuthService } from '@/services/live';
import { session } from '@/services/live/http';
import { liveDemoLoginEnabled } from './demoAccounts';

/** One-click demo login shortcuts: live mode uses the backend's development-only endpoint. */
const SHORTCUTS = [['Demo Buyer', 'BUYER'], ['Demo Workshop', 'WORKSHOP'], ['Demo Inspector', 'INSPECTOR'], ['Demo Admin', 'ADMIN']] as const;
const LANDMARK: Record<(typeof SHORTCUTS)[number][1], string> = { BUYER: 'Manufacturing jobs', WORKSHOP: 'Invitations', INSPECTOR: 'Assigned inspections', ADMIN: 'Audit history' };

beforeEach(() => sessionStorage.clear());
afterEach(() => { session.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function renderLive() {
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');
  render(<MemoryRouter initialEntries={['/login']}><AppProviders services={{ data: createServices('live'), auth: createLiveAuthService() }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
function renderMock() {
  const data = createServices();
  render(<MemoryRouter initialEntries={['/login']}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
const ok = (data: unknown) => Response.json({ success: true, message: 'ok', data });
const serverUser = (role: string) => ({ id: 'u-' + role, name: 'Server ' + role, email: role.toLowerCase() + '@kaarigarlink.test', role });
type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
/** The backend: demo login answers with `answer(role)`; normal login answers as a buyer; other reads 404. */
function backend(answer: (role: string) => Response | Promise<Response>): FetchMock {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
    if (url.endsWith('/auth/demo-login')) return answer(JSON.parse(String(init!.body)).role as string);
    if (url.endsWith('/auth/login')) return ok({ token: 'tok-normal', user: serverUser('BUYER') });
    return Response.json({ success: false, message: 'not stubbed' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const demoCalls = (fetchMock: FetchMock) => fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/demo-login'));

describe('live mode', () => {
  it.each(SHORTCUTS)('%s signs in with one click through POST /auth/demo-login', async (label, role) => {
    const fetchMock = backend(r => ok({ token: 'tok-' + r, user: serverUser(r) }));
    const user = renderLive();
    const panel = await screen.findByRole('region', { name: 'Demo accounts' });
    for (const [name] of SHORTCUTS) expect(within(panel).getByRole('button', { name })).toBeVisible();
    await user.click(within(panel).getByRole('button', { name: label }));

    const nav = await screen.findByRole('navigation', { name: 'Workspace navigation' });
    expect(within(nav).getByRole('link', { name: LANDMARK[role] })).toBeVisible();
    const [url, init] = demoCalls(fetchMock)[0]!;
    expect(url).toBe('http://api.test/api/auth/demo-login');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(String(init!.body))).toEqual({ role }); // the role only: no email, password or token
    expect(new Headers(init!.headers).get('Authorization')).toBeNull();
    // The normal session mechanism: the server's token is stored like after a password login.
    expect(session.token()).toBe('tok-' + role);
    expect(fetchMock.mock.calls.some(([u]) => u.endsWith('/auth/login'))).toBe(false);
  });

  it('the workspace follows the role in the server reply, not the button label', async () => {
    backend(() => ok({ token: 'tok-x', user: serverUser('INSPECTOR') }));
    const user = renderLive();
    await user.click(await screen.findByRole('button', { name: 'Demo Admin' }));
    const nav = await screen.findByRole('navigation', { name: 'Workspace navigation' });
    expect(within(nav).getByRole('link', { name: 'Assigned inspections' })).toBeVisible();
    expect(within(nav).queryByRole('link', { name: 'Audit history' })).not.toBeInTheDocument();
  });

  it('shows a loading state and ignores further clicks while signing in', async () => {
    let release!: (response: Response) => void;
    const fetchMock = backend(() => new Promise<Response>(resolve => { release = resolve; }));
    const user = renderLive();
    await user.click(await screen.findByRole('button', { name: 'Demo Buyer' }));
    const busy = screen.getByRole('button', { name: 'Opening…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    for (const name of ['Demo Workshop', 'Demo Inspector', 'Demo Admin']) expect(screen.getByRole('button', { name })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Demo Workshop' }));
    expect(demoCalls(fetchMock)).toHaveLength(1);
    release(ok({ token: 'tok-b', user: serverUser('BUYER') }));
    expect(await screen.findByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    expect(demoCalls(fetchMock)).toHaveLength(1);
  });

  it('shows the backend\'s message when demo login is rejected, and stays on sign-in', async () => {
    backend(() => Response.json({ success: false, message: 'Demo login is disabled on this server' }, { status: 404 }));
    const user = renderLive();
    await user.click(await screen.findByRole('button', { name: 'Demo Admin' }));
    expect(await screen.findByText('Demo login is disabled on this server')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Demo Admin' })).toBeEnabled();
    expect(session.token()).toBeNull();
  });

  it('ordinary email and password login still uses POST /auth/login; registration is still offered', async () => {
    const fetchMock = backend(() => ok({}));
    const user = renderLive();
    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    await user.type(screen.getByLabelText('Email address'), 'asha.rao@kaarigarlink.test');
    await user.type(screen.getByLabelText('Password'), 'typed-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    const login = fetchMock.mock.calls.find(([u]) => u.endsWith('/auth/login'))!;
    expect(JSON.parse(String(login[1]!.body))).toEqual({ email: 'asha.rao@kaarigarlink.test', password: 'typed-password' });
    expect(demoCalls(fetchMock)).toHaveLength(0);
  });

  it('VITE_DEMO_LOGIN=false hides the shortcuts (the backend still enforces its own switch)', () => {
    expect(liveDemoLoginEnabled(undefined)).toBe(true);
    expect(liveDemoLoginEnabled('true')).toBe(true);
    expect(liveDemoLoginEnabled(' FALSE ')).toBe(false);
  });
});

describe('mock mode', () => {
  it('keeps one-click demo sign-in for all four roles, without calling any server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const [label, role] of SHORTCUTS) {
      sessionStorage.clear();
      const user = renderMock();
      const panel = await screen.findByRole('region', { name: 'Explore a demo workspace' });
      await user.click(within(panel).getByRole('button', { name: label }));
      expect(within(await screen.findByRole('navigation', { name: 'Workspace navigation' })).getByRole('link', { name: LANDMARK[role] })).toBeVisible();
      document.body.textContent = '';
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mock email/password sign-in still reports invalid credentials', async () => {
    const user = renderMock();
    await user.type(await screen.findByLabelText('Email address'), 'buyer@kaarigarlink.example');
    await user.type(screen.getByLabelText('Password'), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('no secrets in the frontend', () => {
  const root = path.resolve(__dirname, '../..');
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const sources = files(root).map(file => [path.relative(root, file), fs.readFileSync(file, 'utf8')] as const);

  it('no JWT and no seed or backend secret appears in application source', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./); // a JWT
      expect(text, file).not.toMatch(/SeedTest-Passw0rd|JWT_SECRET\s*[:=]|SEED_DEFAULT_PASSWORD\s*[:=]/);
    }
  });
  it('the live demo login sends a role only', () => {
    const live = sources.find(([file]) => file.replaceAll('\\', '/') === 'services/live/auth.ts')![1];
    const start = live.indexOf("'/auth/demo-login'");
    const call = live.slice(start, live.indexOf('\n', start));
    expect(call).toContain('body: { role: role.toUpperCase() }');
    expect(call).not.toMatch(/password|email|token:/i);
  });
});
