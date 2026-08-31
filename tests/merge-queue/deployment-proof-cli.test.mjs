import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { proveDeployment, validateReleaseBaseUrl } from '../../scripts/merge-queue/deployment-proof.mjs';
import { RELEASE_SMOKE_STEPS, runReleaseSmokes } from '../../scripts/merge-queue/run-release-smokes.mjs';

const SHA = 'a'.repeat(40);

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('release URL accepts only canonical production or an immutable Vercel HTTPS host', () => {
  assert.equal(validateReleaseBaseUrl('https://puxaficha.com.br'), 'https://puxaficha.com.br');
  assert.equal(validateReleaseBaseUrl('https://puxa-ficha-a1b2c3.vercel.app/'), 'https://puxa-ficha-a1b2c3.vercel.app');
  assert.throws(() => validateReleaseBaseUrl('http://puxa-ficha-a1b2c3.vercel.app'), /HTTPS/);
  assert.throws(() => validateReleaseBaseUrl('https://attacker.example'), /permitido/);
  assert.throws(() => validateReleaseBaseUrl('https://puxaficha.com.br.evil.example'), /permitido/);
});

test('proveDeployment accepts only the exact deployment-info tuple', async () => {
  const seen = [];
  const result = await proveDeployment({
    baseUrl: 'https://puxa-ficha-a1b2c3.vercel.app',
    expectedSha: SHA,
    bypassSecret: 'automation-bypass-secret',
    fetchImpl: async (url, init) => {
      seen.push([String(url), init]);
      return response({ ok: true, environment: 'production', commitRef: 'main', commitSha: SHA });
    },
  });
  assert.deepEqual(result, { ok: true, sha: SHA, ref: 'main', environment: 'production' });
  assert.equal(seen[0][0], 'https://puxa-ficha-a1b2c3.vercel.app/api/deployment-info');
  assert.equal(seen[0][1].redirect, 'error');
  assert.equal(seen[0][1].headers['x-vercel-protection-bypass'], 'automation-bypass-secret');
  assert.equal(seen[0][1].headers['x-vercel-set-bypass-cookie'], undefined);
});

for (const [name, reply, pattern] of [
  ['HTTP status', response({ ok: false }, 503), /HTTP 503/],
  ['ok flag', response({ ok: false, environment: 'production', commitRef: 'main', commitSha: SHA }), /ok/],
  ['environment', response({ ok: true, environment: 'preview', commitRef: 'main', commitSha: SHA }), /ambiente/],
  ['ref', response({ ok: true, environment: 'production', commitRef: 'feature', commitSha: SHA }), /ref/],
  ['sha', response({ ok: true, environment: 'production', commitRef: 'main', commitSha: 'b'.repeat(40) }), /SHA/],
]) {
  test(`proveDeployment rejects ${name} drift`, async () => {
    await assert.rejects(proveDeployment({
      baseUrl: 'https://puxa-ficha-a1b2c3.vercel.app',
      expectedSha: SHA,
      fetchImpl: async () => reply,
    }), pattern);
  });
}

test('release runner executes every smoke without a shell and preserves the target environment', async () => {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0, null));
    return child;
  };
  await runReleaseSmokes({ spawnImpl, env: { PF_BASE_URL: 'https://puxa-ficha-a1b2c3.vercel.app', PF_EXPECTED_DEPLOY_SHA: SHA } });
  assert.equal(calls.length, RELEASE_SMOKE_STEPS.length);
  assert.ok(calls.every((call) => call.options.shell === false));
  assert.ok(calls.every((call) => call.options.env.PF_BASE_URL === 'https://puxa-ficha-a1b2c3.vercel.app'));
});

test('release runner CLI path inherits the target from process.env', async () => {
  const originalBaseUrl = process.env.PF_BASE_URL;
  const originalSha = process.env.PF_EXPECTED_DEPLOY_SHA;
  process.env.PF_BASE_URL = 'https://puxa-ficha-a1b2c3.vercel.app';
  process.env.PF_EXPECTED_DEPLOY_SHA = SHA;
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0, null));
    return child;
  };

  try {
    await runReleaseSmokes({
      steps: [{ name: 'deployment-info', command: 'node', args: ['proof.mjs'] }],
      spawnImpl,
    });
  } finally {
    if (originalBaseUrl === undefined) delete process.env.PF_BASE_URL;
    else process.env.PF_BASE_URL = originalBaseUrl;
    if (originalSha === undefined) delete process.env.PF_EXPECTED_DEPLOY_SHA;
    else process.env.PF_EXPECTED_DEPLOY_SHA = originalSha;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.env.PF_BASE_URL, 'https://puxa-ficha-a1b2c3.vercel.app');
  assert.equal(calls[0].options.env.PF_EXPECTED_DEPLOY_SHA, SHA);
});

test('release runner stops on the first non-zero smoke', async () => {
  let calls = 0;
  const spawnImpl = () => {
    calls += 1;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', calls === 2 ? 9 : 0, null));
    return child;
  };
  await assert.rejects(runReleaseSmokes({
    spawnImpl,
    env: { PF_BASE_URL: 'https://puxaficha.com.br', PF_EXPECTED_DEPLOY_SHA: SHA },
  }), /exit code 9/);
  assert.equal(calls, 2);
});

test('release runner rejects an invalid expected SHA before spawning a smoke', async () => {
  let called = false;
  await assert.rejects(runReleaseSmokes({
    spawnImpl: () => { called = true; },
    env: { PF_BASE_URL: 'https://puxaficha.com.br', PF_EXPECTED_DEPLOY_SHA: 'invalid' },
  }), /40 caracteres hexadecimais/);
  assert.equal(called, false);
});

test('search smoke defaults to production but preserves a staged PF_BASE_URL', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:search-smoke'], /PF_BASE_URL=\$\{PF_BASE_URL:-https:\/\/puxaficha\.com\.br\}/);
  assert.match(pkg.scripts['test:search-smoke'], /PF_RUN_SEARCH_SMOKE=1/);
});
