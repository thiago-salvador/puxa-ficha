import "server-only"

import { getCandidatoSlugStaticParams, projectColetaVerificacaoRow, projectTCUVerificacaoRow, type ColetaVerificacaoRow } from "@/lib/api"
import { getCanonicalPerson } from "@/lib/canonical-person-map"
import { fonteDadosAbertosPatrimonioTse } from "@/lib/evolucao-patrimonial"
import { anosGastosParlamentaresEmRevisao, gastoParlamentarEmRevisao } from "@/lib/gastos-parlamentares-em-revisao"
import {
  estadoValorPatrimonio,
  parseValorPatrimonio,
  patrimonioMaisRecenteSemEscolhaArbitraria,
  variacaoPatrimonialDaFicha,
  type PatrimonioValorEstado,
} from "@/lib/patrimonio-contexto"
import { normalizePatrimonioForDisplay } from "@/lib/person-level-dedupe"
import { casaParlamentarDaFonte, fonteUrlGastoParlamentar, gastoParlamentarExibivel } from "@/lib/public-profile-dto"
import { resolverEstadoSancoes, type EstadoSancoes } from "@/lib/sancoes-verificacao"
import { getCandidateSitesTseBySlug } from "@/lib/candidate-sites-data"
import { getCitableCandidateSites } from "@/lib/candidate-sites-proof"
import { filtrarProcessosJudiciaisContaveis } from "@/lib/processos-justica-candidato"
import { urlFonteJudicialEspecifica, urlPublicaDoProcesso, type FonteProcessoNivel } from "@/lib/djen-consulta-url"
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase"
import { shouldExposeCargo } from "@/lib/senado-feature"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"
import { formatDisplayName } from "@/lib/display-name"
import { loadSenadoRunningMates } from "@/lib/senado-running-mates"
import { verifiedViceStatus } from "@/lib/vice-official-status"
import type { Chapa2026, Patrimonio, TCUVerificacao } from "@/lib/types"

export interface ImprensaFilters {
  cargo: string | null
  uf: string | null
}

export interface ImprensaRow {
  slug: string
  /** Formatado para exibição (title case); ver `nomeOriginal` para citação/exportação. */
  nome: string
  /** Grafia original do TSE (CAIXA ALTA), preservada para "Como citar" e para os exports. */
  nomeOriginal: string
  cargo: string
  uf: string | null
  partido: string | null
  fichaUrl: string
  chapa: {
    estado: "publicado" | "sem_dado" | "indisponivel" | "indeferidos_comprovados" | "indeterminado"
    suplentesEstado: "publicado" | "indeferidos_comprovados" | "indeterminado" | "indisponivel" | "nao_aplicavel"
    /** Formatado para exibição (title case); ver `viceNomeOriginal` para exportação. */
    viceNome: string | null
    /** Grafia original do TSE, preservada para exportação. */
    viceNomeOriginal: string | null
    /** Mesma situação oficial que a ficha mostra ao lado do vice (hoje só "Inapto no TSE"). */
    viceSituacao?: { label: string; source_url: string; checked_at: string } | null
    suplentes: string[]
    fonteUrl: string | null
    fonteSha256: string | null
    snapshotEm: string | null
  }
  sites: {
    estado: "publicado" | "vazio_confirmado" | "sem_dado"
    quantidade: number | null
    fonteUrl: string | null
    fonteSha256: string | null
    coletadoEm: string | null
    ocorrencias: { ordem: number; url: string }[]
  }
  processos: {
    estado: "publicado" | "cobertura_parcial" | "vazio_confirmado" | "indeterminado" | "nao_buscado" | "erro" | "desatualizado" | "sem_dado"
    buscaEstado: "encontrado" | "vazio_confirmado" | "indeterminado" | "nao_buscado" | "erro" | "desatualizado" | "contraditorio"
    quantidade: number | null
    quantidadeOmitida?: number
    /** Linhas públicas com o selo "Fonte em confirmação", a mesma regra da ficha. */
    quantidadeEmConfirmacao?: number
    ocorrencias: {
      numero: string | null
      tipo: string
      tribunal: string
      urlFonte: string
      fonteNivel: FonteProcessoNivel
      dataInicio: string | null
      dataDecisao: string | null
    }[]
  }
  /**
   * Card "Patrimônio" da ficha: declaração mais recente única, com a mesma
   * leitura de valor (zero declarado x valor não informado) e a mesma
   * variação entre as duas últimas declarações comparáveis.
   */
  patrimonio: {
    estado: "publicado" | "valor_nao_informado" | "multiplas_declaracoes" | "sem_dado"
    ano: number | null
    total: number | null
    valorEstado: PatrimonioValorEstado | null
    anoAnterior: number | null
    totalAnterior: number | null
    variacaoPct: number | null
    fonteUrl: string | null
  }
  /** Linhas de cota parlamentar que a ficha exibe, já sem os anos em revisão. */
  gastos: {
    estado: "publicado" | "sem_dado"
    ultimoAno: number | null
    ultimoAnoTotal: number | null
    anosEmRevisao: number[]
    anos: { ano: number; casa: "camara" | "senado" | null; total: number; fonteUrl: string | null }[]
  }
  /** Recibo da consulta TCU como a ficha mostra; sem recibo é "nao_verificado". */
  tcu: {
    estado: TCUVerificacao["estado"] | "nao_verificado"
    registros: number | null
    consultadoEm: string | null
    fonteUrl: string | null
  }
  /** Bloco "Sanções administrativas" (CEIS, CNEP, CEAF) da ficha. */
  sancoes: {
    estado: EstadoSancoes
    quantidade: number | null
    consultadoEm: string | null
    fonteUrl: string | null
  }
}

