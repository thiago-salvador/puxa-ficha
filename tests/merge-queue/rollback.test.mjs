import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config, greenChecks, greenProduction, pr, reversibleMigrationManifest } from './helpers.mjs';

function rollbackSnapshot(rollback, ownerOverrides = {}, snapshotOverrides = {}) {
  const restoredSha = rollback?.mergeSha ?? 'restore-sha';
  return {
    prs: [pr(43, { labels: ['active', 'rollback'], mergeSha: 'failed-merge', rollback, ...ownerOverrides }), pr(44)],
    main: { sha: restoredSha, checks: greenChecks(restoredSha, ['CI', 'Ledger']) },
    production: greenProduction(restoredSha),
    ...snapshotOverrides,
  };
}

test('rollback in progress holds the same slot', () => {
  const result = evaluateSnapshot(config, rollbackSnapshot({ status: 'in_progress' }));
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.owner, 43);
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('merged owner with stale pre-merge label resumes post-merge instead of merging twice', () => {
  const mergeSha = 'merge-43';
  const owner = pr(43, {
    state: 'closed',
    mergedAt: '2026-08-21T10:05:00Z',
    mergeSha,
    labels: ['active', 'pre-merge'],
    queueContext: { previousDeploymentId: 'deploy-before', previousMainSha: 'main-before', headSha: 'head-43' },
    postMergeChecks: greenChecks(mergeSha, ['CI', 'Ledger']),
  });
  const result = evaluateSnapshot(config, {
    prs: [owner, pr(44)],
    main: { sha: mergeSha, checks: greenChecks(mergeSha, ['CI', 'Ledger']) },
    production: greenProduction(mergeSha),
  });
  assert.notEqual(result.decision, 'MERGE');
  assert.equal(result.owner, 43);
});

test('explicit rollback phase wins over merged-owner post-merge inference', () => {
  const rollback = {
    status: 'open', prNumber: 900, headSha: 'rollback-head', sync: 'up_to_date', mergeable: true,
    checks: greenChecks('rollback-head'),
  };
  const owner = pr(43, {
    state: 'closed',
    mergedAt: '2026-08-21T10:05:00Z',
    mergeSha: 'failed-merge',
    labels: ['active', 'rollback'],
    rollback,
  });
  const result = evaluateSnapshot(config, { prs: [owner, pr(44)], main: { sha: 'failed-merge' } });
  assert.equal(result.reason, 'rollback-pr-ready');
  assert.deepEqual(result.mutations, [
    {
      type: 'MERGE_ROLLBACK_PR', pr: 43, rollbackPr: 900,
      expectedHeadSha: 'rollback-head', expectedBaseSha: 'failed-merge',
    },
  ]);
});

test('pre-merge blocks when rollback requires a previous production deployment and none is captured', () => {
  const strictConfig = structuredClone(config);
  strictConfig.production.rollback = { requirePreviousReadyDeployment: true };
  const result = evaluateSnapshot(strictConfig, { prs: [pr(43)], main: { sha: 'main-before' }, production: {} });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'previous-production-deployment-missing');
});

test('rollback failure remains locked and reports failure', () => {
  const result = evaluateSnapshot(config, rollbackSnapshot({ status: 'failure' }));
  assert.equal(result.decision, 'ROLLBACK');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'NOTIFY'));
});

test('deployment rollback in progress keeps the release slot locked', () => {
  const snapshot = {
    prs: [pr(43, {
      labels: ['active', 'post-merge'],
      mergeSha: 'failed-merge',
      postMergeChecks: greenChecks('failed-merge', ['CI', 'Ledger']),
    }), pr(44)],
    main: { sha: 'failed-merge', checks: greenChecks('failed-merge', ['CI', 'Ledger']) },
    production: {
      ...greenProduction('failed-merge'),
      publicReadback: { sha: 'failed-merge', status: 'failure' },
      rollback: { sha: 'trusted-sha', status: 'pending', deploymentId: 'dep-previous' },
    },
  };
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY_ROLLBACK');
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('rollback evidence from a divergent SHA becomes a critical locked incident', () => {
  const snapshot = {
    prs: [pr(43, {
      labels: ['active', 'post-merge'],
      mergeSha: 'failed-merge',
      postMergeChecks: greenChecks('failed-merge', ['CI', 'Ledger']),
      queueContext: { previousMainSha: 'trusted-sha', previousDeploymentId: 'dep-previous' },
    })],
    main: { sha: 'failed-merge', checks: greenChecks('failed-merge', ['CI', 'Ledger']) },
    production: {
      ...greenProduction('failed-merge'),
      rollback: { sha: 'unexpected-sha', status: 'pending', deploymentId: 'dep-previous' },
    },
  };
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'INCIDENT_CRITICAL');
  assert.equal(result.reason, 'deployment-rollback-sha-mismatch');
});

test('verified deployment rollback becomes a locked incident', () => {
  const snapshot = {
    prs: [pr(43, {
      labels: ['active', 'post-merge'],
      mergeSha: 'failed-merge',
      postMergeChecks: greenChecks('failed-merge', ['CI', 'Ledger']),
    }), pr(44)],
    main: { sha: 'failed-merge', checks: greenChecks('failed-merge', ['CI', 'Ledger']) },
    production: {
      ...greenProduction('failed-merge'),
      publicReadback: { sha: 'failed-merge', status: 'failure' },
      rollback: { sha: 'trusted-sha', status: 'success', deploymentId: 'dep-previous' },
    },
  };
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'INCIDENT');
  assert.equal(result.reason, 'previous-deployment-restored');
  assert.ok(!result.mutations.some((mutation) => mutation.type === 'SET_LABELS' && mutation.remove.includes('active')));
});

