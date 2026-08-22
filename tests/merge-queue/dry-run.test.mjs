import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcile } from '../../scripts/merge-queue/coordinator.mjs';
import { config, pr } from './helpers.mjs';

test('dry-run performs zero adapter writes and returns structured plan', async () => {
  let writes = 0;
  const forbidden = async () => { writes += 1; throw new Error('write called in dry-run'); };
  const adapters = { github: { setLabels: forbidden, comment: forbidden, merge: forbidden, persistContext: forbidden, createRollbackPr: forbidden } };
  const result = await reconcile({
    config,
    snapshot: { prs: [pr(43)], main: { sha: 'main-a' } },
    dryRun: true,
    adapters,
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'MERGE');
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.writes, []);
  assert.equal(writes, 0);
});

test('disabled config is inert before adapters, tokens, or network exist', async () => {
  const result = await reconcile({ config: { ...config, enabled: false }, dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'DISABLED');
  assert.deepEqual(result.writes, []);
});
