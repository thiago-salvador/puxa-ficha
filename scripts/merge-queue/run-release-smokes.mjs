#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateReleaseBaseUrl } from './deployment-proof.mjs';

export const RELEASE_SMOKE_STEPS = Object.freeze([
  { name: 'deployment-info', command: process.execPath, args: ['scripts/merge-queue/deployment-proof.mjs'] },
  { name: 'launch', command: 'npx', args: ['tsx', 'scripts/smoke-lancamento.ts'] },
  { name: 'search', command: 'npm', args: ['run', 'test:search-smoke'] },
  { name: 'a11y', command: 'npm', args: ['run', 'test:a11y'] },
  { name: 'pesquisas', command: 'npm', args: ['run', 'test:pesquisas:production-smoke'] },
]);

function runStep(step, { spawnImpl, env }) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawnImpl(step.command, step.args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      const durationMs = Date.now() - startedAt;
      if (code !== 0) {
        reject(new Error(`${step.name} failed with exit code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`));
        return;
      }
      process.stdout.write(`${JSON.stringify({ smoke: step.name, status: 'pass', durationMs })}\n`);
      resolve();
    });
  });
}

export async function runReleaseSmokes({
  steps = RELEASE_SMOKE_STEPS,
  spawnImpl = spawn,
  env = {},
} = {}) {
  const releaseEnv = {
    ...process.env,
    ...env,
    PF_BASE_URL: validateReleaseBaseUrl(env.PF_BASE_URL),
  };
  if (!/^[0-9a-f]{40}$/.test(String(releaseEnv.PF_EXPECTED_DEPLOY_SHA ?? ''))) {
    throw new Error('PF_EXPECTED_DEPLOY_SHA deve ter 40 caracteres hexadecimais');
  }
  for (const step of steps) await runStep(step, { spawnImpl, env: releaseEnv });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseSmokes().catch((error) => {
    process.stderr.write(`release smoke failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
