import { CoordinatorError, normalizeConfig } from './engine.mjs';

const CONTEXT_PREFIX = '<!-- serial-merge-queue-context:';

export class HttpError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

function encodePath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function checkFromRun(run) {
  return {
    name: run.name,
    sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
  };
}

function isTrustedContextComment(comment, config) {
  const actor = String(comment.user?.login ?? '').toLowerCase();
  const app = String(comment.performed_via_github_app?.slug ?? '').toLowerCase();
  const actors = (config.queue?.trustedContextActors ?? []).map((item) => String(item).toLowerCase());
  const apps = (config.queue?.trustedContextApps ?? []).map((item) => String(item).toLowerCase());
  return (actor && actors.includes(actor)) || (app && apps.includes(app));
}

function isValidQueueContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set([
    'previousMainSha', 'previousDeploymentId', 'previousDeploymentSha', 'previousDeploymentUrl',
    'mergeSha', 'headSha', 'transition',
    'rollbackPr', 'rollbackMergeSha', 'recovered', 'failedHeadSha', 'restoredSha',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  const shaKeys = ['previousMainSha', 'previousDeploymentSha', 'mergeSha', 'headSha', 'rollbackMergeSha', 'failedHeadSha', 'restoredSha'];
  if (shaKeys.some((key) => value[key] != null && !/^[0-9a-f]{40}$/.test(String(value[key])))) return false;
  if (value.previousMainSha && value.previousDeploymentSha && value.previousMainSha !== value.previousDeploymentSha) return false;
  if (value.previousDeploymentId != null && !/^[A-Za-z0-9_-]{1,128}$/.test(String(value.previousDeploymentId))) return false;
  if (value.previousDeploymentUrl != null) {
    try {
      deploymentUrl(value.previousDeploymentUrl);
    } catch {
      return false;
    }
  }
  if (value.rollbackPr != null && (!Number.isInteger(value.rollbackPr) || value.rollbackPr < 1)) return false;
  if (value.recovered != null && typeof value.recovered !== 'boolean') return false;
  if (value.transition != null && !['merge-started', 'merged'].includes(value.transition)) return false;
  return true;
}

export class GitHubAdapter {
  constructor({ repository, token, fetchImpl = globalThis.fetch, apiUrl = 'https://api.github.com' }) {
    if (!repository?.includes('/')) throw new CoordinatorError('Config repository must be owner/name');
    if (!token) throw new CoordinatorError('GITHUB_TOKEN is required for live reconciliation');
    this.repository = repository;
    this.token = token;
    this.fetch = fetchImpl;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  async request(path, init = {}) {
    const response = await this.fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new HttpError(`GitHub API ${response.status} for ${path}`, response.status, payload);
    return payload;
  }

  async paginated(path, select = (payload) => payload, maxPages = 50) {
    const items = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const payload = await this.request(`${path}${separator}page=${page}`);
      const batch = select(payload);
      if (!Array.isArray(batch)) throw new CoordinatorError(`Paginated GitHub response is not an array for ${path}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new CoordinatorError(`GitHub pagination exceeded ${maxPages} pages for ${path}`);
  }

  async graphql(query, variables) {
    const payload = await this.request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
    if (payload.errors?.length) throw new CoordinatorError('GitHub GraphQL mutation failed', { errors: payload.errors });
    return payload.data;
  }

  async checks(sha) {
    const [runs, statusesPayload] = await Promise.all([
      this.paginated(`/repos/${this.repository}/commits/${encodeURIComponent(sha)}/check-runs?filter=latest&per_page=100`, (payload) => payload.check_runs),
      this.paginated(`/repos/${this.repository}/commits/${encodeURIComponent(sha)}/statuses?per_page=100`),
    ]);
    const latestByContext = new Map();
    for (const status of statusesPayload) {
      const context = String(status.context ?? '');
      const observedAt = Date.parse(status.updated_at ?? status.created_at ?? '') || 0;
      const current = latestByContext.get(context);
      if (!current || observedAt > current.observedAt) {
        latestByContext.set(context, { status, observedAt });
      }
    }
    const statuses = [...latestByContext.values()].map(({ status }) => ({
      name: status.context,
      sha,
      status: status.state,
      conclusion: status.state,
      url: status.target_url,
      createdAt: status.created_at ?? null,
      updatedAt: status.updated_at ?? status.created_at ?? null,
    }));
    return [...runs.map(checkFromRun), ...statuses];
  }

  async queueContext(number, config) {
    const comments = await this.paginated(`/repos/${this.repository}/issues/${number}/comments?per_page=100`);
    for (const comment of comments.toReversed()) {
      if (!isTrustedContextComment(comment, config)) continue;
      const body = String(comment.body ?? '');
      const start = body.indexOf(CONTEXT_PREFIX);
      if (start < 0) continue;
      const end = body.indexOf('-->', start);
      if (end < 0) continue;
      try {
        const context = JSON.parse(body.slice(start + CONTEXT_PREFIX.length, end).trim());
        if (isValidQueueContext(context)) return context;
      } catch {
        continue;
      }
    }
    return null;
  }

  async rollbackFor(ownerNumber, rollbackLabel) {
    const candidates = await this.paginated(`/repos/${this.repository}/issues?state=all&labels=${encodeURIComponent(rollbackLabel)}&per_page=100`);
    const issue = candidates.find((item) => item.pull_request && String(item.body ?? '').includes(`serial-merge-queue-owner: #${ownerNumber}`));
    if (!issue) return null;
    const pr = await this.request(`/repos/${this.repository}/pulls/${issue.number}`);
    const sha = pr.merge_commit_sha ?? pr.head.sha;
    return {
      prNumber: pr.number,
      status: pr.merged_at ? 'merged' : lowerState(pr.state),
      headSha: pr.head.sha,
      mergeSha: pr.merge_commit_sha,
      sync: pr.mergeable_state,
      mergeable: pr.mergeable,
      checks: await this.checks(sha),
    };
  }

  async jsonAtRef(path, ref) {
    try {
      const payload = await this.request(`/repos/${this.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
      if (payload.type !== 'file' || payload.encoding !== 'base64') return null;
      return JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }

  async pullSnapshot(pr, config) {
    const [checks, files, context, manifest] = await Promise.all([
      this.checks(pr.head.sha),
      this.paginated(`/repos/${this.repository}/pulls/${pr.number}/files?per_page=100`),
      this.queueContext(pr.number, config),
      config.irreversibleChanges.manifestPath
        ? this.jsonAtRef(config.irreversibleChanges.manifestPath, pr.head.sha)
        : Promise.resolve(null),
    ]);
    const labels = (pr.labels ?? []).map((label) => label.name);
    const snapshot = {
      number: pr.number,
      nodeId: pr.node_id,
      createdAt: pr.created_at,
      state: pr.state,
      draft: pr.draft === true,
      mergedAt: pr.merged_at,
      headSha: pr.head.sha,
      mergeSha: context?.mergeSha ?? (pr.merged_at ? pr.merge_commit_sha : null),
      sync: pr.mergeable_state,
      mergeable: pr.mergeable,
      labels,
      checks,
      files: files.map((file) => file.filename),
      queueContext: context,
      reversibilityManifest: manifest,
    };
    if (labels.includes(config.labels.rollback)) snapshot.rollback = await this.rollbackFor(pr.number, config.labels.rollbackPr);
    return snapshot;
  }

  async snapshot(configInput) {
    const config = normalizeConfig(configInput);
    const [open, lockedIssues, branch] = await Promise.all([
      this.paginated(`/repos/${this.repository}/pulls?state=open&sort=created&direction=asc&per_page=100`),
      this.paginated(`/repos/${this.repository}/issues?state=all&labels=${encodeURIComponent(config.labels.active)}&per_page=100`),
      this.request(`/repos/${this.repository}/branches/${encodeURIComponent(config.defaultBranch)}`),
    ]);
    const byNumber = new Map(open.map((pr) => [pr.number, pr]));
    for (const issue of lockedIssues) {
      if (issue.pull_request && !byNumber.has(issue.number)) {
        byNumber.set(issue.number, await this.request(`/repos/${this.repository}/pulls/${issue.number}`));
      }
    }
    const prs = await Promise.all([...byNumber.values()].map((pr) => this.pullSnapshot(pr, config)));
    const mainSha = branch.commit.sha;
    return {
      prs,
      main: { sha: mainSha, checks: await this.checks(mainSha) },
    };
  }

  async setLabels(number, add, remove) {
    const issue = await this.request(`/repos/${this.repository}/issues/${number}`);
    const labels = new Set((issue.labels ?? []).map((label) => label.name));
    for (const label of remove) labels.delete(label);
    for (const label of add) labels.add(label);
    await this.request(`/repos/${this.repository}/issues/${number}/labels`, {
      method: 'PUT', body: JSON.stringify({ labels: [...labels] }),
    });
    return { labels: [...labels] };
  }

  async comment(number, body) {
    return this.request(`/repos/${this.repository}/issues/${number}/comments`, {
      method: 'POST', body: JSON.stringify({ body }),
    });
  }

  async merge(number, expectedHeadSha, mergeMethod = 'squash') {
    return this.request(`/repos/${this.repository}/pulls/${number}/merge`, {
      method: 'PUT', body: JSON.stringify({ sha: expectedHeadSha, merge_method: mergeMethod }),
    });
  }

  async assertMergePreconditions(number, expectedHeadSha, expectedBaseSha, config, requiredLabel = config.labels.active) {
    const [branch, pr, issue] = await Promise.all([
      this.request(`/repos/${this.repository}/branches/${encodeURIComponent(config.defaultBranch)}`),
      this.request(`/repos/${this.repository}/pulls/${number}`),
      this.request(`/repos/${this.repository}/issues/${number}`),
    ]);
    const labels = (issue.labels ?? []).map((label) => label.name);
    const valid = branch.commit?.sha === expectedBaseSha && pr.state === 'open' &&
      pr.head?.sha === expectedHeadSha && labels.includes(requiredLabel);
    if (!valid) {
      throw new HttpError('Merge preconditions changed after the queue snapshot', 409, {
        expectedBaseSha,
        observedBaseSha: branch.commit?.sha ?? null,
        expectedHeadSha,
        observedHeadSha: pr.head?.sha ?? null,
        state: pr.state,
      });
    }
    return { ok: true, baseSha: expectedBaseSha, headSha: expectedHeadSha };
  }

  async assertOwnerLabels(number, requiredLabels) {
    const issue = await this.request(`/repos/${this.repository}/issues/${number}`);
    const labels = new Set((issue.labels ?? []).map((label) => label.name));
    if (!requiredLabels.every((label) => labels.has(label))) {
      throw new HttpError('Queue owner lock changed after the recovery snapshot', 409, {
        owner: number,
        requiredLabels,
        observedLabels: [...labels],
      });
    }
    return { ok: true, owner: number };
  }

  async persistContext(number, context) {
    return this.comment(number, `${CONTEXT_PREFIX}${JSON.stringify(context)} -->`);
  }

  async setCommitStatus(sha, state, context, description) {
    return this.request(`/repos/${this.repository}/statuses/${encodeURIComponent(sha)}`, {
      method: 'POST',
      body: JSON.stringify({ state, context, description: description?.slice(0, 140) }),
    });
  }

  async dispatch(eventType, clientPayload) {
    return this.request(`/repos/${this.repository}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
    });
  }

  async upsertIncident({ pr, phase, sha, reason, severity, assignee }) {
    const signature = `serial-merge-queue:${pr}:${phase}:${sha ?? 'unknown'}:${reason}`;
    const issues = await this.paginated(`/repos/${this.repository}/issues?state=open&per_page=100`);
    const existing = issues.find((issue) => !issue.pull_request && String(issue.body ?? '').includes(`<!-- ${signature} -->`));
    const body = `<!-- ${signature} -->\nPR: #${pr}\nPhase: ${phase}\nSHA: ${sha ?? 'unknown'}\nFailure: ${reason}\nSeverity: ${severity}`;
    if (existing) {
      return this.request(`/repos/${this.repository}/issues/${existing.number}`, {
        method: 'PATCH', body: JSON.stringify({ body }),
      });
    }
    return this.request(`/repos/${this.repository}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[Serial merge queue] PR #${pr}: ${reason}`,
        body,
        assignees: assignee ? [assignee] : [],
      }),
    });
  }

  async createRollbackPr(ownerNumber, rollbackLabel) {
    const owner = await this.request(`/repos/${this.repository}/pulls/${ownerNumber}`);
    const data = await this.graphql(
      `mutation Revert($pullRequestId: ID!) { revertPullRequest(input: {pullRequestId: $pullRequestId}) { revertPullRequest { number url } } }`,
      { pullRequestId: owner.node_id },
    );
    const revert = data.revertPullRequest.revertPullRequest;
    await this.setLabels(revert.number, [rollbackLabel], []);
    await this.request(`/repos/${this.repository}/issues/${revert.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: `serial-merge-queue-owner: #${ownerNumber}\n\nAutomatic recovery PR. The original PR keeps the queue lock.` }),
    });
    return revert;
  }
}

