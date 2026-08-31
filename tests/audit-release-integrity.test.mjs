import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UnavailableError,
  createDefaultProbes,
  executeAudit,
  filterAuditEnvironment,
  markdownCell,
  parseEnvFile,
  renderReport,
  runCommand,
} from '../scripts/audit/audit-release-integrity.mjs';

test('audit classifies pass, fail and unavailable without turning missing evidence green', async () => {
  const probes = [
    {
      name: 'green', source: 'fixture', command: 'green --read-only',
      run: async () => ({ summary: 'proved', sha: 'a'.repeat(40) }),
    },
    {
      name: 'missing', source: 'fixture', command: 'missing --read-only',
      run: async () => { throw new UnavailableError('credential absent'); },
    },
    {
      name: 'broken', source: 'fixture', command: 'broken --read-only',
      run: async () => { throw new Error('invariant diverged'); },
    },
  ];
  const result = await executeAudit({
    probes,
    now: () => new Date('2026-08-31T12:00:00.000Z'),
  });
  assert.deepEqual(result.results.map(({ status }) => status), ['pass', 'unavailable', 'fail']);
  assert.equal(result.exitCode, 1);
  assert.match(result.report, /\| green \| pass \|/);
  assert.match(result.report, /\| missing \| unavailable \|/);
  assert.match(result.report, /\| broken \| fail \|/);
});

test('audit exits zero with unavailable evidence only when no proof failed', async () => {
  const result = await executeAudit({
    probes: [
      { name: 'green', source: 'fixture', command: 'green', run: async () => ({ summary: 'ok' }) },
      {
        name: 'retention', source: 'fixture', command: 'logs',
        run: async () => { throw new UnavailableError('outside retention'); },
      },
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.pass, 1);
  assert.equal(result.summary.unavailable, 1);
  assert.equal(result.summary.fail, 0);
});

test('report stores only bounded summaries and redacts token-shaped values', () => {
  const report = renderReport({
    generatedAt: '2026-08-31T12:00:00.000Z',
    results: [{
      name: 'safe', status: 'fail', source: 'fixture', command: 'fixture',
      checkedAt: '2026-08-31T12:00:00.000Z',
      summary: `token ghp_${'a'.repeat(36)} ${'x'.repeat(1000)}`,
      sha: null,
    }],
  });
  assert.doesNotMatch(report, /ghp_[a-z]/);
  assert.match(report, /\[redacted-token\]/);
  assert.ok(report.length < 2000);
});

test('markdown cells escape existing backslashes before table separators', () => {
  assert.equal(markdownCell(String.raw`path\with|separator`), String.raw`path\\with\|separator`);
});

test('audit child environment keeps only the explicit operational allowlist', () => {
  const filtered = filterAuditEnvironment({
    PATH: '/usr/bin',
    GH_TOKEN: 'github-token',
    VERCEL_TOKEN: 'vercel-token',
    SUPABASE_DB_URL: 'postgres://database',
    SENTRY_AUTH_TOKEN: 'sentry-token',
    UNRELATED_SECRET: 'must-not-leak',
  });

  assert.deepEqual(filtered, {
    PATH: '/usr/bin',
    GH_TOKEN: 'github-token',
    VERCEL_TOKEN: 'vercel-token',
    SUPABASE_DB_URL: 'postgres://database',
    SENTRY_AUTH_TOKEN: 'sentry-token',
  });
  assert.equal(filtered.UNRELATED_SECRET, undefined);
});

test('env parser loads only explicitly allowed keys and supports quoted values', () => {
  const parsed = parseEnvFile(
    'SUPABASE_DB_URL="postgres://safe"\nCRON_SECRET=secret\nUNRELATED=ignore\n# comment\n',
    new Set(['SUPABASE_DB_URL', 'CRON_SECRET']),
  );
  assert.deepEqual(parsed, { SUPABASE_DB_URL: 'postgres://safe', CRON_SECRET: 'secret' });
});

test('timed out child that ignores SIGTERM is force-killed', async () => {
  const startedAt = Date.now();
  await assert.rejects(runCommand(process.execPath, [
    '-e',
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
  ], { timeoutMs: 50, killGraceMs: 50 }), /timed out/);
  assert.ok(Date.now() - startedAt < 2_000);
});

test('Vercel runtime audit scopes logs to the deployment already validated', async () => {
  const calls = [];
  const runner = async (file, args) => {
    calls.push([file, args]);
    return { stdout: `${JSON.stringify({ responseStatusCode: 200 })}\n`, stderr: '' };
  };
  const probe = createDefaultProbes({ env: {}, runner })
    .find(({ name }) => name === 'vercel-runtime-log-availability');
  const context = { publicSha: 'a'.repeat(40), vercelDeploymentId: 'dpl_exact' };
  await probe.run(context);
  assert.deepEqual(calls[0][1].slice(-2), ['--deployment', 'dpl_exact']);
});
