import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

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

async function parsedStagedWorkflow() {
  return parse(await readFile(stagedWorkflowUrl, 'utf8'));
}

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

test('every complete release smoke installs Chromium and WebKit', async () => {
  const workflow = await parsedStagedWorkflow();
  const installers = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .filter(({ name }) => name === 'Install Playwright browsers used by the release suite');
  assert.equal(installers.length, 3);
  for (const installer of installers) {
    assert.equal(installer.run, 'npx playwright install --with-deps chromium webkit');
  }
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
  const parsed = parse(workflow);
  assert.match(workflow, /target=production/);
  assert.match(workflow, /meta-githubCommitSha/);
  assert.match(workflow, /\.readyState == "READY"/);
  assert.ok(workflow.includes('staged_url" =~ ^https://[A-Za-z0-9.-]+\\.vercel\\.app$'));
  assert.match(workflow, /test "\$staged_url" != "https:\/\/puxaficha\.com\.br"/);
  assert.match(workflow, /PF_BASE_URL: \$\{\{ steps\.deployment\.outputs\.url \}\}/);
  assert.match(workflow, /PF_EXPECTED_DEPLOY_SHA: \$\{\{ env\.EXPECTED_SHA \}\}/);
  assert.match(workflow, /VERCEL_AUTOMATION_BYPASS_SECRET: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.match(workflow, /test -n "\$VERCEL_AUTOMATION_BYPASS_SECRET"/);
  assert.match(workflow, /npm run release:smoke/);
  assert.match(workflow, /printf 'id=%s\\n'.*GITHUB_OUTPUT/);
  const findDeployment = parsed.jobs.staged_release.steps.find(({ name }) => name === 'Find exact staged production deployment');
  assert.match(findDeployment.run, /if ! deployments=/);
  assert.match(findDeployment.run, /sleep 10\s+continue/);
});

test('an isolated privileged job explicitly promotes only the tested deployment id', async () => {
  const workflow = await readFile(stagedWorkflowUrl, 'utf8');
  const parsed = parse(workflow);
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
  const steps = parsed.jobs.promote_candidate.steps;
  const promoteIndex = steps.findIndex(({ name }) => name === 'Promote exact deployment id');
  const aliasesIndex = steps.findIndex(({ name }) => name === 'Wait for every production alias to complete promotion');
  assert.ok(promoteIndex >= 0 && aliasesIndex > promoteIndex);
  assert.match(steps[aliasesIndex].run, /v1\/projects\/\$\{VERCEL_PROJECT_ID\}\/promote\/aliases/);
  assert.match(steps[aliasesIndex].run, /\.alias == "puxaficha\.com\.br" and \.status == "completed"/);
  assert.match(steps[aliasesIndex].run, /all\(\.aliases\[\]; \.status == "completed"\)/);
  assert.match(steps[aliasesIndex].run, /\.status == "failed" or \.status == "error"/);
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
  const workflow = await parsedStagedWorkflow();
  const recovery = workflow.jobs.rollback_recovery;
  assert.equal(recovery.name, 'Production rollback recovery');
  assert.deepEqual(recovery.needs, ['staged_release', 'promote_candidate', 'public_closure']);
  assert.match(recovery.if, /needs\.staged_release\.result == 'success'/);
  assert.match(recovery.if, /needs\.promote_candidate\.result != 'success'/);
  assert.match(recovery.if, /needs\.public_closure\.result != 'success'/);
  const restoreIndex = recovery.steps.findIndex(({ name }) => name === 'Restore exact captured deployment');
  const verifyIndex = recovery.steps.findIndex(({ name }) => name === 'Prove and smoke restored predecessor');
  const publishIndex = recovery.steps.findIndex(({ name }) => name === 'Publish rollback result and upsert locked incident');
  assert.ok(restoreIndex >= 0 && verifyIndex > restoreIndex && publishIndex > verifyIndex);
  assert.equal(recovery.steps[verifyIndex].env.PF_EXPECTED_DEPLOY_SHA, '${{ env.PREVIOUS_DEPLOYMENT_SHA }}');
  assert.match(recovery.steps[restoreIndex].run, /deployments\/\$\{PREVIOUS_DEPLOYMENT_ID\}\/rollback/);
  assert.match(recovery.steps[publishIndex].run, /serial-release-incident:/);
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      const serialized = JSON.stringify(step);
      assert.ok(!(/merge-queue\/active/.test(serialized) && /remove|DELETE|labels\//i.test(serialized)));
    }
  }
});

test('stage failure also creates a locked incident without production rollback', async () => {
  const workflow = await parsedStagedWorkflow();
  const incident = workflow.jobs.stage_incident;
  assert.equal(incident.needs, 'staged_release');
  assert.match(incident.if, /always\(\)/);
  assert.match(incident.if, /vars\.SERIAL_MERGE_QUEUE_ENABLED == 'true'/);
  assert.match(incident.if, /needs\.staged_release\.result != 'success'/);
  assert.doesNotMatch(incident.if, /result != 'skipped'/);
  const run = incident.steps.find(({ name }) => name === 'Upsert locked stage incident').run;
  assert.match(run, /statuses\/\$\{EXPECTED_SHA\}/);
  assert.match(run, /serial-release-incident:/);
  assert.doesNotMatch(run, /\/rollback/);
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
