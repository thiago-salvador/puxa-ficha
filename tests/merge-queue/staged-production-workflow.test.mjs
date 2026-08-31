import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stagedWorkflowUrl = new URL(
  '../../.github/workflows/staged-production-release.yml',
  import.meta.url,
);
const queueWorkflowUrl = new URL(
  '../../.github/workflows/serial-merge-queue.yml',
  import.meta.url,
);
const coordinatorUrl = new URL('../../scripts/merge-queue/coordinator.mjs', import.meta.url);

const DEPLOYMENT_CHECK = 'Vercel - puxa-ficha: staged-release';

test('staged release owns the post-merge dispatch and serializes releases', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /repository_dispatch:\s*[\s\S]*serial-merge-queue-post-merge/);
  assert.match(workflow, /vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true'/);
  assert.match(workflow, /github\.actor == 'thiago-salvador'/);
  assert.match(workflow, /concurrency:\s*[\s\S]*cancel-in-progress: false/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});

test('stage check is unique and published on the exact candidate SHA', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, new RegExp(`name: ["']?${DEPLOYMENT_CHECK}`));
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*statuses: write/);
  assert.doesNotMatch(workflow, /vercel\/repository-dispatch\/actions\/status/);
  assert.match(workflow, /statuses\/\$\{EXPECTED_SHA\}/);
  assert.match(workflow, new RegExp(`context="${DEPLOYMENT_CHECK}"`));
  assert.match(workflow, /uses: actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /ref: \$\{\{ env\.EXPECTED_SHA \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: "24"/);
});

test('dispatch and rollback identity are validated before candidate code runs', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  for (const field of [
    'mergeSha',
    'trustedSha',
    'previousDeploymentId',
    'previousDeploymentSha',
    'previousDeploymentUrl',
    'git.sha',
  ]) {
    assert.ok(workflow.includes(field), `${field} is part of the trusted dispatch contract`);
  }
  assert.match(workflow, /test "\$DISPATCH_GIT_SHA" = "\$EXPECTED_SHA"/);
  assert.match(workflow, /main_sha=.*commits\/main/);
  assert.match(workflow, /test "\$main_sha" = "\$EXPECTED_SHA"/);
  assert.match(workflow, /merge_commit_sha == \$sha/);
  assert.ok(
    workflow.indexOf('Validate dispatch and required credentials') <
      workflow.indexOf('Checkout exact candidate SHA'),
  );
});

test('stage proves the exact production-target deployment before Vercel promotion', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /target=production/);
  assert.match(workflow, /meta-githubCommitSha/);
  assert.match(workflow, /\.readyState == "READY"/);
  assert.ok(workflow.includes('staged_url" =~ ^https://[A-Za-z0-9.-]+\\.vercel\\.app$'));
  assert.match(workflow, /test "\$staged_url" != "https:\/\/puxaficha\.com\.br"/);
  assert.match(workflow, /PF_BASE_URL: \$\{\{ steps\.deployment\.outputs\.url \}\}/);
  assert.match(workflow, /PF_EXPECTED_DEPLOY_SHA: \$\{\{ env\.EXPECTED_SHA \}\}/);
  assert.match(workflow, /npm run release:smoke/);
  assert.match(workflow, /printf 'id=%s\\n'.*GITHUB_OUTPUT/);
});

test('an isolated privileged job explicitly promotes only the tested deployment id', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /promote_candidate:\s*[\s\S]*name: Promote exact staged deployment/);
  assert.match(workflow, /needs: staged_release/);
  assert.match(workflow, /CANDIDATE_DEPLOYMENT_ID: \$\{\{ needs\.staged_release\.outputs\.deployment_id \}\}/);
  assert.match(workflow, /\.id == \$id[\s\S]*\.projectId == \$project[\s\S]*\.meta\.githubCommitSha == \$sha[\s\S]*\.readyState == "READY"/);
  assert.match(workflow, /projects\/\$\{VERCEL_PROJECT_ID\}\/promote\/\$\{CANDIDATE_DEPLOYMENT_ID\}/);
  const promotion = workflow.slice(
    workflow.indexOf('  promote_candidate:'),
    workflow.indexOf('  public_closure:'),
  );
  assert.doesNotMatch(promotion, /actions\/checkout|npm ci|release:smoke/);
});

test('public closure repeats exact-SHA proof and smoke only after explicit promotion', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /public_closure:\s*[\s\S]*name: Production release closure/);
  assert.match(workflow, /public_closure:\s*[\s\S]*needs: promote_candidate/);
  assert.match(workflow, /PF_BASE_URL: https:\/\/puxaficha\.com\.br/);
  assert.match(workflow, /PF_EXPECTED_DEPLOY_SHA: \$\{\{ env\.EXPECTED_SHA \}\}/);
  assert.match(workflow, /Wait for public exact-SHA promotion[\s\S]*release:prove-deployment/);
  assert.match(workflow, /Run complete public smoke suite[\s\S]*release:smoke/);
});

test('public failure restores the captured deployment and leaves a deduplicated incident', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(workflow, /rollback_recovery:\s*[\s\S]*name: Production rollback recovery/);
  assert.match(
    workflow,
    /needs\.staged_release\.result == 'success'[\s\S]*needs\.promote_candidate\.result != 'success'[\s\S]*needs\.public_closure\.result != 'success'/,
  );
  assert.match(workflow, /CURRENT_PUBLIC_SHA/);
  assert.match(workflow, /test "\$current_public_sha" = "\$PREVIOUS_DEPLOYMENT_SHA"/);
  assert.match(workflow, /deployments\/\$\{PREVIOUS_DEPLOYMENT_ID\}\/rollback/);
  assert.match(workflow, /PF_EXPECTED_DEPLOY_SHA: \$\{\{ env\.PREVIOUS_DEPLOYMENT_SHA \}\}/);
  assert.match(workflow, /serial-release-incident:/);
  assert.match(workflow, /issues\?state=open/);
  assert.match(workflow, /issues\/\$issue_number\/comments/);
  assert.doesNotMatch(workflow, /merge-queue\/active.*remove|remove.*merge-queue\/active/);
});

test('stage failure also creates a locked incident without production rollback', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.match(
    workflow,
    /stage_incident:\s*[\s\S]*needs\.staged_release\.result != 'success'[\s\S]*needs\.staged_release\.result != 'skipped'/,
  );
  const stageIncident = workflow.slice(workflow.indexOf('  stage_incident:'));
  assert.match(stageIncident, /serial-release-incident:/);
  assert.doesNotMatch(stageIncident, /\/rollback/);
});

test('release workflow cannot run migrations or receive Supabase service credentials', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE|db push|migration up|supabase\/migrations/);
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
});

test('legacy mixed production and recovery jobs are removed from queue workflow', async () => {
  const workflow = await readFile(queueWorkflowUrl, 'utf8');
  for (const legacy of [
    'post-merge-production:',
    'production-smokes:',
    'publish-production-smoke-results:',
    'recovery-production:',
    'recovery-smokes:',
    'publish-recovery-smoke-results:',
  ]) {
    assert.ok(!workflow.includes(legacy), `${legacy} was removed`);
  }
});

test('coordinator dispatch includes Vercel repository-dispatch identity fields', async () => {
  const coordinator = await readFile(coordinatorUrl, 'utf8');
  assert.match(coordinator, /git:\s*\{\s*sha:\s*mergeSha\s*\}/);
  assert.match(coordinator, /environment:\s*'production'/);
  assert.match(coordinator, /project:\s*\{\s*name:/);
});