test('failed deployment rollback becomes a critical locked incident', () => {
  const snapshot = {
    prs: [pr(43, {
      labels: ['active', 'post-merge'],
      mergeSha: 'failed-merge',
      postMergeChecks: greenChecks('failed-merge', ['CI', 'Ledger']),
    }), pr(44)],
    main: { sha: 'failed-merge', checks: greenChecks('failed-merge', ['CI', 'Ledger']) },
    production: {
      ...greenProduction('failed-merge'),
      publicReadback: { sha: 'failed-merge', status: 'failure' },
      rollback: { sha: 'trusted-sha', status: 'failure', deploymentId: 'dep-previous' },
    },
  };
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'INCIDENT_CRITICAL');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'NOTIFY' && mutation.severity === 'critical'));
});

test('green rollback PR is merged without transferring the original queue lock', () => {
  const rollback = {
    status: 'open', prNumber: 900, headSha: 'rollback-head', sync: 'up_to_date', mergeable: true,
    checks: greenChecks('rollback-head'),
  };
  const result = evaluateSnapshot(config, rollbackSnapshot(rollback));
  assert.equal(result.decision, 'ROLLBACK');
  assert.equal(result.reason, 'rollback-pr-ready');
  assert.deepEqual(result.mutations, [{
    type: 'MERGE_ROLLBACK_PR', pr: 43, rollbackPr: 900,
    expectedHeadSha: 'rollback-head', expectedBaseSha: 'restore-sha',
  }]);
});

test('code restore without database readback is incomplete for a migration', () => {
  const rollback = { status: 'merged', mergeSha: 'restore-sha', checks: greenChecks('restore-sha', ['CI', 'Ledger']) };
  const result = evaluateSnapshot(config, rollbackSnapshot(rollback, {
    files: ['supabase/migrations/20260821_change.sql'],
    reversibilityManifest: reversibleMigrationManifest(),
  }));
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.evidence.database.state, 'pending');
});

test('verified restoration becomes RECOVERED but does not release original PR lock', () => {
  const rollback = {
    status: 'merged', mergeSha: 'restore-sha', checks: greenChecks('restore-sha', ['CI', 'Ledger']),
    dbReadback: { sha: 'restore-sha', status: 'success' },
  };
  const result = evaluateSnapshot(config, rollbackSnapshot(rollback, {
    files: ['supabase/migrations/20260821_change.sql'],
    reversibilityManifest: reversibleMigrationManifest(),
  }));
  assert.equal(result.decision, 'RECOVERED');
  const labels = result.mutations.find((mutation) => mutation.type === 'SET_LABELS');
  assert.ok(!labels.remove.includes('active'));
  assert.ok(labels.add.includes('blocked'));
});

test('fixed original PR re-enters merge while later PR still waits', () => {
  const fixed = pr(43, {
    headSha: 'fixed-head', labels: ['active', 'blocked'], checks: greenChecks('fixed-head'),
    queueContext: { recovered: true, failedHeadSha: 'failed-head' },
  });
  const result = evaluateSnapshot(config, { prs: [fixed, pr(44)], main: { sha: 'restored-main' } });
  assert.equal(result.decision, 'MERGE');
  assert.equal(result.owner, 43);
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('recovered original PR remains blocked until its head changes', () => {
  const unchanged = pr(43, {
    headSha: 'failed-head', labels: ['active', 'blocked'], checks: greenChecks('failed-head'),
    queueContext: { recovered: true, failedHeadSha: 'failed-head' },
  });
  const result = evaluateSnapshot(config, { prs: [unchanged, pr(44)], main: { sha: 'restored-main' } });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'failed-pr-awaiting-new-head');
});
