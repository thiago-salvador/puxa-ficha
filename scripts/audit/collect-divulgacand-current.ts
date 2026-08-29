import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyOfficialCandidacy,
  selectCurrentVice,
  validateActiveProfileCrosswalk,
} from "../../src/lib/candidate-publication-integrity";
import {
  collectCandidateVices,
  collectCurrentOfficialCandidacies,
  DIVULGACAND_BASE,
  ELECTION_ID_2026,
} from "../lib/data-freshness/divulgacand-current";

interface SnapshotPerson {
  sq_candidato: string;
  perfil_slug: string | null;
}

interface SnapshotSlate {
  identidade_status: "confirmada" | "duplicidade_oficial";
  uf: string | null;
  titular: SnapshotPerson;
}

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((item) => item.startsWith(prefix))
      ?.slice(prefix.length) ?? fallback
  );
}

function optionalArgument(name: string): string | null {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((item) => item.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

export function publishArtifactsAtomically(
  artifacts: Array<{ path: string; content: string }>,
): void {
  const transactionId = randomUUID();
  const staged: Array<{ path: string; temporary: string }> = [];
  try {
    for (const artifact of artifacts) {
      mkdirSync(dirname(artifact.path), { recursive: true });
      const temporary = `${artifact.path}.${transactionId}.tmp`;
      writeFileSync(temporary, artifact.content, { flag: "wx" });
      staged.push({ path: artifact.path, temporary });
    }
  } catch (error) {
    for (const artifact of staged) rmSync(artifact.temporary, { force: true });
    throw error;
  }

  const published: Array<{ path: string; backup: string | null }> = [];
  try {
    for (const artifact of staged) {
      const backup = existsSync(artifact.path)
        ? `${artifact.path}.${transactionId}.bak`
        : null;
      if (backup) renameSync(artifact.path, backup);
      try {
        renameSync(artifact.temporary, artifact.path);
      } catch (error) {
        if (backup) renameSync(backup, artifact.path);
        throw error;
      }
      published.push({ path: artifact.path, backup });
    }
  } catch (error) {
    for (const artifact of published.reverse()) {
      rmSync(artifact.path, { force: true });
      if (artifact.backup) renameSync(artifact.backup, artifact.path);
    }
    for (const artifact of staged) rmSync(artifact.temporary, { force: true });
    throw error;
  }
  for (const artifact of published) {
    if (artifact.backup) rmSync(artifact.backup, { force: true });
  }
}

async function main(): Promise<void> {
  const snapshotPath = resolve(
    argument("snapshot", "data/chapas-2026-tse-20260827.json"),
  );
  const outputPath = resolve(
    argument("out", "output/data-freshness/divulgacand-current.json"),
  );
  const activeOutputArgument = optionalArgument("active-out");
  const activeOutputPath = activeOutputArgument
    ? resolve(activeOutputArgument)
    : null;
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
    chapas: SnapshotSlate[];
  };
  const profileBySq = new Map<string, string>();
  const ambiguous = new Map<string, string | null>();

  for (const slate of snapshot.chapas) {
    if (slate.titular.perfil_slug) {
      profileBySq.set(slate.titular.sq_candidato, slate.titular.perfil_slug);
    }
    if (slate.identidade_status === "duplicidade_oficial") {
      ambiguous.set(slate.titular.sq_candidato, slate.uf);
    }
  }

  const collected = await collectCurrentOfficialCandidacies();
  const records = collected.records.map((row) => ({
    ...row,
    profile_slug: profileBySq.get(row.sq_candidato) ?? null,
    classification: classifyOfficialCandidacy(row),
  }));
  const slates = [];

  for (const [sqCandidato, uf] of ambiguous) {
    const official = records.find((row) => row.sq_candidato === sqCandidato);
    if (!official) continue;
    const collectedVices = await collectCandidateVices(sqCandidato, uf);
    slates.push({
      titular_sq_candidato: sqCandidato,
      titular_profile_slug: official.profile_slug,
      titular_status: official.status,
      uf,
      source: collectedVices.source,
      resolution: selectCurrentVice(sqCandidato, collectedVices.vices),
      vices: collectedVices.vices,
    });
  }

  const active = records.filter((row) => row.classification === "active");
  const terminal = records.filter((row) => row.classification === "terminal");
  const unresolved = records.filter(
    (row) => row.classification === "review_required",
  );
  const activeByProfile = new Map<string, typeof active>();
  for (const row of active) {
    if (!row.profile_slug) {
      throw new Error(`titular ativo sem perfil mapeado: ${row.sq_candidato}`);
    }
    const current = activeByProfile.get(row.profile_slug) ?? [];
    current.push(row);
    activeByProfile.set(row.profile_slug, current);
  }
  const activeProfiles = [...activeByProfile.entries()]
    .map(([profileSlug, rows]) => ({
      profile_slug: profileSlug,
      office: rows[0].office,
      uf: rows[0].uf,
      canonical_registration_sq:
        rows.length === 1 ? rows[0].sq_candidato : null,
      registration_sqs: rows.map((row) => row.sq_candidato).sort(),
      names: [...new Set(rows.map((row) => row.name))].sort(),
      parties: [...new Set(rows.map((row) => row.party))].sort(),
      statuses: [...new Set(rows.map((row) => row.status))].sort(),
      publication_status:
        rows.length === 1
          ? ("active" as const)
          : ("quarantine_duplicate_active" as const),
    }))
    .sort(
      (left, right) =>
        left.office.localeCompare(right.office) ||
        (left.uf ?? "").localeCompare(right.uf ?? "") ||
        left.profile_slug.localeCompare(right.profile_slug),
    );
  const checkedAt = new Date().toISOString();
  const generationId = randomUUID();
  const output = {
    metadata: {
      checked_at: checkedAt,
      generation_id: generationId,
      source: DIVULGACAND_BASE,
      election_id: ELECTION_ID_2026,
      source_urls: collected.sources,
      official_total: records.length,
      active_total: active.length,
      terminal_total: terminal.length,
      unresolved_total: unresolved.length,
      ambiguous_titulars_checked: slates.length,
    },
    records,
    slates,
  };

  const artifacts = [
    { path: outputPath, content: `${JSON.stringify(output, null, 2)}\n` },
  ];
  if (activeOutputPath) {
    const activeCrosswalk = {
      metadata: {
        checked_at: checkedAt,
        generation_id: generationId,
        source: DIVULGACAND_BASE,
        election_id: ELECTION_ID_2026,
        active_registration_count: active.length,
        active_profile_count: activeProfiles.length,
        unresolved_count: unresolved.length,
        source_urls: collected.sources,
      },
      profiles: activeProfiles,
    };
    validateActiveProfileCrosswalk(activeProfiles, {
      activeRegistrationCount: active.length,
      activeProfileCount: activeProfiles.length,
      unresolvedCount: unresolved.length,
    });
    artifacts.push({
      path: activeOutputPath,
      content: `${JSON.stringify(activeCrosswalk, null, 2)}\n`,
    });
  }
  publishArtifactsAtomically(artifacts);
  console.log(
    JSON.stringify(
      {
        output: outputPath,
        active_crosswalk: activeOutputPath,
        official_total: records.length,
        active_total: active.length,
        terminal: terminal.map((row) => ({
          sq_candidato: row.sq_candidato,
          profile_slug: row.profile_slug,
          name: row.name,
          status: row.status,
        })),
        unresolved: unresolved.map((row) => ({
          sq_candidato: row.sq_candidato,
          profile_slug: row.profile_slug,
          name: row.name,
          status: row.status,
        })),
        slate_review_required: slates.filter(
          (slate) => slate.resolution.status !== "resolved",
        ),
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
