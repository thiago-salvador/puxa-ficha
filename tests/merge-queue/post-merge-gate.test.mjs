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
  snapshot.production.promotion.status = 'pending';
  snapshot.production.publicReadback.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY_STAGE');
  assert.equal(result.owner, 43);
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('successful deployment from another SHA is not evidence', () => {
  const snapshot = postSnapshot();
  snapshot.production.stagedDeployment.sha = 'different-sha';
  snapshot.production.promotion.status = 'pending';
  snapshot.production.publicReadback.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY_STAGE');
});

test('failed post-merge check locks an incident before promotion', () => {
  const snapshot = postSnapshot();
  snapshot.prs[0].postMergeChecks = [
    ...greenChecks('merge-43', ['CI']),
    { name: 'Ledger', sha: 'merge-43', conclusion: 'failure' },
  ];
  snapshot.production.promotion.status = 'pending';
  snapshot.production.publicReadback.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'INCIDENT');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'NOTIFY'));
  assert.ok(!result.mutations.some((mutation) => mutation.type === 'INSTANT_ROLLBACK'));
});

for (const signal of ['stagedDeployment', 'stagedChecks', 'promotion']) {
  test(`failed ${signal} locks an incident without rolling back public production`, () => {
    const snapshot = postSnapshot();
    snapshot.production[signal].status = 'failure';
    if (signal !== 'promotion') snapshot.production.promotion.status = 'pending';
    snapshot.production.publicReadback.status = 'pending';
    const result = evaluateSnapshot(config, snapshot);
    assert.equal(result.decision, 'INCIDENT');
    assert.ok(!result.mutations.some((mutation) => mutation.type === 'INSTANT_ROLLBACK'));
  });
}

test('green stage waits for explicit promotion while keeping the queue locked', () => {
  const snapshot = postSnapshot();
  snapshot.production.promotion.status = 'pending';
  snapshot.production.publicReadback.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'AWAIT_PROMOTION');
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('promoted candidate waits for public closure', () => {
  const snapshot = postSnapshot();
  snapshot.production.publicReadback.status = 'pending';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'VERIFY_PUBLIC');
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('public closure failure starts deployment rollback to the captured target', () => {
  const snapshot = postSnapshot({
    pr: {
      queueContext: {
        previousMainSha: 'trusted-sha',
        previousDeploymentId: 'dep-previous',
        previousDeploymentSha: 'trusted-sha',
      },
    },
  });
  snapshot.production.publicReadback.status = 'failure';
  const result = evaluateSnapshot(config, snapshot);
  assert.equal(result.decision, 'ROLLBACK_DEPLOYMENT');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'INSTANT_ROLLBACK'));
  assert.ok(!result.mutations.some((mutation) => mutation.type === 'CREATE_ROLLBACK_PR'));
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('release happens only after every post-merge and production gate is green', () => {
  const result = evaluateSnapshot(config, postSnapshot());
  assert.equal(result.decision, 'RELEASE');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'SET_LABELS' && mutation.remove.includes('active')));
});
