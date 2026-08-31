#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function validateReleaseBaseUrl(value) {
  const url = new URL(String(value ?? '').trim());
  if (url.protocol !== 'https:') throw new Error('A URL de release deve usar HTTPS');
  const allowed = url.hostname === 'puxaficha.com.br' || url.hostname.endsWith('.vercel.app');
  if (!allowed) throw new Error('Host de release não permitido');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('A URL de release deve conter somente a origem');
  return url.origin;
}

export async function proveDeployment({
  baseUrl,
  expectedSha,
  expectedRef = 'main',
  expectedEnvironment = 'production',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
}) {
  const origin = validateReleaseBaseUrl(baseUrl);
  if (!SHA_PATTERN.test(String(expectedSha ?? ''))) throw new Error('SHA esperado deve ter 40 caracteres hexadecimais');
  const response = await fetchImpl(`${origin}/api/deployment-info`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) throw new Error(`deployment-info respondeu HTTP ${response.status}`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('deployment-info não retornou JSON válido');
  }
  if (payload?.ok !== true) throw new Error('deployment-info não confirmou ok');
  if (payload.environment !== expectedEnvironment) throw new Error('deployment-info divergiu no ambiente');
  if (payload.commitRef !== expectedRef) throw new Error('deployment-info divergiu na ref');
  if (payload.commitSha !== expectedSha) throw new Error('deployment-info divergiu no SHA');
  return { ok: true, sha: expectedSha, ref: expectedRef, environment: expectedEnvironment };
}

async function main() {
  const result = await proveDeployment({
    baseUrl: process.env.PF_BASE_URL,
    expectedSha: process.env.PF_EXPECTED_DEPLOY_SHA,
  });
  process.stdout.write(`${JSON.stringify({ proof: 'deployment-info', ...result })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`deployment proof failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
