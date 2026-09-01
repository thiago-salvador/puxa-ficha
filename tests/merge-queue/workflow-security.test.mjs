import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/serial-merge-queue.yml', import.meta.url);
const stagedWorkflowUrl = new URL('../../.github/workflows/staged-production-release.yml', import.meta.url);
const configUrl = new URL('../../.github/serial-merge-queue.json', import.meta.url);
const coordinatorUrl = new URL('../../scripts/merge-queue/coordinator.mjs', import.meta.url);
const manifestUrl = new URL('../../.github/merge-queue/irreversible-change-manifest.json', import.meta.url);

test('coordinator workflow serializes events and checks out only trusted main', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /concurrency:\s*[\s\S]*group: serial-merge-queue[\s\S]*cancel-in-progress: false/);
  assert.match(workflow, /uses: actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /ref: refs\/heads\/main/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /run:[^\n]*\$\{\{\s*github\.event\./);
});

test('workflow has read-only default permissions and explicit scoped secret mapping', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const permissions = workflow.match(/permissions:\s*\n([\s\S]*?)\n\njobs:/)?.[1] ?? '';
  for (const permission of ['actions', 'checks', 'contents', 'deployments', 'issues', 'pull-requests', 'security-events', 'statuses']) {
    assert.match(permissions, new RegExp(`^\\s*${permission}: read$`, 'm'));
  }
  assert.doesNotMatch(permissions, /:\s*write\s*$/m);
  assert.match(workflow, /MERGE_QUEUE_GH_TOKEN: \$\{\{ secrets\.MERGE_QUEUE_GH_TOKEN \}\}/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /^\s*GH_TOKEN: \$\{\{ secrets\.MERGE_QUEUE_GH_TOKEN \}\}\s*$/m);
  assert.match(workflow, /VERCEL_AUTOMATION_BYPASS_SECRET: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.ok(config.secrets.required.includes('VERCEL_AUTOMATION_BYPASS_SECRET'));
  assert.match(workflow, /persist-credentials: false/);
});

test('manual Vercel credential probe is read-only and cannot reconcile the queue', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*mode:/);
  assert.match(
    workflow,
    /reconcile:\s*[\s\S]*?if: vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true' && inputs\.mode != 'vercel-credentials'/,
  );

  const probe = workflow.slice(workflow.indexOf('  vercel-credentials:'));
  assert.match(probe, /if: github\.event_name == 'workflow_dispatch' && inputs\.mode == 'vercel-credentials'/);
  assert.match(probe, /https:\/\/api\.vercel\.com\/v6\/deployments\?/);
  assert.match(probe, /test "\$http_code" = "200"/);
  assert.doesNotMatch(probe, /-X POST|--request POST|\/promote\/|\/rollback|DELETE/);
});

test('runtime smoke privado fica no watchdog e não amplia privilégios do release', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const route = await readFile(
    new URL('../../src/app/api/internal/runtime-smoke/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.equal(config.production.smokes, undefined);
  assert.ok(!config.secrets.required.includes('CRON_SECRET'));
  assert.doesNotMatch(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\}\}/);
  assert.doesNotMatch(workflow, /PF_RUNTIME_SMOKE_SECRET/);
});

test('ledger configura o manifesto canonico e releases reais', async () => {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const releases = manifest.scope.releases;
  assert.equal(config.ledger.manifestPath, '.github/merge-queue/irreversible-change-manifest.json');
  assert.equal(config.ledger.manifestFormat, 'json-releases-or-json-or-lines');
  assert.ok(releases.length > 0);
  for (const release of releases) {
    assert.match(release.predecessor, /^\d{14}$/);
    assert.ok(release.versions.length > 0);
    for (const version of release.versions) assert.match(version, /^\d{14}$/);
  }
});

