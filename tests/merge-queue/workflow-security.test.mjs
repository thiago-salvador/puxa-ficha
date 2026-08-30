import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/serial-merge-queue.yml', import.meta.url);
const configUrl = new URL('../../.github/serial-merge-queue.json', import.meta.url);
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
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.MERGE_QUEUE_GH_TOKEN \}\}/);
  assert.match(workflow, /persist-credentials: false/);
});

test('runtime smoke usa o CRON_SECRET canonico da rota, config e workflow', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const route = await readFile(
    new URL('../../src/app/api/internal/runtime-smoke/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.equal(config.production.smokes.private.secret, 'CRON_SECRET');
  assert.ok(config.secrets.required.includes('CRON_SECRET'));
  assert.match(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\}\}/);
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

test('new automation ships disabled and fail-closed', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  assert.equal(config.enabled, false);
  assert.match(workflow, /vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true'/);
  assert.equal(config.queue.requireUpToDate, true);
  assert.equal(config.releaseGate.failClosedOnMissingHold, true);
  assert.equal(config.irreversibleChanges.executePullRequestSql, false);
  assert.equal(config.secrets.missingPolicy, 'block');
});

test('post-merge dispatch validates trusted SHA before production commands', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /repository_dispatch:[\s\S]*serial-merge-queue-post-merge/);
  assert.match(workflow, /main_sha=.*commits\/main/);
  assert.match(workflow, /test "\$main_sha" = "\$EXPECTED_SHA"/);
  assert.match(workflow, /merge_commit_sha == \$sha/);
  assert.match(workflow, /Production already serves the candidate SHA; the Vercel hold is missing/);
  assert.match(workflow, /serial-merge-queue-recovery/);
  assert.match(workflow, /name: Restore verified production deployment/);
  assert.match(workflow, /name: Run recovery smokes/);
  assert.match(workflow, /name: Publish recovery smoke results/);
});

test('merged repository code never runs with privileged queue or Vercel tokens', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const postMergeJob = workflow.slice(workflow.indexOf('  post-merge-production:'));
  const jobHeader = postMergeJob.slice(0, postMergeJob.indexOf('    steps:'));
  assert.doesNotMatch(jobHeader, /secrets\./);

  for (const name of [
    'Launch smoke in production',
    'Search smoke in production',
    'Accessibility smoke in production',
  ]) {
    const start = postMergeJob.indexOf(`      - name: ${name}`);
    const next = postMergeJob.indexOf('\n      - name:', start + 1);
    const step = postMergeJob.slice(start, next < 0 ? undefined : next);
    assert.ok(start >= 0, `${name} step is present`);
    assert.doesNotMatch(step, /MERGE_QUEUE_GH_TOKEN|VERCEL_TOKEN|PF_RUNTIME_SMOKE_SECRET/);
  }

  const smokeJob = workflow.slice(
    workflow.indexOf('  production-smokes:'),
    workflow.indexOf('  publish-production-smoke-results:'),
  );
  const publisherJob = workflow.slice(
    workflow.indexOf('  publish-production-smoke-results:'),
    workflow.indexOf('  recovery-production:'),
  );
  assert.doesNotMatch(smokeJob, /secrets\./);
  assert.match(smokeJob, /ref: \$\{\{ env\.TRUSTED_SHA \}\}/);
  assert.doesNotMatch(publisherJob, /actions\/checkout|npm ci|npm run|npx /);
});

test('privileged automation sources are protected by the irreversible-change gate', async () => {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('.github/workflows/**'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('.github/serial-merge-queue.json'));
  assert.ok(config.irreversibleChanges.pathPatterns.includes('scripts/merge-queue/**'));
  assert.equal(config.irreversibleChanges.requireNamedRemoteWriteApproval, true);
  assert.deepEqual(config.queue.trustedContextActors, ['thiago-salvador']);
});

test('recovery jq gate compiles and ignores internal skipped siblings', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const recovery = workflow.slice(workflow.indexOf('  recovery-production:'));
  const match = recovery.match(/if jq -e '([\s\S]*?)' <<<"\$runs"/);
  assert.ok(match, 'recovery jq program is extractable');
  const input = {
    check_runs: [
      { name: 'verify', status: 'completed', conclusion: 'success' },
      { name: 'Rotas e acessibilidade (build local)', status: 'completed', conclusion: 'success' },
      { name: 'Run recovery smokes', status: 'completed', conclusion: 'skipped' },
      { name: 'Publish recovery smoke results', status: 'completed', conclusion: 'skipped' },
    ],
  };
  assert.doesNotThrow(() => execFileSync('jq', ['-e', match[1]], { input: JSON.stringify(input) }));
});
