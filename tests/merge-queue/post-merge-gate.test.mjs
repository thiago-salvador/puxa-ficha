import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config, greenChecks, greenProduction, pr } from './helpers.mjs';

function postSnapshot(overrides = {}) {
  const mergeSha = overrides.mergeSha ?? 'merge-43';
  const owner = pr(43, {
    labels: ['active', 'post-merge'], mergeSha,
    postMergeChecks: greenChecks(mergeSha, ['CI', 'Ledger']),
    ...overrides.pr,
  });
  return {
    prs: [owner, pr(44)],
    main: { sha: mergeSha, checks: greenChecks(mergeSha, ['CI', 'Ledger']) },
    production: greenProduction(mergeSha),
    ...overrides.snapshot,
  };
}

test('lock stays held while deployment is pending', () => {
  const snapshot = postSnapshot();
  snapshot.production.stagedDeployment.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY');
  assert.equal(result.owner, 43);
});

test('successful deployment from another SHA is not evidence', () => {
  const snapshot = postSnapshot();
  snapshot.production.stagedDeployment.sha = 'different-sha';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY');
});

test('failed post-merge check starts rollback', () => {
  const snapshot = postSnapshot();
  snapshot.prs[0].postMergeChecks = [
    ...greenChecks('merge-43', ['CI']),
    { name: 'Ledger', sha: 'merge-43', conclusion: 'failure' },
  ];
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'ROLLBACK');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'CREATE_ROLLBACK_PR'));
});

for (const signal of ['stagedDeployment', 'smokes', 'promotion', 'publicReadback']) {
  test(`failed ${signal} starts rollback`, () => {
    const snapshot = postSnapshot();
    snapshot.production[signal].status = 'failure';
    assert.equal(evaluateSnapshot(config, snapshot).decision, 'ROLLBACK');
  });
}

test('release happens only after every post-merge and production gate is green', () => {
  const result = evaluateSnapshot(config, postSnapshot());
  assert.equal(result.decision, 'RELEASE');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'SET_LABELS' && mutation.remove.includes('active')));
});
