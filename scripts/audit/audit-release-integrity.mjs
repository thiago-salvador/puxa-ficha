#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC_URL = 'https://puxaficha.com.br';
const DEFAULT_REPOSITORY = 'thiago-salvador/puxa-ficha';
const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_CAPTURE = 5 * 1024 * 1024;
const ALLOWED_ENV_KEYS = new Set([
  'SUPABASE_DB_URL',
  'PF_DATABASE_URL',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
]);
const AUDIT_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'CI',
  'NO_COLOR',
  'FORCE_COLOR',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'XDG_CONFIG_HOME',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_HOST',
  'GH_ENTERPRISE_TOKEN',
  'GH_CONFIG_DIR',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'VERCEL_CONFIG_DIR',
  'SUPABASE_DB_URL',
  'PF_DATABASE_URL',
  'PF_PSQL_BIN',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGAPPNAME',
  'PGCONNECT_TIMEOUT',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
]);

export class UnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnavailableError';
  }
}

class CommandError extends Error {
  constructor(file, code) {
    super(`${file} exited with code ${code}`);
    this.name = 'CommandError';
    this.code = code;
  }
}

function sanitize(value) {
  return String(value ?? '')
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[redacted-token]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[redacted]@')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function markdownCell(value) {
  return sanitize(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|') || 'n/a';
}

export function filterAuditEnvironment(source, overrides = {}) {
  const filtered = {};
  for (const environment of [source, overrides]) {
    for (const [key, value] of Object.entries(environment ?? {})) {
      if (AUDIT_ENV_KEYS.has(key) && value != null) filtered[key] = String(value);
    }
  }
  return filtered;
}

export function parseEnvFile(text, allowed = ALLOWED_ENV_KEYS) {
  const parsed = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !allowed.has(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

export function runCommand(file, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const isolatedProcessGroup = process.platform !== 'win32';
    const child = spawn(file, args, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? {},
      shell: false,
      detached: isolatedProcessGroup,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let captureExceeded = false;
    const append = (current, chunk) => {
      if (current.length + chunk.length > MAX_CAPTURE) {
        captureExceeded = true;
        return current;
      }
      return current + chunk;
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', reject);
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        if (isolatedProcessGroup && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (captureExceeded) return reject(new Error(`${file} exceeded bounded output capture`));
      if (timedOut) return reject(new Error(`${file} timed out after ${timeoutMs}ms`));
      if (signal) return reject(new Error(`${file} terminated by ${signal}`));
      if (code !== 0) return reject(new CommandError(file, code));
      resolvePromise({ stdout, stderr });
    });
    if (options.input != null) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

function resultSummary(results) {
  return results.reduce(
    (summary, result) => ({ ...summary, [result.status]: summary[result.status] + 1 }),
    { pass: 0, fail: 0, unavailable: 0 },
  );
}

export function renderReport({ generatedAt, results }) {
  const summary = resultSummary(results);
  const overall = summary.fail > 0 ? 'FAIL' : summary.unavailable > 0 ? 'PASS COM LIMITAÇÕES' : 'PASS';
  const rows = results.map((result) =>
    `| ${markdownCell(result.name)} | ${result.status} | ${markdownCell(result.checkedAt)} | ${markdownCell(result.source)} | ${markdownCell(result.sha)} | \`${markdownCell(result.command)}\` | ${markdownCell(result.summary)} |`,
  );
  const unavailable = results.filter((result) => result.status === 'unavailable');
  return [
    '# Auditoria de integridade dos releases anteriores',
    '',
    `- Gerada em: ${generatedAt}`,
    `- Resultado: **${overall}**`,
    `- Provas: ${summary.pass} pass, ${summary.fail} fail, ${summary.unavailable} unavailable`,
    '- Política: consulta remota read-only; ausência de evidência nunca conta como pass.',
    '',
    '| Prova | Estado | Coletada em | Fonte | SHA | Comando | Resultado ou limitação |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Limitações explícitas',
    '',
    ...(unavailable.length
      ? unavailable.map((result) => `- ${markdownCell(result.name)}: ${markdownCell(result.summary)}`)
      : ['- Nenhuma limitação de evidência nesta execução.']),
    '',
    '## Interpretação',
    '',
    summary.fail > 0
      ? '- Há prova divergente. O release não pode ser considerado íntegro até a falha ser corrigida e esta auditoria passar novamente.'
      : '- Nenhuma prova executada divergiu. Itens unavailable permanecem fora da garantia e exigem nova coleta quando a fonte estiver acessível.',
    '',
  ].join('\n');
}

export async function executeAudit({ probes, now = () => new Date(), outputPath = null }) {
  const context = {};
  const results = [];
  for (const probe of probes) {
    const checkedAt = now().toISOString();
    try {
      const evidence = await probe.run(context);
      results.push({
        name: probe.name,
        status: evidence?.status ?? 'pass',
        source: probe.source,
        command: probe.command,
        checkedAt,
        summary: sanitize(evidence?.summary ?? 'proved'),
        sha: evidence?.sha ?? context.publicSha ?? null,
      });
    } catch (error) {
      results.push({
        name: probe.name,
        status: error instanceof UnavailableError ? 'unavailable' : 'fail',
        source: probe.source,
        command: probe.command,
        checkedAt,
        summary: sanitize(error instanceof Error ? error.message : String(error)),
        sha: context.publicSha ?? null,
      });
    }
  }
  const generatedAt = now().toISOString();
  const summary = resultSummary(results);
  const report = renderReport({ generatedAt, results });
  if (outputPath) {
    const absolute = resolve(ROOT, outputPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, report, 'utf8');
  }
  return { generatedAt, results, summary, report, exitCode: summary.fail > 0 ? 1 : 0 };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
}

function latestByName(items, dateKey) {
  const latest = new Map();
  for (const item of items) {
    const name = item.name ?? item.context;
    if (!name) continue;
    const prior = latest.get(name);
    if (!prior || String(item[dateKey] ?? '') > String(prior[dateKey] ?? '')) latest.set(name, item);
  }
  return [...latest.values()];
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json().catch(() => { throw new Error(`${new URL(url).pathname} returned malformed JSON`); });
}

function requireDatabaseUrl(env) {
  const value = env.PF_DATABASE_URL ?? env.SUPABASE_DB_URL;
  if (!value) throw new UnavailableError('Supabase database credential is absent');
  return value;
}

export function createDefaultProbes({ env, runner = runCommand, repository = DEFAULT_REPOSITORY }) {
  const psql = env.PF_PSQL_BIN ?? '/opt/homebrew/opt/libpq/bin/psql';
  const node = process.execPath;
  const readOnlyDatabaseEnv = (databaseUrl) => ({
    ...env,
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000',
    PF_DATABASE_URL: databaseUrl,
  });

  return [
    {
      name: 'public-deployment-identity',
      source: `${PUBLIC_URL}/api/deployment-info`,
      command: 'GET /api/deployment-info',
      run: async (context) => {
        const body = await fetchJson(`${PUBLIC_URL}/api/deployment-info`);
        if (body.ok !== true || body.environment !== 'production' || body.commitRef !== 'main' || !SHA_RE.test(body.commitSha)) {
          throw new Error('public deployment tuple is not production/main/exact-SHA');
        }
        context.publicSha = body.commitSha;
        return { sha: body.commitSha, summary: `Public alias serves production/main SHA ${body.commitSha.slice(0, 12)}` };
      },
    },
    {
      name: 'complete-public-smoke',
      source: 'public routes, APIs, accessibility and pesquisas',
      command: 'npm run release:smoke',
      run: async (context) => {
        if (!context.publicSha) throw new Error('public SHA is unavailable');
        await runner(node, ['scripts/merge-queue/run-release-smokes.mjs'], {
          cwd: ROOT,
          timeoutMs: 600_000,
          env: { ...env, PF_BASE_URL: PUBLIC_URL, PF_EXPECTED_DEPLOY_SHA: context.publicSha },
        });
        return { sha: context.publicSha, summary: 'Deployment proof plus launch, search, a11y and pesquisas smokes passed' };
      },
    },
    {
      name: 'known-historical-regressions',
      source: 'public SHA source tree',
      command: 'git show <public-sha>:<fixed-files>',
      run: async (context) => {
        const general = await runner('git', ['show', `${context.publicSha}:src/components/CandidateGeneralData.tsx`], { env });
        const tabs = await runner('git', ['show', `${context.publicSha}:src/components/ProfileTabs.tsx`], { env });
        const tests = await runner('git', ['show', `${context.publicSha}:tests/rotulos-plural-e-mobile.test.tsx`], { env });
        if (!general.stdout.includes('<dl') || !general.stdout.includes('<dt') || !general.stdout.includes('<dd')) {
          throw new Error('public SHA lacks the dt/dd semantic wrapper correction');
        }
        if (!/pesquisas:\s*["']Pesq\.["']/.test(tabs.stdout) || !tests.stdout.includes('barra mobile devia usar a forma curta')) {
          throw new Error('public SHA lacks the mobile Pesq. selector correction and regression test');
        }
        return { sha: context.publicSha, summary: 'Both known historical false-green regressions are fixed in the deployed SHA' };
      },
    },
    {
      name: 'github-open-state',
      source: `GitHub ${repository}`,
      command: 'gh api open pulls and issues',
      run: async () => {
        const pulls = parseJson((await runner('gh', ['api', `repos/${repository}/pulls?state=open&per_page=100`], { env })).stdout, 'pulls');
        const issueItems = parseJson((await runner('gh', ['api', `repos/${repository}/issues?state=open&per_page=100`], { env })).stdout, 'issues');
        const issues = issueItems.filter((item) => !item.pull_request);
        if (pulls.length || issues.length) throw new Error(`open remote state is not empty: ${pulls.length} PR(s), ${issues.length} issue(s)`);
        return { summary: 'Zero open pull requests and zero open issues at collection time' };
      },
    },
    {
      name: 'github-public-sha-checks',
      source: `GitHub checks and workflow runs for ${repository}`,
      command: 'gh api commit checks, statuses and runs for <public-sha>',
      run: async (context) => {
        const runsBody = parseJson((await runner('gh', ['api', `repos/${repository}/commits/${context.publicSha}/check-runs?per_page=100`], { env })).stdout, 'check-runs');
        const statusBody = parseJson((await runner('gh', ['api', `repos/${repository}/commits/${context.publicSha}/status`], { env })).stdout, 'statuses');
        const workflowBody = parseJson((await runner('gh', ['api', `repos/${repository}/actions/runs?head_sha=${context.publicSha}&per_page=100`], { env })).stdout, 'workflow-runs');
        const checks = latestByName(runsBody.check_runs ?? [], 'completed_at');
        const statuses = latestByName(statusBody.statuses ?? [], 'updated_at');
        const workflows = latestByName(workflowBody.workflow_runs ?? [], 'updated_at');
        const badChecks = checks.filter((item) => item.status !== 'completed' || !['success', 'neutral', 'skipped'].includes(item.conclusion));
        const badStatuses = statuses.filter((item) => !['success'].includes(item.state));
        const badWorkflows = workflows.filter((item) => {
          if (item.conclusion === 'success') return false;
          return !(
            ['Serial merge queue', 'Serial merge queue watchdog'].includes(item.name) &&
            item.conclusion === 'skipped'
          );
        });
        if (!checks.length || !workflows.length) throw new UnavailableError('GitHub retained no checks or workflow runs for the public SHA');
        if (badChecks.length || badStatuses.length || badWorkflows.length) {
          throw new Error(`latest GitHub evidence has ${badChecks.length} bad check(s), ${badStatuses.length} bad status(es), ${badWorkflows.length} bad workflow(s)`);
        }
        return {
          sha: context.publicSha,
          summary: `${checks.length} latest checks, ${statuses.length} latest statuses and ${workflows.length} latest workflows are green`,
        };
      },
    },
    {
      name: 'supabase-specialized-workflow-receipts',
      source: 'GitHub production migration workflows',
      command: 'gh api latest workflow_dispatch runs for five migration-specific workflows',
      run: async (context) => {
        const workflows = [
          'apply-candidate-roster-integrity-production.yml',
          'apply-issue-138-production.yml',
          'apply-profissao-qid-production.yml',
          'apply-jhc-artigo-17-production.yml',
          'apply-destaques-freshness-reconciliation-production.yml',
        ];
        const receipts = [];
        for (const workflow of workflows) {
          const body = parseJson((await runner('gh', [
            'api', `repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=20`,
          ], { env })).stdout, workflow);
          const latest = (body.workflow_runs ?? [])[0];
          if (!latest) throw new UnavailableError(`${workflow} has no retained workflow_dispatch receipt`);
          if (latest.conclusion !== 'success') throw new Error(`${workflow} latest production receipt is ${latest.conclusion ?? latest.status}`);
          receipts.push(latest.id);
        }
        return {
          sha: context.publicSha,
          summary: `${receipts.length} migration-specific apply, ledger and readback workflow receipts are green`,
        };
      },
    },
    {
      name: 'vercel-production-deployment',
      source: 'Vercel production alias',
      command: 'vercel inspect https://puxaficha.com.br --json',
      run: async (context) => {
        const inspected = parseJson((await runner('vercel', ['inspect', PUBLIC_URL, '--json'], { env, timeoutMs: 60_000 })).stdout, 'vercel inspect');
        if (!inspected.id || inspected.name !== 'puxa-ficha' || inspected.target !== 'production' || inspected.readyState !== 'READY') {
          throw new Error('Vercel deployment identity, target or readiness diverged');
        }
        if (!Array.isArray(inspected.aliases) || !inspected.aliases.includes('puxaficha.com.br')) {
          throw new Error('Vercel deployment does not own the canonical alias');
        }
        context.vercelDeploymentId = inspected.id;
        return { sha: context.publicSha, summary: `READY production deployment ${inspected.id} owns puxaficha.com.br` };
      },
    },
    {
      name: 'vercel-runtime-log-availability',
      source: 'Vercel runtime logs, last 24 hours',
      command: 'vercel logs --project puxa-ficha --environment production --since 24h --limit 20 --json',
      run: async (context) => {
        if (!context.vercelDeploymentId) throw new Error('Vercel deployment id is unavailable');
        const output = await runner('vercel', [
          'logs', '--project', 'puxa-ficha', '--environment', 'production', '--since', '24h',
          '--limit', '20', '--json', '--no-branch',
        ], { env, timeoutMs: 60_000 });
        const lines = output.stdout.split(/\r?\n/).filter(Boolean);
        if (!lines.length) throw new UnavailableError('Vercel returned no retained runtime log entries in the last 24 hours');
        const entries = lines.map((line) => parseJson(line, 'Vercel log'));
        const serverErrors = entries.filter((entry) => Number(entry.responseStatusCode ?? entry.statusCode ?? entry.status) >= 500);
        if (serverErrors.length) throw new Error(`Vercel retained ${serverErrors.length} runtime response(s) with HTTP 5xx`);
        return { sha: context.publicSha, summary: `${entries.length} retained runtime entries are available with zero HTTP 5xx` };
      },
    },
    {
      name: 'supabase-migration-ledger',
      source: 'Supabase PostgreSQL migration ledger',
      command: 'psql read-only ledger | audit:ledger:gate',
      run: async (context) => {
        const databaseUrl = requireDatabaseUrl(env);
        await access(psql).catch(() => { throw new UnavailableError('PostgreSQL 17 client is unavailable'); });
        const databaseEnv = readOnlyDatabaseEnv(databaseUrl);
        const ledger = await runner(psql, [
          databaseUrl, '-X', '-Atq', '-v', 'ON_ERROR_STOP=1',
          '-c', 'select version from supabase_migrations.schema_migrations order by version',
        ], { env: databaseEnv, timeoutMs: 90_000 });
        const versions = ledger.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!versions.length || versions.some((version) => !/^\d{14}$/.test(version))) {
          throw new Error('Supabase migration ledger returned empty or malformed evidence');
        }
        await runner(node, ['--import', 'tsx', 'scripts/audit/check-ledger-vs-repo.ts'], {
          env: databaseEnv, input: `${versions.join('\n')}\n`, timeoutMs: 60_000,
        });
        context.databaseEnv = databaseEnv;
        return { sha: context.publicSha, summary: `${versions.length} remote migration versions match the repository ledger rules` };
      },
    },
    {
      name: 'supabase-release-invariants',
      source: 'Migration-specific production readbacks',
      command: 'psql default_transaction_read_only=on -f <manifest-readback>',
      run: async (context) => {
        const databaseUrl = requireDatabaseUrl(env);
        await access(psql).catch(() => { throw new UnavailableError('PostgreSQL 17 client is unavailable'); });
        const manifest = parseJson(await readFile(resolve(ROOT, '.github/merge-queue/irreversible-change-manifest.json'), 'utf8'), 'database manifest');
        const artifacts = manifest.databaseArtifacts?.readback?.artifacts ?? [];
        if (!artifacts.length) throw new Error('database manifest declares no production readback artifacts');
        const databaseEnv = context.databaseEnv ?? readOnlyDatabaseEnv(databaseUrl);
        for (const artifact of artifacts) {
          if (!/^supabase\/readback\/[A-Za-z0-9_.-]+\.sql$/.test(artifact)) throw new Error('unsafe readback artifact path');
          await runner(psql, [databaseUrl, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', artifact], {
            env: databaseEnv, timeoutMs: 120_000,
          });
        }
        return { sha: context.publicSha, summary: `${artifacts.length} migration-specific production readbacks passed under forced read-only mode` };
      },
    },
    {
      name: 'sentry-evidence',
      source: 'Sentry project issues',
      command: 'GET Sentry unresolved issues API',
      run: async (context) => {
        const token = env.SENTRY_AUTH_TOKEN;
        const org = env.SENTRY_ORG;
        const project = env.SENTRY_PROJECT;
        if (!token || !org || !project) throw new UnavailableError('Sentry credential or project coordinates are absent');
        const sentryUrl = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved`;
        const response = await fetch(sentryUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        });
        if ([401, 403].includes(response.status)) throw new UnavailableError('Sentry credential was rejected by the read-only issues API');
        if (!response.ok) throw new Error(`Sentry issues API returned HTTP ${response.status}`);
        const issues = await response.json().catch(() => { throw new Error('Sentry issues response is malformed'); });
        if (!Array.isArray(issues)) throw new Error('Sentry issues response is malformed');
        if (issues.length) throw new Error(`Sentry reports ${issues.length} unresolved issue(s)`);
        return { sha: context.publicSha, summary: 'Sentry reports zero unresolved issues' };
      },
    },
  ];
}

function parseArgs(argv) {
  const result = { outputPath: null, envFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') result.outputPath = argv[++index];
    else if (arg.startsWith('--output=')) result.outputPath = arg.slice('--output='.length);
    else if (arg === '--env-file') result.envFile = argv[++index];
    else if (arg.startsWith('--env-file=')) result.envFile = arg.slice('--env-file='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.outputPath) throw new Error('--output is required');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let fileEnv = {};
  if (args.envFile) {
    fileEnv = parseEnvFile(await readFile(resolve(args.envFile), 'utf8'));
  }
  const env = filterAuditEnvironment(fileEnv, process.env);
  const probes = createDefaultProbes({ env });
  const result = await executeAudit({ probes, outputPath: args.outputPath });
  process.stdout.write(`${JSON.stringify({
    status: result.exitCode === 0 ? 'pass' : 'fail',
    output: args.outputPath,
    ...result.summary,
  })}\n`);
  process.exitCode = result.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`audit-release-integrity: ${sanitize(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
