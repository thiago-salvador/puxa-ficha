import { supabase } from "./supabase"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import {
  GASTOS_RECENT_ANOS,
  classificarReciboProposicoes,
  hasFullVotacaoIdCoverage,
  hasGastosRecentYearsComplete,
  pareceCorteHistorico,
  projetosLeiSincronizado,
} from "./camara-incremental-guards"
import { contarPorNatureza } from "@/lib/proposicao-natureza"
import { FONTE_CAMARA_PROPOSICOES, registrarColeta, type EntradaColeta } from "./coleta-log"
import { loadCandidatosPublicos, loadVerificacaoCampos, resolveCandidatoId } from "./helpers-db"
import { deveProcessarAcervoLegislativo, reciboAcervoCongelado } from "./acervo-legislativo-congelado"
import { fetchJSON, sleep } from "./helpers"
import { CAMARA_API, resultadoSemAlcance, sondarAlcanceCamara, type AlcanceCamara } from "./camara-alcance"
import { namesLookCompatible } from "./name-match"
import { assertSemReplacementChar } from "./ceaps-csv-encoding"
import { sanitizePublicTextOrThrow } from "../../src/lib/public-text"
import { stripAccents } from "../../src/lib/strip-accents"
import { log, warn, error } from "./logger"
import { classificarVotacao, type ClassificacaoVotacao } from "./votacao-classificacao"
import { emDryRun, planejarEscrita } from "./dry-run"
import { escreverAuditado } from "./escrita-auditada"
import type { IngestResult } from "./types"
import { secondarySourceBirthDate } from "./data-nascimento"

const API = CAMARA_API

/** Camara public API is often slow; 15s default caused frequent AbortError under load. */
const CAMARA_FETCH_RETRIES = 5
const CAMARA_FETCH_TIMEOUT_MS = 60_000

/** Wall clock per candidato: votos por proposicao pode gerar dezenas de round-trips. */
const CANDIDATO_WALL_MS = 600_000

interface CamaraResponse<T> {
  dados: T
  links: { rel: string; href: string }[]
}

function camaraFetchJSON<T>(url: string, options: Parameters<typeof fetchJSON<T>>[4] = {}): Promise<T> {
  return fetchJSON<T>(url, undefined, CAMARA_FETCH_RETRIES, CAMARA_FETCH_TIMEOUT_MS, options)
}

type CamaraPageCapture = { page: number; url: string; body: string }

type CamaraExpensePageReceipt = {
  page: number
  status: 200
  url: string
  fetched_at: string
  bytes: number
  sha256: string
  body_path: string
}

type CamaraExpenseSnapshot = {
  id_camara: number
  ano: number
  id_legislatura: number
  fonte_url: string
  consulta_paginas: number
  consulta_snapshot_sha256: string
  fetched_at: string
  pages: CamaraExpensePageReceipt[]
  controle_independente: boolean
  valor_liquido_fonte_cents: number
  valor_documento_fonte_cents: number
  valor_glosa_fonte_cents: number
  direct_total_cents: number
  grouped_total_cents: number
}

async function fetchPaginated<T>(
  baseUrl: string,
  params: Record<string, string> = {},
  onPage?: (capture: CamaraPageCapture) => void | Promise<void>,
): Promise<T[]> {
  const all: T[] = []
  let page = 1

  while (true) {
    const searchParams = new URLSearchParams({ ...params, itens: "100", pagina: String(page) })
    const url = `${baseUrl}?${searchParams}`
    let body = ""
    const json = await camaraFetchJSON<CamaraResponse<T[]>>(url, {
      onResponseBody: (raw) => {
        body = raw
      },
    })
    await onPage?.({ page, url, body })
    const dados = requireCamaraArray(json, url)
    if (dados.length === 0) break
    all.push(...dados)
    if (dados.length < 100) break
    page++
    await sleep(1000)
  }

  return all
}

export function requireCamaraArray<T>(json: CamaraResponse<T[]>, url: string): T[] {
  if (!Array.isArray(json.dados)) {
    throw new Error(`Resposta inválida da API Câmara: dados não é uma lista (${url})`)
  }
  return json.dados
}

export function applyCamaraExpenseSourceFilter<T>(query: { eq(column: string, value: unknown): T }): T {
  return query.eq("fonte", "Camara")
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function writeCamaraExpensePageSnapshot(
  snapshotDir: string,
  idCamara: number,
  ano: number,
  capture: CamaraPageCapture,
): CamaraExpensePageReceipt {
  const bodyPath = resolve(snapshotDir, String(idCamara), String(ano), `pagina-${capture.page}.json`)
  mkdirSync(dirname(bodyPath), { recursive: true })
  writeFileSync(bodyPath, capture.body, "utf8")
  return {
    page: capture.page,
    status: 200,
    url: capture.url,
    fetched_at: new Date().toISOString(),
    bytes: Buffer.byteLength(capture.body, "utf8"),
    sha256: sha256(capture.body),
    body_path: bodyPath,
  }
}

export function readCamaraExpenseSnapshot(
  snapshotDir: string,
  idCamara: number,
  ano: number,
  idLegislatura: number,
): { despesas: Record<string, unknown>[]; pages: CamaraExpensePageReceipt[] } | null {
  const manifestPath = resolve(snapshotDir, String(idCamara), String(ano), "manifest.json")
  let pages: CamaraExpensePageReceipt[]
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CamaraExpenseSnapshot
    if (manifest.id_camara !== idCamara || manifest.ano !== ano || manifest.id_legislatura !== idLegislatura) {
      throw new Error(`Snapshot Câmara fora do escopo: ${manifestPath}`)
    }
    if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
      throw new Error(`Snapshot Câmara sem páginas: ${manifestPath}`)
    }
    pages = manifest.pages
  } else {
    const yearDir = dirname(manifestPath)
    if (!existsSync(yearDir)) return null
    const pageFiles = readdirSync(yearDir)
      .filter((name) => /^pagina-\d+\.json$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    if (pageFiles.length === 0) return null
    pages = pageFiles.map((name) => {
      const bodyPath = resolve(yearDir, name)
      const body = readFileSync(bodyPath, "utf8")
      const page = Number(name.match(/\d+/)?.[0])
      return {
        page,
        status: 200,
        url: `${API}/deputados/${idCamara}/despesas?ano=${ano}&idLegislatura=${idLegislatura}&itens=100&pagina=${page}`,
        fetched_at: statSync(bodyPath).mtime.toISOString(),
        bytes: Buffer.byteLength(body, "utf8"),
        sha256: sha256(body),
        body_path: bodyPath,
      }
    })
  }
  const despesas: Record<string, unknown>[] = []
  for (const [index, page] of pages.entries()) {
    const url = new URL(page.url)
    if (page.page !== index + 1 || url.origin !== "https://dadosabertos.camara.leg.br" ||
      url.pathname !== `/api/v2/deputados/${idCamara}/despesas` ||
      url.searchParams.get("ano") !== String(ano) ||
      url.searchParams.get("idLegislatura") !== String(idLegislatura) ||
      url.searchParams.get("pagina") !== String(page.page)) {
      throw new Error(`Página Câmara fora do escopo ou sequência: ${page.body_path}`)
    }
    const body = readFileSync(page.body_path, "utf8")
    if (sha256(body) !== page.sha256 || Buffer.byteLength(body, "utf8") !== page.bytes) {
      throw new Error(`Snapshot Câmara diverge do hash: ${page.body_path}`)
    }
    const json = JSON.parse(body) as CamaraResponse<Record<string, unknown>[]>
    const dados = requireCamaraArray(json, page.url)
    const hasNext = Array.isArray(json.links) && json.links.some((link) => link.rel === "next")
    // Uma interrupção pode deixar páginas íntegras, mas sem o final da consulta.
    // Nunca promover esse cache parcial a um snapshot completo.
    if (index === pages.length - 1 && (hasNext || dados.length >= 100)) return null
    despesas.push(...dados)
  }
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CamaraExpenseSnapshot
    const snapshotHash = sha256(pages.map((page) => page.sha256).join("\n"))
    if (snapshotHash !== manifest.consulta_snapshot_sha256) {
      throw new Error(`Manifesto Câmara diverge das páginas: ${manifestPath}`)
    }
  }
  return { despesas, pages }
}

/**
 * Cardinalidade que a Camara declara para uma consulta, em 1 request.
 *
 * A API v2 nao devolve total no corpo, mas devolve `links` com `rel="last"`. Com
 * `itens=1`, o numero da ultima pagina E o total de itens. Isso da o denominador
 * exato que a issue #138 pede sem baixar o acervo inteiro so para conta-lo.
 *
 * Devolve `null` quando a fonte nao entrega o link (resposta de pagina unica com
 * `dados` vazio, ou formato inesperado). `null` significa "nao sei", e quem
 * consome trata como motivo para ir buscar, nunca como zero.
 */
export function parseDeclaredCountFromLinks(
  links: { rel: string; href: string }[] | undefined,
  itensNaPrimeiraPagina: number
): number | null {
  const last = (links ?? []).find((l) => l.rel === "last")
  if (!last?.href) {
    // Sem `last`, a consulta cabe numa pagina so: o total e o que veio nela.
    return Number.isFinite(itensNaPrimeiraPagina) && itensNaPrimeiraPagina >= 0
      ? itensNaPrimeiraPagina
      : null
  }
  const pagina = new URL(last.href, API).searchParams.get("pagina")
  // `Number(null)` e 0, e devolver 0 aqui inventaria "a fonte declarou zero" a
  // partir de um link malformado. Sem o parametro, a resposta e "nao sei".
  if (pagina == null || pagina.trim() === "") return null
  const total = Number(pagina)
  return Number.isInteger(total) && total >= 0 ? total : null
}

