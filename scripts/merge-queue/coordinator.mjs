#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CoordinatorError, evaluateSnapshot, normalizeConfig } from './engine.mjs';
import { createLiveAdapters, HttpError, preflightSecrets, signalFromChecks } from './adapters.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const result = { command, dryRun: false, configPath: null, snapshotPath: null };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--config') result.configPath = rest[++index];
    else if (arg === '--snapshot') result.snapshotPath = rest[++index];
    else throw new CoordinatorError(`Unknown argument: ${arg}`);
  }
  if (command !== 'reconcile') throw new CoordinatorError('Expected command: reconcile');
  if (!result.configPath) throw new CoordinatorError('--config is required');
  return result;
}

async function jsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function productionCheckNames(config) {
  const names = (section) => section?.checks ?? (section?.check ? [section.check] : []);
  return {
    stagedChecks: names(config.production.stagedChecks ?? config.production.smokes),
    readback: names(config.production.publicReadback),
    rollback: names(config.production.rollback),
  };
}

export async function enrichProduction(snapshot, config, vercel) {
  const owner = snapshot.prs.find((pr) => pr.labels?.includes(config.labels.active));
  const rollbackSha = owner?.labels?.includes(config.labels.rollback) ? owner.rollback?.mergeSha : null;
  const sha = rollbackSha ?? owner?.mergeSha ?? snapshot.main?.sha;
  if (!sha) return snapshot;
  const checks = snapshot.main?.checks ?? [];
  const names = productionCheckNames(config);
  const deploymentForSha = vercel.deploymentForSha?.bind(vercel) ?? vercel.productionForSha.bind(vercel);
  const productionDomain = config.production?.url ? new URL(config.production.url).hostname : null;
  const [deployment, currentDeployment] = await Promise.all([
    deploymentForSha(sha, { target: 'production' }),
    productionDomain && vercel.currentProductionForDomain
      ? vercel.currentProductionForDomain(productionDomain).catch(() => null)
      : snapshot.main?.sha ? deploymentForSha(snapshot.main.sha, { target: 'production' }) : Promise.resolve(null),
  ]);
  const promotion = currentDeployment?.sha === sha && currentDeployment?.status === 'success'
    ? { sha, status: 'success' }
    : { sha, status: 'pending' };
  const rollbackCheck = signalFromChecks(checks, sha, names.rollback);
  const previousMainSha = owner?.queueContext?.previousMainSha ?? owner?.queueContext?.previousDeploymentSha ?? null;
  snapshot.production = {
    ...(snapshot.production ?? {}),
    stagedDeployment: deployment,
    currentDeployment,
    stagedChecks: signalFromChecks(checks, sha, names.stagedChecks),
    promotion,
    publicReadback: signalFromChecks(checks, sha, names.readback),
    rollback: rollbackCheck?.status !== 'pending' && previousMainSha
      ? { ...rollbackCheck, sha: previousMainSha }
      : null,
  };
  return snapshot;
}

