import { createHash } from "node:crypto";
import {
  classifyOfficialCandidacy,
  selectCurrentVice,
  type OfficialCandidacy,
  type OfficialVice,
} from "../../../src/lib/candidate-publication-integrity";
import { stripAccents } from "../../../src/lib/strip-accents";
import type { CandidacyRecord } from "./types";
import { hasUnknownCdnStatus } from "./candidaturas";

export interface DivulgaCandReceipt {
  url: string;
  checked_at: string;
  http_status: number | null;
  sha256: string | null;
}

type CurrentCandidacy = OfficialCandidacy & { party: string; checked_at: string | null };

export const DIVULGACAND_BASE =
  "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura";
export const ELECTION_ID_2026 = "20322002026";
export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface RawCandidate {
  id?: string | number;
  nomeUrna?: string;
  descricaoSituacao?: string;
  dataUltimaAtualizacao?: string;
  partido?: { sigla?: string };
}

interface RawVice {
  sq_CANDIDATO?: string | number;
  nm_URNA?: string;
  situacaoVice?: number | string;
}

function recordsFromPayload(payload: unknown): RawCandidate[] {
  if (Array.isArray(payload)) return payload as RawCandidate[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { candidatos?: unknown; data?: unknown };
  if (Array.isArray(record.candidatos))
    return record.candidatos as RawCandidate[];
  if (Array.isArray(record.data)) return record.data as RawCandidate[];
  return [];
}

function nonEmpty(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`DivulgaCand sem ${field}`);
  return normalized;
}

export function sanitizeCandidateList(
  payload: unknown,
  office: OfficialCandidacy["office"],
  uf: string | null,
): Array<OfficialCandidacy & { party: string; checked_at: string | null }> {
  return recordsFromPayload(payload).map((row) => ({
    sq_candidato: nonEmpty(row.id, "id da candidatura"),
    profile_slug: null,
    office,
    uf,
    name: nonEmpty(row.nomeUrna, "nome de urna"),
    status: nonEmpty(row.descricaoSituacao, "situação da candidatura"),
    party: nonEmpty(row.partido?.sigla, "partido"),
    checked_at: row.dataUltimaAtualizacao?.trim() || null,
  }));
}

export function sanitizeVices(payload: unknown): OfficialVice[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as { vices?: RawVice[] };
  return (raw.vices ?? []).map((vice) => {
    const status = Number(vice.situacaoVice);
    if (!Number.isInteger(status) || status < 0) {
      throw new Error("DivulgaCand com situação da vice inválida");
    }
    return {
      sq_candidato: nonEmpty(vice.sq_CANDIDATO, "SQ da vice"),
      name: nonEmpty(vice.nm_URNA, "nome de urna da vice"),
      situacao_vice: status,
    };
  });
}

function listUrl(
  office: OfficialCandidacy["office"],
  uf: string | null,
): string {
  const scope = office === "Presidente" ? "BR" : nonEmpty(uf, "UF");
  const officeCode = office === "Presidente" ? "1" : "3";
  return `${DIVULGACAND_BASE}/listar/2026/${scope}/${ELECTION_ID_2026}/${officeCode}/candidatos`;
}

async function fetchJsonWithRetry(
  url: string,
  fetchImpl: FetchLike,
  attempts = 3,
  receipts?: DivulgaCandReceipt[],
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const receipt: DivulgaCandReceipt = {
      url, checked_at: new Date().toISOString(), http_status: null, sha256: null,
    };
    receipts?.push(receipt);
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
          referer: "https://divulgacandcontas.tse.jus.br/divulga/",
          "user-agent": "PuxaFichaDataFreshness/1.0",
        },
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
        cache: "no-store",
      });
      receipt.http_status = response.status;
      const body = await response.text();
      receipt.sha256 = createHash("sha256").update(body).digest("hex");
      if (response.ok) {
        if (body.length > 2_000_000) throw new Error("resposta excede limite");
        return JSON.parse(body) as unknown;
      }
      lastError = new Error(`DivulgaCand HTTP ${response.status}: ${url}`);
      if (![403, 408, 429, 500, 502, 503, 504].includes(response.status)) break;
    } catch {
      // Erros de parse podem incluir trechos privados do corpo da resposta.
      lastError = new Error(`DivulgaCand resposta inválida ou indisponível: ${url}`);
    }
    if (attempt < attempts)
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw lastError ?? new Error(`DivulgaCand sem resposta: ${url}`);
}

