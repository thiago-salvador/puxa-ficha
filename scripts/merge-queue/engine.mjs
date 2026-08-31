export const DEFAULT_LABELS = Object.freeze({
  active: 'active',
  preMerge: 'pre-merge',
  postMerge: 'post-merge',
  rollback: 'rollback',
  blocked: 'blocked',
  rollbackPr: 'rollback-pr',
});

export class CoordinatorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CoordinatorError';
    this.code = 'COORDINATOR_STATE_INVALID';
    this.details = details;
  }
}

const SUCCESS = new Set(['success', 'successful', 'succeeded', 'green', 'passed', 'pass', 'ready', 'promoted']);
const PENDING = new Set(['pending', 'queued', 'in_progress', 'in-progress', 'requested', 'waiting', 'expected', 'unknown', '']);
const FAILURE = new Set([
  'failure', 'failed', 'error', 'cancelled', 'canceled', 'timed_out', 'timed-out',
  'action_required', 'startup_failure', 'stale', 'neutral', 'skipped', 'inactive',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function statusOf(record) {
  if (!record) return 'missing';
  const raw = lower(record.conclusion ?? record.status ?? record.state ?? record.result);
  if (SUCCESS.has(raw)) return 'success';
  if (FAILURE.has(raw)) return 'failure';
  if (PENDING.has(raw)) return 'pending';
  return 'failure';
}

function checkName(check) {
  return String(check?.name ?? check?.context ?? check?.checkName ?? '');
}

function checkSha(check) {
  return check?.sha ?? check?.headSha ?? check?.commitSha ?? null;
}

function requiredNames(section) {
  const configured = Array.isArray(section) ? section : section?.required;
  return asArray(configured).map((item) => String(typeof item === 'string' ? item : item?.name)).filter(Boolean);
}

function sectionForRisk(section, risk) {
  if (!risk.required) return section;
  return {
    ...section,
    required: [...requiredNames(section), ...asArray(section?.conditionalRequired)].filter((name, index, all) => all.indexOf(name) === index),
  };
}

export function normalizeConfig(input = {}) {
  const labels = { ...DEFAULT_LABELS, ...(input.labels ?? {}) };
  const production = input.production ?? {};
  return {
    ...input,
    version: input.version ?? 1,
    enabled: input.enabled !== false,
    defaultBranch: input.defaultBranch ?? 'main',
    labels,
    queue: {
      orderBy: ['createdAt', 'number'],
      requireUpToDate: true,
      ...(input.queue ?? {}),
    },
    checks: {
      preMerge: { required: [], includeAllPresent: true, ...(input.checks?.preMerge ?? {}) },
      postMerge: { required: [], includeAllPresent: true, ...(input.checks?.postMerge ?? {}) },
      rollback: { required: [], includeAllPresent: true, ...(input.checks?.rollback ?? {}) },
    },
    production: {
      environment: 'Production',
      stagedDeployment: { required: true, ...(production.stagedDeployment ?? {}) },
      stagedChecks: { required: true, ...(production.stagedChecks ?? production.smokes ?? {}) },
      smokes: { required: true, checks: [], ...(production.smokes ?? {}) },
      promotion: { required: true, ...(production.promotion ?? {}) },
      publicReadback: { required: true, ...(production.publicReadback ?? {}) },
      ...production,
    },
    irreversibleChanges: {
      pathPatterns: ['supabase/migrations/**', 'migrations/**'],
      requireValidatedManifest: true,
      ...(input.irreversibleChanges ?? {}),
    },
  };
}

function labelsOf(pr) {
  return new Set(asArray(pr.labels).map((label) => typeof label === 'string' ? label : label?.name).filter(Boolean));
}

function phaseOf(pr, config) {
  const labels = labelsOf(pr);
  const phaseEntries = [
    ['pre-merge', config.labels.preMerge],
    ['post-merge', config.labels.postMerge],
    ['rollback', config.labels.rollback],
    ['blocked', config.labels.blocked],
  ].filter(([, label]) => labels.has(label));
  if (phaseEntries.length > 1) {
    throw new CoordinatorError(`PR #${pr.number} has contradictory queue phases`, {
      pr: pr.number,
      phases: phaseEntries.map(([phase]) => phase),
    });
  }
  return phaseEntries[0]?.[0] ?? null;
}

function isOpen(pr) {
  return ['open', 'opened'].includes(lower(pr.state ?? 'open'));
}

function compareQueue(a, b) {
  const timeA = Date.parse(a.createdAt ?? '') || Number.MAX_SAFE_INTEGER;
  const timeB = Date.parse(b.createdAt ?? '') || Number.MAX_SAFE_INTEGER;
  return timeA - timeB || Number(a.number) - Number(b.number);
}

export function validateQueueState(configInput, snapshot) {
  const config = normalizeConfig(configInput);
  if (!snapshot || !Array.isArray(snapshot.prs)) {
    throw new CoordinatorError('Snapshot must contain a prs array');
  }
  const queuePrs = snapshot.prs.filter((pr) => !labelsOf(pr).has(config.labels.rollbackPr));
  const active = queuePrs.filter((pr) => labelsOf(pr).has(config.labels.active));
  if (active.length > 1) {
    throw new CoordinatorError('More than one PR owns the serial queue lock', {
      activePrs: active.map((pr) => pr.number),
    });
  }
  for (const pr of snapshot.prs) {
    phaseOf(pr, config);
    if (labelsOf(pr).has(config.labels.active) && labelsOf(pr).has(config.labels.rollbackPr)) {
      throw new CoordinatorError(`Rollback PR #${pr.number} cannot own the original PR lock`, { pr: pr.number });
    }
  }
  return { config, active: active[0] ?? null, queuePrs };
}

function inspectChecks(checksInput, expectedSha, section) {
  const checks = asArray(checksInput);
  const required = requiredNames(section);
  const current = checks.filter((check) => checkSha(check) === expectedSha);
  const stale = checks.filter((check) => checkSha(check) && checkSha(check) !== expectedSha);
  const failures = current.filter((check) => statusOf(check) === 'failure');
  const pending = current.filter((check) => statusOf(check) === 'pending');
  const missing = required.filter((name) => !current.some((check) => checkName(check) === name));
  const staleRequired = missing.filter((name) => stale.some((check) => checkName(check) === name));
  const trulyMissing = missing.filter((name) => !staleRequired.includes(name));
  const staleOnlyPresent = section?.includeAllPresent !== false
    ? stale.filter((old) => !current.some((now) => checkName(now) === checkName(old)))
    : [];

  if (failures.length) {
    return { state: 'failure', reason: 'check-failed', checks: failures.map(checkName) };
  }
  if (pending.length) {
    return { state: 'pending', reason: 'check-pending', checks: pending.map(checkName) };
  }
  if (staleRequired.length || staleOnlyPresent.length) {
    return {
      state: 'pending',
      reason: 'check-sha-stale',
      checks: [...new Set([...staleRequired, ...staleOnlyPresent.map(checkName)])],
    };
  }
  if (trulyMissing.length || (required.length === 0 && current.length === 0)) {
    return { state: 'failure', reason: 'check-missing', checks: trulyMissing };
  }
  if (section?.includeAllPresent !== false && current.some((check) => statusOf(check) !== 'success')) {
    return { state: 'failure', reason: 'check-not-green' };
  }
  return { state: 'success', reason: 'all-checks-green', count: current.length };
}

function matchGlob(path, pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

function containsSqlPayload(value, parentKey = '') {
  if (value == null) return false;
  if (['sql', 'query', 'statement'].includes(lower(parentKey))) return true;
  if (Array.isArray(value)) return value.some((item) => containsSqlPayload(item));
  if (typeof value === 'object') return Object.entries(value).some(([key, item]) => containsSqlPayload(item, key));
  return false;
}

export function validateReversibility(pr, configInput) {
  const config = normalizeConfig(configInput);
  const files = asArray(pr.files).map((file) => typeof file === 'string' ? file : file?.path ?? file?.filename).filter(Boolean);
  const patterns = asArray(config.irreversibleChanges.pathPatterns);
  const migration = files.some((path) => patterns.some((pattern) => matchGlob(path, pattern)));
  const external = Boolean(pr.externalEffect ?? pr.changeRisk?.externalEffect ?? pr.changeRisk?.irreversible);
  if (!migration && !external) return { required: false, valid: true, migration: false, external: false };
  const manifest = pr.reversibilityManifest ?? pr.changeRisk?.manifest;
  if (config.irreversibleChanges.requireValidatedManifest === false) {
    return { required: true, valid: true, migration, external };
  }
  const rollback = manifest?.rollback;
  const verification = manifest?.verification;
  if (config.irreversibleChanges.requireNamedRemoteWriteApproval === true) {
    return {
      required: true,
      valid: false,
      migration,
      external,
      reason: 'named-remote-write-approval-required',
    };
  }
  const allowedKinds = migration
    ? new Set(['compensating-migration', 'manual-compensation'])
    : new Set(['revert-pr', 'compensating-change', 'manual-compensation']);
  const valid = Boolean(
    manifest && manifest.version && manifest.reversible === true && rollback &&
    allowedKinds.has(rollback.kind ?? rollback.type) &&
    (rollback.artifact || rollback.reference || asArray(rollback.steps).length) &&
    verification && asArray(verification.checks).length &&
    !containsSqlPayload(manifest)
  );
  return {
    required: true,
    valid,
    migration,
    external,
    reason: valid ? 'reversible-manifest-valid' : 'reversible-manifest-invalid',
  };
}

function branchState(pr, config) {
  const sync = lower(pr.sync ?? pr.mergeStateStatus ?? pr.branchState);
  const upToDate = pr.upToDate === true || ['up_to_date', 'up-to-date', 'clean', 'has_hooks'].includes(sync);
  if (config.queue.requireUpToDate && !upToDate) {
    return ['unknown', 'unstable', 'checking', ''].includes(sync)
      ? { state: 'pending', reason: 'branch-state-pending' }
      : { state: 'failure', reason: 'branch-not-up-to-date' };
  }
  const mergeability = lower(pr.mergeable);
  if (pr.mergeable === false || ['conflicting', 'conflict', 'dirty', 'blocked'].includes(mergeability)) {
    return { state: 'failure', reason: 'pr-not-mergeable' };
  }
  if (pr.mergeable !== true && !['mergeable', 'clean'].includes(mergeability)) {
    return { state: 'pending', reason: 'mergeability-pending' };
  }
  return { state: 'success', reason: 'branch-ready' };
}

function phaseMutations(pr, nextPhase, config, { acquire = false, release = false } = {}) {
  const remove = [config.labels.preMerge, config.labels.postMerge, config.labels.rollback, config.labels.blocked];
  if (release) remove.push(config.labels.active);
  const add = [];
  if (acquire) add.push(config.labels.active);
  if (nextPhase) add.push(config.labels[{ 'pre-merge': 'preMerge', 'post-merge': 'postMerge', rollback: 'rollback', blocked: 'blocked' }[nextPhase]]);
  return [{ type: 'SET_LABELS', pr: pr.number, add, remove: remove.filter((label) => !add.includes(label)) }];
}

function decision(decisionName, owner, queue, reason, mutations = [], evidence = {}) {
  return {
    ok: true,
    decision: decisionName,
    owner: owner?.number ?? null,
    ownerHeadSha: owner?.headSha ?? null,
    reason,
    queue: queue.map((pr) => ({
      number: pr.number,
      disposition: pr.number === owner?.number ? decisionName : 'WAIT',
    })),
    mutations,
    evidence,
  };
}

function preMergeDecision(pr, config, snapshot, queue, acquire) {
  if (pr.draft && config.queue.excludeDrafts !== false) {
    return decision('BLOCK', pr, queue, 'active-pr-is-draft', [
      ...phaseMutations(pr, 'blocked', config, { acquire }),
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: 'active-pr-is-draft' },
    ]);
  }
  if (pr.queueContext?.recovered === true && pr.headSha === pr.queueContext.failedHeadSha) {
    return decision('BLOCK', pr, queue, 'failed-pr-awaiting-new-head', phaseMutations(pr, 'blocked', config, { acquire }), {
      failedHeadSha: pr.queueContext.failedHeadSha,
    });
  }
  const risk = validateReversibility(pr, config);
  if (!risk.valid) {
    return decision('BLOCK', pr, queue, risk.reason, [
      ...phaseMutations(pr, 'blocked', config, { acquire }),
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: risk.reason },
    ], { risk });
  }
  const branch = branchState(pr, config);
  if (branch.state === 'failure') {
    return decision('BLOCK', pr, queue, branch.reason, [
      ...phaseMutations(pr, 'blocked', config, { acquire }),
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: branch.reason },
    ], { branch, risk });
  }
  if (branch.state === 'pending') {
    return decision('WAIT', pr, queue, branch.reason, phaseMutations(pr, 'pre-merge', config, { acquire }), { branch, risk });
  }
  const checks = inspectChecks(pr.checks, pr.headSha, sectionForRisk(config.checks.preMerge, risk));
  if (checks.state === 'failure') {
    return decision('BLOCK', pr, queue, checks.reason, [
      ...phaseMutations(pr, 'blocked', config, { acquire }),
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: checks.reason, checks: checks.checks ?? [] },
    ], { checks, risk });
  }
  if (checks.state === 'pending') {
    return decision('WAIT', pr, queue, checks.reason, phaseMutations(pr, 'pre-merge', config, { acquire }), { checks, risk });
  }
  const previousMainSha = snapshot.main?.sha ?? snapshot.defaultBranchSha ?? null;
  const previousDeployment = snapshot.production?.currentDeployment ?? snapshot.production?.deployment ?? null;
  const previousDeploymentId = previousDeployment?.id ?? null;
  const previousDeploymentSha = previousDeployment?.sha ?? null;
  const previousDeploymentUrl = previousDeployment?.url ?? null;
  const previousDeploymentValid = Boolean(
    previousDeploymentId && previousDeploymentSha === previousMainSha &&
    statusOf(previousDeployment) === 'success' && previousDeploymentUrl,
  );
  if (config.production.rollback?.requirePreviousReadyDeployment === true && !previousDeploymentValid) {
    return decision('BLOCK', pr, queue, 'previous-production-deployment-missing', [
      ...phaseMutations(pr, 'blocked', config, { acquire }),
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: 'previous-production-deployment-missing' },
    ], { checks, branch, risk, previousMainSha, previousDeploymentId, previousDeploymentSha, previousDeploymentUrl });
  }
  return decision('MERGE', pr, queue, 'pre-merge-gates-green', [
    ...phaseMutations(pr, 'pre-merge', config, { acquire }),
    {
      type: 'MERGE_PR', pr: pr.number, expectedHeadSha: pr.headSha,
      capture: { previousMainSha, previousDeploymentId, previousDeploymentSha, previousDeploymentUrl },
    },
  ], { checks, branch, risk, previousMainSha, previousDeploymentId, previousDeploymentSha, previousDeploymentUrl });
}

