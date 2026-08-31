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

test('migration manifest requires migration-specific forward, readback and rollback evidence', () => {
  const manifest = reversibleMigrationManifest();
  assert.equal(manifest.databaseRollbackMode, 'migration-specific');
  for (const section of ['forward', 'readback', 'rollback']) {
    const broken = structuredClone(manifest);
    delete broken.databaseArtifacts[section];
    const result = validateReversibility(
      pr(43, { files: ['supabase/migrations/x.sql'], reversibilityManifest: broken }),
      config,
    );
    assert.equal(result.valid, false, `${section} is mandatory`);
  }
});

test('database artifacts are invalid when their specialized validation checks are absent', () => {
  const manifest = reversibleMigrationManifest();
  manifest.databaseArtifacts.readback.checks = [];
  const result = validateReversibility(
    pr(43, { files: ['supabase/migrations/x.sql'], reversibilityManifest: manifest }),
    config,
  );
  assert.equal(result.valid, false);
});

test('sensitive automation is not misclassified as a database migration', () => {
  const sensitiveConfig = structuredClone(config);
  sensitiveConfig.irreversibleChanges.pathPatterns.push('.github/workflows/**');
  sensitiveConfig.irreversibleChanges.migrationPathPatterns = ['supabase/migrations/**'];
  const manifest = {
    version: 1,
    reversible: true,
    rollback: { kind: 'revert-pr', artifact: '.github/workflows/example.yml' },
    verification: { checks: ['workflow-review'] },
  };
  const result = validateReversibility(
    pr(43, { files: ['.github/workflows/example.yml'], reversibilityManifest: manifest }),
    sensitiveConfig,
  );
  assert.equal(result.migration, false);
  assert.equal(result.valid, true);
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
