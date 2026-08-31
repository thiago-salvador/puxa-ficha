import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubAdapter, HttpError, preflightSecrets } from '../../scripts/merge-queue/adapters.mjs';
import { enrichProduction, reconcile } from '../../scripts/merge-queue/coordinator.mjs';
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
        updateBranch: record('updateBranch', { message: 'Updating pull request branch.' }),
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
        deploymentForSha: record('deploymentForSha', {
          id: 'deploy-before', sha: 'main-before', status: 'success', readyState: 'READY',
          target: 'production', url: 'https://puxa-ficha-before.vercel.app',
        }),
        currentProductionForDomain: record('currentProductionForDomain', {
          id: 'deploy-before', sha: 'main-before', status: 'success', readyState: 'READY',
          target: 'production', url: 'https://puxa-ficha-before.vercel.app',
        }),
        productionForSha: record('productionForSha', { id: 'deploy-before', sha: 'main-before', status: 'success' }),
        assertDeployment: (deployment, expected) => {
          calls.push(['assertDeployment', deployment, expected]);
          if (deployment?.id !== expected.expectedId || deployment?.sha !== expected.expectedSha) {
            throw new Error('deployment assertion rejected the predecessor');
          }
          return deployment;
        },
        instantRollback: record('instantRollback'),
        promote: record('promote'),
        ...overrides.vercel,
      },
    },
  };
}

function liveConfig() {
  const config = structuredClone(baseConfig);
  config.production.promotion.mode = 'explicit-vercel-promote';
  return {
    ...config,
    releaseGate: { required: false, name: 'Serial release orchestration', initialState: 'pending', successState: 'success' },
    notifications: { assignee: 'thiago-salvador' },
  };
}

test('live production evidence uses deployment identity for promotion and maps rollback to predecessor SHA', async () => {
  const mergeSha = 'a'.repeat(40);
  const previousSha = 'b'.repeat(40);
  const config = liveConfig();
  config.production.stagedChecks.checks = ['Vercel - puxa-ficha: staged-release'];
  config.production.publicReadback.checks = ['Production release closure'];
  config.production.rollback.checks = ['Production rollback recovery'];
  const snapshot = {
    prs: [pr(43, {
      labels: ['active', 'post-merge'],
      mergeSha,
      queueContext: { previousMainSha: previousSha },
    })],
    main: {
      sha: mergeSha,
      checks: [
        { name: 'Vercel - puxa-ficha: staged-release', sha: mergeSha, conclusion: 'success' },
        { name: 'Production release closure', sha: mergeSha, conclusion: 'pending' },
        { name: 'Production rollback recovery', sha: mergeSha, conclusion: 'success' },
      ],
    },
  };
  const candidate = {
    id: 'candidate', sha: mergeSha, status: 'success', readyState: 'READY',
    target: 'production', url: 'https://candidate.vercel.app',
  };
  const result = await enrichProduction(snapshot, config, {
    deploymentForSha: async () => candidate,
    currentProductionForDomain: async () => candidate,
  });
  assert.deepEqual(result.production.promotion, { sha: mergeSha, status: 'success' });
  assert.deepEqual(result.production.stagedChecks, { sha: mergeSha, status: 'success' });
  assert.deepEqual(result.production.publicReadback, { sha: mergeSha, status: 'pending' });
  assert.deepEqual(result.production.rollback, { sha: previousSha, status: 'success' });
});

test('missing rollback check stays null instead of inventing pending recovery evidence', async () => {
  const mergeSha = 'a'.repeat(40);
  const previousSha = 'b'.repeat(40);
  const config = liveConfig();
  config.production.rollback.checks = ['Production rollback recovery'];
  const snapshot = {
    prs: [pr(43, { labels: ['active', 'post-merge'], mergeSha, queueContext: { previousMainSha: previousSha } })],
    main: { sha: mergeSha, checks: [] },
  };
  const candidate = {
    id: 'candidate', sha: mergeSha, status: 'success', readyState: 'READY',
    target: 'production', url: 'https://candidate.vercel.app',
  };
  const result = await enrichProduction(snapshot, config, {
    deploymentForSha: async () => candidate,
    currentProductionForDomain: async () => candidate,
  });
  assert.equal(result.production.rollback, null);
});

test('skipped conditional rollback job stays null instead of becoming a critical failure', async () => {
  const mergeSha = 'a'.repeat(40);
  const previousSha = 'b'.repeat(40);
  const config = liveConfig();
  config.production.rollback.checks = ['Production rollback recovery'];
  const snapshot = {
    prs: [pr(43, { labels: ['active', 'post-merge'], mergeSha, queueContext: { previousMainSha: previousSha } })],
    main: {
      sha: mergeSha,
      checks: [{ name: 'Production rollback recovery', sha: mergeSha, conclusion: 'skipped' }],
    },
  };
  const candidate = {
    id: 'candidate', sha: mergeSha, status: 'success', readyState: 'READY',
    target: 'production', url: 'https://candidate.vercel.app',
  };
  const result = await enrichProduction(snapshot, config, {
    deploymentForSha: async () => candidate,
    currentProductionForDomain: async () => null,
  });
  assert.equal(result.production.rollback, null);
});

