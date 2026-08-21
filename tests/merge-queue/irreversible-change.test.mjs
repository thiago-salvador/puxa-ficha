import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSnapshot, validateReversibility } from '../../scripts/merge-queue/engine.mjs';
import { config, pr, reversibleMigrationManifest } from './helpers.mjs';

test('sensitive path without a validated reversible manifest is blocked', () => {
  const owner = pr(43, { files: ['supabase/migrations/20260821_change.sql'] });
  assert.equal(evaluateSnapshot(config, { prs: [owner], main: { sha: 'main' } }).decision, 'BLOCK');
});

test('manifest is declarative and rejects embedded SQL execution payloads', () => {
  const manifest = reversibleMigrationManifest();
  assert.equal(validateReversibility(pr(43, { files: ['supabase/migrations/x.sql'], reversibilityManifest: manifest }), config).valid, true);
  manifest.rollback.statement = 'select dangerous_input()';
  assert.equal(validateReversibility(pr(43, { files: ['supabase/migrations/x.sql'], reversibilityManifest: manifest }), config).valid, false);
});

test('self-asserted manifest cannot bypass named remote-write approval', () => {
  const lockedConfig = structuredClone(config);
  lockedConfig.irreversibleChanges.requireNamedRemoteWriteApproval = true;
  const fakeManifest = {
    version: 1,
    reversible: true,
    rollback: { kind: 'compensating-migration', reference: 'does-not-exist' },
    verification: { checks: ['trust me'] },
  };
  const owner = pr(43, {
    files: ['supabase/migrations/x.sql'],
    reversibilityManifest: fakeManifest,
  });
  const result = evaluateSnapshot(lockedConfig, { prs: [owner], main: { sha: 'main' } });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'named-remote-write-approval-required');
});

test('conditional migration checks become mandatory for sensitive changes', () => {
  const conditionalConfig = structuredClone(config);
  conditionalConfig.checks.preMerge.conditionalRequired = ['migration-replay'];
  const owner = pr(43, { files: ['supabase/migrations/x.sql'], reversibilityManifest: reversibleMigrationManifest() });
  assert.equal(evaluateSnapshot(conditionalConfig, { prs: [owner], main: { sha: 'main' } }).reason, 'check-missing');
});
