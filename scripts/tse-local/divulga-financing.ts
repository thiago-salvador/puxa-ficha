import { createHash } from "node:crypto"

import { withVisibleTseChrome, type TseChromeClient } from "./chrome-fetch"

const ROOT = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
const ELECTIONS_URL = `${ROOT}/eleicao/ordinarias`
const UF_PATTERN = /^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|BR)$/
const MAX_PAGES = 1_000

/** Fields from an already-validated 2026 DivulgaCand candidate response. */
export type FinancingIdentity = {
  uf: string
  sqCandidato: string
  cargoCodigo: number | null
  partidoNumero: number | null
  numeroCandidato: number | null
}

export type SafeReceipt = {
  data_receita: string | null
  codigo_receita: number | null
  valor: number | null
  especie_recurso: string | null
  fonte_origem: string | null
  financiamento_coletivo: boolean | null
  rateio_pessoa_fisica: boolean | null
}

export type DivulgaFinancingResult = {
  resultado: "encontrado" | "vazio_confirmado" | "erro" | "indeterminado"
  estado_prestacao: "apresentada" | "nao_apresentada" | "indeterminada"
  ano: 2026
  uf: string
  sq_candidato: string
  fonte: string
  sha256_receitas_sanitizadas: string | null
  paginas_consultadas: number | null
  quantidade_receitas: number | null
  total_arrecadado: number | null
  receitas: SafeReceipt[] | null
  motivo?:
    | "identidade_seed_invalida"
    | "eleicao_2026_nao_resolvida"
    | "identidade_oficial_divergente"
    | "conta_oficial_divergente"
    | "resposta_oficial_invalida"
    | "fonte_indisponivel"
    | "paginacao_incompleta"
    | "primeira_pagina_vazia_sem_contraprova"
}

type WithClient = <T>(run: (client: TseChromeClient) => Promise<T>) => Promise<T>
type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
}

function digits(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : ""
  return /^\d{1,20}$/.test(text) ? text : null
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function finiteAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function safeText(value: unknown, maxLength = 120): string | null {
  if (typeof value !== "string") return null
  const text = value.trim().slice(0, maxLength)
  if (!text) return null
  // The finance endpoints are external data. Even an otherwise allowed text
  // column must not carry an accidental CPF/title into a saved summary.
  return /(?:\d[\s./-]?){11,14}/.test(text) ? null : text
}

function validIdentity(identity: FinancingIdentity): boolean {
  return UF_PATTERN.test(identity.uf) && /^\d{5,20}$/.test(identity.sqCandidato) &&
    integer(identity.cargoCodigo) !== null && integer(identity.partidoNumero) !== null &&
    integer(identity.numeroCandidato) !== null
}

function baseResult(
  identity: FinancingIdentity,
  resultado: DivulgaFinancingResult["resultado"],
  estado_prestacao: DivulgaFinancingResult["estado_prestacao"],
  fonte: string,
  motivo?: DivulgaFinancingResult["motivo"],
): DivulgaFinancingResult {
  return {
    resultado,
    estado_prestacao,
    ano: 2026,
    uf: UF_PATTERN.test(identity.uf) ? identity.uf : "",
    sq_candidato: /^\d{5,20}$/.test(identity.sqCandidato) ? identity.sqCandidato : "",
    fonte,
    sha256_receitas_sanitizadas: null,
    paginas_consultadas: null,
    quantidade_receitas: null,
    total_arrecadado: null,
    receitas: null,
    ...(motivo ? { motivo } : {}),
  }
}

function electionIdFrom(payload: unknown): string | null {
  if (!Array.isArray(payload)) return null
  const ids = new Set<string>()
  for (const value of payload) {
    const record = asRecord(value)
    const id = digits(record?.id)
    if (Number(record?.ano) === 2026 && id) ids.add(id)
  }
  return ids.size === 1 ? [...ids][0]! : null
}

function accountUrl(
  identity: FinancingIdentity,
  electionId: string,
  cargo: number,
  party: number,
  number: number,
): string {
  return `${ROOT}/prestador/consulta/${electionId}/2026/${identity.uf}/${cargo}/${party}/${number}/${identity.sqCandidato}`
}

function receiptFrom(value: unknown): SafeReceipt | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    data_receita: safeText(record.dtReceita, 40),
    codigo_receita: integer(record.codReceita),
    valor: finiteAmount(record.valorReceita),
    especie_recurso: safeText(record.especieRecurso),
    fonte_origem: safeText(record.fonteOrigem),
    financiamento_coletivo: typeof record.stFinanciamentoColetivo === "boolean" ? record.stFinanciamentoColetivo : null,
    rateio_pessoa_fisica: typeof record.stPessoaRateio === "boolean" ? record.stPessoaRateio : null,
  }
}

function responseError(identity: FinancingIdentity, source: string): DivulgaFinancingResult {
  return baseResult(identity, "erro", "indeterminada", source, "fonte_indisponivel")
}

