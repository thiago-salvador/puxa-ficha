import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  analyzeProfileAdmission,
  reconcilePublicRoster,
  validateActiveProfileCrosswalk,
  type ActiveProfileCrosswalkEntry,
  type OfficialCandidacy,
  type ProfileAdmissionInput,
  type PublicCandidateSummary,
} from "../../src/lib/candidate-publication-integrity";
import { compareCandidacies } from "../lib/data-freshness/candidaturas";
import { collectCurrentOfficialCandidacies } from "../lib/data-freshness/divulgacand-current";
import {
  aggregateSourceEvidence,
  evaluateSourceFreshness,
  loadFreshnessRegistry,
  type SourceEvidence,
} from "../lib/data-freshness/registry";
import {
  buildDataFreshnessRecommendations,
  recommendationsMarkdown,
  type DataFreshnessRecommendation,
} from "../lib/data-freshness/recommendations";
import {
  downloadOfficialCandidacies,
  OfficialSourceError,
  officialRecordsFromVersionedSnapshot,
  parseOfficialCandidaciesZip,
} from "../lib/data-freshness/tse-source";
import type { CandidacyRecord } from "../lib/data-freshness/types";

const ELECTION_ID_2026 = "20322002026";

interface PublishedSnapshot {
  generated_at?: string;
  records: CandidacyRecord[];
  public_profiles?: Array<ProfileAdmissionInput & PublicCandidateSummary>;
  collection_evidence?: SourceEvidence[];
}

interface ActiveProfileCrosswalkSnapshot {
  metadata: {
    active_registration_count: number;
    active_profile_count: number;
    unresolved_count: number;
  };
  profiles: ActiveProfileCrosswalkEntry[];
}

interface CliOptions {
  published: string;
  officialSnapshot: string | null;
  currentOfficialSnapshot: string | null;
  activeProfileCrosswalk: string;
  out: string;
  now: Date;
  strict: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) values.set(match[1], match[2]);
  }
  const published = values.get("published");
  if (!published) {
    throw new Error(
      "uso: --published=<snapshot.json> [--official-snapshot=<snapshot.json>] [--current-official-snapshot=<snapshot.json>] [--active-profile-crosswalk=<snapshot.json>]",
    );
  }
  const nowValue = values.get("now");
  const now = nowValue ? new Date(nowValue) : new Date();
  if (!Number.isFinite(now.getTime()))
    throw new Error(`--now inválido: ${nowValue}`);
  return {
    published: resolve(published),
    officialSnapshot: values.get("official-snapshot")
      ? resolve(values.get("official-snapshot") as string)
      : null,
    currentOfficialSnapshot: values.get("current-official-snapshot")
      ? resolve(values.get("current-official-snapshot") as string)
      : null,
    activeProfileCrosswalk: resolve(
      values.get("active-profile-crosswalk") ??
        "data/candidate-roster-active-20260829.json",
    ),
    out: resolve(values.get("out") ?? "reports/data-freshness"),
    now,
    strict: args.includes("--strict"),
  };
}