export async function collectCurrentOfficialCandidacies(
  fetchImpl: FetchLike = fetch,
  receipts: DivulgaCandReceipt[] = [],
) {
  const records: Array<
    OfficialCandidacy & { party: string; checked_at: string | null }
  > = [];
  const sources: string[] = [];

  for (const uf of BRAZIL_UFS) {
    const url = listUrl("Governador", uf);
    const rows = sanitizeCandidateList(
      await fetchJsonWithRetry(url, fetchImpl, 3, receipts),
      "Governador",
      uf,
    );
    if (rows.length === 0)
      throw new Error(
        `DivulgaCand retornou zero candidatos a Governador em ${uf}`,
      );
    records.push(...rows);
    sources.push(url);
  }

  const presidentUrl = listUrl("Presidente", null);
  const presidents = sanitizeCandidateList(
    await fetchJsonWithRetry(presidentUrl, fetchImpl, 3, receipts),
    "Presidente",
    null,
  );
  if (presidents.length === 0)
    throw new Error("DivulgaCand retornou zero candidatos a Presidente");
  records.push(...presidents);
  sources.push(presidentUrl);

  const seen = new Set<string>();
  const duplicates = records.filter((row) => {
    if (seen.has(row.sq_candidato)) return true;
    seen.add(row.sq_candidato);
    return false;
  });
  if (duplicates.length > 0) {
    throw new Error(
      `DivulgaCand repetiu SQ_CANDIDATO: ${duplicates.map((row) => row.sq_candidato).join(", ")}`,
    );
  }

  return { records, sources, receipts };
}

const normalized = (value: unknown) =>
  stripAccents(String(value ?? "")).replace(/\s+/g, " ").trim().toUpperCase();

interface CandidateDetail extends RawCandidate {
  isCandidatoInapto?: boolean;
  st_SUBSTITUIDO?: boolean;
  ufCandidatura?: string;
  eleicao?: { id?: string | number; ano?: number };
  cargo?: { codigo?: number; nome?: string };
  vices?: Array<RawVice & { sg_PARTIDO?: string }>;
}

/** A ausência no pacote não basta: lista e dois detalhes oficiais devem concordar. */
export async function collectDirectCandidaciesMissingFromCdn(
  cdn: readonly CandidacyRecord[],
  current: readonly CurrentCandidacy[],
  listReceipts: readonly DivulgaCandReceipt[],
  receipts: DivulgaCandReceipt[] = [],
  fetchImpl: FetchLike = fetch,
  now?: Date,
): Promise<CandidacyRecord[]> {
  const seen = new Set<string>();
  for (const row of current) {
    if (seen.has(row.sq_candidato)) throw new Error("DivulgaCand lista com SQ duplicado");
    seen.add(row.sq_candidato);
  }
  const cdnBySq = new Map(cdn.map((row) => [row.sq_candidato, row]));
  const additions = new Map<string, CandidacyRecord>();
  const resolvedViceSqs = new Set<string>();
  const fresh = (receipt: DivulgaCandReceipt) => {
    const age = (now?.getTime() ?? Date.now()) - Date.parse(receipt.checked_at);
    return receipt.http_status === 200 && /^[a-f0-9]{64}$/.test(receipt.sha256 ?? "") &&
      Number.isFinite(age) && age >= -60_000 && age <= 3_600_000;
  };
  async function detail(sq: string, uf: string | null) {
    if (!/^\d+$/.test(sq)) throw new Error("DivulgaCand SQ inválido");
    const url = `${DIVULGACAND_BASE}/buscar/2026/${uf ?? "BR"}/${ELECTION_ID_2026}/candidato/${sq}`;
    const raw = await fetchJsonWithRetry(url, fetchImpl, 3, receipts);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`DivulgaCand detalhe inválido para SQ ${sq}`);
    }
    if (!receipts.some((receipt) => receipt.url === url && fresh(receipt))) {
      throw new Error(`DivulgaCand detalhe sem recibo fresco para SQ ${sq}`);
    }
    return raw as CandidateDetail;
  }
  function validate(raw: CandidateDetail, sq: string, name: string, party: string, uf: string | null, officeCode: number) {
    if (String(raw.id) !== sq || normalized(raw.nomeUrna) !== normalized(name) ||
        !party || normalized(raw.partido?.sigla) !== normalized(party) ||
        normalized(raw.ufCandidatura) !== (uf ?? "BR") ||
        String(raw.eleicao?.id) !== ELECTION_ID_2026 || raw.eleicao?.ano !== 2026 ||
        raw.cargo?.codigo !== officeCode ||
        raw.isCandidatoInapto !== false || raw.st_SUBSTITUIDO !== false ||
        classifyOfficialCandidacy({ status: raw.descricaoSituacao ?? null }) !== "active") {
      throw new Error(`DivulgaCand detalhe divergente ou não ativo para SQ ${sq}`);
    }
  }
  function add(raw: CandidateDetail, sq: string, uf: string | null, cargo: CandidacyRecord["cargo"]) {
    if (additions.has(sq)) throw new Error(`DivulgaCand detalhe compartilha SQ ${sq} entre chapas`);
    if (cdnBySq.has(sq)) return; // Nunca substituir qualquer campo existente no CDN.
    additions.set(sq, {
      sq_candidato: sq, uf, cargo, sq_coligacao: "",
      nome_urna: nonEmpty(raw.nomeUrna, "nome de urna"),
      partido_sigla: nonEmpty(raw.partido?.sigla, "partido"),
      situacao_codigo: null,
      situacao_descricao: nonEmpty(raw.descricaoSituacao, "situação"),
      perfil_slug: null, source_origin: "divulgacand_current",
    });
  }
  for (const row of current) {
    if (cdnBySq.has(row.sq_candidato)) continue;
    // Terminal e desconhecido continuam na reconciliação, sem ganhar admissão.
    if (classifyOfficialCandidacy(row) !== "active") continue;
    if (!listReceipts.some((receipt) => receipt.url === listUrl(row.office, row.uf) && fresh(receipt))) {
      throw new Error(`DivulgaCand lista sem recibo fresco para SQ ${row.sq_candidato}`);
    }
    const raw = await detail(row.sq_candidato, row.uf);
    const governor = row.office === "Governador";
    validate(raw, row.sq_candidato, row.name, row.party, row.uf, governor ? 3 : 1);
    if (normalized(raw.descricaoSituacao) !== normalized(row.status)) {
      throw new Error(`DivulgaCand situação diverge entre lista e detalhe para SQ ${row.sq_candidato}`);
    }
    const vices = sanitizeVices(raw);
    if (new Set(vices.map((vice) => vice.sq_candidato)).size !== vices.length ||
        vices.some((vice) => ![1, 3].includes(vice.situacao_vice))) {
      throw new Error(`DivulgaCand vices duplicadas ou situação desconhecida para SQ ${row.sq_candidato}`);
    }
    const selected = selectCurrentVice(row.sq_candidato, vices);
    if (selected.status !== "resolved") throw new Error(`DivulgaCand vice não resolvida para SQ ${row.sq_candidato}`);
    const vice = selected.vice;
    if (resolvedViceSqs.has(vice.sq_candidato)) {
      throw new Error(`DivulgaCand vice compartilha SQ ${vice.sq_candidato} entre chapas`);
    }
    resolvedViceSqs.add(vice.sq_candidato);
    const viceParty = raw.vices?.find((entry) => String(entry.sq_CANDIDATO) === vice.sq_candidato)?.sg_PARTIDO ?? "";
    const viceDetail = await detail(vice.sq_candidato, row.uf);
    validate(viceDetail, vice.sq_candidato, vice.name, viceParty, row.uf, governor ? 4 : 2);
    const cdnVice = cdnBySq.get(vice.sq_candidato);
    if (cdnVice && (normalized(cdnVice.nome_urna) !== normalized(viceDetail.nomeUrna) ||
        normalized(cdnVice.partido_sigla) !== normalized(viceDetail.partido?.sigla) ||
        cdnVice.uf !== row.uf || cdnVice.cargo !== (governor ? "VICE GOVERNADOR" : "VICE PRESIDENTE") ||
        normalized(cdnVice.situacao_descricao) !== normalized(viceDetail.descricaoSituacao))) {
      throw new Error(`DivulgaCand vice diverge do CDN para SQ ${vice.sq_candidato}`);
    }
    add(raw, row.sq_candidato, row.uf, governor ? "GOVERNADOR" : "PRESIDENTE");
    add(viceDetail, vice.sq_candidato, row.uf, governor ? "VICE GOVERNADOR" : "VICE PRESIDENTE");
  }
  return [...additions.values()];
}

