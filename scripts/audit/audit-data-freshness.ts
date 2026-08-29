import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  analyzeProfileAdmission,
  reconcilePublicRoster,
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

interface PublishedSnapshot {
  generated_at?: string;
  records: CandidacyRecord[];
  public_profiles?: Array<ProfileAdmissionInput & PublicCandidateSummary>;
  collection_evidence?: SourceEvidence[];
}

interface CliOptions {
  published: string;
  officialSnapshot: string | null;
  currentOfficialSnapshot: string | null;
  out: string;
  now: Date;
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
      "uso: --published=<snapshot.json> [--official-snapshot=<snapshot.json>] [--current-official-snapshot=<snapshot.json>]",
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
    out: resolve(values.get("out") ?? "reports/data-freshness"),
    now,
  };
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

function readCurrentOfficial(path: string): OfficialCandidacy[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as
    OfficialCandidacy[] | { records?: OfficialCandidacy[] };
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records))
    throw new Error("snapshot DivulgaCand não contém records[]");
  return records;
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
      currentOfficial = readCurrentOfficial(options.currentOfficialSnapshot);
      source.divulgacand = {
        status: "fresh",
        mode: "versioned_snapshot",
        path: options.currentOfficialSnapshot,
      };
    } else {
      const current = await collectCurrentOfficialCandidacies();
      currentOfficial = current.records;
      source.divulgacand = {
        status: "fresh",
        mode: "live_official",
        checked_at: generatedAt,
        sources: current.sources,
      };
    }
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
  );
  const currentOfficialWithProfiles = attachPublishedProfiles(
    currentOfficial,
    published.records,
  );
  const publicProfiles = published.public_profiles ?? [];
  const publicationIntegrity = reconcilePublicRoster(
    currentOfficialWithProfiles,
    publicProfiles.map(({ slug, office, uf }) => ({ slug, office, uf })),
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
    published: published.records,
    public_profiles: publicProfiles,
  });
  writeJson(resolve(options.out, "diff.json"), {
    generated_at: generatedAt,
    status: overall,
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
