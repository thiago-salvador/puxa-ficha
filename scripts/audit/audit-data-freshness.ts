import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  analyzeProfileAdmission,
  comparePublicProfileStatuses,
  reconcilePublicRoster,
  validateActiveProfileCrosswalk,
  type ActiveProfileCrosswalkEntry,
  type OfficialCandidacy,
  type ProfileAdmissionInput,
  type PublicCandidateSummary,
} from "../../src/lib/candidate-publication-integrity";
import {
  compareCandidacies,
  reviewedSubstitutedViceSqs,
  reviewedSubstitutedTitularSqs,
} from "../lib/data-freshness/candidaturas";
import {
  collectCurrentOfficialCandidacies,
  collectCurrentStatusEvidence,
  collectDirectCandidaciesMissingFromCdn,
  type DivulgaCandReceipt,
} from "../lib/data-freshness/divulgacand-current";
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
  downloadOfficialResource,
  loadLocalOfficialResources,
  OfficialSourceError,
  officialRecordsFromVersionedSnapshot,
  parseJulgamentosZip,
  parseOfficialCandidaciesZip,
  parseOfficialFichaRows,
  parseRedesSociaisZip,
  TSE_COMPLEMENTAR_URL,
  TSE_REDES_SOCIAIS_URL,
  type OfficialResource,
} from "../lib/data-freshness/tse-source";
import {
  compareFichasTse,
  situacaoAtualDoDivulgaCand,
  type FichaTseComparison,
  type OfficialFichaRow,
  type PublishedFicha,
} from "../lib/data-freshness/ficha-tse";
import type { CandidacyRecord } from "../lib/data-freshness/types";
import type { LinhaSiteCandidatoTse } from "../lib/candidate-sites-tse";
import type { JulgamentoTse } from "../lib/tse-situacao-julgamento";
import type { CandidateSitesTseDataset } from "../../src/lib/types";

const ELECTION_ID_2026 = "20322002026";

interface PublishedSnapshot {
  generated_at?: string;
  records: CandidacyRecord[];
  public_profiles?: Array<ProfileAdmissionInput & PublicCandidateSummary>;
  collection_evidence?: SourceEvidence[];
  /** Fichas públicas de Presidente, Governador e Senador com identidade TSE. */
  public_candidacies?: PublishedFicha[];
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
  /** Diretório com catalog.json e ZIPs oficiais já baixados (não é leitura ao vivo). */
  sourceDir: string | null;
  currentOfficialSnapshot: string | null;
  publishedSites: string;
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
      "uso: --published=<snapshot.json> [--official-snapshot=<snapshot.json> | --source-dir=<dir com catalog.json e ZIPs>] [--current-official-snapshot=<snapshot.json>] [--active-profile-crosswalk=<snapshot.json>] [--published-sites=<json>]",
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
    sourceDir: values.get("source-dir")
      ? resolve(values.get("source-dir") as string)
      : null,
    publishedSites: resolve(
      values.get("published-sites") ?? "src/data/candidate-sites-tse-2026.json",
    ),
    currentOfficialSnapshot: values.get("current-official-snapshot")
      ? resolve(values.get("current-official-snapshot") as string)
      : null,
    activeProfileCrosswalk: resolve(
      values.get("active-profile-crosswalk") ??
        "data/candidate-roster-active-20260905.json",
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
 * Substituições explicitamente revisadas nos recibos versionados.
 * situacaoVice 3 prova inaptidão; isoladamente não prova substituição.
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
    for (const sq of reviewedSubstitutedViceSqs(parsed.resolutions ?? [])) sqs.add(sq);
  }
  return [...sqs];
}

interface TitularResolutionsFile {
  metadata?: { election_id?: string };
  resolutions?: Array<{ replaced_titular_sq?: string }>;
}

/**
 * Espelha `readSubstitutedViceSqs` para titulares (issue #340). Substituições
 * explicitamente revisadas nos recibos versionados de
 * `data/tse-titular-substituicoes-*.json`, cada uma com `st_SUBSTITUIDO:
 * true` e `substituto.sqCandidato` do detalhe ao vivo do DivulgaCandContas.
 */