export interface ImprensaDataset {
  version: "2"
  generatedAt: string
  filters: ImprensaFilters
  availableCargos: string[]
  availableUfs: string[]
  rows: ImprensaRow[]
}

type CandidateRow = {
  id: string
  slug: string
  nome_urna: string | null
  cargo_disputado: string | null
  estado: string | null
  partido_sigla: string | null
}

type ProcessoRow = {
  candidato_id: string
  id?: string
  numero_processo?: string | null
  tipo?: string | null
  tribunal?: string | null
  url_fonte?: string | null
  data_inicio?: string | null
  data_decisao?: string | null
}

type ProcessoReceiptRow = {
  candidato_id?: string | null
  alvo?: string | null
  resultado?: string | null
  executado_em?: string | null
}

type ChapaRow = Partial<Pick<Chapa2026, "uf" | "titular_sq_candidato" | "vice_sq_candidato" | "vice_partido_sigla" | "vice_situacao_divulgacand">> & {
  titular_candidato_id: string
  vice_nome_urna?: string | null
  identidade_status?: string | null
  vinculo_titular_status?: string | null
  fonte_url?: string | null
  fonte_sha256?: string | null
  snapshot_em?: string | null
}

type PatrimonioRow = Patrimonio & { despublicado_em?: string | null }

type GastoRow = {
  candidato_id: string
  ano: number
  total_gasto: number | string | null
  fonte: string | null
  detalhamento: unknown
}

type SancaoRow = { candidato_id: string; id?: string }

type ColetaReceiptRow = ColetaVerificacaoRow & { alvo?: string | null }

type ImprensaDependencies = {
  loadSlugs: typeof getCandidatoSlugStaticParams
  loadCandidates: (slugs: string[]) => Promise<CandidateRow[]>
  loadProcesses: (candidateIds: string[]) => Promise<ProcessoRow[]>
  loadProcessReceipts: (candidateIds: string[], slugs: string[]) => Promise<ProcessoReceiptRow[]>
  loadChapas: (candidateIds: string[]) => Promise<ChapaRow[]>
  loadSenadoRunningMates: typeof loadSenadoRunningMates
  loadSites: typeof getCandidateSitesTseBySlug
  loadPatrimonio: (candidateIds: string[]) => Promise<PatrimonioRow[]>
  loadGastos: (candidateIds: string[]) => Promise<GastoRow[]>
  loadSancoes: (candidateIds: string[]) => Promise<SancaoRow[]>
  loadColetaReceipts: (fonte: "tcu" | "transparencia-sanctions", slugs: string[]) => Promise<ColetaReceiptRow[]>
}

const PAGE_SIZE = 500
const PROCESS_BATCH_SIZE = 250

function firstFilter(value: string | string[] | null | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  const normalized = typeof candidate === "string" ? candidate.trim() : ""
  return normalized || null
}

export function normalizeImprensaFilters(raw: {
  cargo?: string | string[] | null
  uf?: string | string[] | null
}): ImprensaFilters {
  return { cargo: firstFilter(raw.cargo), uf: firstFilter(raw.uf)?.toUpperCase() ?? null }
}