function lowerState(value) {
  return String(value ?? '').toLowerCase();
}

function deploymentUrl(value) {
  const raw = String(value ?? '').trim();
  const url = new URL(raw.startsWith('https://') || raw.startsWith('http://') ? raw : `https://${raw}`);
  if (url.protocol !== 'https:') throw new CoordinatorError('Vercel deployment URL must use HTTPS');
  if (!url.hostname.endsWith('.vercel.app')) throw new CoordinatorError('Vercel deployment URL must use a Vercel host');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function normalizedDeployment(deployment) {
  if (!deployment || typeof deployment !== 'object') return null;
  const readyState = String(deployment.readyState ?? deployment.state ?? '').toUpperCase();
  const state = lowerState(readyState);
  return {
    id: deployment.uid ?? deployment.id ?? null,
    sha: deployment.meta?.githubCommitSha ?? deployment.sha ?? null,
    url: deploymentUrl(deployment.url),
    readyState,
    target: lowerState(deployment.target),
    createdAt: deployment.createdAt ?? deployment.created ?? null,
    status: state === 'ready' ? 'success' : state === 'error' || state === 'canceled' ? 'failure' : 'pending',
  };
}

export class VercelAdapter {
  constructor({ token, teamId, projectId, fetchImpl = globalThis.fetch, apiUrl = 'https://api.vercel.com' }) {
    this.token = token;
    this.teamId = teamId;
    this.projectId = projectId;
    this.fetch = fetchImpl;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  assertDeployment(deployment, { expectedId, expectedSha, target, requiredState } = {}) {
    if (!deployment?.id) throw new CoordinatorError('Vercel deployment id is missing');
    if (expectedId && deployment.id !== expectedId) throw new CoordinatorError('Vercel deployment id does not match the expected deployment');
    if (expectedSha && deployment.sha !== expectedSha) throw new CoordinatorError('Vercel deployment SHA does not match the expected SHA');
    if (target && lowerState(deployment.target) !== lowerState(target)) throw new CoordinatorError('Vercel deployment target does not match the expected target');
    if (requiredState && lowerState(deployment.readyState) !== lowerState(requiredState)) {
      throw new CoordinatorError('Vercel deployment ready state does not match the required ready state');
    }
    deploymentUrl(deployment.url);
    return deployment;
  }

  async deploymentForSha(sha, { target = 'production' } = {}) {
    if (!this.token || !this.projectId) return null;
    const query = new URLSearchParams({ projectId: this.projectId, target, limit: '100' });
    if (this.teamId) query.set('teamId', this.teamId);
    const response = await this.fetch(`${this.apiUrl}/v6/deployments?${query}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new HttpError(`Vercel API ${response.status}`, response.status, await response.text());
    const payload = await response.json();
    const deployment = payload.deployments?.find((item) => item.meta?.githubCommitSha === sha && lowerState(item.target) === lowerState(target)) ?? null;
    if (!deployment) return null;
    const normalized = normalizedDeployment(deployment);
    return this.assertDeployment(normalized, { expectedSha: sha, target });
  }

  async productionForSha(sha) {
    return this.deploymentForSha(sha, { target: 'production' });
  }

  async currentProductionForDomain(domain) {
    const hostname = String(domain ?? '').trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.includes('..')) {
      throw new CoordinatorError('Production domain is invalid');
    }
    const deployment = normalizedDeployment(await this.request(`/v13/deployments/${encodeURIComponent(hostname)}`));
    return this.assertDeployment(deployment, { target: 'production', requiredState: 'READY' });
  }

  async request(path, init = {}) {
    if (!this.token) throw new CoordinatorError('VERCEL_TOKEN is required for live production mutations');
    const query = this.teamId ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(this.teamId)}` : '';
    const response = await this.fetch(`${this.apiUrl}${path}${query}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new HttpError(`Vercel API ${response.status} for ${path}`, response.status, payload);
    return payload;
  }

  async instantRollback(deploymentId) {
    if (!deploymentId) throw new CoordinatorError('Previous production deployment is required for instant rollback');
    return this.request(`/v1/deployments/${encodeURIComponent(deploymentId)}/rollback`, { method: 'POST', body: '{}' });
  }

  async promote(deploymentId) {
    if (!deploymentId) throw new CoordinatorError('Deployment id is required for explicit promotion');
    return this.request(`/v10/projects/${encodeURIComponent(this.projectId)}/promote/${encodeURIComponent(deploymentId)}`, {
      method: 'POST', body: '{}',
    });
  }
}

export function signalFromChecks(checks, sha, names = []) {
  const wanted = names.filter(Boolean);
  if (!wanted.length) return null;
  const found = checks.filter((check) => wanted.includes(check.name) && check.sha === sha);
  if (found.some((check) => ['failure', 'cancelled', 'timed_out', 'neutral', 'skipped'].includes(lowerState(check.conclusion)))) {
    return { sha, status: 'failure' };
  }
  if (wanted.every((name) => found.some((check) => check.name === name && lowerState(check.conclusion) === 'success'))) {
    return { sha, status: 'success' };
  }
  return { sha, status: 'pending' };
}

export async function createLiveAdapters(config, env = process.env, fetchImpl = globalThis.fetch) {
  const github = new GitHubAdapter({ repository: config.repository, token: env.GITHUB_TOKEN, fetchImpl });
  const vercel = new VercelAdapter({
    token: env.VERCEL_TOKEN,
    teamId: env.VERCEL_TEAM_ID,
    projectId: env.VERCEL_PROJECT_ID,
    fetchImpl,
  });
  return { github, vercel };
}

export function preflightSecrets(config, env = process.env) {
  const aliases = {
    MERGE_QUEUE_GH_TOKEN: ['MERGE_QUEUE_GH_TOKEN', 'GITHUB_TOKEN'],
    VERCEL_ORG_ID: ['VERCEL_ORG_ID', 'VERCEL_TEAM_ID'],
  };
  const missing = (config.secrets?.required ?? []).filter((name) => {
    const candidates = aliases[name] ?? [name];
    return !candidates.some((candidate) => env[candidate]);
  });
  if (missing.length) throw new CoordinatorError('Required live secrets are missing', { missing });
  const hold = config.production?.stagedDeployment?.hold;
  const holdRequired = hold?.required === true || config.releaseGate?.failClosedOnMissingHold === true;
  if (holdRequired && (!hold?.required || !hold?.githubStatusContext)) {
    throw new CoordinatorError('Production hold configuration is missing or incomplete');
  }
  if (holdRequired && hold?.provider !== 'vercel-auto-assignment-disabled') {
    throw new CoordinatorError('Production hold must disable Vercel automatic domain assignment');
  }
  if (holdRequired && config.production?.promotion?.mode !== 'explicit-vercel-promote') {
    throw new CoordinatorError('Production promotion must target an explicit Vercel deployment');
  }
  return { ok: true };
}