test('canonical-domain lookup failure degrades to missing evidence and remains fail-closed', async () => {
  const mergeSha = 'a'.repeat(40);
  const config = liveConfig();
  config.production.url = 'https://puxaficha.com.br';
  const candidate = {
    id: 'candidate', sha: mergeSha, status: 'success', readyState: 'READY',
    target: 'production', url: 'https://candidate.vercel.app',
  };
  const result = await enrichProduction({ prs: [], main: { sha: mergeSha, checks: [] } }, config, {
    deploymentForSha: async () => candidate,
    currentProductionForDomain: async () => { throw new Error('Vercel alias lookup unavailable'); },
  });
  assert.equal(result.production.currentDeployment, null);
  assert.deepEqual(result.production.promotion, { sha: mergeSha, status: 'pending' });
});

test('successful live merge dispatches staged validation without opening a legacy gate', async () => {
  const { calls, adapters } = recorder();
  const result = await reconcile({
    config: liveConfig(),
    snapshot: {
      prs: [pr(43)],
      main: { sha: 'main-before' },
      production: { deployment: {
        id: 'deploy-before', sha: 'main-before', status: 'success',
        url: 'https://puxa-ficha-before.vercel.app',
      } },
    },
    adapters,
  });
  assert.equal(result.decision, 'MERGE');
  assert.deepEqual(calls.map(([name]) => name), [
    'setLabels', 'assertMergePreconditions', 'persistContext', 'merge', 'persistContext', 'setLabels', 'dispatch',
  ]);
  assert.ok(!calls.some(([name]) => name === 'setCommitStatus'));
  assert.deepEqual(calls.find(([name]) => name === 'dispatch').slice(1), [
    'serial-merge-queue-post-merge',
    {
      pr: 43,
      mergeSha: 'merge-43',
      trustedSha: 'main-before',
      previousDeploymentId: 'deploy-before',
      previousDeploymentSha: 'main-before',
      previousDeploymentUrl: 'https://puxa-ficha-before.vercel.app',
      git: { sha: 'merge-43' },
      environment: 'production',
      project: { name: 'puxa-ficha' },
    },
  ]);
});

test('live behind branch updates only the captured head and keeps the serial lock', async () => {
  const { calls, adapters } = recorder();
  const result = await reconcile({
    config: liveConfig(),
    snapshot: { prs: [pr(43, { sync: 'behind' }), pr(44)], main: { sha: 'main-before' } },
    adapters,
  });
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.reason, 'branch-update-required');
  assert.deepEqual(calls.map(([name]) => name), ['setLabels', 'updateBranch']);
  assert.deepEqual(calls.find(([name]) => name === 'updateBranch').slice(1), [43, 'head-43']);
});

test('live pre-merge snapshot captures the previous production deployment before merging', async () => {
  const config = liveConfig();
  config.production.rollback = { requirePreviousReadyDeployment: true };
  config.production.stagedDeployment.hold = {
    required: true,
    provider: 'vercel-auto-assignment-disabled',
    githubStatusContext: 'Vercel - puxa-ficha: staged-release',
  };
  const { calls, adapters } = recorder({
    github: {
      snapshot: async () => ({ prs: [pr(43)], main: { sha: 'main-before', checks: [] } }),
    },
    vercel: {
      deploymentForSha: async (sha) => ({
        id: 'deploy-before', sha, status: 'success', readyState: 'READY', target: 'production',
        url: 'https://puxa-ficha-before.vercel.app',
      }),
      currentProductionForDomain: async () => ({
        id: 'deploy-before', sha: 'main-before', status: 'success', readyState: 'READY', target: 'production',
        url: 'https://puxa-ficha-before.vercel.app',
      }),
    },
  });
  const result = await reconcile({ config, adapters });
  assert.equal(result.decision, 'MERGE');
  const firstContext = calls.find(([name]) => name === 'persistContext')[2];
  assert.equal(firstContext.previousDeploymentId, 'deploy-before');
  assert.equal(firstContext.previousMainSha, 'main-before');
  assert.equal(firstContext.previousDeploymentSha, 'main-before');
  assert.equal(firstContext.previousDeploymentUrl, 'https://puxa-ficha-before.vercel.app');
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

test('failure after promotion marks the gate failed and instant-rolls back without creating a revert PR', async () => {
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
  assert.equal(result.decision, 'ROLLBACK_DEPLOYMENT');
  const sequence = calls.map(([name]) => name);
  assert.deepEqual(sequence, ['setCommitStatus', 'deploymentForSha', 'assertDeployment', 'instantRollback', 'upsertIncident']);
  assert.equal(calls.find(([name]) => name === 'instantRollback')[1], 'deploy-before');
  assert.ok(!calls.some(([name]) => name === 'createRollbackPr'));
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
    'setCommitStatus', 'deploymentForSha', 'assertDeployment', 'instantRollback', 'upsertIncident',
  ]);
});

