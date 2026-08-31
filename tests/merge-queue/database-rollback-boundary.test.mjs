import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateSnapshot } from '../../scripts/merge-queue/engine.mjs';
import { config, greenChecks, greenProduction, pr, reversibleMigrationManifest } from './helpers.mjs';

const manifestUrl = new URL(
  '../../.github/merge-queue/irreversible-change-manifest.json',
  import.meta.url,
);
const releaseWorkflowUrl = new URL(
  '../../.github/workflows/staged-production-release.yml',
  import.meta.url,
);

test('canonical database contract names migration-specific forward, readback and rollback artifacts', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.databaseRollbackMode, 'migration-specific');
  for (const sectionName of ['forward', 'readback', 'rollback']) {
    const section = manifest.databaseArtifacts[sectionName];
    assert.ok(section.artifacts.length > 0, `${sectionName} artifacts are declared`);
    assert.ok(section.workflows.length > 0, `${sectionName} specialized workflows are declared`);
    assert.ok(section.checks.length > 0, `${sectionName} validation checks are declared`);
    for (const relativePath of [...section.artifacts, ...section.workflows]) {
      assert.doesNotMatch(relativePath, /(^\/|\.\.)/);
      await access(new URL(`../../${relativePath}`, import.meta.url));
    }
    for (const check of section.checks) {
      assert.ok(manifest.verification.checks.includes(check));
    }
  }
  const forward = new Set(manifest.databaseArtifacts.forward.checks);
  assert.ok(manifest.databaseArtifacts.readback.checks.every((check) => !forward.has(check)));
});

test('database recovery never creates a generic SQL rollback mutation', () => {
  const mergeSha = 'a'.repeat(40);
  const owner = pr(43, {
    labels: ['active', 'post-merge'],
    mergeSha,
    files: ['supabase/migrations/20260831_change.sql'],
    reversibilityManifest: reversibleMigrationManifest(),
    queueContext: {
      previousMainSha: 'b'.repeat(40),
      previousDeploymentId: 'dpl_previous',
      previousDeploymentSha: 'b'.repeat(40),
    },
    postMergeChecks: greenChecks(mergeSha, ['CI', 'Ledger']),
  });
  const production = greenProduction(mergeSha);
  production.publicReadback.status = 'failure';
  const result = evaluateSnapshot(config, {
    prs: [owner],
    main: { sha: mergeSha, checks: greenChecks(mergeSha, ['CI', 'Ledger']) },
    production,
  });
  assert.equal(result.decision, 'ROLLBACK_DEPLOYMENT');
  assert.ok(result.mutations.some((mutation) => mutation.type === 'INSTANT_ROLLBACK'));
  assert.ok(result.mutations.every((mutation) => !/DATABASE|SQL|MIGRATION/.test(mutation.type)));
});

test('staged and public smoke workflow has no database write capability', async () => {
  const workflow = await readFile(releaseWorkflowUrl, 'utf8');
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE|SUPABASE_DB_URL|PF_DATABASE_URL/);
  assert.doesNotMatch(workflow, /psql|supabase db|migration up|migration repair/);
});