function readSubstitutedTitularSqs(dataDir = resolve(process.cwd(), "data")): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return [];
  }
  const files = entries
    .filter((name) => /^tse-titular-substituicoes-\d{8}\.json$/.test(name))
    .sort();
  const sqs = new Set<string>();
  for (const name of files) {
    const parsed = JSON.parse(
      readFileSync(resolve(dataDir, name), "utf8"),
    ) as TitularResolutionsFile;
    if (parsed.metadata?.election_id && parsed.metadata.election_id !== ELECTION_ID_2026) {
      throw new Error(`${name}: resoluções de titular pertencem a outra eleição`);
    }
    for (const sq of reviewedSubstitutedTitularSqs(parsed.resolutions ?? [])) sqs.add(sq);
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

/** Aviso, não falha: nome civil (NM_CANDIDATO) diferente do banco ou do seed. Só slugs. */
function nomeCivilMarkdown(checks: FichaTseComparison): string {
  const { nome_civil_divergente_banco: banco, nome_civil_divergente_seed: seed } = checks.counts;
  if (banco === 0 && seed === 0) return "- Nome civil igual ao TSE no banco e no seed\n";
  const lista = checks.fichas
    .filter((row) => row.nome_civil?.banco === "divergente" || row.nome_civil?.seed === "divergente")
    .map((row) => `${row.slug} (${[row.nome_civil?.banco === "divergente" ? "banco" : null, row.nome_civil?.seed === "divergente" ? "seed" : null].filter(Boolean).join("+")})`)
    .join(", ");
  return `- Aviso: nome civil diferente do TSE em ${banco} ficha(s) no banco e ${seed} no seed; valores oficiais em diff.json (ficha_checks). ${lista}\n`;
}

function fichaChecksMarkdown(checks: FichaTseComparison | null): string {
  if (!checks) return "";
  const { counts } = checks;
  const blocking = checks.fichas.filter((row) => row.blocking.length > 0);
  const rows = blocking
    .map((row) => `| ${row.slug} | ${row.cargo ?? "?"} | ${row.uf ?? "?"} | ${row.blocking.join(", ")} |`)
    .join("\n");
  return (
    `\n## Conferência por ficha pública (Presidente, Governador, Senador)\n\n` +
    `- Fichas conferidas: ${counts.fichas} (Presidente ${counts.por_cargo.PRESIDENTE}, Governador ${counts.por_cargo.GOVERNADOR}, Senador ${counts.por_cargo.SENADOR})\n` +
    `- Identidade sem registro oficial por SQ+cargo+UF: ${counts.identidade_sem_match}\n` +
    `- Fichas com divergência que exige revisão: ${counts.bloqueantes}\n` +
    `- Fichas só com divergência informativa (sites ou vice): ${counts.com_divergencia_informativa}\n` +
    nomeCivilMarkdown(checks) +
    (blocking.length > 0
      ? `\n| Ficha | Cargo | UF | Checks |\n|---|---|---|---|\n${rows}\n`
      : "")
  );
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
  publicProfileStatusChanges?: ReturnType<typeof comparePublicProfileStatuses>;
  incompleteProfiles?: number;
  fichaChecks?: FichaTseComparison | null;
  sourceError?: string;
}): string {
  const changes = Object.entries(input.changeCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const freshness = Object.entries(input.freshnessCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
  const statusChanges = input.publicProfileStatusChanges ?? [];
  const cell = (value: string | null) => (value ?? "sem informação").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const statusRows = statusChanges.map((row) =>
    `| ${cell(row.slug)} | ${row.sq_candidato} | ${cell(row.published_status)} | ${cell(row.official_status)} | ${row.official_state} | ${row.is_candidato_inapto ?? "não verificado"} | ${row.substituido ?? "não verificado"} |`,
  ).join("\n");
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
        `- Situações de fichas divergentes do TSE: ${statusChanges.length}\n` +
        `- Fichas abaixo do gate de admissão: ${input.incompleteProfiles ?? 0}\n`) +
    (input.sourceError ? `- Erro da fonte: ${input.sourceError}\n` : "") +
    `\n## Diferenças de candidaturas\n\n| Classificação | Total |\n|---|---:|\n${changes}\n` +
    (statusChanges.length > 0
      ? `\n## Situações publicadas divergentes do TSE\n\n${statusChanges.length} divergência(s) entre fichas publicadas e inscrições oficiais atuais.\n\n| Ficha | SQ candidato | Publicado | TSE | Estado | Inapto | Substituído |\n|---|---|---|---|---|---|---|\n${statusRows}\n`
      : "") +
    ((input.changeCounts.substituted ?? 0) > 0
      ? `\n- \`substituted\` é informativo: vice substituído conforme DivulgaCandContas, com a vice vigente já publicada. Não leva a auditoria a review_required.\n`
      : "") +
    ((input.changeCounts.inactive_vice ?? 0) > 0
      ? `\n- \`inactive_vice\` é informativo: ausência de vice inapto comprovado no detalhe atual do DivulgaCandContas. Não comprova substituição ou aptidão de outra vice.\n`
      : "") +
    fichaChecksMarkdown(input.fichaChecks ?? null) +
    `\n## Atualidade por fonte\n\n| Estado | Total |\n|---|---:|\n${freshness}\n` +
    `\n${recommendationsMarkdown(input.recommendations)}`
  );
}