test('rollback aborts when assertDeployment rejects the captured predecessor', async () => {
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
  assert.ok(!calls.some(([name]) => name === 'createRollbackPr'));
  assert.ok(calls.some(([name]) => name === 'assertDeployment'));
  assert.ok(calls.some(([name]) => name === 'upsertIncident'));
});

test('ready staged release keeps lock until explicit promotion is visible', async () => {
  const config = liveConfig();
  const sha = 'merge-43';
  const owner = pr(43, { labels: ['active', 'post-merge'], mergeSha: sha, postMergeChecks: greenChecks(sha, ['CI', 'Ledger']) });
  const production = greenProduction(sha);
  production.promotion.status = 'pending';
  const { calls, adapters } = recorder();
  const result = await reconcile({ config, snapshot: { prs: [owner], main: { sha }, production }, adapters });
  assert.equal(result.decision, 'AWAIT_PROMOTION');
  assert.equal(result.reason, 'stage-green-awaiting-promotion');
  assert.deepEqual(calls, []);
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
    production: {
      stagedDeployment: {
        hold: {
          required: true,
          provider: 'vercel-auto-assignment-disabled',
          githubStatusContext: 'Vercel - puxa-ficha: staged-release',
        },
      },
      promotion: { mode: 'explicit-vercel-promote' },
    },
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
  const unsafe = structuredClone(config);
  unsafe.production.stagedDeployment.hold.provider = 'vercel-deployment-checks';
  assert.throws(() => preflightSecrets(unsafe, {
    GITHUB_TOKEN: 'x', VERCEL_TOKEN: 'x', VERCEL_TEAM_ID: 'x', VERCEL_PROJECT_ID: 'x',
  }), /disable Vercel automatic domain assignment/);
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

test('queue context preserves the exact rollback deployment and ignores malformed trusted state', async () => {
  const valid = {
    previousMainSha: 'a'.repeat(40),
    previousDeploymentId: 'deploy-trusted',
    previousDeploymentSha: 'a'.repeat(40),
    previousDeploymentUrl: 'https://puxa-ficha-trusted.vercel.app',
    headSha: 'b'.repeat(40),
  };
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

test('GitHub checks keep only the newest commit status for each context', async () => {
  const sha = 'a'.repeat(40);
  const fetchImpl = async (url) => {
    if (url.includes('/check-runs?')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ check_runs: [] }) };
    }
    if (url.includes('/statuses?')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          {
            context: 'Production release closure',
            state: 'success',
            target_url: 'https://github.test/runs/current',
            created_at: '2026-08-31T12:00:00Z',
            updated_at: '2026-08-31T12:00:00Z',
          },
          {
            context: 'Production release closure',
            state: 'failure',
            target_url: 'https://github.test/runs/old',
            created_at: '2026-08-31T11:00:00Z',
            updated_at: '2026-08-31T11:00:00Z',
          },
        ]),
      };
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl });

  assert.deepEqual(await github.checks(sha), [{
    name: 'Production release closure',
    sha,
    status: 'success',
    conclusion: 'success',
    url: 'https://github.test/runs/current',
    createdAt: '2026-08-31T12:00:00Z',
    updatedAt: '2026-08-31T12:00:00Z',
  }]);
});

test('GitHub checks keep only the newest rerun for each check name', async () => {
  const sha = 'a'.repeat(40);
  const fetchImpl = async (url) => {
    if (url.includes('/check-runs?')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ check_runs: [
          {
            id: 2,
            name: 'verify',
            head_sha: sha,
            status: 'completed',
            conclusion: 'success',
            completed_at: '2026-08-31T12:00:00Z',
            html_url: 'https://github.test/runs/current',
          },
          {
            id: 1,
            name: 'verify',
            head_sha: sha,
            status: 'completed',
            conclusion: 'failure',
            completed_at: '2026-08-31T11:00:00Z',
            html_url: 'https://github.test/runs/old',
          },
        ] }),
      };
    }
    if (url.includes('/statuses?')) {
      return { ok: true, status: 200, text: async () => '[]' };
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl });
  assert.deepEqual(await github.checks(sha), [{
    name: 'verify',
    sha,
    status: 'completed',
    conclusion: 'success',
    url: 'https://github.test/runs/current',
  }]);
});