export async function collectDivulgaFinancingForClient(
  client: TseChromeClient,
  identity: FinancingIdentity,
  electionId: string,
): Promise<DivulgaFinancingResult> {
  if (!validIdentity(identity) || !digits(electionId)) {
    return baseResult(identity, "erro", "indeterminada", ELECTIONS_URL, "identidade_seed_invalida")
  }
  const cargo = integer(identity.cargoCodigo)!
  const party = integer(identity.partidoNumero)!
  const number = integer(identity.numeroCandidato)!

  const source = accountUrl(
    identity,
    electionId,
    cargo,
    party,
    number,
  )
  let accountPayload: unknown
  try { accountPayload = await client.getJson(source) }
  catch { return responseError(identity, source) }
  const account = asRecord(accountPayload)
  if (!account || digits(account.idCandidato) !== identity.sqCandidato ||
      digits(account.idEleicao) !== electionId || Number(account.ano) !== 2026 ||
      String(account.sgUe ?? "").toUpperCase() !== identity.uf ||
      integer(account.nrPartido) !== party ||
      integer(account.nrCandidato) !== number || !digits(account.idPrestador)) {
    return baseResult(identity, "indeterminado", "indeterminada", source, "conta_oficial_divergente")
  }

  if (account.idUltimaEntrega === null && account.entregaAtual === null &&
      account.dadosConsolidados === null &&
      Array.isArray(account.historicoEntregas) && account.historicoEntregas.length === 0) {
    return {
      ...baseResult(identity, "vazio_confirmado", "nao_apresentada", source),
      quantidade_receitas: 0,
      total_arrecadado: null,
      receitas: [],
      paginas_consultadas: 0,
    }
  }

  const idPrestador = digits(account.idPrestador)
  const idUltimaEntrega = digits(account.idUltimaEntrega)
  const idEleicao = digits(account.idEleicao)
  if (!idPrestador || !idUltimaEntrega || !idEleicao) {
    return baseResult(identity, "indeterminado", "indeterminada", source, "resposta_oficial_invalida")
  }

  const safeReceipts: SafeReceipt[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pageSource = `${ROOT}/prestador/consulta/receitas/${idEleicao}/${idPrestador}/${idUltimaEntrega}/lista?pagina=${page}`
    let payload: unknown
    try { payload = await client.getJson(pageSource) }
    catch { return responseError(identity, pageSource) }
    if (!Array.isArray(payload)) {
      return baseResult(identity, "indeterminado", "apresentada", pageSource, "resposta_oficial_invalida")
    }
    if (payload.length === 0) {
      if (page === 1) return baseResult(identity, "indeterminado", "apresentada", pageSource, "primeira_pagina_vazia_sem_contraprova")
      const total = safeReceipts.every((receipt) => receipt.valor !== null)
        ? safeReceipts.reduce((sum, receipt) => sum + (receipt.valor ?? 0), 0)
        : null
      return {
        ...baseResult(identity, safeReceipts.length ? "encontrado" : "vazio_confirmado", "apresentada", pageSource),
        sha256_receitas_sanitizadas: createHash("sha256").update(JSON.stringify(safeReceipts)).digest("hex"),
        paginas_consultadas: page,
        quantidade_receitas: safeReceipts.length,
        total_arrecadado: total,
        receitas: safeReceipts,
      }
    }
    const parsed = payload.map(receiptFrom)
    if (parsed.some((receipt) => receipt === null)) {
      return baseResult(identity, "indeterminado", "apresentada", pageSource, "resposta_oficial_invalida")
    }
    safeReceipts.push(...parsed as SafeReceipt[])
  }
  return baseResult(identity, "erro", "apresentada", source, "paginacao_incompleta")
}

/** Read-only financing receipt summary; donor identity fields are never copied. */
export async function collectDivulgaFinancing(
  identities: readonly FinancingIdentity[],
  withClient: WithClient = withVisibleTseChrome,
): Promise<DivulgaFinancingResult[]> {
  const results = new Map<number, DivulgaFinancingResult>()
  const valid = identities.map((identity, index) => {
    if (!validIdentity(identity)) {
      results.set(index, baseResult(identity, "erro", "indeterminada", ELECTIONS_URL, "identidade_seed_invalida"))
      return null
    }
    return { identity, index }
  }).filter((item): item is { identity: FinancingIdentity; index: number } => item !== null)
  if (!valid.length) return identities.map((_, index) => results.get(index)!)

  try {
    await withClient(async (client) => {
      let electionId: string | null = null
      try { electionId = electionIdFrom(await client.getJson(ELECTIONS_URL)) } catch {
        for (const { identity, index } of valid) results.set(index, responseError(identity, ELECTIONS_URL))
        return
      }
      if (!electionId) {
        for (const { identity, index } of valid) {
          results.set(index, baseResult(identity, "indeterminado", "indeterminada", ELECTIONS_URL, "eleicao_2026_nao_resolvida"))
        }
        return
      }
      for (const { identity, index } of valid) {
      results.set(index, await collectDivulgaFinancingForClient(client, identity, electionId))
      }
    })
  } catch {
    for (const { identity, index } of valid) {
      if (!results.has(index)) results.set(index, responseError(identity, ELECTIONS_URL))
    }
  }
  return identities.map((_, index) => results.get(index)!)
}