function inspectSignal(record, expectedSha, required = true) {
  if (!required) return { state: 'success', reason: 'not-required' };
  if (!record) return { state: 'pending', reason: 'missing' };
  const sha = record.sha ?? record.commitSha ?? record.meta?.sha;
  if (!sha || sha !== expectedSha) return { state: 'pending', reason: 'sha-mismatch', observedSha: sha ?? null };
  return { state: statusOf(record), reason: statusOf(record) === 'success' ? 'green' : statusOf(record) };
}

function productionSignals(snapshot, config, expectedSha) {
  const prod = snapshot.production ?? {};
  const stagedCheckRecord = prod.stagedChecks ?? prod.smokes ?? prod.smoke;
  return {
    stagedDeployment: inspectSignal(prod.stagedDeployment ?? prod.deployment, expectedSha, config.production.stagedDeployment?.required !== false),
    stagedChecks: inspectSignal(stagedCheckRecord, expectedSha, config.production.stagedChecks?.required !== false),
    promotion: inspectSignal(prod.promotion, expectedSha, config.production.promotion?.required !== false),
    publicReadback: inspectSignal(prod.publicReadback ?? prod.readback, expectedSha, config.production.publicReadback?.required !== false),
  };
}

function lockedIncident(pr, queue, reason, mergeSha, evidence, severity = 'failure') {
  return decision(severity === 'critical' ? 'INCIDENT_CRITICAL' : 'INCIDENT', pr, queue, reason, [
    { type: 'SET_RELEASE_GATE_FAILED', pr: pr.number, mergeSha, reason },
    { type: 'NOTIFY', pr: pr.number, severity, reason, phase: 'post-merge', sha: mergeSha },
  ], evidence);
}

