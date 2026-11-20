/**
 * KaarigarLink end-to-end smoke test (M9A).
 *
 * Exercises the real HTTP API of a running backend (e.g. http://localhost:4000):
 *   health -> login buyer + workshop -> buyer creates job -> matches ->
 *   invite workshop -> workshop lists invitations -> accepts -> buyer sees ACCEPTED
 *
 * It WRITES data (one job + one invitation per run). Run it only against a
 * local demo/test database, never against data you need to keep clean. By
 * default it cancels the job it created at the end (it never deletes anything);
 * set SMOKE_KEEP_JOB=true to leave the job in place for inspection.
 *
 * Usage (from backend/):
 *   SMOKE_BASE_URL=http://localhost:4000 \
 *   SMOKE_BUYER_EMAIL=... SMOKE_BUYER_PASSWORD=... \
 *   SMOKE_WORKSHOP_EMAIL=... SMOKE_WORKSHOP_PASSWORD=... \
 *   SMOKE_CONFIRM_WRITES=yes npm run smoke
 *
 * The workshop account must belong to a VERIFIED workshop with at least one
 * capability, an OPERATIONAL machine for it and free capacity in the next two
 * weeks (the seed's `precision-works@kaarigarlink.test` qualifies).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

class SmokeError extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

// ---------- configuration ----------

function requireEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SmokeError('config', `${name} is not set. ${hint}`);
  return value;
}

function loadConfig() {
  const baseUrl = requireEnv('SMOKE_BASE_URL', 'Example: http://localhost:4000');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new SmokeError('config', `SMOKE_BASE_URL "${baseUrl}" is not a valid URL`);
  }
  if (process.env.SMOKE_CONFIRM_WRITES !== 'yes') {
    throw new SmokeError(
      'config',
      'This smoke test creates a job and an invitation. Run it only against a local demo/test database, ' +
        'then set SMOKE_CONFIRM_WRITES=yes to confirm.',
    );
  }
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new SmokeError('config', 'SMOKE_TIMEOUT_MS must be a positive number of milliseconds');
  }
  return {
    apiBase: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '').replace(/\/api$/, '')}/api`,
    buyer: {
      email: requireEnv('SMOKE_BUYER_EMAIL', 'Email of a BUYER account.'),
      password: requireEnv('SMOKE_BUYER_PASSWORD', 'Password of the BUYER account.'),
    },
    workshop: {
      email: requireEnv('SMOKE_WORKSHOP_EMAIL', 'Email of a WORKSHOP account with a VERIFIED workshop.'),
      password: requireEnv('SMOKE_WORKSHOP_PASSWORD', 'Password of the WORKSHOP account.'),
    },
    keepJob: process.env.SMOKE_KEEP_JOB === 'true',
    timeoutMs,
  };
}

// ---------- HTTP helper ----------

interface ApiBody {
  success?: boolean;
  message?: string;
  errors?: unknown;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function call(
  apiBase: string,
  step: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options: { token?: string; body?: unknown; expect?: number[]; timeoutMs?: number } = {},
): Promise<{ status: number; body: ApiBody }> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (err) {
    throw new SmokeError(step, `${method} ${path} failed to connect: ${(err as Error).message}`);
  }
  const text = await response.text();
  let body: ApiBody;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new SmokeError(step, `${method} ${path} returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  const expected = options.expect ?? [200];
  if (!expected.includes(response.status)) {
    throw new SmokeError(
      step,
      `${method} ${path} returned HTTP ${response.status} (expected ${expected.join(' or ')}): ${body.message ?? 'no message'}`,
      body.errors,
    );
  }
  return { status: response.status, body };
}

// ---------- steps ----------

async function main() {
  const cfg = loadConfig();
  const api = (step: string, method: 'GET' | 'POST' | 'PUT', path: string, options?: Parameters<typeof call>[4]) =>
    call(cfg.apiBase, step, method, path, options);
  const started = Date.now();
  const log = (step: string, detail: string) => console.log(`  ✓ ${step.padEnd(28)} ${detail}`);

  console.log(`\nKaarigarLink smoke test -> ${cfg.apiBase}`);
  console.log('  (writes one job + one invitation; use a local demo/test database)\n');

  let jobId: string | undefined;
  let buyerToken: string | undefined;

  try {
    // 1. Health (retries until the backend is up, e.g. while `npm run dev` is still starting).
    const healthDeadline = Date.now() + cfg.timeoutMs;
    let lastError = '';
    for (;;) {
      try {
        const res = await api('1. health', 'GET', '/health', { expect: [200], timeoutMs: 30_000 });
        if (res.body.data?.database !== 'up') throw new Error(`database is ${res.body.data?.database}`);
        log('1. health', 'database up');
        break;
      } catch (err) {
        lastError = (err as Error).message;
        if (Date.now() > healthDeadline) {
          throw new SmokeError('1. health', `backend not healthy after ${cfg.timeoutMs} ms: ${lastError}`);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // 2. Logins (credentials come only from environment variables and are never printed).
    const buyerLogin = await api('2. login buyer', 'POST', '/auth/login', { body: cfg.buyer });
    if (buyerLogin.body.data?.user?.role !== 'BUYER') {
      throw new SmokeError('2. login buyer', `SMOKE_BUYER_EMAIL is a ${buyerLogin.body.data?.user?.role} account, expected BUYER`);
    }
    buyerToken = buyerLogin.body.data.token as string;
    const workshopLogin = await api('2. login workshop', 'POST', '/auth/login', { body: cfg.workshop });
    if (workshopLogin.body.data?.user?.role !== 'WORKSHOP') {
      throw new SmokeError('2. login workshop', `SMOKE_WORKSHOP_EMAIL is a ${workshopLogin.body.data?.user?.role} account, expected WORKSHOP`);
    }
    const workshopToken = workshopLogin.body.data.token as string;
    log('2. login', 'buyer and workshop authenticated');

    // Derive a job this workshop can do from its own profile (nothing hard-coded).
    const me = await api('2. workshop profile', 'GET', '/workshops/me', { token: workshopToken });
    const workshop = me.body.data.workshop;
    const capability = workshop.capabilities?.[0];
    if (workshop.verificationStatus !== 'VERIFIED') {
      throw new SmokeError('2. workshop profile', `workshop "${workshop.businessName}" is ${workshop.verificationStatus}; only VERIFIED workshops are eligible`);
    }
    if (!capability || !capability.supportedMaterials?.length) {
      throw new SmokeError('2. workshop profile', `workshop "${workshop.businessName}" has no capability with a material`);
    }

    // 3. Buyer creates a job.
    const created = await api('3. create job', 'POST', '/jobs', {
      token: buyerToken,
      expect: [201],
      body: {
        title: `[SMOKE] ${new Date().toISOString()}`,
        description: 'Automated smoke test job - safe to ignore.',
        material: capability.supportedMaterials[0],
        manufacturingProcess: capability.manufacturingProcess,
        quantity: 1,
        deadline: new Date(Date.now() + 14 * DAY_MS).toISOString(),
        ...(workshop.latitude !== null && workshop.longitude !== null && {
          latitude: workshop.latitude,
          longitude: workshop.longitude,
        }),
      },
    });
    jobId = created.body.data.job.id as string;
    log('3. create job', `${jobId} (${capability.manufacturingProcess}, ${capability.supportedMaterials[0]})`);

    // 4. Matches.
    const matches = await api('4. matches', 'GET', `/jobs/${jobId}/matches`, { token: buyerToken });
    const mine = (matches.body.data.results as { workshopId: string; rank: number | null; score: number | null; eligibility: { eligible: boolean; reasons: string[] } }[])
      .find((r) => r.workshopId === workshop.id);
    if (!mine) throw new SmokeError('4. matches', `workshop ${workshop.id} missing from match results`);
    if (!mine.eligibility.eligible) {
      throw new SmokeError('4. matches', `workshop "${workshop.businessName}" is not eligible`, mine.eligibility.reasons);
    }
    log('4. matches', `${matches.body.data.eligibleCount} eligible; workshop rank ${mine.rank}, score ${mine.score}`);

    // 5. Invite.
    const invited = await api('5. invite', 'POST', `/jobs/${jobId}/invitations`, {
      token: buyerToken,
      expect: [201],
      body: { workshopId: workshop.id },
    });
    const invitationId = invited.body.data.invitation.id as string;
    log('5. invite', `${invitationId} (job now ${invited.body.data.jobStatus})`);

    // 6. Workshop lists its invitations.
    const list = await api('6. workshop invitations', 'GET', '/workshops/invitations?status=INVITED&limit=100', { token: workshopToken });
    const received = (list.body.data.items as { id: string; status: string; matchScore?: unknown; rank?: unknown }[])
      .find((i) => i.id === invitationId);
    if (!received) throw new SmokeError('6. workshop invitations', `invitation ${invitationId} not in the workshop's INVITED list`);
    if ('matchScore' in received || 'rank' in received) {
      throw new SmokeError('6. workshop invitations', 'workshop view exposes score/rank (privacy regression)');
    }
    log('6. workshop invitations', `invitation visible as ${received.status}`);

    // 7. Workshop accepts.
    const accepted = await api('7. accept', 'POST', `/invitations/${invitationId}/respond`, {
      token: workshopToken,
      body: { response: 'ACCEPTED', note: 'Smoke test acceptance' },
    });
    if (accepted.body.data.invitation.status !== 'ACCEPTED') {
      throw new SmokeError('7. accept', `status is ${accepted.body.data.invitation.status}, expected ACCEPTED`);
    }
    log('7. accept', 'ACCEPTED');

    // 8. Buyer verifies.
    const buyerView = await api('8. buyer verifies', 'GET', `/jobs/${jobId}/invitations`, { token: buyerToken });
    const seen = (buyerView.body.data.items as { id: string; status: string }[]).find((i) => i.id === invitationId);
    if (seen?.status !== 'ACCEPTED') {
      throw new SmokeError('8. buyer verifies', `buyer sees status ${seen?.status ?? 'missing'}, expected ACCEPTED`);
    }
    log('8. buyer verifies', 'invitation is ACCEPTED');

    console.log(`\nSMOKE TEST PASSED in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    // Never deletes: only cancels the job THIS run created (unless asked to keep it).
    if (jobId && buyerToken) {
      if (cfg.keepJob) {
        console.log(`  - kept smoke job ${jobId} (SMOKE_KEEP_JOB=true)`);
      } else {
        try {
          await api('cleanup', 'PUT', `/jobs/${jobId}`, { token: buyerToken, body: { status: 'CANCELLED' } });
          console.log(`  - cancelled smoke job ${jobId} (set SMOKE_KEEP_JOB=true to keep it)`);
        } catch (err) {
          console.error(`  ! could not cancel smoke job ${jobId}: ${(err as Error).message}`);
        }
      }
    }
  }
}

main().catch((err: unknown) => {
  if (err instanceof SmokeError) {
    console.error(`\nSMOKE TEST FAILED at step "${err.step}": ${err.message}`);
    if (err.details) console.error(`  details: ${JSON.stringify(err.details)}`);
  } else {
    console.error('\nSMOKE TEST FAILED with an unexpected error:', err);
  }
  process.exitCode = 1;
});