async function fetchDeclaredProposicaoCount(idCamara: number): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      idDeputadoAutor: String(idCamara),
      ordem: "DESC",
      ordenarPor: "id",
      itens: "1",
      pagina: "1",
    })
    const json = await camaraFetchJSON<CamaraResponse<Record<string, unknown>[]>>(
      `${API}/proposicoes?${params}`
    )
    return parseDeclaredCountFromLinks(json.links, (json.dados ?? []).length)
  } catch (err) {
    warn("camara", `  nao foi possivel ler cardinalidade declarada: ${asMessage(err)}`)
    return null
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Legislatura da Câmara em curso na data. A legislatura N começa em 1º de
 * fevereiro de 1991 + 4 * (N - 49) e termina em 31 de janeiro quatro anos
 * depois, então janeiro ainda pertence à legislatura do ano anterior.
 */
export function legislaturaCamaraVigente(agora: Date = new Date()): number {
  const ano = agora.getUTCMonth() === 0 ? agora.getUTCFullYear() - 1 : agora.getUTCFullYear()
  return 49 + Math.floor((ano - 1991) / 4)
}

/**
 * `ultimoStatus` da API da Câmara descreve o último mandato do deputado na
 * Casa, com a situação daquele mandato: um ex-deputado da legislatura 51
 * volta com situacao "Exercício" e o partido de 1999-2003. Só conta como
 * mandato atual quando a situação é exercício E a legislatura é a vigente;
 * sem `idLegislatura`, não há como provar que o status é atual.
 */
export function mandatoCamaraVigente(
  status: Record<string, unknown> | undefined,
  agora: Date = new Date(),
): boolean {
  if (!status) return false
  const emExercicio = String(status.situacao || "").toLowerCase().includes("exerc")
  const legislatura = Number(status.idLegislatura)
  return emExercicio && Number.isInteger(legislatura) && legislatura === legislaturaCamaraVigente(agora)
}

/**
 * Colunas de `candidatos` que o perfil da Câmara atualiza, sem rede nem banco.
 * Partido e cargo_atual só entram quando `ultimoStatus` é um mandato em
 * exercício na legislatura vigente (mandatoCamaraVigente): um ex-deputado
 * volta da API com o status do último mandato na Casa, e esse status não pode
 * sobrescrever o partido de hoje.
 */
export function atualizacoesPerfilCamara(
  dep: Record<string, unknown>,
  opcoes: { agora?: Date; fotoAtual?: string | null } = {},
): Record<string, unknown> {
  const agora = opcoes.agora ?? new Date()
  const status = dep.ultimoStatus as Record<string, unknown> | undefined
  const updates: Record<string, unknown> = {
    ultima_atualizacao: agora.toISOString(),
  }

  if (status) {
    const isDeputyInExercise = mandatoCamaraVigente(status, agora)

    if (status.urlFoto && !opcoes.fotoAtual) updates.foto_url = status.urlFoto
    // The Camara profile reflects the deputy's last mandate there. For ex-deputies it is
    // frequently stale and must not override current-party curation.
    if (isDeputyInExercise && status.siglaPartido) {
      updates.partido_sigla = status.siglaPartido
      updates.partido_atual = status.siglaPartido
    }

    if (isDeputyInExercise) {
      updates.cargo_atual = "Deputado(a) Federal"
    }
  }
  if (dep.escolaridade) updates.formacao = dep.escolaridade
  if (dep.municipioNascimento && dep.ufNascimento) {
    updates.naturalidade = `${dep.municipioNascimento}/${dep.ufNascimento}`
  }
  const nascimento = secondarySourceBirthDate(dep.dataNascimento)
  if (nascimento) updates.data_nascimento = nascimento
  return updates
}

async function ingestPerfil(
  idCamara: number,
  candidatoId: string,
  slug: string,
  expectedNomeCompleto: string,
  expectedNomeUrna: string,
  candidateEstado?: string
) {
  const json = await camaraFetchJSON<CamaraResponse<Record<string, unknown>>>(`${API}/deputados/${idCamara}`)
  const dep = json.dados as Record<string, unknown>
  const status = dep.ultimoStatus as Record<string, unknown> | undefined
  const observedNames = [
    dep.nomeCivil ? String(dep.nomeCivil) : null,
    dep.nomeEleitoral ? String(dep.nomeEleitoral) : null,
    status?.nome ? String(status.nome) : null,
  ]

  if (!namesLookCompatible([expectedNomeCompleto, expectedNomeUrna], observedNames)) {
    throw new Error(
      `ID Camara inconsistente para ${slug}: retornou ${observedNames.filter(Boolean).join(" / ")}`
    )
  }

  // UF validation: check that deputy's UF matches candidate's state
  // This check is load-bearing: namesLookCompatible uses substring matching
  // which produces false positives for short names. Do not remove.
  const ufDeputado = status?.siglaUf ? String(status.siglaUf).toUpperCase() : null
  if (ufDeputado && candidateEstado && ufDeputado !== candidateEstado.toUpperCase()) {
    throw new Error(
      `ID Camara UF mismatch para ${slug}: deputado UF=${ufDeputado}, candidato estado=${candidateEstado}`
    )
  }

  // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
  let fotoAtual: string | null = null
  if (status?.urlFoto) {
    const { data: current } = await supabase.from("candidatos").select("foto_url").eq("id", candidatoId).single()
    fotoAtual = current?.foto_url ?? null
  }
  const updates = atualizacoesPerfilCamara(dep, { fotoAtual })

  if (emDryRun()) {
    planejarEscrita({
      fonte: "camara", tabela: "candidatos", operacao: "update", alvo: slug,
      identidade: `id:${candidatoId}`, chave: { id: candidatoId }, valores: updates,
    })
  } else {
    const { error: writeError } = await supabase.from("candidatos").update(updates).eq("id", candidatoId)
    if (writeError) throw new Error(`candidatos.update falhou: ${writeError.message}`)
  }
  log("camara", `  ${slug}: perfil ${emDryRun() ? "planejado" : "atualizado"}`)
  return !emDryRun()
}

/**
 * Recibo de cota parlamentar zerada: a API oficial devolveu zero lançamentos
 * em todos os anos consultados, cada um com a legislatura correta. Só vira
 * recibo quando nenhum ano teve lançamento; a matriz de cobertura decide se os
 * anos consultados cobrem o mandato (consulta vazia fora do mandato não prova
 * nada). Sem linhas, não há o que publicar: o recibo é a prova do zero.
 */
export function reciboCotaZeroCamara(
  idCamara: number,
  slug: string,
  anosConsultados: readonly number[],
  anosVazios: readonly number[],
): EntradaColeta | null {
  const consultados = [...new Set(anosConsultados)].sort((a, b) => a - b)
  const vazios = new Set(anosVazios)
  if (consultados.length === 0 || consultados.some((ano) => !vazios.has(ano))) return null
  return {
    fonte: "camara-gastos",
    escopo: "candidato",
    alvo: slug,
    resultado: "vazio_confirmado",
    volume: 0,
    url: `${API}/deputados/${idCamara}/despesas`,
    detalhe: JSON.stringify({
      contract_version: 1,
      kind: "cota-parlamentar-zero",
      house: "camara",
      source_id: String(idCamara),
      anos: consultados,
      id_legislatura_por_ano: Object.fromEntries(consultados.map((ano) => [ano, ano <= 2022 ? 56 : 57])),
    }),
  }
}

interface CamaraGastosWriteOutcome {
  persistedRows: number
  plannedRows: number
  sourceRows: number
}

async function ingestGastos(
  idCamara: number,
  candidatoId: string,
  slug: string,
  expenseSnapshotDir?: string,
  expenseSnapshotCacheOnly = false,
): Promise<CamaraGastosWriteOutcome> {
  // Fetch expenses from 2019 onwards (current + previous legislature)
  // Note: API returns 504 for older years on ex-deputies
  const anos = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
  let totalRows = 0
  let plannedRows = 0
  let sourceRows = 0
  const anosVazios: number[] = []

  for (const ano of anos) {
    const idLegislatura = ano <= 2022 ? 56 : 57
    const cached = expenseSnapshotDir
      ? readCamaraExpenseSnapshot(expenseSnapshotDir, idCamara, ano, idLegislatura)
      : null
    if (expenseSnapshotCacheOnly && !cached) {
      throw new Error(`Snapshot Câmara ausente em modo cache-only: ${idCamara}/${ano}`)
    }
    const pageReceipts: CamaraExpensePageReceipt[] = cached?.pages ?? []
    const despesas = cached?.despesas ?? await fetchPaginated<Record<string, unknown>>(
      `${API}/deputados/${idCamara}/despesas`,
      {
        ano: String(ano),
        // A API retorna um vazio enganoso quando a legislatura não é informada.
        // O catálogo oficial fixa 56 em 2019-2022 e 57 em 2023-2026.
        idLegislatura: String(idLegislatura),
      },
      expenseSnapshotDir
        ? (capture) => {
            pageReceipts.push(writeCamaraExpensePageSnapshot(expenseSnapshotDir, idCamara, ano, capture))
          }
        : undefined,
    )

    if (despesas.length === 0) {
      if (expenseSnapshotDir) {
        const snapshotHash = sha256(pageReceipts.map((page) => page.sha256).join("\n"))
        const emptySnapshot: CamaraExpenseSnapshot = {
          id_camara: idCamara,
          ano,
          id_legislatura: idLegislatura,
          fonte_url: `${API}/deputados/${idCamara}/despesas`,
          consulta_paginas: pageReceipts.length,
          consulta_snapshot_sha256: snapshotHash,
          fetched_at: pageReceipts.at(-1)?.fetched_at ?? new Date().toISOString(),
          pages: pageReceipts,
          controle_independente: pageReceipts.length > 0,
          valor_liquido_fonte_cents: 0,
          valor_documento_fonte_cents: 0,
          valor_glosa_fonte_cents: 0,
          direct_total_cents: 0,
          grouped_total_cents: 0,
        }
        const manifestPath = resolve(expenseSnapshotDir, String(idCamara), String(ano), "manifest.json")
        writeFileSync(manifestPath, `${JSON.stringify(emptySnapshot, null, 2)}\n`, "utf8")
      }
      anosVazios.push(ano)
      continue
    }
    sourceRows += despesas.length

    const porCategoria: Record<string, number> = {}
    let totalGasto = 0
    const todosGastos: { categoria: string; valor: number; fornecedor: string }[] = []
    let valorDocumentoFonte = 0
    let valorGlosaFonte = 0

    for (const d of despesas) {
      const valorLiquidoRaw = d.valorLiquido
      if (
        valorLiquidoRaw === null ||
        valorLiquidoRaw === undefined ||
        (typeof valorLiquidoRaw === "string" && valorLiquidoRaw.trim() === "")
      ) {
        throw new Error(`Resposta Câmara sem valorLiquido: ${idCamara}/${ano}`)
      }
      const valorLiquido = Number(valorLiquidoRaw)
      if (!Number.isFinite(valorLiquido)) {
        throw new Error(`Resposta Câmara sem valorLiquido numérico: ${idCamara}/${ano}`)
      }
      const valorDocumento = Number(d.valorDocumento)
      const valorGlosa = Number(d.valorGlosa)
      if (!Number.isFinite(valorDocumento) || !Number.isFinite(valorGlosa)) {
        throw new Error(`Resposta Câmara sem valorDocumento/valorGlosa numéricos: ${idCamara}/${ano}`)
      }
      const valor = valorLiquido
      const categoria = String(d.tipoDespesa || "Outros")
      const fornecedor = String(d.nomeFornecedor || "")
      totalGasto += valor
      valorDocumentoFonte += valorDocumento
      valorGlosaFonte += valorGlosa
      porCategoria[categoria] = (porCategoria[categoria] || 0) + valor
      todosGastos.push({ categoria, valor, fornecedor })
    }

    const detalhamento = Object.entries(porCategoria).map(([categoria, valor]) => ({
      categoria,
      valor: Math.round(valor * 100) / 100,
    }))

    const gastosDestaque = todosGastos
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((g) => ({
        categoria: g.categoria,
        valor: Math.round(g.valor * 100) / 100,
        fornecedor: g.fornecedor,
      }))

    const directTotalCents = despesas.reduce((sum, d) => sum + Math.round(Number(d.valorLiquido) * 100), 0)
    const valorDocumentoFonteCents = Math.round(valorDocumentoFonte * 100)
    const valorGlosaFonteCents = Math.round(valorGlosaFonte * 100)
    const groupedTotalCents = Object.values(porCategoria).reduce((sum, value) => sum + Math.round(value * 100), 0)
    const controleIndependente = directTotalCents === groupedTotalCents && pageReceipts.length > 0
    const fonteUrl = `${API}/deputados/${idCamara}/despesas`
    const snapshotHash = sha256(pageReceipts.map((page) => page.sha256).join("\n"))
    const fetchedAt = pageReceipts.at(-1)?.fetched_at ?? new Date().toISOString()
    const snapshot: CamaraExpenseSnapshot = {
      id_camara: idCamara,
      ano,
      id_legislatura: idLegislatura,
      fonte_url: fonteUrl,
      consulta_paginas: pageReceipts.length,
      consulta_snapshot_sha256: snapshotHash,
      fetched_at: fetchedAt,
      pages: pageReceipts,
      controle_independente: controleIndependente,
      valor_liquido_fonte_cents: directTotalCents,
      valor_documento_fonte_cents: valorDocumentoFonteCents,
      valor_glosa_fonte_cents: valorGlosaFonteCents,
      direct_total_cents: directTotalCents,
      grouped_total_cents: groupedTotalCents,
    }
    if (expenseSnapshotDir) {
      const manifestPath = resolve(expenseSnapshotDir, String(idCamara), String(ano), "manifest.json")
      writeFileSync(manifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
    }

    const expenseLookup = supabase
      .from("gastos_parlamentares")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano", ano)
    const { data: existing } = await applyCamaraExpenseSourceFilter(expenseLookup).single()

    assertSemReplacementChar(
      JSON.stringify({ detalhamento, gastosDestaque }),
      `camara:${slug}:${ano}`,
    )

    const row = {
      candidato_id: candidatoId,
      ano,
      total_gasto: Math.round(totalGasto * 100) / 100,
      coletado_em: fetchedAt,
      detalhamento: expenseSnapshotDir
        ? {
            categorias: detalhamento,
            proveniencia: {
              controle_independente: controleIndependente,
              fonte_url: fonteUrl,
              consulta_snapshot_sha256: snapshotHash,
              id_camara: idCamara,
              consulta_paginas: pageReceipts.length,
              ano_consulta: ano,
              id_legislatura: idLegislatura,
              valor_liquido_fonte: Math.round(totalGasto * 100) / 100,
              valor_documento_fonte: Math.round(valorDocumentoFonte * 100) / 100,
              valor_glosa_fonte: Math.round(valorGlosaFonte * 100) / 100,
              direct_total_cents: directTotalCents,
              grouped_total_cents: groupedTotalCents,
            },
          }
        : detalhamento,
      gastos_destaque: gastosDestaque,
      fonte: "Camara",
    }

    if (emDryRun()) {
      planejarEscrita({
        fonte: "camara-gastos", tabela: "gastos_parlamentares",
        operacao: existing ? "update" : "insert", alvo: slug,
        identidade: `id-camara:${idCamara}`,
        chave: existing ? { id: existing.id } : { candidato_id: candidatoId, ano, fonte: "Camara" },
        valores: row,
      })
      plannedRows++
    } else {
      const { error: writeError } = existing
        ? await supabase.from("gastos_parlamentares").update(row).eq("id", existing.id)
        : await supabase.from("gastos_parlamentares").insert(row)
      if (writeError) throw new Error(`gastos_parlamentares ${ano} write falhou: ${writeError.message}`)
      totalRows++
    }

    log("camara", `  ${slug}: gastos ${ano} ${emDryRun() ? "planejados" : "atualizados"} — R$ ${Math.round(totalGasto).toLocaleString()} (${despesas.length} registros)`)
    await sleep(300)
  }

  const reciboZero = reciboCotaZeroCamara(idCamara, slug, anos, anosVazios)
  if (reciboZero) await registrarColeta(reciboZero)

  return { persistedRows: totalRows, plannedRows, sourceRows }
}

export type VotoCamaraNormalizado =
  | "sim"
  | "não"
  | "abstenção"
  | "ausente"
  | "obstrução"
  | "artigo_17"

export function parseVoto(raw: string): VotoCamaraNormalizado | null {
  const s = raw.toLowerCase().trim().replace(/\s+/g, " ")
  if (s === "artigo 17") return "artigo_17"
  if (s === "sim") return "sim"
  if (s === "não" || s === "nao") return "não"
  if (s === "abstenção" || s === "abstencao") return "abstenção"
  if (s === "obstrução" || s === "obstrucao") return "obstrução"
  if (s === "ausente") return "ausente"
  return null
}

/**
 * Costura de IO do matching de votos.
 *
 * Existe para os testes adversariais poderem provar o comportamento em FALHA
 * sem rede e sem banco. Os modos de falha desta funcao (erro de select, detalhe
 * indisponivel, lista de votos vazia, upsert recusado) sao justamente os que
 * ninguem exercita por acaso, e foram eles que deixaram 100 pares errados
 * publicados enquanto a execucao dizia sucesso.
 */
export interface PortasDeVotos {
  selecionarVotacoesChave: () => Promise<{
    data: Array<Record<string, unknown>> | null
    error: { message: string } | null
  }>
  buscarDetalheDaVotacao: (votacaoIdApi: string, onSourceRevision?: (revision: { url: string; sha256: string }) => void) => Promise<{ id?: unknown; data?: unknown; descricao?: unknown } | null>
  atualizarDataOficial: (input: { id: string; votacaoIdApi: string; data: string; dataAnterior: string | null; casaAnterior: string | null; fonteAnterior: string | null; proposicaoIdOficial: string | null; proposicaoIdAnterior: string | null }) => Promise<{ atualizada: boolean; error: string | null }>
  buscarVotosDaVotacao: (votacaoIdApi: string, onSourceRevision?: (revision: { url: string; sha256: string }) => void) => Promise<Array<Record<string, unknown>>>
  gravarVoto: (linha: {
    candidato_id: string
    votacao_id: string
    voto: string
  }) => Promise<{ error: { message: string } | null }>
}

const PORTAS_REAIS: PortasDeVotos = {
  selecionarVotacoesChave: async () => {
    const { data, error } = await supabase
      .from("votacoes_chave")
      .select("id, titulo, casa, fonte, votacao_id_api, data_votacao, proposicao_id")
      .or("fonte.eq.camara,fonte.eq.Câmara,fonte.is.null")
      .not("votacao_id_api", "is", null)
    return { data: (data as Array<Record<string, unknown>> | null) ?? null, error }
  },
  buscarDetalheDaVotacao: async (votacaoIdApi, onSourceRevision) => {
    const url = `${API}/votacoes/${votacaoIdApi}`
    let body = ""
    const detalhe = await camaraFetchJSON<CamaraResponse<Record<string, unknown>>>(
      url,
      { onResponseBody: (raw) => { body = raw } },
    )
    if (body) onSourceRevision?.({ url, sha256: sha256(body) })
    return detalhe.dados ?? null
  },
  buscarVotosDaVotacao: async (votacaoIdApi, onSourceRevision) => {
    const url = `${API}/votacoes/${votacaoIdApi}/votos`
    let body = ""
    const resp = await camaraFetchJSON<CamaraResponse<Record<string, unknown>[]>>(
      url,
      { onResponseBody: (raw) => { body = raw } },
    )
    if (body) onSourceRevision?.({ url, sha256: sha256(body) })
    return resp.dados ?? []
  },
  atualizarDataOficial: async ({ id, votacaoIdApi, data, dataAnterior, casaAnterior, fonteAnterior, proposicaoIdOficial, proposicaoIdAnterior }) => {
    const valores: Record<string, string> = { data_votacao: data, casa: "Câmara", fonte: "camara" }
    if (proposicaoIdOficial !== null) valores.proposicao_id = proposicaoIdOficial
    const base = supabase.from("votacoes_chave").update(valores)
      .eq("id", id).eq("votacao_id_api", votacaoIdApi)
    const casaGuard = casaAnterior === null ? base.is("casa", null) : base.eq("casa", casaAnterior)
    const fonteGuard = fonteAnterior === null ? casaGuard.is("fonte", null) : casaGuard.eq("fonte", fonteAnterior)
    let guarded = dataAnterior === null ? fonteGuard.is("data_votacao", null) : fonteGuard.eq("data_votacao", dataAnterior)
    if (proposicaoIdOficial !== null) guarded = proposicaoIdAnterior === null
      ? guarded.is("proposicao_id", null)
      : guarded.eq("proposicao_id", proposicaoIdAnterior)
    const write = await escreverAuditado({
      script: "ingest-camara",
      tabela: "votacoes_chave",
      motivo: "Sincronizar metadados oficiais da votação Câmara pelo evento exato",
      recorte: `votacao_id_api:${votacaoIdApi}`,
    }, () => guarded.select("id, data_votacao, proposicao_id"))
    if (write.length !== 1 || write[0]?.id !== id || write[0]?.data_votacao !== data
      || (proposicaoIdOficial !== null && write[0]?.proposicao_id !== proposicaoIdOficial)) {
      return { atualizada: false, error: "readback dos metadados oficiais não confirmou exatamente a linha" }
    }
    const readback = await supabase.from("votacoes_chave").select("id, casa, fonte, votacao_id_api, data_votacao, proposicao_id")
      .eq("id", id).in("casa", ["Câmara", "Camara"]).eq("fonte", "camara").eq("votacao_id_api", votacaoIdApi).maybeSingle()
    if (readback.error || readback.data?.data_votacao !== data || readback.data?.casa !== "Câmara" || readback.data?.fonte !== "camara"
      || (proposicaoIdOficial !== null && readback.data?.proposicao_id !== proposicaoIdOficial)) {
      return { atualizada: false, error: readback.error?.message ?? "select independente divergiu" }
    }
    return { atualizada: true, error: null }
  },
  gravarVoto: async (linha) => {
    const { error } = await supabase
      .from("votos_candidato")
      .upsert(linha, { onConflict: "candidato_id,votacao_id" })
    return { error }
  },
}

let portas: PortasDeVotos = PORTAS_REAIS

export function __usarPortasDeVotosParaTeste(novas: Partial<PortasDeVotos>): void {
  const detalheMock = novas.buscarDetalheDaVotacao
  portas = {
    ...PORTAS_REAIS,
    atualizarDataOficial: async () => ({ atualizada: true, error: null }),
    ...novas,
    ...(detalheMock ? {
      buscarDetalheDaVotacao: async (id, onRevision) => {
        const detail = await detalheMock(id, onRevision)
        return detail && detail.id === undefined && typeof detail.descricao === "string"
          ? { ...detail, id, data: typeof detail.data === "string" ? detail.data : "2020-01-01" }
          : detail
      },
    } : {}),
  }
  __resetCacheVotacoesParaTeste()
}

export function __restaurarPortasDeVotos(): void {
  portas = PORTAS_REAIS
  __resetCacheVotacoesParaTeste()
}

/**
 * Uma votacao-chave da Camara, endereçada pelo id EXATO da votacao na fonte.
 *
 * `descricaoOficial` e `classificacao` vem do endpoint de detalhe, nao do
 * dataset: o texto editorial da ficha nao serve para decidir se a votacao e
 * procedimental, porque quem escreve o texto editorial e a curadoria e o que
 * precisa ser conferido e a FONTE.
 */
interface VotacaoChaveCamara {
  id: string
  votacaoIdApi: string
  titulo: string
  descricaoOficial: string | null
  classificacao: ClassificacaoVotacao
  dataVotacao: string | null
}

/**
 * Resultado do carregamento das votacoes-chave.
 *
 * `erros` NAO e cosmetico. Falha de rede, de API ou de banco tem que chegar em
 * `IngestResult.errors`, senao a execucao termina "com sucesso" tendo casado
 * menos votos do que devia, e ninguem fica sabendo. Foi assim que 100 pares
 * errados ficaram publicados: o caminho antigo engolia excecao com `catch {}` e
 * seguia.
 */
interface CarregamentoVotacoes {
  votacoes: VotacaoChaveCamara[]
  erros: string[]
  avisos: string[]
  /** `true` quando alguma etapa falhou. Estado indeterminado nao vira sucesso. */
  degradado: boolean
  sourceRevisions: Array<{ url: string; sha256: string }>
}

/**
 * Cache por execucao. `ingestVotos` roda uma vez por candidato, e sem cache o
 * detalhe e a lista de votos de cada votacao-chave seriam baixados uma vez por
 * candidato: 12 votacoes x 59 deputados = 708 chamadas para o mesmo conteudo.
 *
 * So resultado BEM-SUCEDIDO entra no cache. Guardar falha como mapa vazio faria
 * a primeira falha de rede virar "esse deputado nao votou" para todos os
 * candidatos seguintes, que e mentira com aparencia de dado.
 */
let cacheVotacoesChave: CarregamentoVotacoes | null = null
const cacheVotosPorVotacao = new Map<
  string,
  { votos: Map<number, { normalizado: VotoCamaraNormalizado | null; cru: string }>; sourceRevision?: { url: string; sha256: string } }
>()

export function __resetCacheVotacoesParaTeste(): void {
  cacheVotacoesChave = null
  cacheVotosPorVotacao.clear()
}

/**
 * Carrega as votacoes-chave da Camara que TEM chave exata, e descarta as
 * procedimentais.
 *
 * Votacao sem `votacao_id_api` nao entra: ela nao e enderecavel, e a alternativa
 * (procurar pela proposicao) e exatamente o que produziu as 6 linhas defeituosas
 * de 10/08/2026. Melhor a ficha nao mostrar nada do que mostrar o voto errado.
 */
async function carregarVotacoesChaveCamara(): Promise<CarregamentoVotacoes> {
  if (cacheVotacoesChave) return cacheVotacoesChave

  const erros: string[] = []
  const { data, error } = await portas.selecionarVotacoesChave()

  if (error) {
    // Nao cacheia: erro de banco e transitorio, e congelar "zero votacoes"
    // faria todo candidato seguinte da execucao sair sem voto em silencio.
    const msg = `votos: select de votacoes_chave falhou: ${error.message}`
    warn("camara", `  ${msg}`)
    return { votacoes: [], erros: [msg], avisos: [], degradado: true, sourceRevisions: [] }
  }

  const carregadas: VotacaoChaveCamara[] = []
  const avisos: string[] = []
  const sourceRevisions: Array<{ url: string; sha256: string }> = []
  for (const linha of data ?? []) {
    if (linha.fonte != null && linha.fonte !== "camara" && linha.fonte !== "Câmara") continue
    if (linha.casa != null && linha.casa !== "Câmara" && linha.casa !== "Camara") {
      const msg = `votos: votação ${String(linha.votacao_id_api)} tem Casa ${String(linha.casa)}; revisão manual necessária`
      erros.push(msg)
      continue
    }
    const votacaoIdApi = String(linha.votacao_id_api)
    let descricaoOficial: string | null = null
    let detalheOficial: Record<string, unknown> | null = null
    try {
      const detalhe = await portas.buscarDetalheDaVotacao(votacaoIdApi, (revision) => { sourceRevisions.push(revision) })
      detalheOficial = detalhe as Record<string, unknown> | null
      const bruto = detalhe?.descricao
      descricaoOficial = typeof bruto === "string" ? bruto : null
    } catch (err) {
      const msg = `votos: detalhe da votacao ${votacaoIdApi} ("${linha.titulo}") indisponivel: ${err instanceof Error ? err.message : String(err)}`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }

    // Descricao ausente com HTTP 200 e indeterminado, nao "nao procedimental":
    // sem o texto oficial nao da para afirmar o que foi votado, e classificar
    // como aceitavel seria decidir por ausencia de prova.
    if (descricaoOficial === null) {
      const msg = `votos: votacao ${votacaoIdApi} ("${linha.titulo}") voltou sem descricao oficial; nao da para classificar e ela fica de fora`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }

    const idDetalhe = detalheOficial?.id
    if (idDetalhe !== votacaoIdApi) {
      const msg = `votos: detalhe oficial devolveu id ${String(idDetalhe)} para chave ${votacaoIdApi}; evento recusado`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }
    const idsProposicoes = Array.isArray(detalheOficial?.proposicoesAfetadas)
      ? detalheOficial.proposicoesAfetadas.map((raw) => {
          if (!raw || typeof raw !== "object") return null
          const id = (raw as Record<string, unknown>).id
          return typeof id === "string" || typeof id === "number" ? String(id) : null
        }).filter((id): id is string => id !== null)
      : []
    const proposicaoAnterior = typeof linha.proposicao_id === "string" || typeof linha.proposicao_id === "number"
      ? String(linha.proposicao_id)
      : null
    let proposicaoOficial: string | null = null
    if (Array.isArray(detalheOficial?.proposicoesAfetadas) && detalheOficial.proposicoesAfetadas.length === 1 && idsProposicoes.length === 1) {
      proposicaoOficial = idsProposicoes[0]!
    } else if (Array.isArray(detalheOficial?.proposicoesAfetadas) && detalheOficial.proposicoesAfetadas.length > 1
      && (proposicaoAnterior === null || !idsProposicoes.includes(proposicaoAnterior))) {
      const msg = `votos: votação ${votacaoIdApi} afeta múltiplas proposições e a chave anterior ${String(proposicaoAnterior)} não está na lista oficial; revisão necessária`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }
    const dataBruta = detalheOficial?.data
    const parsedDate = typeof dataBruta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dataBruta)
      ? new Date(`${dataBruta}T00:00:00.000Z`)
      : null
    const dataOficial = parsedDate && parsedDate.toISOString().slice(0, 10) === dataBruta ? dataBruta as string : null
    if (!dataOficial) {
      const msg = `votos: votação ${votacaoIdApi} sem data oficial válida no detalhe; data publicada preservada`
      warn("camara", `  ${msg}`)
      erros.push(msg)
    } else if (dataOficial !== (typeof linha.data_votacao === "string" ? linha.data_votacao : null)
      || (proposicaoOficial !== null && proposicaoOficial !== proposicaoAnterior)
      || linha.casa == null || linha.fonte == null) {
      const dataAnterior = typeof linha.data_votacao === "string" ? linha.data_votacao : null
      if (emDryRun()) {
        planejarEscrita({
          fonte: "destaques-votacoes", tabela: "votacoes_chave", operacao: "update", alvo: votacaoIdApi,
          identidade: `fonte:camara;votacao_id_api:${votacaoIdApi}`,
          chave: { id: String(linha.id), data_votacao: dataAnterior },
          valores: { data_votacao: dataOficial, proposicao_id: proposicaoOficial, casa: "Câmara", fonte: "camara" },
        })
      } else {
        const atualizado = await portas.atualizarDataOficial({
          id: String(linha.id), votacaoIdApi, data: dataOficial, dataAnterior,
          casaAnterior: typeof linha.casa === "string" ? linha.casa : null,
          fonteAnterior: typeof linha.fonte === "string" ? linha.fonte : null,
          proposicaoIdOficial: proposicaoOficial,
          proposicaoIdAnterior: proposicaoAnterior,
        })
        if (atualizado.error || !atualizado.atualizada) {
          const msg = `votos: data oficial da votação ${votacaoIdApi} não atualizada: ${atualizado.error ?? "preimage/readback divergiu"}`
          warn("camara", `  ${msg}`)
          erros.push(msg)
        }
      }
    }

    const { classificacao } = classificarVotacao(descricaoOficial)
    if (classificacao === "procedimental") {
      // Recusa deliberada, nao falha: o dataset apontou para uma votacao que a
      // fonte diz ser procedimental, e isso e defeito de curadoria a corrigir.
      const msg = `votos: votacao ${votacaoIdApi} ("${linha.titulo}") e PROCEDIMENTAL na fonte e foi recusada: ${descricaoOficial.slice(0, 90)}`
      warn("camara", `  ${msg}`)
      avisos.push(msg)
      continue
    }

    carregadas.push({
      id: String(linha.id),
      votacaoIdApi,
      titulo: String(linha.titulo),
      descricaoOficial,
      classificacao,
      dataVotacao: typeof linha.data_votacao === "string" ? linha.data_votacao.slice(0, 10) : null,
    })
  }

  const carregamento: CarregamentoVotacoes = {
    votacoes: carregadas,
    erros,
    avisos,
    degradado: erros.length > 0,
    sourceRevisions,
  }

  // SÓ carregamento íntegro entra no cache, e a condição é `erros.length === 0`,
  // nunca "tem alguma votação". Carregamento parcial cacheado congela a lista
  // curta para todos os candidatos seguintes da execução: uma votação que caiu
  // por 503 transitório na primeira ficha vira "essa votação não existe" nas
  // outras 58, em silêncio e com aparência de dado.
  //
  // O custo é assumido: se uma votação do dataset estiver quebrada ou for
  // procedimental, o detalhe é rebaixado a cada candidato. Isso é caro de
  // propósito, porque nesse estado o dataset tem defeito de curadoria a
  // corrigir, e cache barato esconderia o defeito em vez de pressioná-lo.
  if (erros.length === 0) {
    cacheVotacoesChave = carregamento
  }

  return carregamento
}

/** Lista de votos de uma votacao, ou falha nomeada. Nunca mapa vazio por erro. */
type VotosDaVotacao =
  | {
      ok: true
      votos: Map<number, { normalizado: VotoCamaraNormalizado | null; cru: string }>
      sourceRevision?: { url: string; sha256: string }
    }
  | { ok: false; motivo: string }

/**
 * Mapa idDeputado -> voto, baixado uma vez por execucao.
 *
 * HTTP 200 com `dados: []` NAO e sucesso aqui. Uma votacao aprovada para o
 * dataset e, por construcao, uma votacao nominal com centenas de votos: lista
 * vazia significa que a fonte nao publicou o voto individual daquele id, que foi
 * exatamente o caso da denuncia contra Temer (2143164-138). Tratar como sucesso
 * gravaria "ninguem votou" e a ficha mostraria a materia sem voto nenhum como se
 * fosse fato apurado.
 */
async function votosDaVotacao(votacaoIdApi: string): Promise<VotosDaVotacao> {
  const cacheado = cacheVotosPorVotacao.get(votacaoIdApi)
  if (cacheado) return { ok: true, votos: cacheado.votos, sourceRevision: cacheado.sourceRevision }

  let bruto: Array<Record<string, unknown>>
  let sourceRevision: { url: string; sha256: string } | undefined
  try {
    bruto = await portas.buscarVotosDaVotacao(votacaoIdApi, (revision) => { sourceRevision = revision })
  } catch (err) {
    return {
      ok: false,
      motivo: `lista de votos da votacao ${votacaoIdApi} indisponivel: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (bruto.length === 0) {
    return {
      ok: false,
      motivo: `votacao ${votacaoIdApi} voltou 200 com lista de votos VAZIA; a fonte nao publicou o voto nominal desse id, estado indeterminado`,
    }
  }

  const mapa = new Map<
    number,
    { normalizado: VotoCamaraNormalizado | null; cru: string }
  >()
  for (const v of bruto) {
    const dep = v.deputado_ as Record<string, unknown> | undefined
    const idDep = Number(dep?.id)
    if (!Number.isFinite(idDep)) continue
    const cru = String(v.tipoVoto ?? "")
    const normalizado = parseVoto(cru)
    if (normalizado == null) {
      warn(
        "camara",
        `  votacao ${votacaoIdApi}: tipoVoto desconhecido para deputado ${idDep}: ${JSON.stringify(cru)}`
      )
    }
    mapa.set(idDep, { normalizado, cru })
  }

  // So sucesso entra no cache.
  cacheVotosPorVotacao.set(votacaoIdApi, { votos: mapa, sourceRevision })
  return { ok: true, votos: mapa, sourceRevision }
}

export interface VotosIngestOutcome {
  /** Linhas que o banco CONFIRMOU. Upsert recusado nao conta. */
  persistidos: number
  /** Linhas planejadas em dry-run; nunca contam como persistidas. */
  planejados: number
  /** Toda falha nomeada, para subir em IngestResult.errors. */
  erros: string[]
  /** Recusas de curadoria que devem aparecer no relatório sem falhar o ingest completo. */
  avisos: string[]
  completo: boolean
  votacoesConferidas: number
  sourceRows: number
  sourceRevisions: Array<{ url: string; sha256: string }>
}

export function reciboDestaquesVotacoesCamara(
  slug: string,
  idCamara: number,
  outcome: VotosIngestOutcome,
): EntradaColeta {
  const resultado = !outcome.completo
    ? "erro"
    : outcome.persistidos + outcome.planejados > 0 ? "encontrado" : "vazio_confirmado"
  const primeiroUrl = outcome.sourceRevisions[0]?.url
  return {
    fonte: "destaques-votacoes",
    escopo: "candidato",
    alvo: slug,
    resultado,
    volume: resultado === "encontrado" ? outcome.persistidos + outcome.planejados : 0,
    detalhe: JSON.stringify({
      contract_version: 1,
      kind: "camara-destaques-votacoes",
      identity: { house: "camara", source_id: String(idCamara) },
      votacoes_conferidas: outcome.votacoesConferidas,
      source_rows: outcome.sourceRows,
      votos_publicados: outcome.persistidos,
      votos_planejados: outcome.planejados,
      fonte_completa: outcome.completo,
      erros: outcome.erros,
      source_revisions: outcome.sourceRevisions,
    }),
    url: primeiroUrl ?? `${API}/votacoes`,
  }
}

/**
 * Casa os votos do deputado pela chave composta (fonte, votacao_id_api).
 *
 * O que este matching NAO faz mais, e por que:
 *
 * - nao busca por `proposicao_id`. Uma proposicao tem muitas votacoes (33 no
 *   Teto de Gastos), e aceitar qualquer uma publicava destaque, requerimento de
 *   urgencia e redacao final como se fossem posicao de merito;
 * - nao le `/deputados/{id}/votacoes`, que devolvia inclusive votacao de
 *   comissao da mesma proposicao;
 * - nao tem `plenVotacoes.slice(0, 3)`. Nao ha mais busca a limitar, entao o
 *   limite que deixava 30 votacoes fora do alcance deixou de existir;
 * - nao engole erro. Falha de banco, de detalhe, de lista de votos e de upsert
 *   sobe nomeada.
 */
export async function ingestVotos(
  idCamara: number,
  candidatoId: string,
  slug: string
): Promise<VotosIngestOutcome> {
  const { votacoes, erros: errosDeCarga, avisos: avisosDeCarga } =
    await carregarVotacoesChaveCamara()
  const sourceRevisions = [...(cacheVotacoesChave?.sourceRevisions ?? [])]
  const erros = errosDeCarga.map((e) => `${slug}: ${e}`)
  const avisos = avisosDeCarga.map((a) => `${slug}: ${a}`)

  if (votacoes.length === 0) {
    log("camara", `  ${slug}: nenhuma votacao-chave da Camara utilizavel, pulando votos`)
    return { persistidos: 0, planejados: 0, erros, avisos, completo: false, votacoesConferidas: 0, sourceRows: 0, sourceRevisions }
  }

  let persistidos = 0
  let planejados = 0
  let sourceRows = 0
  for (const votacao of votacoes) {
    const resultado = await votosDaVotacao(votacao.votacaoIdApi)
    if (!resultado.ok) {
      erros.push(`${slug}: ${resultado.motivo}`)
      continue
    }
    sourceRows += resultado.votos.size
    if (resultado.sourceRevision) sourceRevisions.push(resultado.sourceRevision)

    const votoDaFonte = resultado.votos.get(idCamara)
    if (!votoDaFonte) continue
    if (votoDaFonte.normalizado == null) {
      erros.push(
        `${slug}: tipoVoto desconhecido ${JSON.stringify(votoDaFonte.cru)} na votacao ${votacao.votacaoIdApi}; par enviado para revisao e nao persistido`
      )
      continue
    }

    const row = {
      candidato_id: candidatoId,
      votacao_id: votacao.id,
      voto: votoDaFonte.normalizado,
    }
    if (emDryRun()) {
      planejarEscrita({
        fonte: "destaques-votacoes", tabela: "votos_candidato", operacao: "upsert", alvo: slug,
        identidade: `id-camara:${idCamara}`, chave: { candidato_id: candidatoId, votacao_id: votacao.id },
        valores: row,
      })
      planejados++
      continue
    }
    const { error } = await portas.gravarVoto(row)

    // Conta o que o banco confirmou, nao o que a gente tentou. Contar tentativa
    // faz o relatorio dizer que gravou o que foi recusado.
    if (error) {
      erros.push(
        `${slug}: upsert do voto na votacao ${votacao.votacaoIdApi} recusado: ${error.message}`
      )
      continue
    }
    persistidos++
  }

  log(
    "camara",
    `  ${slug}: ${votacoes.length} votacoes-chave conferidas, ${persistidos} voto(s) confirmado(s)${planejados ? `, ${planejados} planejado(s)` : ""}${erros.length ? `, ${erros.length} falha(s)` : ""}${avisos.length ? `, ${avisos.length} aviso(s) de curadoria` : ""}`
  )
  return {
    persistidos,
    planejados,
    erros,
    avisos,
    completo: erros.length === 0 && votacoes.length > 0 && sourceRevisions.length >= votacoes.length * 2,
    votacoesConferidas: votacoes.length,
    sourceRows,
    sourceRevisions: [...new Map(sourceRevisions.map((item) => [item.url, item])).values()],
  }
}

interface ProjetosIngestOutcome {
  /** Quantas a fonte declarou para a consulta de autoria. `null` = fonte nao disse. */
  declarado: number | null
  /** Quantas linhas o laco tentou gravar. */
  tentado: number
  /** Quantas o upsert confirmou sem erro. */
  persistido: number
  /** Linhas planejadas em dry-run; nunca contam como persistidas. */
  planejado: number
  /** Quantas o upsert recusou, com a mensagem da primeira falha. */
  falhou: number
  primeiroErro?: string
  /** Contagem relida do banco depois de gravar (readback). `null` = leitura falhou. */
  readback: number | null
  /** Recorte do que foi tentado, pela `siglaTipo`. */
  projetosLei: number
  outrasProposicoes: number
  sourceRevisions: Array<{ url: string; sha256: string }>
  legacyReconciliation?: { provenanceAdded: number; unpublished: number; review: number }
}

export type LinhaProjetoLegadaCamara = {
  id: string
  candidato_id: string
  tipo: string | null
  numero: string | null
  ano: number | null
  ementa: string | null
  fonte: string | null
  proposicao_id_api: string | null
  despublicado_em?: string | null
}

function chaveEmentaProjeto(row: { tipo?: unknown; siglaTipo?: unknown; numero?: unknown; ementa?: unknown }): string | null {
  const tipo = String(row.tipo ?? row.siglaTipo ?? "").trim().toUpperCase()
  const numero = String(row.numero ?? "").trim()
  const ementa = stripAccents(String(row.ementa ?? "")).toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
  return tipo && numero && ementa ? `${tipo}\u0000${numero}\u0000ementa:${ementa}` : null
}

function chaveMaterialProjeto(row: { tipo?: unknown; siglaTipo?: unknown; numero?: unknown; ano?: unknown; ementa?: unknown }): string | null {
  const tipo = String(row.tipo ?? row.siglaTipo ?? "").trim().toUpperCase()
  const numero = String(row.numero ?? "").trim()
  const ano = Number(row.ano)
  if (!tipo || !numero) return null
  if (Number.isInteger(ano) && ano >= 1900 && ano <= 2100) return `${tipo}\u0000${numero}\u0000ano:${ano}`
  return chaveEmentaProjeto(row)
}

export function planejarReconciliacaoProjetosCamara(input: {
  legacyRows: readonly LinhaProjetoLegadaCamara[]
  officialRows: readonly Record<string, unknown>[]
  sourceComplete: boolean
  otherHouseExcluded: boolean
}): { matched: Array<{ legacy: LinhaProjetoLegadaCamara; official: Record<string, unknown> }>; absent: LinhaProjetoLegadaCamara[]; review: LinhaProjetoLegadaCamara[] } {
  const legacyRows = input.legacyRows.filter((row) =>
    (row.fonte == null || row.fonte === "Câmara" || row.fonte === "Camara") && row.despublicado_em == null,
  )
  const officialByKey = new Map<string, Record<string, unknown>[]>()
  const officialById = new Map<string, Record<string, unknown>[]>()
  const legacyByKey = new Map<string, LinhaProjetoLegadaCamara[]>()
  const review = new Set<LinhaProjetoLegadaCamara>()
  for (const official of input.officialRows) {
    const keys = [chaveMaterialProjeto(official), chaveEmentaProjeto(official)].filter((key): key is string => key !== null)
    for (const key of new Set(keys)) {
      const rows = officialByKey.get(key) ?? []
      rows.push(official)
      officialByKey.set(key, rows)
    }
  }
  for (const legacy of legacyRows.filter((row) => row.proposicao_id_api == null)) {
    const key = chaveMaterialProjeto(legacy)
    if (!key) { review.add(legacy); continue }
    const rows = legacyByKey.get(key) ?? []
    rows.push(legacy)
    legacyByKey.set(key, rows)
  }
  const matched: Array<{ legacy: LinhaProjetoLegadaCamara; official: Record<string, unknown> }> = []
  const absent: LinhaProjetoLegadaCamara[] = []
  const matchedLegacy = new Set<LinhaProjetoLegadaCamara>()
  const usedOfficial = new Set<string>()
  for (const official of input.officialRows) {
    const id = String(official.id ?? "").trim()
    if (!id) continue
    const rows = officialById.get(id) ?? []
    rows.push(official)
    officialById.set(id, rows)
  }
  for (const legacy of legacyRows.filter((row) => row.proposicao_id_api != null)) {
    const id = String(legacy.proposicao_id_api).trim()
    const candidates = officialById.get(id) ?? []
    if (id && candidates.length === 1 && legacyRows.filter((row) => row.proposicao_id_api === legacy.proposicao_id_api).length === 1) {
      matched.push({ legacy, official: candidates[0]! })
      matchedLegacy.add(legacy)
      usedOfficial.add(id)
    } else review.add(legacy)
  }
  for (const [key, oldRows] of legacyByKey) {
    const officialRows = officialByKey.get(key) ?? []
    if (oldRows.length !== 1) {
      oldRows.forEach((row) => review.add(row))
      continue
    }
    if (officialRows.length === 0) {
      if (input.sourceComplete && input.otherHouseExcluded) absent.push(oldRows[0]!)
      else review.add(oldRows[0]!)
      continue
    }
    if (officialRows.length !== 1) {
      oldRows.forEach((row) => review.add(row))
      continue
    }
    const officialId = String(officialRows[0]?.id ?? "")
    if (!officialId || usedOfficial.has(officialId)) {
      oldRows.forEach((row) => review.add(row))
      continue
    }
    matched.push({ legacy: oldRows[0]!, official: officialRows[0]! })
    matchedLegacy.add(oldRows[0]!)
    usedOfficial.add(officialId)
  }
  for (const legacy of legacyRows) {
    if (matchedLegacy.has(legacy) || review.has(legacy)) continue
    if (!absent.includes(legacy)) review.add(legacy)
  }
  return { matched, absent, review: [...review] }
}

/**
 * Persiste o acervo autoral da Camara para um candidato.
 *
 * Issue #138. Antes existia `proposicoes.slice(0, 100)` aqui, e ele descartava
 * 1989 das 2089 proposicoes autorais do `efraim-filho` em silencio. O laco agora
 * grava tudo o que a fonte devolve, confere o erro de CADA upsert antes de
 * contar, e relê a contagem do banco no fim.
 *
 * O que NAO acontece aqui e filtro por `siglaTipo`: o acervo autoral entra
 * inteiro, e a classificacao entre projeto de lei e outra proposicao fica em
 * `src/lib/proposicao-natureza.ts`, aplicada na leitura. A decisao e o porque
 * estao em `Settings/SOURCES_AND_DATA.md`.
 */
async function ingestProjetos(
  idCamara: number,
  candidatoId: string,
  slug: string,
  declaradoNaFonte: number | null,
  otherHouseExcluded: boolean
): Promise<ProjetosIngestOutcome> {
  const sourceRevisions: Array<{ url: string; sha256: string }> = []
  const proposicoes = await fetchPaginated<Record<string, unknown>>(
    `${API}/proposicoes`,
    { idDeputadoAutor: String(idCamara), ordem: "DESC", ordenarPor: "id" },
    (capture) => { sourceRevisions.push({ url: capture.url, sha256: sha256(capture.body) }) },
  )

  // Vistoria do PR #141: `?? proposicoes.length` convertia "não sei" na
  // contagem que o próprio ingest baixou, e o coleta_log passava a registrar
  // como declarado pela fonte um número que a fonte nunca declarou. Declarado
  // desconhecido fica desconhecido; quem preenche é o request dedicado do
  // chamador, nunca o resultado da paginação.
  const outcome: ProjetosIngestOutcome = {
    declarado: declaradoNaFonte,
    tentado: 0,
    persistido: 0,
    planejado: 0,
    falhou: 0,
    readback: null,
    sourceRevisions,
    legacyReconciliation: { provenanceAdded: 0, unpublished: 0, review: 0 },
    ...contarPorNatureza(proposicoes.map((p) => String(p.siglaTipo ?? ""))),
  }

  const legacyQuery = await supabase.from("projetos_lei")
    .select("id, candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api, despublicado_em", { count: "exact" })
    .eq("candidato_id", candidatoId).is("despublicado_em", null)
    .or("fonte.is.null,fonte.eq.Câmara,fonte.eq.Camara")
    .range(0, 1000)
  if (legacyQuery.error) throw new Error(`leitura de projetos legados falhou (${slug})`)
  if (legacyQuery.count == null || legacyQuery.count !== (legacyQuery.data ?? []).length) {
    throw new Error(`leitura de projetos legados truncada (${slug})`)
  }
  const legacyRows = (legacyQuery.data ?? []) as LinhaProjetoLegadaCamara[]
  const sourceComplete = declaradoNaFonte != null && declaradoNaFonte === proposicoes.length
  const reconciliation = planejarReconciliacaoProjetosCamara({
    legacyRows, officialRows: proposicoes, sourceComplete, otherHouseExcluded,
  })
  outcome.legacyReconciliation = {
    provenanceAdded: reconciliation.matched.length,
    unpublished: reconciliation.absent.length,
    review: reconciliation.review.length,
  }
  for (const { legacy, official } of reconciliation.matched) {
    const officialId = String(official.id)
    if (emDryRun()) {
      planejarEscrita({ fonte: FONTE_CAMARA_PROPOSICOES, tabela: "projetos_lei", operacao: "update", alvo: slug,
        identidade: `id-camara:${idCamara}`, chave: { id: legacy.id, tipo: legacy.tipo, numero: legacy.numero, ano: legacy.ano, fonte: legacy.fonte, proposicao_id_api: legacy.proposicao_id_api },
        valores: { fonte: "Camara", proposicao_id_api: officialId } })
      continue
    }
    let update = supabase.from("projetos_lei").update({ fonte: "Camara", proposicao_id_api: officialId })
      .eq("id", legacy.id).eq("candidato_id", candidatoId).is("despublicado_em", null)
    update = legacy.proposicao_id_api == null
      ? update.is("proposicao_id_api", null)
      : update.eq("proposicao_id_api", legacy.proposicao_id_api)
    for (const [column, value] of [["tipo", legacy.tipo], ["numero", legacy.numero], ["ano", legacy.ano], ["ementa", legacy.ementa], ["fonte", legacy.fonte]] as const) {
      update = value == null ? update.is(column, null) : update.eq(column, value)
    }
    const write = await escreverAuditado({ script: "ingest-camara", tabela: "projetos_lei",
      motivo: "Associar linha legada de proposição à matéria oficial única da Câmara", recorte: `${slug}:${legacy.id}->${officialId}` },
    () => update.select("id, candidato_id, tipo, numero, ano, ementa, fonte, proposicao_id_api"))
    const written = write[0] as Record<string, unknown> | undefined
    if (write.length !== 1 || written?.id !== legacy.id || written?.fonte !== "Camara" || written?.proposicao_id_api !== officialId) {
      throw new Error(`preimage/readback da promoção de projeto divergiu (${slug}:${legacy.id})`)
    }
    const readback = await supabase.from("projetos_lei").select("id, fonte, proposicao_id_api")
      .eq("id", legacy.id).eq("candidato_id", candidatoId).maybeSingle()
    if (readback.error || readback.data?.fonte !== "Camara" || readback.data?.proposicao_id_api !== officialId) {
      throw new Error(`readback independente da promoção divergiu (${slug}:${legacy.id})`)
    }
  }
  for (const legacy of reconciliation.absent) {
    if (emDryRun()) {
      planejarEscrita({ fonte: FONTE_CAMARA_PROPOSICOES, tabela: "projetos_lei", operacao: "update", alvo: slug,
        identidade: `id-camara:${idCamara}`, chave: { id: legacy.id, tipo: legacy.tipo, numero: legacy.numero, ano: legacy.ano },
        valores: { despublicado_em: "now()", despublicacao_motivo: "camara-proposicoes: ausência em lista oficial completa" } })
      continue
    }
    const reason = `camara-proposicoes: matéria não consta na lista autoral completa do ID Câmara ${idCamara}; mantida para auditoria`
    let update = supabase.from("projetos_lei").update({ despublicado_em: new Date().toISOString(), despublicacao_motivo: reason })
      .eq("id", legacy.id).eq("candidato_id", candidatoId).is("despublicado_em", null).is("proposicao_id_api", null)
    for (const [column, value] of [["tipo", legacy.tipo], ["numero", legacy.numero], ["ano", legacy.ano], ["ementa", legacy.ementa], ["fonte", legacy.fonte]] as const) {
      update = value == null ? update.is(column, null) : update.eq(column, value)
    }
    const write = await escreverAuditado({ script: "ingest-camara", tabela: "projetos_lei",
      motivo: "Despublicar proposição legada ausente em lista oficial completa da Câmara", recorte: `${slug}:${legacy.id}` },
    () => update.select("id, despublicado_em, despublicacao_motivo"))
    if (write.length !== 1 || write[0]?.id !== legacy.id || !write[0]?.despublicado_em || write[0]?.despublicacao_motivo !== reason) {
      throw new Error(`preimage/readback da despublicação de projeto divergiu (${slug}:${legacy.id})`)
    }
    const readback = await supabase.from("projetos_lei").select("id, despublicado_em, despublicacao_motivo")
      .eq("id", legacy.id).eq("candidato_id", candidatoId).maybeSingle()
    if (readback.error || readback.data?.despublicado_em == null || readback.data?.despublicacao_motivo !== reason) {
      throw new Error(`readback independente da despublicação de projeto divergiu (${slug}:${legacy.id})`)
    }
  }

  for (const p of proposicoes) {
    const propId = String(p.id)

    const row = {
      candidato_id: candidatoId,
      tipo: String(p.siglaTipo || ""),
      numero: String(p.numero || ""),
      ano: Number(p.ano) || null,
      ementa: sanitizePublicTextOrThrow(
        String(p.ementa || ""),
        `camara:${slug}:proposicao:${propId}:ementa`,
      ),
      situacao: p.statusProposicao
        ? String((p.statusProposicao as Record<string, unknown>).descricaoSituacao || "")
        : null,
      url_inteiro_teor: p.urlInteiroTeor ? String(p.urlInteiroTeor) : null,
      fonte: "Camara",
      proposicao_id_api: propId,
    }

    outcome.tentado++
    if (emDryRun()) {
      planejarEscrita({
        fonte: FONTE_CAMARA_PROPOSICOES, tabela: "projetos_lei", operacao: "upsert", alvo: slug,
        identidade: `id-camara:${idCamara}`,
        chave: { candidato_id: candidatoId, fonte: "Camara", proposicao_id_api: propId },
        valores: row,
      })
      outcome.planejado++
    } else {
      const { error: upsertError } = await supabase
        .from("projetos_lei")
        .upsert(row, { onConflict: "candidato_id,fonte,proposicao_id_api" })

      if (upsertError) {
        outcome.falhou++
        if (!outcome.primeiroErro) outcome.primeiroErro = upsertError.message
        warn("camara", `  ${slug}: upsert recusou proposicao ${propId}: ${upsertError.message}`)
      } else {
        outcome.persistido++
      }
    }

    if (outcome.tentado % 20 === 0) await sleep(300)
  }

  // Readback: a contagem que vale e a que o banco confirma, nao a que o laco achou
  // que gravou. Divergencia aqui e o sinal de escrita perdida que o `count++` sem
  // checagem de erro escondia.
  outcome.readback = await countProjetosLeiForCandidato(candidatoId, "Camara")

  const alerta =
    outcome.falhou > 0
      ? ` / ${outcome.falhou} RECUSADAS (${outcome.primeiroErro})`
      : ""
  const divergencia =
    outcome.readback != null && outcome.readback < outcome.persistido
      ? ` / readback ${outcome.readback} ABAIXO do persistido`
      : ""
  const escritaResumo = emDryRun() ? `${outcome.planejado} planejadas` : `${outcome.persistido} gravadas`
  log(
    "camara",
    `  ${slug}: ${escritaResumo}/${outcome.tentado} proposicoes autorais ` +
      `(fonte declarou ${outcome.declarado}; ${outcome.projetosLei} projeto de lei, ` +
      `${outcome.outrasProposicoes} outras; readback ${outcome.readback ?? "?"})${alerta}${divergencia}`
  )

  return outcome
}

/**
 * Grava em `coleta_log` a cardinalidade que a Camara declarou, para que a regua
 * de cobertura tenha denominador (issue #138). Sem isso, `coverage-model.ts` nao
 * consegue separar "acervo completo" de "acervo truncado", e volta a chamar
 * qualquer numero positivo de `ok`.
 *
 * `volume` e o DECLARADO pela fonte. O que foi persistido e o readback vao em
 * `detalhe`, porque a pergunta que a regua faz e "o banco alcancou a fonte?".
 */
async function registrarCardinalidadeProposicoes(
  slug: string,
  idCamara: number,
  outcome: ProjetosIngestOutcome
): Promise<void> {
  const url = `${API}/proposicoes?idDeputadoAutor=${encodeURIComponent(String(idCamara))}&ordem=DESC&ordenarPor=id`
  const detalhe = JSON.stringify({
    contract_version: 2,
    kind: "camara-proposicoes-cardinality",
    source_id: String(idCamara),
    declarado: outcome.declarado,
    tentado: outcome.tentado,
    persistido: outcome.persistido,
    planejado: outcome.planejado,
    recusados: outcome.falhou,
    readback: outcome.readback,
    projeto_lei: outcome.projetosLei,
    outras: outcome.outrasProposicoes,
    reconciliacao_legado: outcome.legacyReconciliation ?? null,
    source_revisions: outcome.sourceRevisions,
  })

  const resultado = outcome.legacyReconciliation?.review
    ? "indeterminado"
    : classificarReciboProposicoes(outcome)
  await registrarColeta({
    fonte: FONTE_CAMARA_PROPOSICOES,
    alvo: slug,
    resultado,
    volume: resultado === "encontrado" ? (outcome.declarado ?? 0) : 0,
    detalhe: outcome.declarado == null
      ? JSON.stringify({ ...JSON.parse(detalhe), status: "cardinalidade_nao_declarada" })
      : detalhe,
    url,
  })
}

export type IngestCamaraOptions = {
  targetSlugs?: string[]
  candidateRows?: readonly { slug: string; nome_completo: string; nome_urna: string; estado?: string; ids: { camara: number | null; senado?: number | null } }[]
  /** Recoleta somente o acervo autoral, sem perfil, gastos ou votos. */
  onlyProjects?: boolean
  /** Rerun focal de perfil e gastos, preservando votos e projetos já lidos. */
  onlyProfileAndGastos?: boolean
  /** Diretório local para payloads brutos e recibos anuais da Câmara. */
  expenseSnapshotDir?: string
  /** Recoleta apenas despesas, sem perfil, votos ou proposições. */
  onlyGastos?: boolean
  /** Impede rede: exige snapshots locais íntegros para todos os anos. */
  expenseSnapshotCacheOnly?: boolean
  /** Recoleta explícita de acervo congelado. Exigida com escopo na CLI. */
  forceFrozen?: boolean
  /** Override scoped do wall clock por candidato. */
  candidateTimeoutMs?: number
  /**
   * Modo incremental: reduz chamadas a API da Camara.
   * - **Pulo total**: votos Camara completos + acervo autoral com pelo menos a
   *   cardinalidade que a Camara declara + gastos com linha para 2023, 2024 e 2025.
   *   Custa 1 request por candidato (a leitura da cardinalidade declarada).
   * - **Senao**: atualiza perfil (1 GET leve) e so as etapas ainda incompletas (gastos / votos / projetos).
   */
  skipValidated?: boolean
  /** @deprecated Preferir `skipValidated`. Mesmo comportamento. */
  skipIfCamaraVotesComplete?: boolean
}

async function loadCamaraChaveVotacaoIds(): Promise<string[]> {
  const { data } = await supabase
    .from("votacoes_chave")
    .select("id, casa, fonte, votacao_id_api")
  const rows = data ?? []
  return rows
    .filter(
      (v) =>
        v.fonte === "camara" &&
        typeof v.votacao_id_api === "string" &&
        v.votacao_id_api.trim().length > 0 &&
        (v.casa === "Câmara" || v.casa === "Camara")
    )
    .map((v) => v.id)
}

async function hasFullCamaraVoteCoverage(candidatoId: string, requiredVotacaoIds: string[]): Promise<boolean> {
  if (requiredVotacaoIds.length === 0) return true
  const { data } = await supabase
    .from("votos_candidato")
    .select("votacao_id")
    .eq("candidato_id", candidatoId)
    .in("votacao_id", requiredVotacaoIds)
  return hasFullVotacaoIdCoverage(requiredVotacaoIds, (data ?? []).map((r) => r.votacao_id))
}

/**
 * Conta linhas de `projetos_lei`. `fonte` restringe ao acervo de uma origem, que
 * e o que o guard incremental precisa: comparar o total da Camara com o
 * declarado pela Camara, sem somar o que veio de curadoria nominal ou do Senado.
 *
 * Erro de leitura devolve `null`, nunca 0: zero por falha de rede e exatamente o
 * falso estado de completude que a issue #138 cobra.
 */
async function countProjetosLeiForCandidato(
  candidatoId: string,
  fonte?: string
): Promise<number | null> {
  let query = supabase
    .from("projetos_lei")
    .select("*", { count: "exact", head: true })
    .eq("candidato_id", candidatoId)
    .is("despublicado_em", null)
  if (fonte) query = query.eq("fonte", fonte)
  const { count, error } = await query
  if (error) {
    warn("camara", `  contagem de projetos_lei falhou: ${error.message}`)
    return null
  }
  return count ?? 0
}

async function hasGastosRecentComplete(candidatoId: string): Promise<boolean> {
  const { data } = await supabase
    .from("gastos_parlamentares")
    .select("ano")
    .eq("candidato_id", candidatoId)
    .in("ano", [...GASTOS_RECENT_ANOS])
  return hasGastosRecentYearsComplete((data ?? []).map((r) => Number(r.ano)))
}

export async function ingestCamara(options?: IngestCamaraOptions | string[]): Promise<IngestResult[]> {
  const opts: IngestCamaraOptions = Array.isArray(options) ? { targetSlugs: options } : (options ?? {})
  const selectedSlugs = opts.targetSlugs != null ? new Set(opts.targetSlugs) : null
  const profileAndGastosOnly = Boolean(opts.onlyProfileAndGastos)
  const skipValidated = Boolean(opts.skipValidated ?? opts.skipIfCamaraVotesComplete ?? profileAndGastosOnly)
  const candidateTimeoutMs = opts.candidateTimeoutMs ?? CANDIDATO_WALL_MS

  let requiredCamaraVotacaoIds: string[] = []
  if (skipValidated) {
    requiredCamaraVotacaoIds = await loadCamaraChaveVotacaoIds()
    log(
      "camara",
      `skip-validated (incremental): ${requiredCamaraVotacaoIds.length} votacao(oes) chave Camara; ` +
        `projetos>=cardinalidade declarada pela fonte; gastos anos ${GASTOS_RECENT_ANOS.join(",")}`
    )
  }

  const candidatos = (opts.candidateRows ? [...opts.candidateRows] : await loadCandidatosPublicos()).filter((cand) =>
    selectedSlugs ? selectedSlugs.has(cand.slug) : true
  )
  const verificacaoPorSlug = await loadVerificacaoCampos(candidatos.map((cand) => cand.slug))
  const results: IngestResult[] = []

  // Pre-voo de alcance (camara-alcance.ts): origem que recusa conexao vira um
  // erro por ficha em ~1 min, em vez de ~100 s por ficha ate o teto do job.
  // O modo so-cache nao usa rede e nao sonda.
  let alcance: AlcanceCamara = { ok: true }
  if (!opts.expenseSnapshotCacheOnly && candidatos.some((cand) => cand.ids.camara)) {
    alcance = await sondarAlcanceCamara()
    if (!alcance.ok) error("camara", `API inalcancavel, nenhuma ficha sera tentada: ${alcance.motivo}`)
  }

  for (const cand of candidatos) {
    if (!cand.ids.camara) continue
    const start = Date.now()
    const result: IngestResult = {
      source: "camara",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    if (!deveProcessarAcervoLegislativo(verificacaoPorSlug.get(cand.slug), "camara", opts.forceFrozen)) {
      const recibo = reciboAcervoCongelado(verificacaoPorSlug.get(cand.slug), "camara")!
      result.skipped = true
      result.skip_reason = `acervo legislativo Camara congelado e verificado em ${recibo.verificado_em}`
      result.duration_ms = Date.now() - start
      log("camara", `  ${cand.slug}: ${result.skip_reason}`)
      results.push(result)
      continue
    }

    if (!alcance.ok) {
      results.push(resultadoSemAlcance(cand.slug, alcance.motivo))
      continue
    }

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("camara", `  ${cand.slug}: nao encontrado no banco`)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    if (opts.onlyProjects) {
      const declarado = await fetchDeclaredProposicaoCount(cand.ids.camara!)
      const projetos = await ingestProjetos(cand.ids.camara!, candidatoId, cand.slug, declarado, cand.ids.senado === null)
      if (projetos.persistido > 0) result.tables_updated.push("projetos_lei")
      result.rows_upserted = projetos.persistido
      if (projetos.falhou > 0) {
        result.errors.push(
          `projetos_lei: ${projetos.falhou} de ${projetos.tentado} upserts recusados (${projetos.primeiroErro})`,
        )
      }
      if (!emDryRun() && projetos.readback != null && projetos.declarado != null && projetos.readback < projetos.declarado) {
        result.errors.push(`projetos_lei truncado: fonte declarou ${projetos.declarado}, banco tem ${projetos.readback}`)
      }
      await registrarCardinalidadeProposicoes(cand.slug, cand.ids.camara!, projetos)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    let skipVotes = false
    let skipGastos = false
    let skipProjetos = false
    const gastosOnly = Boolean(opts.onlyGastos)
    if (profileAndGastosOnly || gastosOnly) {
      skipVotes = true
      skipProjetos = true
    }
    let declaradoProjetos: number | null = null
    if (skipValidated && !profileAndGastosOnly) {
      skipVotes = await hasFullCamaraVoteCoverage(candidatoId, requiredCamaraVotacaoIds)
      skipGastos = await hasGastosRecentComplete(candidatoId)

      // Issue #138: a decisao de pular projetos custa 1 request a mais, e paga.
      // A versao anterior comparava com a constante 100, que era o proprio teto
      // do corte, entao candidato truncado se declarava sincronizado para sempre.
      declaradoProjetos = await fetchDeclaredProposicaoCount(cand.ids.camara!)
      const localCamara = await countProjetosLeiForCandidato(candidatoId, "Camara")
      skipProjetos = localCamara != null && projetosLeiSincronizado(localCamara, declaradoProjetos)
      if (localCamara != null && pareceCorteHistorico(localCamara) && !skipProjetos) {
        warn(
          "camara",
          `  ${cand.slug}: ${localCamara} linhas Camara e a assinatura do corte historico ` +
            `(fonte declara ${declaradoProjetos ?? "?"}), rebuscando acervo completo`
        )
      }
      // O pulo tambem e uma verificacao com denominador, e a regua precisa
      // dele: sem esta linha, candidato sincronizado que nunca re-ingere
      // (caso renan-filho no backfill de 09/08, 100 == 100 declaradas) fica
      // eternamente como "sem cardinalidade declarada" no relatorio.
      if (skipProjetos && declaradoProjetos != null) {
        await registrarColeta({
          fonte: FONTE_CAMARA_PROPOSICOES,
          alvo: cand.slug,
          resultado: declaradoProjetos > 0 ? "encontrado" : "vazio_confirmado",
          volume: declaradoProjetos,
          detalhe: `skip-validated: local=${localCamara} >= declarado=${declaradoProjetos}, sem refetch`,
        })
      }
    }
    if (profileAndGastosOnly || gastosOnly) skipGastos = false

    const fullSkip = skipValidated && skipVotes && skipGastos && skipProjetos
    if (fullSkip) {
      result.skipped = true
      result.skip_reason =
        `Camara ja sincronizado (votos chave + gastos 2023-2025 + ` +
        `projetos>=${declaradoProjetos ?? "?"} declarados pela fonte)`
      result.incremental_skipped = ["perfil", "gastos_parlamentares", "votos_candidato", "projetos_lei"]
      result.duration_ms = Date.now() - start
      log("camara", `Pulando ${cand.slug} (${result.skip_reason})`)
      results.push(result)
      continue
    }

    const incrementalParts: string[] = []
    if (skipValidated) {
      if (skipVotes) incrementalParts.push("votos ok")
      else incrementalParts.push("votos")
      if (skipGastos) incrementalParts.push("gastos ok")
      else incrementalParts.push("gastos")
      if (skipProjetos) incrementalParts.push("projetos ok")
      else incrementalParts.push("projetos")
    }
    log(
      "camara",
      skipValidated
        ? `Processando ${cand.slug} (ID Camara: ${cand.ids.camara}) incremental: ${incrementalParts.join(", ")}`
        : `Processando ${cand.slug} (ID Camara: ${cand.ids.camara})`
    )

    const incrementalSkipped: NonNullable<IngestResult["incremental_skipped"]> = []
    if (skipValidated) {
      if (skipVotes) incrementalSkipped.push("votos_candidato")
      if (skipGastos) incrementalSkipped.push("gastos_parlamentares")
      if (skipProjetos) incrementalSkipped.push("projetos_lei")
      if (incrementalSkipped.length > 0) result.incremental_skipped = incrementalSkipped
    }

    // Per-candidato wall clock (gastos + muitas proposicoes de voto + acervo autoral inteiro)
    let candidatoTimeoutId: ReturnType<typeof setTimeout> | undefined
    const candidatoTimeout = new Promise<"timeout">((resolve) => {
      candidatoTimeoutId = setTimeout(() => resolve("timeout"), candidateTimeoutMs)
    })

    let gastosColetados = 0
    let gastosPersistidos = 0
    let gastosPlanejados = 0
    const candidatoWork = (async () => {
      if (!gastosOnly) {
        const perfilPersistido = await ingestPerfil(
          cand.ids.camara!,
          candidatoId,
          cand.slug,
          cand.nome_completo,
          cand.nome_urna,
          cand.estado
        )
        if (perfilPersistido) {
          result.tables_updated.push("candidatos")
          result.rows_upserted++
        }
        await sleep(300)
      }

      if (!skipGastos) {
        const gastoOutcome = await ingestGastos(
          cand.ids.camara!,
          candidatoId,
          cand.slug,
          opts.expenseSnapshotDir,
          opts.expenseSnapshotCacheOnly,
        )
        gastosColetados = gastoOutcome.sourceRows
        gastosPersistidos = gastoOutcome.persistedRows
        gastosPlanejados = gastoOutcome.plannedRows
        if (gastoOutcome.persistedRows > 0) result.tables_updated.push("gastos_parlamentares")
        result.rows_upserted += gastoOutcome.persistedRows
        await sleep(300)
      }

      if (!skipVotes) {
        const votos = await ingestVotos(cand.ids.camara!, candidatoId, cand.slug)
        await registrarColeta(reciboDestaquesVotacoesCamara(cand.slug, cand.ids.camara!, votos))
        if (votos.persistidos > 0) result.tables_updated.push("votos_candidato")
        result.rows_upserted += votos.persistidos
        result.errors.push(...votos.erros)
        if (votos.avisos.length > 0) (result.warnings ??= []).push(...votos.avisos)
        await sleep(300)
      }

      if (!skipProjetos) {
        // Na execução completa (sem skipValidated) a cardinalidade declarada
        // ainda não foi lida. Custa 1 request e é o denominador de tudo:
        // readback, coleta_log e régua. Falhou a leitura, segue null, e null
        // significa "não sei", nunca o tamanho do que foi baixado.
        if (declaradoProjetos == null) {
          declaradoProjetos = await fetchDeclaredProposicaoCount(cand.ids.camara!)
        }
        const projetos = await ingestProjetos(
          cand.ids.camara!,
          candidatoId,
          cand.slug,
          declaradoProjetos,
          cand.ids.senado === null,
        )
        if (projetos.persistido > 0) result.tables_updated.push("projetos_lei")
        // Conta o que o banco confirmou, nunca o que o laco tentou.
        result.rows_upserted += projetos.persistido

        if (projetos.falhou > 0) {
          result.errors.push(
            `projetos_lei: ${projetos.falhou} de ${projetos.tentado} upserts recusados (${projetos.primeiroErro})`
          )
        }
        if (!emDryRun() && projetos.readback != null && projetos.declarado != null && projetos.readback < projetos.declarado) {
          result.errors.push(
            `projetos_lei truncado: fonte declarou ${projetos.declarado}, banco tem ${projetos.readback}`
          )
        }

        await registrarCardinalidadeProposicoes(cand.slug, cand.ids.camara!, projetos)
      }

      return "done" as const
    })()

    try {
      const outcome = await Promise.race([candidatoWork, candidatoTimeout])
      if (outcome === "timeout") {
        result.errors.push(`Timeout (${candidateTimeoutMs / 60_000}min) - skipped remaining work`)
        warn("camara", `  ${cand.slug}: TIMEOUT ${candidateTimeoutMs / 60_000}min, pulando...`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      error("camara", `  ${cand.slug}: ${msg}`)
    } finally {
      if (candidatoTimeoutId != null) clearTimeout(candidatoTimeoutId)
    }

    result.duration_ms = Date.now() - start
    if (profileAndGastosOnly || gastosOnly) {
      result.coleta_volume = gastosColetados
      result.coleta_resultado = result.errors.length > 0 ? "erro" : result.coleta_volume > 0 ? "encontrado" : "vazio_confirmado"
      result.coleta_detalhe = JSON.stringify({
        contract_version: 2,
        kind: "camara-perfil-e-gastos",
        identity: { house: "camara", source_id: String(cand.ids.camara) },
        scope: "perfil e despesas anuais de 2019-2026",
        perfil_url: `${API}/deputados/${cand.ids.camara}`,
        gastos_url: `${API}/deputados/${cand.ids.camara}/despesas`,
        despesas_fonte: gastosColetados,
        linhas_gastos_persistidas: gastosPersistidos,
        linhas_gastos_planejadas: gastosPlanejados,
        dry_run: emDryRun(),
      })
      result.coleta_url = `${API}/deputados/${cand.ids.camara}`
    }
    log("camara", `  ${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors, ${result.duration_ms}ms`)
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.argv.slice(2)
  const skipValidated =
    raw.includes("--skip-camara-validated") || raw.includes("--skip-validated")
  const targetSlugs = raw.flatMap((value, index, args) => {
    if (value === "--slugs") {
      return (args[index + 1] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }
    return []
  })

  ingestCamara({
    targetSlugs: targetSlugs.length > 0 ? targetSlugs : undefined,
    skipValidated,
  }).then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