function rollbackTarget(pr, snapshot) {
  const context = pr.queueContext ?? snapshot.queueContext ?? {};
  const previous = snapshot.production?.previousDeployment ?? {};
  return {
    previousMainSha: context.previousMainSha ?? context.previousDeploymentSha ?? previous.sha ?? null,
    previousDeploymentId: context.previousDeploymentId ?? previous.id ?? null,
  };
}

function deploymentRollbackDecision(pr, snapshot, queue, mergeSha, evidence, reason) {
  const target = rollbackTarget(pr, snapshot);
  if (!target.previousMainSha || !target.previousDeploymentId) {
    return lockedIncident(pr, queue, 'rollback-target-missing', mergeSha, { ...evidence, target }, 'critical');
  }
  return decision('ROLLBACK_DEPLOYMENT', pr, queue, reason, [
    { type: 'SET_RELEASE_GATE_FAILED', pr: pr.number, mergeSha, reason },
    {
      type: 'INSTANT_ROLLBACK',
      pr: pr.number,
      failedMergeSha: mergeSha,
      previousMainSha: target.previousMainSha,
      previousDeploymentId: target.previousDeploymentId,
    },
    { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason, phase: 'post-merge', sha: mergeSha },
  ], { ...evidence, target });
}

function postMergeDecision(pr, config, snapshot, queue) {
  const mergeSha = pr.mergeSha ?? snapshot.mergeSha ?? snapshot.main?.sha;
  if (!mergeSha) return decision('VERIFY_STAGE', pr, queue, 'merge-sha-missing', [], {});
  if (snapshot.main?.sha && snapshot.main.sha !== mergeSha) {
    return decision('VERIFY_STAGE', pr, queue, 'main-sha-does-not-match-merge', [], { mergeSha, mainSha: snapshot.main.sha });
  }
  const checks = inspectChecks(pr.postMergeChecks ?? snapshot.main?.checks, mergeSha, config.checks.postMerge);
  const signals = productionSignals(snapshot, config, mergeSha);
  const rollbackRecord = snapshot.production?.rollback;
  if (rollbackRecord) {
    const expectedRollbackSha = rollbackTarget(pr, snapshot).previousMainSha ?? rollbackRecord.sha;
    const rollback = inspectSignal(rollbackRecord, expectedRollbackSha, true);
    const rollbackEvidence = { checks, signals, rollback, mergeSha };
    if (rollback.state === 'failure') {
      return lockedIncident(pr, queue, 'deployment-rollback-failed', mergeSha, rollbackEvidence, 'critical');
    }
    if (rollback.state === 'pending') {
      return decision('VERIFY_ROLLBACK', pr, queue, rollback.reason, [], rollbackEvidence);
    }
    return lockedIncident(pr, queue, 'previous-deployment-restored', mergeSha, rollbackEvidence, 'recovered');
  }

  const stageFailures = [
    checks.state === 'failure' ? checks.reason : null,
    signals.stagedDeployment.state === 'failure' ? 'stagedDeployment-failed' : null,
    signals.stagedChecks.state === 'failure' ? 'stagedChecks-failed' : null,
  ].filter(Boolean);
  const evidence = { checks, signals, mergeSha };

  if (signals.promotion.state === 'success') {
    if (signals.publicReadback.state === 'failure') {
      return deploymentRollbackDecision(pr, snapshot, queue, mergeSha, evidence, 'publicReadback-failed');
    }
    if (stageFailures.length) {
      return deploymentRollbackDecision(pr, snapshot, queue, mergeSha, evidence, stageFailures[0]);
    }
    if (checks.state !== 'success' || signals.stagedDeployment.state !== 'success' || signals.stagedChecks.state !== 'success') {
      return deploymentRollbackDecision(pr, snapshot, queue, mergeSha, evidence, 'stage-evidence-lost-after-promotion');
    }
    if (signals.publicReadback.state !== 'success') {
      return decision('VERIFY_PUBLIC', pr, queue, signals.publicReadback.reason, [], evidence);
    }
    return decision('RELEASE', pr, queue, 'release-gates-green', phaseMutations(pr, null, config, { release: true }), evidence);
  }

  if (signals.promotion.state === 'failure') {
    return lockedIncident(pr, queue, 'promotion-failed', mergeSha, evidence);
  }
  if (stageFailures.length) {
    return lockedIncident(pr, queue, stageFailures[0], mergeSha, evidence);
  }
  if (checks.state !== 'success' || signals.stagedDeployment.state !== 'success' || signals.stagedChecks.state !== 'success') {
    return decision('VERIFY_STAGE', pr, queue, 'stage-evidence-pending', [], evidence);
  }
  return decision('AWAIT_PROMOTION', pr, queue, 'stage-green-awaiting-promotion', [], evidence);
}