function requireHttps(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function asIsoSnapshot(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  let candidate = value
  if (brDate) {
    const day = Number(brDate[1])
    const month = Number(brDate[2])
    const year = Number(brDate[3])
    const checked = new Date(Date.UTC(year, month - 1, day))
    if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null
    candidate = `${brDate[3]}-${brDate[2]}-${brDate[1]}T00:00:00.000Z`
  }
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

function defaultDependencies(): ImprensaDependencies {
  return {
    loadSenadoRunningMates,
    loadSlugs: getCandidatoSlugStaticParams,
    loadCandidates: async (slugs) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: CandidateRow[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const result = await client
          .from("candidatos_publico")
          .select("id,slug,nome_urna,cargo_disputado,estado,partido_sigla")
          .in("slug", slugs)
          .order("slug", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
          .abortSignal(supabaseQueryTimeoutSignal())
        if (result.error) throw new Error(`candidatos_publico: ${result.error.message}`)
        if (!Array.isArray(result.data)) throw new Error("candidatos_publico: resposta inválida")
        rows.push(...(result.data as CandidateRow[]))
        if (result.data.length < PAGE_SIZE) break
      }
      return rows
    },
    loadProcesses: async (candidateIds) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: ProcessoRow[] = []
      for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
        const ids = candidateIds.slice(start, start + PROCESS_BATCH_SIZE)
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const result = await client
            .from("processos")
            .select("id,candidato_id,numero_processo,tipo,tribunal,url_fonte,data_inicio,data_decisao")
            .in("candidato_id", ids)
            .order("candidato_id", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
            .abortSignal(supabaseQueryTimeoutSignal())
          if (result.error) throw new Error(`processos: ${result.error.message}`)
          if (!Array.isArray(result.data)) throw new Error("processos: resposta inválida")
          rows.push(...(result.data as ProcessoRow[]))
          if (result.data.length < PAGE_SIZE) break
        }
      }
      return rows
    },
    loadProcessReceipts: async (candidateIds, slugs) => {
      if (!candidateIds.length || !slugs.length) return []
      const client = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
      const rows: ProcessoReceiptRow[] = []
      for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
        const result = await client
          .from("coleta_log_ultima")
          .select("candidato_id,alvo,resultado,executado_em")
          .eq("fonte", "processos-curadoria")
          .eq("escopo", "candidato")
          .in("alvo", slugs.slice(start, start + PROCESS_BATCH_SIZE))
          .abortSignal(supabaseQueryTimeoutSignal())
        if (result.error) throw new Error(`coleta_log_ultima(processos-curadoria): ${result.error.message}`)
        if (!Array.isArray(result.data)) throw new Error("coleta_log_ultima(processos-curadoria): resposta inválida")
        rows.push(...(result.data as ProcessoReceiptRow[]))
      }
      return rows
    },
    loadChapas: async (candidateIds) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: ChapaRow[] = []
      for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
        const ids = candidateIds.slice(start, start + PROCESS_BATCH_SIZE)
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const result = await client
            .from("chapas_2026_publico")
            .select("titular_candidato_id,uf,vice_nome_urna,vice_partido_sigla,identidade_status,vinculo_titular_status,fonte_url,fonte_sha256,snapshot_em,titular_sq_candidato,vice_sq_candidato,vice_situacao_divulgacand")
            .in("titular_candidato_id", ids)
            .order("titular_candidato_id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
            .abortSignal(supabaseQueryTimeoutSignal())
          if (result.error) throw new Error(`chapas_2026_publico: ${result.error.message}`)
          if (!Array.isArray(result.data)) throw new Error("chapas_2026_publico: resposta inválida")
          rows.push(...(result.data as ChapaRow[]))
          if (result.data.length < PAGE_SIZE) break
        }
      }
      return rows
    },
    loadSites: getCandidateSitesTseBySlug,
    // Mesmas tabelas, cliente e filtros de getCandidatoBySlugResource
    // (src/lib/api.ts), lidos em lote por candidato_id.
    loadPatrimonio: (candidateIds) => loadByCandidateIds<PatrimonioRow>(
      "patrimonio",
      "id,candidato_id,ano_eleicao,valor_total,bens,ano_arquivo,sq_candidato,uf_candidatura,cargo_candidatura,data_eleicao,tipo_eleicao",
      candidateIds,
      { onlyPublished: true },
    ),
    loadGastos: (candidateIds) => loadByCandidateIds<GastoRow>(
      "gastos_parlamentares",
      "id,candidato_id,ano,total_gasto,fonte,detalhamento",
      candidateIds,
    ),
    loadSancoes: (candidateIds) => loadByCandidateIds<SancaoRow>("sancoes_administrativas", "id,candidato_id", candidateIds),
    loadColetaReceipts: async (fonte, slugs) => {
      if (!slugs.length) return []
      const client = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
      const rows: ColetaReceiptRow[] = []
      for (let start = 0; start < slugs.length; start += PROCESS_BATCH_SIZE) {
        const result = await client
          .from("coleta_log_ultima")
          .select("candidato_id,alvo,fonte,resultado,executado_em,volume,detalhe,url,escopo")
          .eq("fonte", fonte)
          .eq("escopo", "candidato")
          .in("alvo", slugs.slice(start, start + PROCESS_BATCH_SIZE))
          .abortSignal(supabaseQueryTimeoutSignal())
        if (result.error) throw new Error(`coleta_log_ultima(${fonte}): ${result.error.message}`)
        if (!Array.isArray(result.data)) throw new Error(`coleta_log_ultima(${fonte}): resposta inválida`)
        rows.push(...(result.data as ColetaReceiptRow[]))
      }
      return rows
    },
  }
}

