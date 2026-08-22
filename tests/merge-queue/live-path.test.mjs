import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubAdapter, preflightSecrets } from '../../scripts/merge-queue/adapters.mjs';
import { reconcile } from '../../scripts/merge-queue/coordinator.mjs';
import { config as baseConfig, greenChecks, greenProduction, pr } from './helpers.mjs';

function recorder(overrides = {}) {
  const calls = [];
  const record = (name, result = {}) => async (...args) => { calls.push([name, ...args]); return result; };
  return {
    calls,
    adapters: {
      github: {
        setLabels: record('setLabels'),
        upsertIncident: record('upsertIncident'),
        assertMergePreconditions: record('assertMergePreconditions', { ok: true }),
        assertOwnerLabels: record('assertOwnerLabels', { ok: true }),
        merge: record('merge', { merged: true, sha: 'merge-43' }),
        persistContext: record('persistContext'),
        setCommitStatus: record('setCommitStatus'),
        dispatch: record('dispatch'),
        createRollbackPr: record('createRollbackPr', { number: 900 }),
        ...overrides.github,
      },
      vercel: {
        productionForSha: record('productionForSha', { id: 'deploy-before', sha: 'main-before', status: 'success' }),
        instantRollback: record('instantRollback'),
        promote: record('promote'),
        ...overrides.vercel,
      },
    },
  };
}

function liveConfig() {
  const config = structuredClone(baseConfig);
  config.production.promotion.mode = 'deployment-check-auto-alias';
  return {
    ...config,
    releaseGate: { required: true, name: 'Serial release gate', initialState: 'pending', successState: 'success' },
    notifications: { assignee: 'thiago-salvador' },
  };
}

test('successful live merge establishes hold and dispatches post-merge validation', async () => {
  const { calls, adapters } = recorder();
  const result = await reconcile({
    config: liveConfig(),
    snapshot: { prs: [pr(43)], main: { sha: 'main-before' }, production: { deployment: { id: 'deploy-before' } } },
    adapters,
  });
  assert.equal(result.decision, 'MERGE');
  assert.deepEqual(calls.map(([name]) => name), [
    'setLabels', 'assertMergePreconditions', 'persistContext', 'merge', 'persistContext', 'setLabels', 'setCommitStatus', 'dispatch',
  ]);
  assert.deepEqual(calls.find(([name]) => name === 'setCommitStatus').slice(1, 4), ['merge-43', 'pending', 'Serial release gate']);
  assert.deepEqual(calls.find(([name]) => name === 'dispatch').slice(1), [
    'serial-merge-queue-post-merge',
    { pr: 43, mergeSha: 'merge-43', trustedSha: 'main-before' },
  ]);
});

test('live pre-merge snapshot captures the previous production deployment before merging', async () => {
  const config = liveConfig();
  config.production.rollback = { requirePreviousReadyDeployment: true };
  config.production.stagedDeployment.hold = { required: true, githubStatusContext: 'Serial release gate' };
  const { calls, adapters } = recorder({
    github: {
      snapshot: async () => ({ prs: [pr(43)], main: { sha: 'main-before', checks: [] } }),
    },
    vercel: {
      productionForSha: async (sha) => ({ id: 'deploy-before', sha, status: 'success' }),
    },
  });
  const result = await reconcile({ config, adapters });
  assert.equal(result.decision, 'MERGE');
  const firstContext = calls.find(([name]) => name === 'persistContext')[2];
  assert.equal(firstContext.previousDeploymentId, 'deploy-before');
  assert.equal(firstContext.previousMainSha, 'main-before');
  assert.equal(firstContext.transition, 'merge-started');
});

test('declined merge fails closed, preserves active owner, and reports incident', async () => {
  const { calls, adapters } = recorder({ github: { merge: async () => ({ merged: false, message: 'base changed' }) } });
  const result = await reconcile({ config: liveConfig(), snapshot: { prs: [pr(43)], main: { sha: 'main' } }, adapters });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'remote-transition-failed');
  assert.ok(calls.some(([name, number, add]) => name === 'setLabels' && number === 43 && add.includes('active') && add.includes('blocked')));
  assert.ok(calls.some(([name]) => name === 'upsertIncident'));
});

test('base change between snapshot and merge fails closed before any merge call', async () => {
  const stale = Object.assign(new Error('base changed'), { status: 409 });
  const { calls, adapters } = recorder({
    github: { assertMergePreconditions: async (...args) => { calls.push(['assertMergePreconditions', ...args]); throw stale; } },
  });
  const result = await reconcile({
    config: liveConfig(),
    snapshot: { prs: [pr(43)], main: { sha: 'main-before' }, production: { deployment: { id: 'deploy-before' } } },
    adapters,
  });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'remote-transition-failed');
  assert.ok(!calls.some(([name]) => name === 'merge'));
  assert.ok(calls.some(([name]) => name === 'upsertIncident'));
});