/** Revalida somente a transição de perfil direto para CSV ainda sem situação. */
export async function collectCurrentStatusEvidence(
  cdn: readonly CandidacyRecord[],
  current: readonly CurrentCandidacy[],
  published: readonly CandidacyRecord[],
  listReceipts: readonly DivulgaCandReceipt[],
  receipts: DivulgaCandReceipt[] = [],
  fetchImpl: FetchLike = fetch,
): Promise<CandidacyRecord[]> {
  const cdnBySq = new Map(cdn.map((row) => [row.sq_candidato, row]));
  const needed = new Set(published.filter((row) => {
    const official = cdnBySq.get(row.sq_candidato);
    return !row.situacao_codigo && !hasUnknownCdnStatus(row) && official && hasUnknownCdnStatus(official);
  }).map((row) => row.sq_candidato));
  if (needed.size === 0) return [];
  // O coletor já exige lista fresca, detalhe titular/vice, flags, eleição e vigência.
  // As linhas retornadas são evidências separadas; nunca substituem campos do CDN.
  const evidence = await collectDirectCandidaciesMissingFromCdn(
    cdn.filter((row) => !needed.has(row.sq_candidato)),
    current.filter((row) => needed.has(row.sq_candidato)),
    listReceipts, receipts, fetchImpl,
  );
  for (const row of evidence) {
    const official = cdnBySq.get(row.sq_candidato);
    if (official && (normalized(official.nome_urna) !== normalized(row.nome_urna) ||
        normalized(official.partido_sigla) !== normalized(row.partido_sigla) ||
        official.cargo !== row.cargo || official.uf !== row.uf)) {
      throw new Error(`DivulgaCand evidência de situação diverge da identidade CDN para SQ ${row.sq_candidato}`);
    }
  }
  return evidence;
}

export async function collectCandidateVices(
  sqCandidato: string,
  uf: string | null,
  fetchImpl: FetchLike = fetch,
) {
  const scope = uf ?? "BR";
  const url = `${DIVULGACAND_BASE}/buscar/2026/${scope}/${ELECTION_ID_2026}/candidato/${sqCandidato}`;
  return {
    vices: sanitizeVices(await fetchJsonWithRetry(url, fetchImpl)),
    source: url,
  };
}