async function loadByCandidateIds<T>(
  table: string,
  columns: string,
  candidateIds: string[],
  options: { onlyPublished?: boolean } = {},
): Promise<T[]> {
  const client = createServerSupabaseClient({ cacheMode: "no-store" })
  const rows: T[] = []
  for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
    const ids = candidateIds.slice(start, start + PROCESS_BATCH_SIZE)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const base = client.from(table).select(columns).in("candidato_id", ids)
      const result = await (options.onlyPublished ? base.is("despublicado_em", null) : base)
        .order("candidato_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(supabaseQueryTimeoutSignal())
      if (result.error) throw new Error(`${table}: ${result.error.message}`)
      if (!Array.isArray(result.data)) throw new Error(`${table}: resposta inválida`)
      rows.push(...(result.data as unknown as T[]))
      if (result.data.length < PAGE_SIZE) break
    }
  }
  return rows
}

let testDependencies: ImprensaDependencies | null = null

/** Exclusivo para testes direcionados; produção sempre usa as fontes canônicas. */
export function __setImprensaDataDependenciesForTests(
  dependencies: Partial<ImprensaDependencies> | null,
): void {
  if (!dependencies) {
    testDependencies = null
    return
  }
  const defaults = defaultDependencies()
  // Existing focused fixtures predate the receipt projection. A fixture that
  // does not provide receipts explicitly represents "nao_buscado".
  // The same applies to the ficha families added later: a fixture that does
  // not provide them represents "sem_dado" / "nao_verificado", never a DB call.
  testDependencies = {
    ...defaults,
    loadProcessReceipts: async () => [],
    loadSenadoRunningMates: async () => ({ data: {}, absence: {}, unavailable: false }),
    loadPatrimonio: async () => [],
    loadGastos: async () => [],
    loadSancoes: async () => [],
    loadColetaReceipts: async () => [],
    ...dependencies,
  }
}

let testNow: (() => Date) | null = null

/** Clock override for deterministic freshness tests; production uses wall clock. */
export function __setImprensaNowForTests(now: (() => Date) | null): void {
  testNow = now
}

function mapSites(value: Awaited<ReturnType<typeof getCandidateSitesTseBySlug>>): ImprensaRow["sites"] {
  const semDado: ImprensaRow["sites"] = { estado: "sem_dado", quantidade: null, fonteUrl: null, fonteSha256: null, coletadoEm: null, ocorrencias: [] }
  const evidence = getCitableCandidateSites(value)
  if (!evidence) return semDado
  return {
    estado: evidence.resultado,
    quantidade: evidence.sites.length,
    fonteUrl: evidence.fonteUrl,
    fonteSha256: evidence.fonteSha256,
    coletadoEm: evidence.coletadoEm,
    ocorrencias: evidence.sites,
  }
}

const PROCESS_RECEIPT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

function processSearchState(receipt: ProcessoReceiptRow | null, hasRows: boolean): ImprensaRow["processos"]["buscaEstado"] {
  if (!receipt) return "nao_buscado"
  const executedAt = receipt.executado_em ? Date.parse(receipt.executado_em) : Number.NaN
  if (!Number.isFinite(executedAt)) return "indeterminado"
  const now = (testNow ? testNow() : new Date()).getTime()
  if (executedAt > now) return "indeterminado"
  const result = receipt.resultado
  if (result === "erro") return "erro"
  if (result === "indeterminado" || result === "sem_achado_no_escopo" || result === "nao_aplicavel") return "indeterminado"
  if (result === "vazio_confirmado" && hasRows) return "contraditorio"
  if (result !== "encontrado" && result !== "vazio_confirmado") return "indeterminado"
  if (now - executedAt > PROCESS_RECEIPT_MAX_AGE_MS) return "desatualizado"
  return result
}

/**
 * Mesma regra da ficha pública (`nivelFonteProcesso`, usada por api.ts e
 * public-profile-dto.ts): linha com fonte judicial específica é "oficial";
 * linha com página específica ainda sem a fonte do tribunal aparece com o selo
 * "Fonte em confirmação"; só a linha sem fonte publicável fica fora e entra na
 * contagem de omitidas.
 */