test('post-merge failure marks release gate failed, reports once, instant-rolls back, and creates revert PR', async () => {
  const config = liveConfig();
  const mergeSha = 'merge-43';
  const owner = pr(43, {
    labels: ['active', 'post-merge'], mergeSha,
    queueContext: { previousDeploymentId: 'deploy-before', previousMainSha: 'main-before', headSha: 'head-43' },
    postMergeChecks: [
      { name: 'CI', sha: mergeSha, conclusion: 'failure' },
      { name: 'Ledger', sha: mergeSha, conclusion: 'success' },
    ],
  });
  const { calls, adapters } = recorder();
  const result = await reconcile({
    config,
    snapshot: { prs: [owner], main: { sha: mergeSha }, production: greenProduction(mergeSha) },
    adapters,
  });
  assert.equal(result.decision, 'ROLLBACK');
  const sequence = calls.map(([name]) => name);
  assert.deepEqual(sequence, ['setLabels', 'setCommitStatus', 'productionForSha', 'instantRollback', 'createRollbackPr', 'upsertIncident']);
  assert.equal(calls.find(([name]) => name === 'instantRollback')[1], 'deploy-before');
});

test('incident outage does not prevent rollback actions from being attempted', async () => {
  const config = liveConfig();
  const mergeSha = 'merge-43';
  const owner = pr(43, {
    labels: ['active', 'post-merge'], mergeSha,
    queueContext: { previousDeploymentId: 'deploy-before', previousMainSha: 'main-before', headSha: 'head-43' },
    postMergeChecks: [
      { name: 'CI', sha: mergeSha, conclusion: 'failure' },
      { name: 'Ledger', sha: mergeSha, conclusion: 'success' },
    ],
  });
  const { calls, adapters } = recorder({
    github: { upsertIncident: async (...args) => { calls.push(['upsertIncident', ...args]); throw new Error('incident API unavailable'); } },
  });
  await assert.rejects(
    reconcile({ config, snapshot: { prs: [owner], main: { sha: mergeSha }, production: greenProduction(mergeSha) }, adapters }),
    /rollback operations failed/,
  );
  assert.deepEqual(calls.map(([name]) => name), [
    'setLabels', 'setCommitStatus', 'productionForSha', 'instantRollback', 'createRollbackPr', 'upsertIncident',
  ]);
});

test('rollback refuses a deployment id that does not match the previous main SHA', async () => {
  const config = liveConfig();
  const mergeSha = 'merge-43';
  const owner = pr(43, {
    labels: ['active', 'post-merge'], mergeSha,
    queueContext: { previousDeploymentId: 'forged-deploy', previousMainSha: 'main-before', headSha: 'head-43' },
    postMergeChecks: [
      { name: 'CI', sha: mergeSha, conclusion: 'failure' },
      { name: 'Ledger', sha: mergeSha, conclusion: 'success' },
    ],
  });
  const { calls, adapters } = recorder();
  await assert.rejects(
    reconcile({ config, snapshot: { prs: [owner], main: { sha: mergeSha }, production: greenProduction(mergeSha) }, adapters }),
    /rollback operations failed/,
  );
  assert.ok(!calls.some(([name]) => name === 'instantRollback'));
  assert.ok(calls.some(([name]) => name === 'createRollbackPr'));
});

test('ready staged release opens hold but keeps lock until promoted readback', async () => {
  const config = liveConfig();
  const sha = 'merge-43';
  const owner = pr(43, { labels: ['active', 'post-merge'], mergeSha: sha, postMergeChecks: greenChecks(sha, ['CI', 'Ledger']) });
  const production = greenProduction(sha);
  production.promotion.status = 'pending';
  const { calls, adapters } = recorder();
  const result = await reconcile({ config, snapshot: { prs: [owner], main: { sha }, production }, adapters });
  assert.equal(result.decision, 'VERIFY');
  assert.equal(result.reason, 'ready-to-promote');
  assert.deepEqual(calls.map(([name]) => name), ['setCommitStatus']);
  assert.equal(calls[0][2], 'success');
});

test('green rollback PR merge dispatches recovery validation for the restored SHA', async () => {
  const config = liveConfig();
  const rollback = {
    status: 'open', prNumber: 900, headSha: 'rollback-head', sync: 'up_to_date', mergeable: true,
    checks: greenChecks('rollback-head'),
  };
  const owner = pr(43, { labels: ['active', 'rollback'], rollback });
  const { calls, adapters } = recorder();
  const result = await reconcile({ config, snapshot: { prs: [owner], main: { sha: 'failed-main' } }, adapters });
  assert.equal(result.reason, 'rollback-pr-ready');
  assert.deepEqual(calls.map(([name]) => name), [
    'assertMergePreconditions', 'assertOwnerLabels', 'merge', 'persistContext', 'dispatch',
  ]);
  assert.deepEqual(calls.at(-1).slice(1), ['serial-merge-queue-recovery', { ownerPr: 43, rollbackPr: 900, restoredSha: 'merge-43' }]);
});