function rollbackDecision(pr, config, snapshot, queue) {
  const rollback = pr.rollback ?? snapshot.rollback;
  if (!rollback) {
    return decision('ROLLBACK', pr, queue, 'rollback-pr-missing', [
      { type: 'CREATE_ROLLBACK_PR', pr: pr.number, mergeSha: pr.mergeSha ?? snapshot.mergeSha ?? null },
    ]);
  }
  if (['failure', 'failed', 'cancelled', 'canceled'].includes(lower(rollback.status))) {
    return decision('ROLLBACK', pr, queue, 'rollback-failed', [
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: 'rollback-failed' },
    ], { rollback });
  }
  if (['open', 'opened', 'ready'].includes(lower(rollback.status))) {
    const rollbackChecks = inspectChecks(rollback.checks, rollback.headSha, config.checks.preMerge);
    const rollbackBranch = branchState(rollback, config);
    if (rollbackChecks.state === 'failure' || rollbackBranch.state === 'failure') {
      return decision('ROLLBACK', pr, queue, 'rollback-pr-blocked', [
        { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: 'rollback-pr-blocked', phase: 'rollback', sha: rollback.headSha },
      ], { rollbackChecks, rollbackBranch });
    }
    if (rollbackChecks.state === 'pending' || rollbackBranch.state === 'pending') {
      return decision('WAIT', pr, queue, 'rollback-pr-checks-pending', [], { rollbackChecks, rollbackBranch });
    }
    return decision('ROLLBACK', pr, queue, 'rollback-pr-ready', [{
      type: 'MERGE_ROLLBACK_PR',
      pr: pr.number,
      rollbackPr: rollback.prNumber,
      expectedHeadSha: rollback.headSha,
      expectedBaseSha: snapshot.main?.sha ?? null,
    }], { rollbackChecks, rollbackBranch });
  }
  if (!['merged', 'recovering', 'success', 'completed'].includes(lower(rollback.status))) {
    return decision('WAIT', pr, queue, 'rollback-in-progress', [], { rollback });
  }
  const restoredSha = rollback.mergeSha ?? rollback.restoredSha ?? snapshot.main?.sha;
  const checks = inspectChecks(rollback.checks ?? snapshot.main?.checks, restoredSha, config.checks.rollback);
  const signals = productionSignals(snapshot, config, restoredSha);
  const risk = validateReversibility(pr, config);
  const dbEvidence = rollback.dbReadback ?? snapshot.recovery?.dbReadback ?? snapshot.production?.dbReadback;
  const dbRequired = risk.migration || risk.external;
  const database = inspectSignal(dbEvidence, restoredSha, dbRequired);
  const anyFailure = checks.state === 'failure' || database.state === 'failure' || Object.values(signals).some((state) => state.state === 'failure');
  if (anyFailure) {
    return decision('ROLLBACK', pr, queue, 'recovery-check-failed', [
      { type: 'NOTIFY', pr: pr.number, severity: 'failure', reason: 'recovery-check-failed' },
    ], { checks, signals, database, restoredSha });
  }
  const complete = checks.state === 'success' && database.state === 'success' && Object.values(signals).every((state) => state.state === 'success');
  if (!complete) {
    const readyToPromote = checks.state === 'success' && database.state === 'success'
      && signals.stagedDeployment.state === 'success' && signals.stagedChecks.state === 'success'
      && signals.promotion.state === 'pending';
    const mutations = readyToPromote
      ? [{ type: 'PROMOTE_RECOVERY', pr: pr.number, restoredSha, deploymentId: snapshot.production?.stagedDeployment?.id ?? null }]
      : [];
    return decision('WAIT', pr, queue, readyToPromote ? 'recovery-ready-to-promote' : 'recovery-evidence-pending', mutations, { checks, signals, database, restoredSha });
  }
  return decision('RECOVERED', pr, queue, 'previous-state-restored', [
    ...phaseMutations(pr, 'blocked', config),
    {
      type: 'MARK_RECOVERED',
      pr: pr.number,
      context: {
        ...(pr.queueContext ?? snapshot.queueContext ?? {}),
        recovered: true,
        failedHeadSha: pr.queueContext?.headSha ?? pr.headSha,
        restoredSha,
      },
    },
    { type: 'NOTIFY', pr: pr.number, severity: 'recovered', reason: 'previous-state-restored' },
  ], { checks, signals, database, restoredSha });
}