function mapProcesses(rows: ProcessoRow[], receipt: ProcessoReceiptRow | null): ImprensaRow["processos"] {
  const ocorrencias: ImprensaRow["processos"]["ocorrencias"] = []
  // Mesmo critério da ficha e da grade (contagem única de processos).
  for (const item of filtrarProcessosJudiciaisContaveis(rows)) {
    const numeroProcesso = item.numero_processo ?? null
    const fonteNivel = item.fonte_nivel
    const urlFonte = fonteNivel === "oficial"
      ? urlFonteJudicialEspecifica(item.url_fonte, numeroProcesso)
      : urlPublicaDoProcesso({ numero_processo: numeroProcesso, url_fonte: item.url_fonte ?? null, fonte_nivel: fonteNivel })
    if (!urlFonte) continue
    ocorrencias.push({
      numero: numeroProcesso,
      tipo: item.tipo ?? "desconhecido",
      tribunal: item.tribunal ?? "",
      urlFonte,
      fonteNivel,
      dataInicio: item.data_inicio ?? null,
      dataDecisao: item.data_decisao ?? null,
    })
  }
  const quantidadeOmitida = rows.length - ocorrencias.length
  const quantidadeEmConfirmacao = ocorrencias.filter((item) => item.fonteNivel === "em_confirmacao").length
  const buscaEstado = processSearchState(receipt, rows.length > 0)
  if (!rows.length) {
    const estado = receipt?.resultado === "encontrado" || buscaEstado === "encontrado" || buscaEstado === "contraditorio" ? "indeterminado" : buscaEstado
    return { estado, buscaEstado, quantidade: estado === "vazio_confirmado" ? 0 : null, quantidadeOmitida: 0, quantidadeEmConfirmacao: 0, ocorrencias: [] }
  }
  if (!ocorrencias.length) return { estado: "cobertura_parcial", buscaEstado, quantidade: null, quantidadeOmitida, quantidadeEmConfirmacao, ocorrencias }
  if (quantidadeOmitida > 0) return { estado: "cobertura_parcial", buscaEstado, quantidade: ocorrencias.length, quantidadeOmitida, quantidadeEmConfirmacao, ocorrencias }
  return { estado: "publicado", buscaEstado, quantidade: ocorrencias.length, quantidadeOmitida, quantidadeEmConfirmacao, ocorrencias }
}

function mapChapa(rows: ChapaRow[]): ImprensaRow["chapa"] {
  if (rows.length !== 1) return { estado: "sem_dado", suplentesEstado: "nao_aplicavel", viceNome: null, viceNomeOriginal: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null }
  const row = rows[0]
  const fonteUrl = requireHttps(row.fonte_url)
  const fonteSha256 = typeof row.fonte_sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.fonte_sha256) ? row.fonte_sha256 : null
  const snapshotEm = asIsoSnapshot(row.snapshot_em)
  const viceNomeOriginal = typeof row.vice_nome_urna === "string" && row.vice_nome_urna.trim() ? row.vice_nome_urna.trim() : null
  // "novo_perfil_oficial" também é vínculo oficial com o titular ligado (ver o
  // CHECK de chapas_2026); a ficha pública mostra o vice nos dois casos.
  const vinculoOficial = row.vinculo_titular_status === "confirmado" || row.vinculo_titular_status === "novo_perfil_oficial"
  if (row.identidade_status !== "confirmada" || !vinculoOficial || !viceNomeOriginal || !fonteUrl || !fonteSha256 || !snapshotEm) {
    return { estado: "sem_dado", suplentesEstado: "nao_aplicavel", viceNome: null, viceNomeOriginal: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null }
  }
  const viceSituacao = verifiedViceStatus({ ...row, vice_nome_urna: viceNomeOriginal } as Parameters<typeof verifiedViceStatus>[0])
  return { estado: "publicado", suplentesEstado: "nao_aplicavel", viceNome: formatDisplayName(viceNomeOriginal), viceNomeOriginal, viceSituacao, suplentes: [], fonteUrl, fonteSha256, snapshotEm }
}

/**
 * Card "Patrimônio" da ficha (CandidatoProfile): a declaração mais recente só
 * vale quando é única no ano; zero que é ausência de valor sai sem número; a
 * variação é a de `variacaoPatrimonialDaFicha`, a mesma função da ficha.
 */
