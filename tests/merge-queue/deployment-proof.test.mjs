import assert from 'node:assert/strict';
import test from 'node:test';
import { VercelAdapter } from '../../scripts/merge-queue/adapters.mjs';

const SHA = 'a'.repeat(40);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deployment(overrides = {}) {
  return {
    uid: 'dpl_candidate',
    readyState: 'READY',
    target: 'production',
    url: 'puxa-ficha-a1b2c3.vercel.app',
    createdAt: 1_787_000_000_000,
    meta: { githubCommitSha: SHA },
    ...overrides,
  };
}

test('deploymentForSha returns only the exact ready production deployment', async () => {
  const calls = [];
  const adapter = new VercelAdapter({
    token: 'token', teamId: 'team', projectId: 'project',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return jsonResponse({ deployments: [
        deployment({ uid: 'dpl_other', meta: { githubCommitSha: 'b'.repeat(40) } }),
        deployment(),
      ] });
    },
  });

  const result = await adapter.deploymentForSha(SHA, { target: 'production' });

  assert.deepEqual(result, {
    id: 'dpl_candidate',
    sha: SHA,
    url: 'https://puxa-ficha-a1b2c3.vercel.app',
    readyState: 'READY',
    target: 'production',
    createdAt: 1_787_000_000_000,
    status: 'success',
  });
  assert.match(calls[0], /target=production/);
});

test('assertDeployment rejects identity, target, readiness and URL drift', () => {
  const adapter = new VercelAdapter({ token: 'token', projectId: 'project' });
  const candidate = {
    id: 'dpl_candidate', sha: SHA, url: 'https://puxa-ficha-a1b2c3.vercel.app',
    readyState: 'READY', target: 'production', status: 'success',
  };
  assert.doesNotThrow(() => adapter.assertDeployment(candidate, {
    expectedId: 'dpl_candidate', expectedSha: SHA, target: 'production', requiredState: 'READY',
  }));
  assert.throws(() => adapter.assertDeployment({ ...candidate, sha: 'b'.repeat(40) }, { expectedSha: SHA }), /SHA/);
  assert.throws(() => adapter.assertDeployment({ ...candidate, target: 'preview' }, { expectedSha: SHA, target: 'production' }), /target/);
  assert.throws(() => adapter.assertDeployment({ ...candidate, readyState: 'BUILDING' }, { expectedSha: SHA, requiredState: 'READY' }), /ready state/);
  assert.throws(() => adapter.assertDeployment({ ...candidate, url: 'http://puxa-ficha-a1b2c3.vercel.app' }, { expectedSha: SHA }), /HTTPS/);
  assert.throws(() => adapter.assertDeployment({ ...candidate, url: 'https://attacker.example' }, { expectedSha: SHA }), /Vercel host/);
});

test('currentProductionForDomain resolves the deployment currently serving the canonical domain', async () => {
  const adapter = new VercelAdapter({
    token: 'token', teamId: 'team', projectId: 'project',
    fetchImpl: async (url) => {
      assert.match(String(url), /\/v13\/deployments\/puxaficha\.com\.br/);
      return jsonResponse(deployment({ uid: 'dpl_public' }));
    },
  });
  const result = await adapter.currentProductionForDomain('puxaficha.com.br');
  assert.equal(result.id, 'dpl_public');
  assert.equal(result.sha, SHA);
});

test('deploymentForSha rejects malformed deployment URLs instead of returning usable evidence', async () => {
  const adapter = new VercelAdapter({
    token: 'token', projectId: 'project',
    fetchImpl: async () => jsonResponse({ deployments: [deployment({ url: 'attacker.example' })] }),
  });
  await assert.rejects(adapter.deploymentForSha(SHA), /Vercel host/);
});
