export const config = {
  version: 1,
  enabled: true,
  labels: {
    active: 'active', preMerge: 'pre-merge', postMerge: 'post-merge',
    rollback: 'rollback', blocked: 'blocked', rollbackPr: 'rollback-pr',
  },
  queue: { requireUpToDate: true },
  checks: {
    preMerge: { required: ['verify', 'build'], includeAllPresent: true },
    postMerge: { required: ['CI', 'Ledger'], includeAllPresent: true },
    rollback: { required: ['CI', 'Ledger'], includeAllPresent: true },
  },
  production: {
    stagedDeployment: { required: true },
    stagedChecks: { required: true },
    smokes: { required: true },
    promotion: { required: true },
    publicReadback: { required: true },
    rollback: { required: true },
  },
  irreversibleChanges: {
    pathPatterns: ['supabase/migrations/**'],
    migrationPathPatterns: ['supabase/migrations/**'],
    databaseRollbackMode: 'migration-specific',
    requireValidatedManifest: true,
  },
};

export function greenChecks(sha, names = ['verify', 'build']) {
  return names.map((name) => ({ name, sha, status: 'completed', conclusion: 'success' }));
}

export function pr(number, overrides = {}) {
  const headSha = overrides.headSha ?? `head-${number}`;
  return {
    number,
    createdAt: overrides.createdAt ?? `2026-08-${String(number).padStart(2, '0')}T10:00:00Z`,
    state: 'open',
    headSha,
    sync: 'up_to_date',
    mergeable: true,
    labels: [],
    checks: greenChecks(headSha),
    files: ['app/page.tsx'],
    ...overrides,
  };
}

export function greenProduction(sha) {
  return {
    previousDeployment: { id: 'dep-previous', sha: 'trusted-sha', status: 'success' },
    stagedDeployment: { id: 'dep-candidate', sha, status: 'success' },
    stagedChecks: { sha, status: 'success' },
    smokes: { sha, status: 'success' },
    promotion: { sha, status: 'success' },
    publicReadback: { sha, status: 'success' },
  };
}

export function reversibleMigrationManifest() {
  const checks = ['migration-forward', 'migration-readback', 'migration-rollback'];
  return {
    version: 1,
    reversible: true,
    databaseRollbackMode: 'migration-specific',
    databaseArtifacts: {
      forward: {
        artifact: 'supabase/migrations/change.sql',
        workflow: '.github/workflows/apply-change-production.yml',
        checks: ['migration-forward'],
      },
      readback: {
        artifact: 'supabase/readback/change.readback.sql',
        workflow: '.github/workflows/apply-change-production.yml',
        checks: ['migration-readback'],
      },
      rollback: {
        artifact: 'supabase/rollback/change.rollback.sql',
        workflow: '.github/workflows/rollback-change-production.yml',
        checks: ['migration-rollback'],
      },
    },
    rollback: { kind: 'compensating-migration', artifact: 'supabase/rollbacks/restore.sql' },
    verification: { checks },
  };
}