test('GitHub CodeQL evidence comes from exact-SHA analyses for both languages', async () => {
  const sha = 'a'.repeat(40);
  const fetchImpl = async (url) => {
    assert.match(url, /code-scanning\/analyses\?ref=refs%2Fheads%2Fmain/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([
        {
          id: 3,
          commit_sha: sha,
          category: '/language:python',
          created_at: '2026-08-31T12:00:00Z',
          error: '',
          url: 'https://api.github.test/analyses/3',
        },
        {
          id: 2,
          commit_sha: sha,
          category: '/language:javascript-typescript',
          created_at: '2026-08-31T12:00:00Z',
          error: '',
          url: 'https://api.github.test/analyses/2',
        },
        {
          id: 1,
          commit_sha: sha,
          category: '/language:python',
          created_at: '2026-08-31T11:00:00Z',
          error: 'old failed rerun',
          url: 'https://api.github.test/analyses/1',
        },
        {
          id: 4,
          commit_sha: 'b'.repeat(40),
          category: '/language:python',
          created_at: '2026-08-31T13:00:00Z',
          error: '',
        },
      ]),
    };
  };
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token', fetchImpl });
  assert.deepEqual(await github.codeScanningChecks(sha, 'refs/heads/main'), [
    {
      name: 'CodeQL analysis (javascript-typescript)',
      sha,
      status: 'completed',
      conclusion: 'success',
      url: 'https://api.github.test/analyses/2',
      createdAt: '2026-08-31T12:00:00Z',
    },
    {
      name: 'CodeQL analysis (python)',
      sha,
      status: 'completed',
      conclusion: 'success',
      url: 'https://api.github.test/analyses/3',
      createdAt: '2026-08-31T12:00:00Z',
    },
  ]);
});

test('GitHub CodeQL evidence fails closed on an exact-SHA analysis error', async () => {
  const sha = 'a'.repeat(40);
  const github = new GitHubAdapter({
    repository: 'owner/repo',
    token: 'token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{
        id: 1,
        commit_sha: sha,
        category: '/language:python',
        created_at: '2026-08-31T12:00:00Z',
        error: 'upload failed',
      }]),
    }),
  });
  assert.equal((await github.codeScanningChecks(sha, 'refs/heads/main'))[0].conclusion, 'failure');
});

test('GitHub branch update is pinned to the observed PR head', async () => {
  const calls = [];
  const github = new GitHubAdapter({
    repository: 'owner/repo',
    token: 'token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        text: async () => JSON.stringify({ message: 'Updating pull request branch.' }),
      };
    },
  });
  const sha = 'a'.repeat(40);
  await github.updateBranch(43, sha);
  assert.equal(calls[0].url, 'https://api.github.com/repos/owner/repo/pulls/43/update-branch');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { expected_head_sha: sha });
});

test('GitHub branch update treats a changed head race as a safe recheck', async () => {
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token' });
  github.request = async (path) => {
    if (path.endsWith('/update-branch')) throw new HttpError('head changed', 422, {});
    return { head: { sha: newSha }, mergeable_state: 'unknown' };
  };
  assert.deepEqual(await github.updateBranch(43, oldSha), {
    updated: false,
    stale: true,
    observedHeadSha: newSha,
  });
});

test('GitHub branch update fails closed when the captured head is still behind', async () => {
  const sha = 'a'.repeat(40);
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token' });
  github.request = async (path) => {
    if (path.endsWith('/update-branch')) throw new HttpError('cannot update', 422, {});
    return { head: { sha }, mergeable_state: 'behind' };
  };
  await assert.rejects(github.updateBranch(43, sha), (error) => error instanceof HttpError && error.status === 422);
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

test('GitHub live snapshot refreshes per-PR mergeability instead of trusting the list response', async () => {
  const github = new GitHubAdapter({ repository: 'owner/repo', token: 'token' });
  github.paginated = async (path) => {
    if (path.includes('/pulls?state=open')) return [{ number: 43 }];
    if (path.includes('/issues?state=all')) return [];
    throw new Error(`unexpected pagination: ${path}`);
  };
  github.request = async (path) => {
    if (path.includes('/branches/')) return { commit: { sha: 'main-sha' } };
    if (path.endsWith('/pulls/43')) {
      return { number: 43, mergeable: true, mergeable_state: 'behind' };
    }
    throw new Error(`unexpected request: ${path}`);
  };
  github.pullSnapshot = async (pull) => ({
    number: pull.number,
    sync: pull.mergeable_state,
    mergeable: pull.mergeable,
  });
  github.checks = async () => [];
  github.codeScanningChecks = async () => [];

  const snapshot = await github.snapshot(liveConfig());
  assert.deepEqual(snapshot.prs, [{ number: 43, sync: 'behind', mergeable: true }]);
});