export function mapPatrimonio(rows: readonly Patrimonio[]): ImprensaRow["patrimonio"] {
  const vazio: ImprensaRow["patrimonio"] = {
    estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null,
  }
  const contexto = patrimonioMaisRecenteSemEscolhaArbitraria(rows)
  if (contexto.ano === null) return vazio
  const atual = contexto.patrimonio
  if (!atual) return { ...vazio, estado: "multiplas_declaracoes", ano: contexto.ano, fonteUrl: fonteDadosAbertosPatrimonioTse(contexto.ano) }
  const valorEstado = estadoValorPatrimonio(atual)
  const variacao = variacaoPatrimonialDaFicha(rows)
  return {
    estado: valorEstado === "valor_nao_informado" ? "valor_nao_informado" : "publicado",
    ano: atual.ano_eleicao,
    total: valorEstado === "valor_nao_informado" ? null : parseValorPatrimonio(atual.valor_total),
    valorEstado,
    anoAnterior: variacao?.anterior.ano_eleicao ?? null,
    totalAnterior: variacao ? parseValorPatrimonio(variacao.anterior.valor_total) : null,
    variacaoPct: variacao?.pct ?? null,
    fonteUrl: fonteDadosAbertosPatrimonioTse(atual.ano_eleicao),
  }
}

/**
 * Mesmos dois filtros que a ficha aplica antes de exibir a cota: ano em
 * revisão fica fora (api.ts) e só entra a linha que `gastoParlamentarExibivel`
 * aprova (public-profile-dto.ts). Sem linha exibível o total é null, nunca 0.
 */
export function mapGastos(slug: string, rows: readonly GastoRow[]): ImprensaRow["gastos"] {
  const anos = rows
    .filter((row) => !gastoParlamentarEmRevisao(slug, row.ano))
    .filter((row) => gastoParlamentarExibivel(row.fonte, row.detalhamento, row.ano, row.total_gasto as number))
    .map((row) => ({
      ano: row.ano,
      casa: casaParlamentarDaFonte(row.fonte),
      total: Number(row.total_gasto),
      fonteUrl: fonteUrlGastoParlamentar(row.detalhamento, row.ano),
    }))
    .sort((a, b) => b.ano - a.ano)
  const anosEmRevisao = anosGastosParlamentaresEmRevisao(slug)
  if (!anos.length) return { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao, anos }
  const ultimoAno = anos[0].ano
  const ultimoAnoTotal = anos.filter((item) => item.ano === ultimoAno).reduce((sum, item) => sum + item.total, 0)
  return { estado: "publicado", ultimoAno, ultimoAnoTotal, anosEmRevisao, anos }
}

/** Recibo `tcu` projetado por `projectTCUVerificacaoRow`, o mesmo da ficha. */
export function mapTCU(verificacao: TCUVerificacao | null): ImprensaRow["tcu"] {
  if (!verificacao) return { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null }
  const registros = verificacao.estado === "vazio_verificado"
    ? 0
    : verificacao.estado === "encontrado_em_revisao"
      ? (verificacao.fontes ?? []).reduce((sum, fonte) => sum + (fonte.resultado === "encontrado" && fonte.volume !== null ? fonte.volume : 0), 0)
      : null
  return { estado: verificacao.estado, registros, consultadoEm: verificacao.executado_em, fonteUrl: verificacao.url }
}

/**
 * Bloco de sanções da ficha: `resolverEstadoSancoes` decide o estado; só com
 * registros ou vazio confirmado há número. Sem verificação, null.
 */
export function mapSancoes(
  quantidade: number,
  verificacao: ReturnType<typeof projectColetaVerificacaoRow>,
): ImprensaRow["sancoes"] {
  const estado = resolverEstadoSancoes(quantidade, verificacao)
  return {
    estado,
    quantidade: estado === "nao-verificado" ? null : quantidade,
    consultadoEm: verificacao?.executado_em ?? null,
    fonteUrl: verificacao?.url ?? null,
  }
}

/** A ficha lê o recibo com `.maybeSingle()`: mais de uma linha vira null. */
function singleReceiptBySlug(rows: readonly ColetaReceiptRow[]): Map<string, ColetaReceiptRow | null> {
  const bySlug = new Map<string, ColetaReceiptRow | null>()
  for (const row of rows) {
    if (typeof row.alvo !== "string") continue
    bySlug.set(row.alvo, bySlug.has(row.alvo) ? null : row)
  }
  return bySlug
}

