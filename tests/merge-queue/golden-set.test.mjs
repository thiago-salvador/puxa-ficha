import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config as baseConfig, greenChecks, greenProduction, pr, reversibleMigrationManifest } from './helpers.mjs';

function fixture(scenario) {
  const number = scenario.pr ?? scenario.headPr ?? 43;
  const head = scenario.head ?? `head-${number}`;
  const merge = scenario.merge ?? 'merge-sha';
  const base = structuredClone(baseConfig);

  if (scenario.kind === 'later') {
    const first = pr(scenario.headPr, { createdAt: '2026-08-20T10:00:00Z' });
    const later = pr(scenario.candidate, { createdAt: '2026-08-20T11:00:00Z' });
    const result = evaluateSnapshot(base, { prs: [later, first], main: { sha: 'main' } });
    return result.queue.find((item) => item.number === scenario.candidate).disposition;
  }
  if (scenario.kind === 'release') {
    const owner = pr(number, { headSha: head, labels: ['active', 'post-merge'], mergeSha: merge, postMergeChecks: greenChecks(merge, ['CI', 'Ledger']) });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: merge }, production: greenProduction(merge) }).decision;
  }
  if (scenario.kind === 'pre') {
    return evaluateSnapshot(base, { prs: [pr(number, { headSha: head, sync: scenario.sync })], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'pre-failure') {
    const checks = [
      { name: 'verify', sha: head, conclusion: scenario.conclusion },
      { name: 'build', sha: head, conclusion: scenario.secondFailure ? 'failure' : 'success' },
    ];
    return evaluateSnapshot(base, { prs: [pr(number, { headSha: head, checks })], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'post-failure') {
    const required = ['CI', 'Ledger', scenario.check].filter((name, index, all) => all.indexOf(name) === index);
    base.checks.postMerge.required = required;
    const checks = required.map((name) => ({ name, sha: merge, conclusion: name === scenario.check ? 'failure' : 'success' }));
    const owner = pr(number, { labels: ['active', 'post-merge'], mergeSha: merge, postMergeChecks: checks });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: merge }, production: greenProduction(merge) }).decision;
  }
  if (scenario.kind === 'post-pending') {
    const checks = greenChecks(merge, ['CI', 'Ledger']);
    if (scenario.pending === 'Ledger') checks.find((check) => check.name === 'Ledger').conclusion = null;
    if (scenario.pending === 'Ledger') checks.find((check) => check.name === 'Ledger').status = 'in_progress';
    const prod = greenProduction(merge);
    if (scenario.pending === 'deployment') prod.stagedDeployment.status = 'pending';
    const owner = pr(number, { labels: ['active', 'post-merge'], mergeSha: merge, postMergeChecks: checks });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: merge }, production: prod }).decision;
  }
  if (scenario.kind === 'deploy-failure' || scenario.kind === 'wrong-deploy-sha') {
    const prod = greenProduction(merge);
    if (scenario.kind === 'deploy-failure') prod.stagedDeployment.status = 'failure';
    else prod.stagedDeployment.sha = scenario.deploy;
    const owner = pr(number, { labels: ['active', 'post-merge'], mergeSha: merge, postMergeChecks: greenChecks(merge, ['CI', 'Ledger']) });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: merge }, production: prod }).decision;
  }
  if (['stage-failure', 'await-promotion', 'public-failure', 'deployment-rollback-failure'].includes(scenario.kind)) {
    const prod = greenProduction(merge);
    if (scenario.kind === 'stage-failure') prod.stagedChecks.status = 'failure';
    if (scenario.kind === 'await-promotion') {
      prod.promotion.status = 'pending';
      prod.publicReadback.status = 'pending';
    }
    if (scenario.kind === 'public-failure') prod.publicReadback.status = 'failure';
    if (scenario.kind === 'deployment-rollback-failure') {
      prod.publicReadback.status = 'failure';
      prod.rollback = { sha: 'trusted-sha', status: 'failure', deploymentId: 'dep-previous' };
    }
    const owner = pr(number, {
      labels: ['active', 'post-merge'],
      mergeSha: merge,
      queueContext: { previousMainSha: 'trusted-sha', previousDeploymentId: 'dep-previous' },
      postMergeChecks: greenChecks(merge, ['CI', 'Ledger']),
    });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: merge }, production: prod }).decision;
  }
  if (scenario.kind === 'rollback-progress') {
    const owner = pr(number, { labels: ['active', 'rollback'], mergeSha: scenario.failedMerge, rollback: { status: 'in_progress' } });
    return evaluateSnapshot(base, { prs: [owner, pr(44)], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'recovered-unchanged' || scenario.kind === 'recovered-fixed') {
    const failedHead = scenario.failedHead ?? head;
    const owner = pr(number, { headSha: head, labels: ['active', 'blocked'], checks: greenChecks(head), queueContext: { recovered: true, failedHeadSha: failedHead } });
    return evaluateSnapshot(base, { prs: [owner, pr(44)], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'blocked-head-later-green') {
    const owner = pr(scenario.headPr, { labels: ['active', 'blocked'], checks: [{ name: 'verify', sha: `head-${scenario.headPr}`, conclusion: 'failure' }] });
    return evaluateSnapshot(base, { prs: [owner, pr(scenario.candidate)], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'stale' || scenario.kind === 'current-green-old-failed') {
    const checks = scenario.kind === 'stale'
      ? greenChecks(scenario.old)
      : [...greenChecks(head), ...greenChecks(scenario.old).map((check) => ({ ...check, conclusion: 'failure' }))];
    return evaluateSnapshot(base, { prs: [pr(number, { headSha: head, checks })], main: { sha: 'main' } }).decision;
  }
  if (scenario.kind === 'migration-recovery-missing-db') {
    const rollback = { status: 'merged', mergeSha: scenario.merge, checks: greenChecks(scenario.merge, ['CI', 'Ledger']) };
    const owner = pr(number, { labels: ['active', 'rollback'], rollback, files: ['supabase/migrations/x.sql'], reversibilityManifest: reversibleMigrationManifest() });
    return evaluateSnapshot(base, { prs: [owner], main: { sha: scenario.merge }, production: greenProduction(scenario.merge) }).decision;
  }
  throw new Error(`Unknown golden scenario kind: ${scenario.kind}`);
}

test('reference solution passes every source-derived golden case', async (t) => {
  const content = await readFile(new URL('../fixtures/serial-merge-queue-cases.jsonl', import.meta.url), 'utf8');
  const cases = content.trim().split('\n').map(JSON.parse);
  assert.ok(cases.length >= 20 && cases.length <= 50);
  for (const item of cases) {
    await t.test(item.id, () => assert.equal(fixture(item.scenario), item.expected, item.origin));
  }
});