function readActiveProfileCrosswalk(
  path: string,
): ActiveProfileCrosswalkSnapshot {
  const snapshot: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("crosswalk ativo deve ser um objeto JSON");
  }
  const candidate = snapshot as Record<string, unknown>;
  const metadata = candidate.metadata;
  const profiles = candidate.profiles;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !Array.isArray(profiles)) {
    throw new Error("crosswalk ativo não contém metadata e profiles[]");
  }
  const counts = metadata as Record<string, unknown>;
  for (const field of [
    "active_registration_count",
    "active_profile_count",
    "unresolved_count",
  ] as const) {
    if (!Number.isInteger(counts[field]) || (counts[field] as number) < 0) {
      throw new Error(`crosswalk ativo contém metadata.${field} inválido`);
    }
  }
  for (const [index, profile] of profiles.entries()) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new Error(`crosswalk ativo contém profiles[${index}] inválido`);
    }
    const entry = profile as Record<string, unknown>;
    if (typeof entry.profile_slug !== "string" || entry.profile_slug.trim() === "") {
      throw new Error(`crosswalk ativo contém profile_slug inválido em profiles[${index}]`);
    }
    if (
      !Array.isArray(entry.registration_sqs) ||
      !entry.registration_sqs.every((sq) => typeof sq === "string" && sq.trim() !== "")
    ) {
      throw new Error(`crosswalk ativo contém registration_sqs inválido em ${entry.profile_slug}`);
    }
    if (entry.canonical_registration_sq !== null && typeof entry.canonical_registration_sq !== "string") {
      throw new Error(`crosswalk ativo contém canonical_registration_sq inválido em ${entry.profile_slug}`);
    }
    if (entry.publication_status !== "active" && entry.publication_status !== "quarantine_duplicate_active") {
      throw new Error(`crosswalk ativo contém publication_status inválido em ${entry.profile_slug}`);
    }
  }
  const validSnapshot = {
    metadata: counts as unknown as ActiveProfileCrosswalkSnapshot["metadata"],
    profiles: profiles as ActiveProfileCrosswalkEntry[],
  };
  validateActiveProfileCrosswalk(validSnapshot.profiles, {
    activeRegistrationCount: validSnapshot.metadata.active_registration_count,
    activeProfileCount: validSnapshot.metadata.active_profile_count,
    unresolvedCount: validSnapshot.metadata.unresolved_count,
  });
  return validSnapshot;
}

function readPublished(path: string): PublishedSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as
    PublishedSnapshot | CandidacyRecord[];
  const snapshot = Array.isArray(parsed) ? { records: parsed } : parsed;
  if (!Array.isArray(snapshot.records))
    throw new Error("snapshot publicado não contém records[]");
  return snapshot;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

interface ViceResolutionsFile {
  metadata?: { election_id?: string };
  resolutions?: Array<{
    replaced_vice_sq?: string;
    vices?: Array<{ sq_candidato?: string; situacao_vice?: number }>;
  }>;
}

/**
 * SQ das vices que o DivulgaCandContas marca como substituídas (situacaoVice 3).
 * O pacote consolidado do TSE mantém as duas alternativas com a mesma situação,
 * então essa prova só existe nos artefatos versionados data/divulgacand-vices-*.json.
 */
function readSubstitutedViceSqs(dataDir = resolve(process.cwd(), "data")): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return [];
  }
  const files = entries
    .filter((name) => /^divulgacand-vices-\d{8}\.json$/.test(name))
    .sort();
  const sqs = new Set<string>();
  for (const name of files) {
    const parsed = JSON.parse(
      readFileSync(resolve(dataDir, name), "utf8"),
    ) as ViceResolutionsFile;
    if (parsed.metadata?.election_id && parsed.metadata.election_id !== ELECTION_ID_2026) {
      throw new Error(`${name}: resoluções de vice pertencem a outra eleição`);
    }
    for (const resolution of parsed.resolutions ?? []) {
      if (resolution.replaced_vice_sq) sqs.add(resolution.replaced_vice_sq);
      for (const vice of resolution.vices ?? []) {
        if (vice.situacao_vice === 3 && vice.sq_candidato) sqs.add(vice.sq_candidato);
      }
    }
  }
  return [...sqs];
}

function readCurrentOfficial(path: string): {
  records: OfficialCandidacy[];
  checkedAt: string | null;
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as
    | OfficialCandidacy[]
    | { records?: OfficialCandidacy[]; metadata?: { checked_at?: string } };
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records))
    throw new Error("snapshot DivulgaCand não contém records[]");
  return {
    records,
    checkedAt: Array.isArray(parsed) ? null : parsed.metadata?.checked_at ?? null,
  };
}

function oldestEvidence(
  left: SourceEvidence,
  right: SourceEvidence,
): SourceEvidence {
  const values = [left.checked_at, right.checked_at];
  if (values.some((value) => !value)) {
    return { source_id: "tse-current", checked_at: null };
  }
  const invalid = values.find((value) => !Number.isFinite(Date.parse(value!)));
  if (invalid) return { source_id: "tse-current", checked_at: invalid };
  return {
    source_id: "tse-current",
    checked_at: values.sort(
      (a, b) => Date.parse(a!) - Date.parse(b!),
    )[0]!,
  };
}