interface FichaSources {
  rows: OfficialFichaRow[];
  julgamentos: Map<string, JulgamentoTse> | null;
  sites: Map<string, LinhaSiteCandidatoTse[]> | null;
}

function revisionOf(resource: OfficialResource): Record<string, unknown> {
  return {
    status: "ok",
    url: resource.url,
    sha256: resource.sha256,
    checked_at: resource.checked_at,
  };
}

/**
 * Recurso auxiliar (complementar, redes) é lido sem derrubar a rodada: se
 * falhar, a conferência por ficha marca a situação como `ausente` ou os sites
 * como `nao_verificado`, e o recibo por candidato vira `indeterminado`.
 */
async function auxiliaryResource<T>(
  load: () => Promise<OfficialResource | null> | OfficialResource | null,
  parse: (bytes: Uint8Array) => T,
): Promise<{ value: T | null; revision: Record<string, unknown> }> {
  try {
    const resource = await load();
    if (!resource) return { value: null, revision: { status: "not_collected" } };
    return { value: parse(resource.bytes), revision: revisionOf(resource) };
  } catch (error) {
    return {
      value: null,
      revision: {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** nome_completo do seed por slug, para o aviso de nome civil; vazio se o seed não abrir. */
function readSeedNames(path: string): Map<string, string> {
  try {
    const seed = JSON.parse(readFileSync(path, "utf8")) as Array<{ slug?: unknown; nome_completo?: unknown }>;
    return new Map(
      (Array.isArray(seed) ? seed : [])
        .filter((row) => typeof row.slug === "string" && typeof row.nome_completo === "string")
        .map((row) => [row.slug as string, row.nome_completo as string]),
    );
  } catch {
    return new Map();
  }
}

function readPublishedSites(path: string): CandidateSitesTseDataset | null {
  try {
    const dataset = JSON.parse(readFileSync(path, "utf8")) as CandidateSitesTseDataset;
    return dataset.schema_version === 1 ? dataset : null;
  } catch {
    return null;
  }
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
  const divulgacandReceipts: DivulgaCandReceipt[] = [];
  const directReceipts: DivulgaCandReceipt[] = [];
  const statusReceipts: DivulgaCandReceipt[] = [];
  let currentStatusEvidence: CandidacyRecord[] = [];
  let source: Record<string, unknown>;
  let tseEvidence: SourceEvidence = {
    source_id: "tse-current",
    checked_at: null,
  };
  let divulgacandEvidence: SourceEvidence = {
    source_id: "tse-current",
    checked_at: null,
  };
  let fichaSources: FichaSources | null = null;

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
    } else if (options.sourceDir) {
      const local = loadLocalOfficialResources(options.sourceDir);
      official = await parseOfficialCandidaciesZip(local.candidaturas.bytes);
      const complementar = await auxiliaryResource(() => local.complementar, parseJulgamentosZip);
      const redes = await auxiliaryResource(() => local.redes, parseRedesSociaisZip);
      fichaSources = {
        rows: parseOfficialFichaRows(local.candidaturas.bytes),
        julgamentos: complementar.value,
        sites: redes.value,
      };
      source = {
        status: "fresh",
        checked_at: local.candidaturas.checked_at,
        // Arquivos oficiais lidos do disco: prova o conteúdo (SHA do catálogo),
        // não a leitura do dia. O recibo global exige live_official.
        mode: "local_official_zip",
        source_url: local.candidaturas.url,
        source_sha256: local.candidaturas.sha256,
        source_dir: options.sourceDir,
        complementar: complementar.revision,
        rede_social: redes.revision,
        attempts: [],
      };
      tseEvidence = {
        source_id: "tse-current",
        checked_at: local.candidaturas.checked_at,
      };
    } else {
      const downloaded = await downloadOfficialCandidacies();
      official = await parseOfficialCandidaciesZip(downloaded.bytes);
      const complementar = await auxiliaryResource(
        () => downloadOfficialResource(TSE_COMPLEMENTAR_URL),
        parseJulgamentosZip,
      );
      const redes = await auxiliaryResource(
        () => downloadOfficialResource(TSE_REDES_SOCIAIS_URL),
        parseRedesSociaisZip,
      );
      fichaSources = {
        rows: parseOfficialFichaRows(downloaded.bytes),
        julgamentos: complementar.value,
        sites: redes.value,
      };
      source = {
        status: "fresh",
        checked_at: downloaded.checked_at,
        mode: "live_official",
        source_url: downloaded.source_url,
        source_catalog_url: downloaded.source_catalog_url,
        source_sha256: downloaded.source_sha256,
        complementar: complementar.revision,
        rede_social: redes.revision,
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
    } else if (options.sourceDir) {
      // Leitura local não consulta o DivulgaCand: a situação de Gov/Pres cai
      // no pacote complementar e o frescor de tse-current fica sem evidência.
      source.divulgacand = { status: "not_collected", mode: "local_official_zip" };
    } else {
      const current = await collectCurrentOfficialCandidacies(fetch, divulgacandReceipts);
      currentOfficial = current.records;
      const direct = await collectDirectCandidaciesMissingFromCdn(
        official, current.records, current.receipts, directReceipts,
      );
      currentStatusEvidence = await collectCurrentStatusEvidence(
        official, current.records, published.records, current.receipts, statusReceipts,
      );
      source.current_status_evidence = {
        mode: "live_official",
        policy: "published_direct_with_unknown_cdn_status",
        records: currentStatusEvidence,
        receipts: statusReceipts,
      };
      source.direct_candidacies = {
        mode: "live_official",
        policy: "cdn_missing_only",
        records: direct,
        receipts: directReceipts,
      };
      official = [...official, ...direct];
      divulgacandEvidence = {
        source_id: "tse-current",
        checked_at: generatedAt,
      };
      source.divulgacand = {
        status: "fresh",
        mode: "live_official",
        checked_at: generatedAt,
        sources: current.sources,
        receipts: divulgacandReceipts,
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
      divulgacand_receipts: divulgacandReceipts,
      direct_candidacy_receipts: directReceipts,
      current_status_receipts: statusReceipts,
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
    {
      substitutedViceSqs: readSubstitutedViceSqs(),
      substitutedTitularSqs: readSubstitutedTitularSqs(),
      currentOfficial,
      currentStatusEvidence,
    },
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
  const publicProfileStatusChanges = comparePublicProfileStatuses(currentOfficialWithProfiles, publicProfiles);
  const profileAdmission = {
    snapshot_present: Array.isArray(published.public_profiles),
    profiles: publicProfiles.map(analyzeProfileAdmission),
  };
  const incompleteProfiles = profileAdmission.profiles.filter(
    (profile) => !profile.ready,
  );
  const publicSlugs = new Set(publicProfiles.map((profile) => profile.slug));
  const seedNames = readSeedNames(resolve("data/candidatos.json"));
  const fichaChecks: FichaTseComparison | null =
    fichaSources && Array.isArray(published.public_candidacies)
      ? compareFichasTse({
          fichas: published.public_candidacies.map((ficha) => ({
            ...ficha,
            seed_nome_completo: seedNames.get(ficha.slug) ?? null,
          })),
          official: fichaSources.rows,
          julgamentos: fichaSources.julgamentos,
          sitesTse: fichaSources.sites,
          publishedSites: readPublishedSites(options.publishedSites),
          situacaoAtual: currentOfficialWithProfiles.length > 0
            ? situacaoAtualDoDivulgaCand(
                currentOfficialWithProfiles
                  .map((row) => row.profile_slug)
                  .filter((slug) => slug !== null && publicSlugs.has(slug)),
                publicProfileStatusChanges.map((row) => row.slug),
              )
            : undefined,
        })
      : null;
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
    publicProfileStatusChanges.length > 0 ||
    !profileAdmission.snapshot_present ||
    incompleteProfiles.length > 0 ||
    fichaChecks?.status === "review_required" ||
    sourceNeedsReview
      ? "review_required"
      : "ok";
  const recommendations = buildDataFreshnessRecommendations({
    comparison,
    freshness,
    registry,
  });
  if (publicProfileStatusChanges.length > 0) recommendations.push({
    code: "public_profile_status_change", priority: "high",
    title: "Situação publicada diverge do detalhe oficial",
    action: "Reconciliar o julgamento e a aptidão de cada ficha com a evidência oficial atual, preservando a trilha da correção.",
    evidence: publicProfileStatusChanges.map((row) => `${row.slug}: ${row.published_status ?? "sem situação"} -> ${row.official_status ?? "sem situação"}; ${row.official_state}`),
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
    public_profile_status_changes: publicProfileStatusChanges,
    profile_admission: profileAdmission,
    ficha_checks: fichaChecks,
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
      publicProfileStatusChanges,
      fichaChecks,
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