test('rollback PR base change is detected before the recovery merge', async () => {
  const config = liveConfig();
  const rollback = {
    status: 'open', prNumber: 900, headSha: 'rollback-head', sync: 'up_to_date', mergeable: true,
    checks: greenChecks('rollback-head'),
  };
  const owner = pr(43, { labels: ['active', 'rollback'], rollback });
  const stale = Object.assign(new Error('rollback base changed'), { status: 409 });
  const { calls, adapters } = recorder({
    github: { assertMergePreconditions: async (...args) => { calls.push(['assertMergePreconditions', ...args]); throw stale; } },
  });
  await assert.rejects(
    reconcile({ config, snapshot: { prs: [owner], main: { sha: 'failed-main' } }, adapters }),
    /rollback operations failed/,
  );
  assert.ok(!calls.some(([name]) => name === 'merge'));
});

test('rollback merge stops if the original owner lock disappears', async () => {
  const config = liveConfig();
  const rollback = {
    status: 'open', prNumber: 900, headSha: 'rollback-head', sync: 'up_to_date', mergeable: true,
    checks: greenChecks('rollback-head'),
  };
  const owner = pr(43, { labels: ['active', 'rollback'], rollback });
  const stale = Object.assign(new Error('owner lock removed'), { status: 409 });
  const { calls, adapters } = recorder({
    github: { assertOwnerLabels: async (...args) => { calls.push(['assertOwnerLabels', ...args]); throw stale; } },
  });
  await assert.rejects(
    reconcile({ config, snapshot: { prs: [owner], main: { sha: 'failed-main' } }, adapters }),
    /rollback operations failed/,
  );
  assert.ok(!calls.some(([name]) => name === 'merge'));
});

test('secret and production hold preflight fail closed', () => {
  const config = {
    ...liveConfig(),
    secrets: { required: ['MERGE_QUEUE_GH_TOKEN', 'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] },
    production: { stagedDeployment: { hold: { required: true, githubStatusContext: 'Serial release gate' } } },
  };
  assert.throws(() => preflightSecrets(config, {}), /secrets are missing/);
  assert.doesNotThrow(() => preflightSecrets(config, {
    GITHUB_TOKEN: 'x', VERCEL_TOKEN: 'x', VERCEL_TEAM_ID: 'x', VERCEL_PROJECT_ID: 'x',
  }));
  const broken = structuredClone(config);
  broken.production.stagedDeployment.hold.githubStatusContext = '';
  assert.throws(() => preflightSecrets(broken, {
    GITHUB_TOKEN: 'x', VERCEL_TOKEN: 'x', VERCEL_TEAM_ID: 'x', VERCEL_PROJECT_ID: 'x',
  }), /hold configuration/);
});

test('incident upsert deduplicates by PR, phase, SHA, and reason signature', async () => {
  const calls = [];
  const existingBody = '<!-- serial-merge-queue:43:post-merge:abc:ledger-failed -->';
  const fetchImpl = async (url, init = {}) => {
    calls.push([url, init]);
    const payload = init.method === 'PATCH' ? { number: 7 } : [{ number: 7, body: existingBody }];
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl });
  await github.upsertIncident({ pr: 43, phase: 'post-merge', sha: 'abc', reason: 'ledger-failed', severity: 'failure', assignee: 'owner' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].method, 'PATCH');
  assert.match(calls[1][0], /issues\/7$/);
});

test('queue context ignores contributor comments and malformed trusted state', async () => {
  const valid = { previousMainSha: 'a'.repeat(40), previousDeploymentId: 'deploy-trusted', headSha: 'b'.repeat(40) };
  const comments = [
    {
      user: { login: 'thiago-salvador' },
      body: `<!-- serial-merge-queue-context:${JSON.stringify(valid)} -->`,
    },
    {
      user: { login: 'thiago-salvador' },
      body: '<!-- serial-merge-queue-context:{"previousDeploymentId":"bad","unknown":"field"} -->',
    },
    {
      user: { login: 'contributor' },
      author_association: 'CONTRIBUTOR',
      body: '<!-- serial-merge-queue-context:{"previousDeploymentId":"forged-deploy","recovered":true} -->',
    },
  ];
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(comments) });
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl });
  const context = await github.queueContext(43, { queue: { trustedContextActors: ['thiago-salvador'] } });
  assert.deepEqual(context, valid);
});

test('GitHub pagination includes a sensitive file from the second page', async () => {
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl: async () => { throw new Error('unused'); } });
  github.checks = async () => [];
  github.queueContext = async () => null;
  github.jsonAtRef = async () => null;
  github.request = async (path) => {
    const page = Number(new URL(`https://api.github.test${path}`).searchParams.get('page'));
    if (page === 1) return Array.from({ length: 100 }, (_, index) => ({ filename: `src/file-${index}.ts` }));
    return [{ filename: 'supabase/migrations/hidden-on-page-two.sql' }];
  };
  const snapshot = await github.pullSnapshot({
    number: 43,
    node_id: 'node',
    created_at: '2026-08-21T10:00:00Z',
    state: 'open',
    draft: false,
    merged_at: null,
    head: { sha: 'a'.repeat(40) },
    mergeable_state: 'clean',
    mergeable: true,
    labels: [],
  }, liveConfig());
  assert.ok(snapshot.files.includes('supabase/migrations/hidden-on-page-two.sql'));
});