function attachPublishedProfiles(
  official: readonly OfficialCandidacy[],
  published: readonly CandidacyRecord[],
): OfficialCandidacy[] {
  const slugBySq = new Map(
    published
      .filter((row) => row.sq_candidato && row.perfil_slug)
      .map((row) => [row.sq_candidato, row.perfil_slug] as const),
  );
  return official.map((row) => ({
    ...row,
    profile_slug: row.profile_slug ?? slugBySq.get(row.sq_candidato) ?? null,
  }));
}

function summaryMarkdown(input: {
  generatedAt: string;
  overall: "ok" | "review_required" | "source_error";
  officialCount: number;
  publishedCount: number;
  changeCounts: Record<string, number>;
  freshnessCounts: Record<string, number>;
  recommendations: DataFreshnessRecommendation[];
  activeOfficialProfiles?: number;
  publicProfiles?: number;
  stalePublic?: number;
  missingPublic?: number;
  duplicateMappings?: number;
  incompleteProfiles?: number;
  sourceError?: string;
}): string {
  const changes = Object.entries(input.changeCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const freshness = Object.entries(input.freshnessCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  return (
    `# Auditoria de atualização dos dados\n\n` +
    `- Gerada em: ${input.generatedAt}\n` +
    `- Estado: **${input.overall}**\n` +
    `- Candidaturas oficiais: ${input.officialCount}\n` +
    `- Registros publicados: ${input.publishedCount}\n` +
    (input.activeOfficialProfiles == null
      ? ""
      : `- Identidades oficiais ativas: ${input.activeOfficialProfiles}\n` +
        `- Fichas públicas: ${input.publicProfiles ?? 0}\n` +
        `- Ativos ausentes: ${input.missingPublic ?? 0}\n` +
        `- Publicados terminais ou obsoletos: ${input.stalePublic ?? 0}\n` +
        `- Identidades oficiais duplicadas: ${input.duplicateMappings ?? 0}\n` +
        `- Fichas abaixo do gate de admissão: ${input.incompleteProfiles ?? 0}\n`) +
    (input.sourceError ? `- Erro da fonte: ${input.sourceError}\n` : "") +
    `\n## Diferenças de candidaturas\n\n| Classificação | Total |\n|---|---:|\n${changes}\n` +
    ((input.changeCounts.substituted ?? 0) > 0
      ? `\n- \`substituted\` é informativo: vice substituído conforme DivulgaCandContas, com a vice vigente já publicada. Não leva a auditoria a review_required.\n`
      : "") +
    `\n## Atualidade por fonte\n\n| Estado | Total |\n|---|---:|\n${freshness}\n` +
    `\n${recommendationsMarkdown(input.recommendations)}`
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const generatedAt = options.now.toISOString();
  const published = readPublished(options.published);
  const registry = loadFreshnessRegistry();
  const monitoredRegistry = registry.filter(
    (entry) => entry.refresh_mode !== "disabled",
  );
  let official: CandidacyRecord[] = [];
  let currentOfficial: OfficialCandidacy[] = [];
  let source: Record<string, unknown>;
  let tseEvidence: SourceEvidence = {
    source_id: "tse-current",
    checked_at: null,
  };
  let divulgacandEvidence: SourceEvidence = {
    source_id: "tse-current",
    checked_at: null,
  };

  try {
    if (options.officialSnapshot) {
      const raw = JSON.parse(
        readFileSync(options.officialSnapshot, "utf8"),
      ) as {
        source_url?: string;
        source_catalog_url?: string;
        source_sha256?: string;
        extracted_at?: string;
        metadata?: {
          source_url?: string;
          source_catalog_url?: string;
          source_sha256?: string;
          extracted_at?: string;
        };
      };
      const snapshotMetadata = raw.metadata ?? raw;
      const snapshotCheckedAt = snapshotMetadata.extracted_at ?? null;
      official = officialRecordsFromVersionedSnapshot(options.officialSnapshot);
      source = {
        status: "fresh",
        checked_at: snapshotCheckedAt,
        mode: "versioned_snapshot",
        source_url: snapshotMetadata.source_url ?? null,
        source_catalog_url: snapshotMetadata.source_catalog_url ?? null,
        source_sha256: snapshotMetadata.source_sha256 ?? null,
        snapshot_extracted_at: snapshotCheckedAt,
        attempts: [],
      };
      tseEvidence = { source_id: "tse-current", checked_at: snapshotCheckedAt };
    } else {
      const downloaded = await downloadOfficialCandidacies();
      official = await parseOfficialCandidaciesZip(downloaded.bytes);
      source = {
        status: "fresh",
        checked_at: downloaded.checked_at,
        mode: "live_official",
        source_url: downloaded.source_url,
        source_catalog_url: downloaded.source_catalog_url,
        source_sha256: downloaded.source_sha256,
        attempts: downloaded.attempts,
      };
      tseEvidence = {
        source_id: "tse-current",
        checked_at: downloaded.checked_at,
      };
    }

    if (options.currentOfficialSnapshot) {
      const currentSnapshot = readCurrentOfficial(
        options.currentOfficialSnapshot,
      );
      currentOfficial = currentSnapshot.records;
      divulgacandEvidence = {
        source_id: "tse-current",
        checked_at: currentSnapshot.checkedAt,
      };
      const currentSource = monitoredRegistry.find(
        (entry) => entry.source_id === "tse-current",
      );
      if (!currentSource) throw new Error("registry sem tse-current");
      source.divulgacand = {
        status: evaluateSourceFreshness(
          currentSource,
          divulgacandEvidence,
          options.now,
          { strict: options.strict },
        ).status,
        mode: "versioned_snapshot",
        path: options.currentOfficialSnapshot,
        checked_at: currentSnapshot.checkedAt,
      };
    } else {
      const current = await collectCurrentOfficialCandidacies();
      currentOfficial = current.records;
      divulgacandEvidence = {
        source_id: "tse-current",
        checked_at: generatedAt,
      };
      source.divulgacand = {
        status: "fresh",
        mode: "live_official",
        checked_at: generatedAt,
        sources: current.sources,
      };
    }
    tseEvidence = oldestEvidence(tseEvidence, divulgacandEvidence);
  } catch (error) {
    const attempts = error instanceof OfficialSourceError ? error.attempts : [];
    const message = error instanceof Error ? error.message : String(error);
    source = {
      status: "source_error",
      checked_at: generatedAt,
      error: message,
      attempts,
    };
    tseEvidence = {
      source_id: "tse-current",
      checked_at: null,
      source_error: message,
    };
    const freshness = monitoredRegistry.map((entry) =>
      evaluateSourceFreshness(
        entry,
        entry.source_id === "tse-current"
          ? tseEvidence
          : aggregateSourceEvidence(entry, published.collection_evidence ?? []),
        options.now,
        { strict: options.strict },
      ),
    );
    const freshnessCounts = Object.fromEntries(
      [
        "fresh",
        "stale",
        "source_error",
        "review_required",
        "technical_debt",
      ].map((status) => [
        status,
        freshness.filter((item) => item.status === status).length,
      ]),
    );
    const recommendations = buildDataFreshnessRecommendations({
      comparison: null,
      freshness,
      registry,
    });
    writeJson(resolve(options.out, "source.json"), source);
    writeJson(resolve(options.out, "universe.json"), {
      generated_at: generatedAt,
      official: [],
      published: published.records,
    });
    writeJson(resolve(options.out, "diff.json"), {
      generated_at: generatedAt,
      status: "source_error",
      strict: options.strict,
      error: message,
      candidacies: null,
      freshness,
    });
    writeFileSync(
      resolve(options.out, "summary.md"),
      summaryMarkdown({
        generatedAt,
        overall: "source_error",
        officialCount: 0,
        publishedCount: published.records.length,
        changeCounts: {},
        freshnessCounts,
        recommendations,
        sourceError: message,
      }),
    );
    console.error(`DATA_FRESHNESS_SOURCE_ERROR: ${message}`);
    process.exitCode = 2;
    return;
  }

  const comparison = compareCandidacies(
    official,
    published.records,
    generatedAt,
    { substitutedViceSqs: readSubstitutedViceSqs() },
  );
  const currentOfficialWithProfiles = attachPublishedProfiles(
    currentOfficial,
    published.records,
  );
  const publicProfiles = published.public_profiles ?? [];
  const activeProfileCrosswalk = readActiveProfileCrosswalk(
    options.activeProfileCrosswalk,
  );
  const publicationIntegrity = reconcilePublicRoster(
    currentOfficialWithProfiles,
    publicProfiles.map(({ slug, office, uf }) => ({ slug, office, uf })),
    activeProfileCrosswalk.profiles,
  );
  const profileAdmission = {
    snapshot_present: Array.isArray(published.public_profiles),
    profiles: publicProfiles.map(analyzeProfileAdmission),
  };
  const incompleteProfiles = profileAdmission.profiles.filter(
    (profile) => !profile.ready,
  );
  const freshness = monitoredRegistry.map((entry) =>
    evaluateSourceFreshness(
      entry,
      entry.source_id === "tse-current"
        ? tseEvidence
        : aggregateSourceEvidence(entry, published.collection_evidence ?? []),
      options.now,
      { strict: options.strict },
    ),
  );
  const freshnessCounts = Object.fromEntries(
    ["fresh", "stale", "source_error", "review_required", "technical_debt"].map(
      (status) => [
        status,
        freshness.filter((item) => item.status === status).length,
      ],
    ),
  );
  // technical_debt é dívida manual informativa. Só estados que exigem
  // revisão operacional bloqueiam o status geral, mesmo em strict.
  const sourceNeedsReview = freshness.some(
    (item) =>
      item.status === "source_error" ||
      item.status === "review_required" ||
      item.status === "stale",
  );
  const overall =
    comparison.status === "review_required" ||
    publicationIntegrity.status === "review_required" ||
    !profileAdmission.snapshot_present ||
    incompleteProfiles.length > 0 ||
    sourceNeedsReview
      ? "review_required"
      : "ok";
  const recommendations = buildDataFreshnessRecommendations({
    comparison,
    freshness,
    registry,
  });

  writeJson(resolve(options.out, "source.json"), source);
  writeJson(resolve(options.out, "universe.json"), {
    generated_at: generatedAt,
    official,
    current_official: currentOfficialWithProfiles,
    active_profile_crosswalk: activeProfileCrosswalk,
    published: published.records,
    public_profiles: publicProfiles,
  });
  writeJson(resolve(options.out, "diff.json"), {
    generated_at: generatedAt,
    status: overall,
    strict: options.strict,
    candidacies: comparison,
    publication_integrity: publicationIntegrity,
    profile_admission: profileAdmission,
    freshness,
  });
  writeFileSync(
    resolve(options.out, "summary.md"),
    summaryMarkdown({
      generatedAt,
      overall,
      officialCount: official.length,
      publishedCount: published.records.length,
      changeCounts: comparison.counts,
      freshnessCounts,
      recommendations,
      activeOfficialProfiles: publicationIntegrity.active_official_profiles,
      publicProfiles: publicationIntegrity.published_profiles,
      stalePublic: publicationIntegrity.stale_public.length,
      missingPublic: publicationIntegrity.missing_public.length,
      duplicateMappings: Object.keys(
        publicationIntegrity.duplicate_active_mappings,
      ).length,
      incompleteProfiles: incompleteProfiles.length,
    }),
  );

  if (overall === "review_required") {
    console.error("DATA_FRESHNESS_REVIEW_REQUIRED");
    process.exitCode = 1;
  } else {
    console.log("DATA_FRESHNESS_OK");
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