export function evaluateSnapshot(configInput, snapshot) {
  const { config, active, queuePrs } = validateQueueState(configInput, snapshot);
  if (!config.enabled) return decision('DISABLED', null, [], 'coordinator-disabled');
  const open = queuePrs.filter((pr) => {
    if (!isOpen(pr)) return false;
    if (pr.draft && config.queue.excludeDrafts !== false) return false;
    const excluded = asArray(config.queue.excludeLabels);
    return !excluded.some((label) => labelsOf(pr).has(label));
  }).sort(compareQueue);
  const owner = active ?? open[0] ?? null;
  if (!owner) return decision('IDLE', null, [], 'queue-empty');
  const visibleQueue = active && !open.some((pr) => pr.number === active.number) ? [active, ...open] : open;
  const explicitPhase = phaseOf(owner, config);
  const inferredMergedPhase = Boolean(
    owner.mergedAt && owner.mergeSha && (!explicitPhase || explicitPhase === 'pre-merge'),
  );
  const phase = inferredMergedPhase ? 'post-merge' : (explicitPhase ?? 'pre-merge');
  const acquire = !active;
  if (phase === 'post-merge') return postMergeDecision(owner, config, snapshot, visibleQueue);
  if (phase === 'rollback') return rollbackDecision(owner, config, snapshot, visibleQueue);
  return preMergeDecision(owner, config, snapshot, visibleQueue, acquire);
}

export function referenceDecision(input) {
  const config = normalizeConfig(input.config ?? {});
  return evaluateSnapshot(config, input.snapshot ?? input).decision;
}
