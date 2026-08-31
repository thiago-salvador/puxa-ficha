import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config, greenChecks, pr, reversibleMigrationManifest } from './helpers.mjs';

function decide(overrides) {
  return evaluateSnapshot(config, { prs: [pr(43, overrides), pr(44)], main: { sha: 'main-a' } });
}

test('behind branch keeps FIFO owner and requests an exact-head update', () => {
  const result = decide({ sync: 'BEHIND' });
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.owner, 43);
  assert.equal(result.reason, 'branch-update-required');
  assert.deepEqual(result.mutations.at(-1), {
    type: 'UPDATE_BRANCH', pr: 43, expectedHeadSha: 'head-43',
  });
});

test('missing expected check blocks', () => {
  const result = decide({ checks: greenChecks('head-43', ['verify']) });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'check-missing');
});

for (const conclusion of ['failure', 'cancelled', 'neutral', 'skipped']) {
  test(`${conclusion} is never green`, () => {
    const result = decide({ checks: [
      ...greenChecks('head-43', ['verify']),
      { name: 'build', sha: 'head-43', status: 'completed', conclusion },
    ] });
    assert.equal(result.decision, 'BLOCK');
  });
}

test('a skipped non-required job does not deadlock otherwise green checks', () => {
  const result = decide({ checks: [
    ...greenChecks('head-43'),
    { name: 'not-applicable', sha: 'head-43', status: 'completed', conclusion: 'skipped' },
  ] });
  assert.equal(result.decision, 'MERGE');
});

test('pending check waits without advancing another PR', () => {
  const result = decide({ checks: [
    ...greenChecks('head-43', ['verify']),
    { name: 'build', sha: 'head-43', status: 'in_progress', conclusion: null },
  ] });
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.queue.find((item) => item.number === 44).disposition, 'WAIT');
});

test('an active PR converted back to draft blocks the slot', () => {
  const result = decide({ draft: true, labels: ['active', 'pre-merge'] });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'active-pr-is-draft');
});

test('green evidence from an old SHA waits', () => {
  const result = decide({ headSha: 'new-head', checks: greenChecks('old-head') });
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.reason, 'check-sha-stale');
});

test('new current SHA can recover from an old failed SHA', () => {
  const result = decide({
    headSha: 'new-head',
    labels: ['active', 'blocked'],
    checks: [
      ...greenChecks('new-head'),
      { name: 'verify', sha: 'old-head', conclusion: 'failure' },
      { name: 'build', sha: 'old-head', conclusion: 'failure' },
    ],
  });
  assert.equal(result.decision, 'MERGE');
});

test('migration without validated reversible manifest blocks', () => {
  const result = decide({ files: ['supabase/migrations/20260821_change.sql'] });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'reversible-manifest-invalid');
});

test('migration with declarative reversible manifest may merge', () => {
  const result = decide({
    files: ['supabase/migrations/20260821_change.sql'],
    reversibilityManifest: reversibleMigrationManifest(),
  });
  assert.equal(result.decision, 'MERGE');
});

test('manifest containing SQL payload is rejected and never executed', () => {
  const manifest = reversibleMigrationManifest();
  manifest.rollback.sql = 'drop table forbidden';
  const result = decide({ files: ['supabase/migrations/20260821_change.sql'], reversibilityManifest: manifest });
  assert.equal(result.decision, 'BLOCK');
});