export async function getImprensaDataset(filters: ImprensaFilters): Promise<ImprensaDataset> {
  const deps = testDependencies ?? defaultDependencies()
  const requested = await deps.loadSlugs()
  const slugs = [...new Set(requested.map((item) => item.slug).filter(Boolean))]
  if (!slugs.length) throw new Error("coorte pública vazia")
  const candidates = await deps.loadCandidates(slugs)
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  if (slugs.some((slug) => !bySlug.has(slug))) throw new Error("candidatos_publico: coorte incompleta")
  const exposed = candidates.filter((candidate) => shouldExposeCargo(candidate.cargo_disputado))
  const availableCargos = [...new Set(exposed.map((candidate) => candidate.cargo_disputado).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const availableUfs = [...new Set(exposed.map((candidate) => candidate.estado?.toUpperCase()).filter((value): value is string => Boolean(value)))].sort()
  const selected = exposed.filter((candidate) => (!filters.cargo || candidate.cargo_disputado === filters.cargo) && (!filters.uf || candidate.estado?.toUpperCase() === filters.uf))
  const processes = await deps.loadProcesses(selected.map((candidate) => candidate.id))
  const processReceipts = await deps.loadProcessReceipts(selected.map((candidate) => candidate.id), selected.map((candidate) => candidate.slug))
  const chapas = await deps.loadChapas(selected.map((candidate) => candidate.id))
  // Patrimônio é lido por pessoa, como na ficha: slugs do mesmo mapa canônico
  // somam as declarações de todos os ids ligados (getCanonicalPerson).
  const personIdsBySlug = new Map<string, string[]>()
  const canonicalSlugs = [...new Set(selected.flatMap((candidate) => {
    const canonical = getCanonicalPerson(candidate.slug)
    return canonical.slugs.length > 1 ? canonical.slugs : []
  }))]
  const canonicalIdBySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate.id]))
  const missingCanonical = canonicalSlugs.filter((slug) => !canonicalIdBySlug.has(slug))
  if (missingCanonical.length) {
    try {
      for (const row of await deps.loadCandidates(missingCanonical)) canonicalIdBySlug.set(row.slug, row.id)
    } catch {
      // A ficha também cai para o id da própria candidatura quando a busca falha.
    }
  }
  for (const candidate of selected) {
    const canonical = getCanonicalPerson(candidate.slug)
    const related = canonical.slugs.length > 1
      ? canonical.slugs.map((slug) => canonicalIdBySlug.get(slug)).filter((value): value is string => Boolean(value))
      : []
    personIdsBySlug.set(candidate.slug, related.length ? related : [candidate.id])
  }
  const patrimonioRows = await deps.loadPatrimonio([...new Set([...personIdsBySlug.values()].flat())])
  const gastosRows = await deps.loadGastos(selected.map((candidate) => candidate.id))
  const sancoesRows = await deps.loadSancoes(selected.map((candidate) => candidate.id))
  const tcuReceipts = singleReceiptBySlug(await deps.loadColetaReceipts("tcu", selected.map((candidate) => candidate.slug)))
  const sancoesReceipts = singleReceiptBySlug(await deps.loadColetaReceipts("transparencia-sanctions", selected.map((candidate) => candidate.slug)))
  const groupBy = <T extends { candidato_id: string }>(items: readonly T[]) => {
    const grouped = new Map<string, T[]>()
    for (const item of items) grouped.set(item.candidato_id, [...(grouped.get(item.candidato_id) ?? []), item])
    return grouped
  }
  const patrimonioByCandidate = groupBy(patrimonioRows.filter((row) => row.despublicado_em == null))
  const gastosByCandidate = groupBy(gastosRows)
  const sancoesByCandidate = groupBy(sancoesRows)
  const senateByUf = new Map<string, CandidateRow[]>()
  for (const candidate of selected.filter((item) => item.cargo_disputado === "Senador" && item.estado)) {
    const uf = candidate.estado!.toUpperCase()
    senateByUf.set(uf, [...(senateByUf.get(uf) ?? []), candidate])
  }
  const senateResults: Array<{ candidates: CandidateRow[]; result: Awaited<ReturnType<ImprensaDependencies["loadSenadoRunningMates"]>> }> = []
  const senateGroups = [...senateByUf]
  for (let start = 0; start < senateGroups.length; start += 5) {
    const batch = await Promise.all(senateGroups.slice(start, start + 5).map(async ([uf, candidates]) => ({
      candidates,
      result: await deps.loadSenadoRunningMates(candidates.map((candidate) => candidate.slug), uf),
    })))
    senateResults.push(...batch)
  }
  const senateChapaBySlug = new Map<string, ImprensaRow["chapa"]>()
  for (const { candidates, result } of senateResults) {
    for (const candidate of candidates) {
      const mates = result.data[candidate.slug] ?? []
      const absence = result.absence[candidate.slug]
      if (mates.length === 2) {
        const fonteUrl = requireHttps(mates[0].fonte_url)
        // Ordem 1 e 2 distintas e nome não vazio, como selectSenadoRunningMates exige.
        const ordensOk = new Set(mates.map((mate) => mate.ordem)).size === 2 && mates.every((mate) => mate.ordem === 1 || mate.ordem === 2)
        const allSourcesHttps = ordensOk && mates.every((mate) => requireHttps(mate.fonte_url) && Boolean(mate.nome_urna?.trim()))
        senateChapaBySlug.set(candidate.slug, fonteUrl && allSourcesHttps ? {
          estado: "publicado", suplentesEstado: "publicado", viceNome: null, viceNomeOriginal: null,
          suplentes: mates.map((mate) => formatDisplayName(mate.nome_urna)),
          fonteUrl, fonteSha256: null, snapshotEm: null,
        } : {
          estado: "indeterminado", suplentesEstado: "indeterminado", viceNome: null, viceNomeOriginal: null,
          suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null,
        })
      } else if (result.unavailable) {
        senateChapaBySlug.set(candidate.slug, { estado: "indisponivel", suplentesEstado: "indisponivel", viceNome: null, viceNomeOriginal: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null })
      } else if (absence) {
        const fonteUrl = requireHttps(absence.fonte_url)
        const fonteSha256 = isSha256(absence.fonte_sha256) ? absence.fonte_sha256 : null
        const snapshotEm = asIsoSnapshot(absence.consulted_at)
        const comprovado = Boolean(fonteUrl && fonteSha256 && snapshotEm)
        senateChapaBySlug.set(candidate.slug, {
          estado: comprovado ? "indeferidos_comprovados" : "indeterminado",
          suplentesEstado: comprovado ? "indeferidos_comprovados" : "indeterminado",
          viceNome: null,
          viceNomeOriginal: null,
          suplentes: [],
          fonteUrl: comprovado ? fonteUrl : null,
          fonteSha256: comprovado ? fonteSha256 : null,
          snapshotEm: comprovado ? snapshotEm : null,
        })
      } else {
        senateChapaBySlug.set(candidate.slug, { estado: "indeterminado", suplentesEstado: "indeterminado", viceNome: null, viceNomeOriginal: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null })
      }
    }
  }
  const processByCandidate = new Map<string, ProcessoRow[]>()
  for (const process of processes) processByCandidate.set(process.candidato_id, [...(processByCandidate.get(process.candidato_id) ?? []), process])
  const receiptBySlug = new Map<string, ProcessoReceiptRow>()
  const candidateBySlug = new Map(selected.map((candidate) => [candidate.slug, candidate]))
  for (const receipt of [...processReceipts].sort((a, b) => Date.parse(b.executado_em ?? "") - Date.parse(a.executado_em ?? ""))) {
    const candidate = receipt.alvo ? candidateBySlug.get(receipt.alvo) : undefined
    if (!candidate || receipt.candidato_id !== candidate.id || receiptBySlug.has(candidate.slug)) continue
    receiptBySlug.set(candidate.slug, receipt)
  }
  const chapaByCandidate = new Map<string, ChapaRow[]>()
  for (const chapa of chapas) chapaByCandidate.set(chapa.titular_candidato_id, [...(chapaByCandidate.get(chapa.titular_candidato_id) ?? []), chapa])
  const rows = await Promise.all(selected.map(async (candidate) => ({
    slug: candidate.slug,
    nome: formatDisplayName(candidate.nome_urna ?? ""),
    nomeOriginal: candidate.nome_urna ?? "",
    cargo: candidate.cargo_disputado ?? "",
    uf: candidate.estado ?? null,
    partido: candidate.partido_sigla ?? null,
    fichaUrl: `/candidato/${candidate.slug}`,
    chapa: senateChapaBySlug.get(candidate.slug) ?? mapChapa(chapaByCandidate.get(candidate.id) ?? []),
    sites: mapSites(await deps.loadSites(candidate.slug)),
    processos: mapProcesses(processByCandidate.get(candidate.id) ?? [], receiptBySlug.get(candidate.slug) ?? null),
    patrimonio: mapPatrimonio(normalizePatrimonioForDisplay(
      (personIdsBySlug.get(candidate.slug) ?? [candidate.id]).flatMap((id) => patrimonioByCandidate.get(id) ?? []),
    )),
    gastos: mapGastos(candidate.slug, gastosByCandidate.get(candidate.id) ?? []),
    tcu: mapTCU((() => {
      const receipt = tcuReceipts.get(candidate.slug)
      return receipt ? projectTCUVerificacaoRow(receipt) : null
    })()),
    sancoes: mapSancoes(sancoesByCandidate.get(candidate.id)?.length ?? 0, (() => {
      const receipt = sancoesReceipts.get(candidate.slug)
      return receipt ? projectColetaVerificacaoRow(receipt, "transparencia-sanctions") : null
    })()),
  })))
  return { version: "2", generatedAt: new Date().toISOString(), filters, availableCargos, availableUfs, rows }
}