test('automation requires both repository and GitHub activation locks', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const coordinator = await readFile(coordinatorUrl, 'utf8');
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  assert.equal(Object.hasOwn(config, 'enabled'), true);
  assert.equal(typeof config.enabled, 'boolean');
  assert.match(workflow, /vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true'/);
  assert.match(coordinator, /if \(!normalized\.enabled\)/);
  assert.equal(config.queue.requireUpToDate, true);
  assert.equal(config.releaseGate.failClosedOnMissingHold, true);
  assert.equal(config.releaseGate.required, false);
  assert.equal(
    config.production.stagedDeployment.hold.githubStatusContext,
    'Vercel - puxa-ficha: staged-release',
  );
  assert.equal(config.production.stagedDeployment.hold.provider, 'vercel-auto-assignment-disabled');
  assert.equal(config.production.promotion.mode, 'explicit-vercel-promote');
  assert.equal(config.irreversibleChanges.executePullRequestSql, false);
  assert.equal(config.secrets.missingPolicy, 'block');
});

test('queue contract matches current blocking checks and delegates public smoke to staged release', async () => {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  for (const phase of ['preMerge', 'postMerge', 'rollback']) {
    assert.ok(config.checks[phase].required.includes('Cobertura (bloqueante)'));
    assert.ok(!config.checks[phase].required.includes('Cobertura (informativa)'));
  }
  assert.ok(!config.checks.postMerge.required.includes('Acessibilidade (produção)'));
  assert.ok(!config.checks.rollback.required.includes('Acessibilidade (produção)'));
  for (const phase of ['postMerge', 'rollback']) {
    assert.ok(!config.checks[phase].required.includes('CodeQL'));
    assert.ok(config.checks[phase].required.includes('CodeQL analysis (javascript-typescript)'));
    assert.ok(config.checks[phase].required.includes('CodeQL analysis (python)'));
  }
  assert.deepEqual(config.production.stagedChecks.checks, ['Vercel - puxa-ficha: staged-release']);
});

test('post-merge dispatch validates trusted SHA before production commands', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /repository_dispatch:[\s\S]*serial-merge-queue-post-merge/);
  assert.match(workflow, /main_sha=.*commits\/main/);
  assert.match(workflow, /test "\$main_sha" = "\$EXPECTED_SHA"/);
  assert.match(workflow, /merge_commit_sha == \$sha/);
  assert.match(workflow, /Prove public production is still the captured predecessor/);
  assert.match(workflow, /name: Production rollback recovery/);
  assert.match(workflow, /Prove and smoke restored predecessor/);
});

test('merged repository code never runs with privileged queue or Vercel tokens', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  for (const name of [
    'Run complete staged smoke suite',
    'Wait for public exact-SHA promotion',
    'Run complete public smoke suite',
    'Prove and smoke restored predecessor',
  ]) {
    const start = workflow.indexOf(`      - name: ${name}`);
    const next = workflow.indexOf('\n      - name:', start + 1);
    const step = workflow.slice(start, next < 0 ? undefined : next);
    assert.ok(start >= 0, `${name} step is present`);
    assert.doesNotMatch(step, /MERGE_QUEUE_GH_TOKEN|VERCEL_TOKEN|CRON_SECRET|SUPABASE_SERVICE_ROLE/);
  }
  assert.match(workflow, /ref: \$\{\{ env\.EXPECTED_SHA \}\}/);
  assert.match(workflow, /persist-credentials: false/);
});

test('privileged automation sources are protected by the irreversible-change gate', async () => {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('.github/workflows/**'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('.github/serial-merge-queue.json'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('scripts/merge-queue/**'));
  assert.equal(config.irreversibleChanges.requireNamedRemoteWriteApproval, true);
  assert.deepEqual(config.queue.trustedContextActors, ['thiago-salvador']);
  assert.deepEqual(config.queue.mergeCoAuthor, {
    name: 'Thiago Salvador',
    email: 'contato.thiagosalvador@gmail.com',
  });
});

test('rollback verifies the immutable deployment tuple before the remote write', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  const recovery = workflow.slice(workflow.indexOf('  rollback_recovery:'));
  const identityGate = recovery.indexOf('.id == $id and');
  const rollbackCall = recovery.indexOf('/deployments/${PREVIOUS_DEPLOYMENT_ID}/rollback');
  assert.ok(identityGate >= 0);
  assert.ok(rollbackCall > identityGate);
  assert.match(recovery, /\.meta\.githubCommitSha == \$sha/);
  assert.match(recovery, /\.target == "production"/);
  assert.match(recovery, /\.readyState == "READY"/);
});