async function executeMutation(mutation, config, adapters) {
  switch (mutation.type) {
    case 'SET_LABELS':
      return adapters.github.setLabels(mutation.pr, mutation.add, mutation.remove);
    case 'NOTIFY':
      return adapters.github.upsertIncident({
        pr: mutation.pr,
        phase: mutation.phase ?? 'queue',
        sha: mutation.sha ?? null,
        reason: mutation.reason,
        severity: mutation.severity,
        assignee: config.notifications?.assignee,
      });
    case 'UPDATE_BRANCH':
      return adapters.github.updateBranch(mutation.pr, mutation.expectedHeadSha);
    case 'MERGE_PR': {
      await adapters.github.assertMergePreconditions(
        mutation.pr,
        mutation.expectedHeadSha,
        mutation.capture.previousMainSha,
        config,
      );
      await adapters.github.persistContext(mutation.pr, {
        ...mutation.capture,
        headSha: mutation.expectedHeadSha,
        transition: 'merge-started',
      });
      const merged = await adapters.github.merge(mutation.pr, mutation.expectedHeadSha, config.queue.mergeMethod ?? 'squash');
      if (merged.merged !== true || !merged.sha) {
        throw new HttpError('GitHub declined the merge transition', 422, merged);
      }
      const mergeSha = merged.sha;
      await adapters.github.persistContext(mutation.pr, {
        ...mutation.capture,
        mergeSha,
        headSha: mutation.expectedHeadSha,
        transition: 'merged',
      });
      await adapters.github.setLabels(mutation.pr, [config.labels.active, config.labels.postMerge], [config.labels.preMerge, config.labels.blocked]);
      if (config.releaseGate?.required) {
        await adapters.github.setCommitStatus(
          mergeSha,
          config.releaseGate.initialState ?? 'pending',
          config.releaseGate.name ?? 'Serial release gate',
          'Serial queue is validating the staged production release',
        );
      }
      await adapters.github.dispatch('serial-merge-queue-post-merge', {
        pr: mutation.pr,
        mergeSha,
        trustedSha: mutation.capture.previousMainSha,
        previousDeploymentId: mutation.capture.previousDeploymentId,
        previousDeploymentSha: mutation.capture.previousDeploymentSha,
        previousDeploymentUrl: mutation.capture.previousDeploymentUrl,
        git: { sha: mergeSha },
        environment: 'production',
        project: { name: config.production?.projectName ?? 'puxa-ficha' },
      });
      return { mergeSha, merged: merged.merged };
    }
    case 'CREATE_ROLLBACK_PR':
      return adapters.github.createRollbackPr(mutation.pr, config.labels.rollbackPr);
    case 'INSTANT_ROLLBACK':
      {
        const deploymentForSha = adapters.vercel.deploymentForSha?.bind(adapters.vercel) ?? adapters.vercel.productionForSha.bind(adapters.vercel);
        const previous = await deploymentForSha(mutation.previousMainSha, { target: 'production' });
        if (!previous) throw new CoordinatorError('Previous production deployment no longer matches the trusted pre-merge snapshot');
        if (adapters.vercel.assertDeployment) {
          adapters.vercel.assertDeployment(previous, {
            expectedId: mutation.previousDeploymentId,
            expectedSha: mutation.previousMainSha,
            target: 'production',
            requiredState: 'READY',
          });
        } else if (previous.id !== mutation.previousDeploymentId || previous.status !== 'success') {
          throw new CoordinatorError('Previous production deployment no longer matches the trusted pre-merge snapshot');
        }
      return adapters.vercel.instantRollback(mutation.previousDeploymentId);
      }
    case 'PROMOTE_RECOVERY':
      return adapters.vercel.promote(mutation.deploymentId);
    case 'SET_RELEASE_GATE_FAILED':
      return adapters.github.setCommitStatus(
        mutation.mergeSha,
        'failure',
        config.releaseGate?.name ?? 'Serial release gate',
        `Serial release failed: ${mutation.reason}`,
      );
    case 'MARK_RECOVERED':
      return adapters.github.persistContext(mutation.pr, mutation.context);
    case 'MERGE_ROLLBACK_PR': {
      await adapters.github.assertMergePreconditions(
        mutation.rollbackPr,
        mutation.expectedHeadSha,
        mutation.expectedBaseSha,
        config,
        config.labels.rollbackPr,
      );
      await adapters.github.assertOwnerLabels(mutation.pr, [config.labels.active, config.labels.rollback]);
      const merged = await adapters.github.merge(mutation.rollbackPr, mutation.expectedHeadSha, config.queue.mergeMethod ?? 'squash');
      if (merged.merged !== true || !merged.sha) throw new HttpError('GitHub declined rollback PR merge', 422, merged);
      await adapters.github.persistContext(mutation.pr, { rollbackPr: mutation.rollbackPr, rollbackMergeSha: merged.sha });
      await adapters.github.dispatch('serial-merge-queue-recovery', {
        ownerPr: mutation.pr, rollbackPr: mutation.rollbackPr, restoredSha: merged.sha,
      });
      return { rollbackMergeSha: merged.sha };
    }
    default:
      throw new CoordinatorError(`Unsupported mutation type: ${mutation.type}`);
  }
}

export async function reconcile({ config, snapshot, dryRun = false, adapters }) {
  const normalized = normalizeConfig(config);
  if (!normalized.enabled) {
    return {
      ok: true,
      decision: 'DISABLED',
      owner: null,
      ownerHeadSha: null,
      reason: 'coordinator-disabled',
      queue: [],
      mutations: [],
      dryRun,
      writes: [],
    };
  }
  let observed = snapshot;
  let liveAdapters = adapters;
  if (!observed) {
    preflightSecrets(normalized);
    liveAdapters ??= await createLiveAdapters(normalized);
    observed = await liveAdapters.github.snapshot(normalized);
    observed = await enrichProduction(observed, normalized, liveAdapters.vercel);
  }
  const plan = evaluateSnapshot(normalized, observed);
  if (dryRun) return { ...plan, dryRun: true, writes: [] };
  if (!liveAdapters) throw new CoordinatorError('Live adapters are required when dryRun is false');
  const writes = [];
  const recoveryErrors = [];
  try {
    for (const mutation of plan.mutations) {
      try {
        writes.push({ mutation, result: await executeMutation(mutation, normalized, liveAdapters) });
      } catch (error) {
        if (!['ROLLBACK', 'ROLLBACK_DEPLOYMENT'].includes(plan.decision)) throw error;
        recoveryErrors.push(error);
        writes.push({ mutation, error: { name: error.name, message: error.message, status: error.status ?? null } });
      }
    }
    if (recoveryErrors.length) {
      throw new AggregateError(recoveryErrors, 'One or more rollback operations failed');
    }
  } catch (error) {
    if ([405, 409, 422].includes(error?.status) && plan.owner) {
      await liveAdapters.github.setLabels(plan.owner, [normalized.labels.active, normalized.labels.blocked], [normalized.labels.preMerge, normalized.labels.postMerge]);
      await liveAdapters.github.upsertIncident({
        pr: plan.owner,
        phase: 'merge',
        sha: plan.ownerHeadSha,
        reason: 'remote-transition-failed',
        severity: 'failure',
        assignee: normalized.notifications?.assignee,
      });
      return { ...plan, decision: 'BLOCK', reason: 'remote-transition-failed', dryRun: false, writes, remoteError: { status: error.status } };
    }
    throw error;
  }
  return { ...plan, dryRun: false, writes };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const config = await jsonFile(args.configPath);
    const snapshot = args.snapshotPath ? await jsonFile(args.snapshotPath) : null;
    const result = await reconcile({ config, snapshot, dryRun: args.dryRun });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const output = {
      ok: false,
      error: error.code ?? 'COORDINATOR_ERROR',
      message: error.message,
      details: error.details ?? null,
    };
    process.stderr.write(`${JSON.stringify(output)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
