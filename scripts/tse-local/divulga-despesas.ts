/**
 * Coletor de despesas 2026 (DivulgaCandContas), só leitura.
 *
 * Reusa a resolução de identidade de `divulga-candidate.ts` e o cliente Chrome
 * real de `chrome-fetch.ts` (acesso direto responde 403). As guardas da
 * consulta são as mesmas do coletor de receitas (`divulga-financing.ts`):
 * idCandidato, idEleicao, ano, sgUe, nrPartido, nrCandidato e idPrestador.
 *
 * Versão da prestação: a lista de despesas é pedida para o `idUltimaEntrega`
 * da consulta, que precisa ser a entrega mais recente do histórico; depois da
 * lista, a consulta é relida e a coleta é rejeitada se a entrega mudou.
 *
 * Nada de documento sai daqui: os itens vão direto ao normalizador em memória.
 */

import { withVisibleTseChrome, type TseChromeClient } from "./chrome-fetch"
import { collectDivulgaCandidateFallback, type SeedCandidateIdentity } from "./divulga-candidate"
import type { FinancingIdentity } from "./divulga-financing"
import {
  normalizarDespesas,
  type ConcentracaoOficialItem,
  type DespesaItemEntrada,
  type RankingOficialItem,
  type ResultadoNormalizacao,
  type TotaisEntrada,
} from "../lib/despesas-normalizar"

const ROOT = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
const UF_PATTERN = /^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|BR)$/
const FONTE_DESPESAS_2026 = "tse-divulgacandcontas"

const CARGOS_2026: Record<number, string> = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual",
  8: "Deputado Distrital",
}

type MotivoColetaDespesas =
  | "identidade_seed_invalida"
  | "eleicao_2026_nao_resolvida"
  | "identidade_nao_resolvida"
  | "conta_oficial_divergente"
  | "resposta_oficial_invalida"
  | "entrega_divergente"
  | "fonte_indisponivel"

type ColetaDespesas2026 = {
  resultado: "coletado" | "sem_prestacao" | "rejeitado" | "erro"
  ano: 2026
  uf: string
  sq_candidato: string
  fonte: string
  motivo?: MotivoColetaDespesas
  normalizado: ResultadoNormalizacao | null
}

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

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function validIdentity(identity: FinancingIdentity): boolean {
  return UF_PATTERN.test(identity.uf) && /^\d{5,20}$/.test(identity.sqCandidato) &&
    integer(identity.cargoCodigo) !== null && integer(identity.partidoNumero) !== null &&
    integer(identity.numeroCandidato) !== null
}

function result(
  identity: FinancingIdentity,
  resultado: ColetaDespesas2026["resultado"],
  fonte: string,
  motivo?: MotivoColetaDespesas,
  normalizado: ResultadoNormalizacao | null = null,
): ColetaDespesas2026 {
  return {
    resultado,
    ano: 2026,
    uf: UF_PATTERN.test(identity.uf) ? identity.uf : "",
    sq_candidato: /^\d{5,20}$/.test(identity.sqCandidato) ? identity.sqCandidato : "",
    fonte,
    ...(motivo ? { motivo } : {}),
    normalizado,
  }
}

export function consultaUrl(identity: FinancingIdentity, electionId: string): string {
  return `${ROOT}/prestador/consulta/${electionId}/2026/${identity.uf}/${identity.cargoCodigo}/${identity.partidoNumero}/${identity.numeroCandidato}/${identity.sqCandidato}`
}

export function despesasUrl(electionId: string, idPrestador: string, idUltimaEntrega: string): string {
  return `${ROOT}/prestador/consulta/despesas/${electionId}/${idPrestador}/${idUltimaEntrega}`
}

/** Mesmas guardas de identidade do coletor de receitas 2026. */
function contaConfere(account: JsonRecord | null, identity: FinancingIdentity, electionId: string): account is JsonRecord {
  return Boolean(account) && digits(account!.idCandidato) === identity.sqCandidato &&
    digits(account!.idEleicao) === electionId && Number(account!.ano) === 2026 &&
    String(account!.sgUe ?? "").toUpperCase() === identity.uf &&
    integer(account!.nrPartido) === identity.partidoNumero &&
    integer(account!.nrCandidato) === identity.numeroCandidato && digits(account!.idPrestador) !== null
}

/** "dd/mm/aaaa HH:MM" (horário de Brasília) em ISO 8601 com fuso. */
function dataEntregaIso(value: unknown): string | null {
  const match = typeof value === "string" ? /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(value.trim()) : null
  if (!match) return null
  const [, dia, mes, ano, hora = "00", minuto = "00"] = match
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`
}

type EntregaValidada = { idUltimaEntrega: string; tipo: string | null; dataIso: string | null }

/** A entrega da consulta precisa ser a mais recente do histórico. */
export function validarEntrega(account: JsonRecord): EntregaValidada | null {
  const id = digits(account.idUltimaEntrega)
  if (!id || !Array.isArray(account.historicoEntregas) || account.historicoEntregas.length === 0) return null
  const entregas = account.historicoEntregas.map(asRecord)
  if (entregas.some((e) => !e || !digits(e.idEntrega))) return null
  const maior = entregas.reduce((max, e) => (BigInt(digits(e!.idEntrega)!) > BigInt(max) ? digits(e!.idEntrega)! : max), "0")
  if (maior !== id) return null
  const atual = entregas.find((e) => digits(e!.idEntrega) === id)!
  return { idUltimaEntrega: id, tipo: text(atual.tipo), dataIso: dataEntregaIso(atual.dataEntrega) }
}

/** Item bruto da lista em entrada do normalizador; o documento fica só em memória. */
function itemDespesa2026(value: unknown): DespesaItemEntrada | null {
  const record = asRecord(value)
  if (!record) return null
  const valor = typeof record.valor === "number" && Number.isFinite(record.valor) ? record.valor : null
  const centavos = valor === null ? null : Math.round(valor * 100)
  const exato = centavos !== null && valor !== null && Math.abs(valor * 100 - centavos) < 1e-6 && centavos >= 0
  const documento = digits(record.cpfCnpjFornecedor)
  const tipo = typeof record.tipoDespesa === "string" ? record.tipoDespesa : null
  return {
    tipo,
    valorCentavos: exato ? centavos : null,
    documentoFornecedor: documento,
    nomeFornecedor: typeof record.nomeFornecedor === "string" ? record.nomeFornecedor : null,
    descricao: typeof record.descricaoDespesa === "string" ? record.descricaoDespesa : null,
    // 2026: o destinatário da doação é o fornecedor; `beneficiadoContratante`
    // descreve o prestador e só entra como contexto.
    destinatario: {
      sq: null,
      nome: typeof record.nomeFornecedor === "string" ? record.nomeFornecedor : null,
      uf: null,
      cargo: null,
      partido: null,
      esferaPartidaria: null,
      contexto: typeof record.beneficiadoContratante === "string" ? record.beneficiadoContratante : null,
    },
  }
}

function totaisDaConsulta(account: JsonRecord): TotaisEntrada {
  const despesas = asRecord(account.despesas)
  const consolidados = asRecord(account.dadosConsolidados)
  const concentracao: ConcentracaoOficialItem[] = Array.isArray(account.concentracaoDespesas)
    ? account.concentracaoDespesas.flatMap((raw) => {
      const r = asRecord(raw)
      const valor = amount(r?.valor)
      if (!r || valor === null) return []
      const quantidade = Number(r.qtdeDespesas)
      return [{ tipo: typeof r.dsDRD === "string" ? r.dsDRD : "", quantidade: Number.isSafeInteger(quantidade) ? quantidade : null, valor }]
    })
    : []
  const ranking: RankingOficialItem[] = Array.isArray(account.rankingFornecedores)
    ? account.rankingFornecedores.flatMap((raw) => {
      const r = asRecord(raw)
      const valor = amount(r?.valor)
      return r && valor !== null ? [{ documento: digits(r.cpfCnpj), valor }] : []
    })
    : []
  return {
    origemTotalContratado: "oficial",
    total_despesas_contratadas: amount(despesas?.totalDespesasContratadas),
    total_despesas_pagas: amount(despesas?.totalDespesasPagas),
    total_doacoes_a_terceiros_oficial: amount(despesas?.doacoesOutrosCandidatosPartigos),
    recursos_financeiros: amount(consolidados?.totalFinanceiro),
    recursos_estimaveis: amount(consolidados?.totalEstimados),
    divida_campanha: amount(account.dividaCampanha),
    sobra_financeira: amount(account.sobraFinanceira),
    concentracao_oficial: concentracao,
    ranking_oficial: ranking,
  }
}

/** Normaliza consulta + lista já obtidas (também usado nos testes com fixtures). */
export function normalizarColeta2026(entrada: {
  identity: FinancingIdentity
  electionId: string
  account: JsonRecord
  entrega: EntregaValidada
  lista: unknown[]
  coletadoEm: string
}): ColetaDespesas2026 {
  const { identity, electionId, account, entrega, lista } = entrada
  const fonte = consultaUrl(identity, electionId)
  const itens = lista.map(itemDespesa2026)
  if (itens.some((item) => item === null)) return result(identity, "rejeitado", fonte, "resposta_oficial_invalida")
  const normalizado = normalizarDespesas(itens as DespesaItemEntrada[], totaisDaConsulta(account), {
    ano_eleicao: 2026,
    sq_candidato: identity.sqCandidato,
    uf: identity.uf,
    municipio_codigo: null,
    cargo_candidatura: CARGOS_2026[identity.cargoCodigo ?? -1] ?? null,
    prestacao_parcial: !/final/i.test(entrega.tipo ?? ""),
    data_entrega: entrega.dataIso,
    id_ultima_entrega: entrega.idUltimaEntrega,
    tipo_entrega: entrega.tipo,
    fonte: FONTE_DESPESAS_2026,
    fonte_url: fonte,
    coletado_em: entrada.coletadoEm,
  })
  const resultado = normalizado.linha.estado_coleta === "sem_prestacao" ? "sem_prestacao"
    : normalizado.divergencias.length ? "rejeitado" : "coletado"
  return result(identity, resultado, fonte, undefined, normalizado)
}

type OpcoesColeta2026 = { confirmarEntrega?: boolean; agora?: () => Date }

export async function coletarDespesas2026ParaCliente(
  client: TseChromeClient,
  identity: FinancingIdentity,
  electionId: string,
  opcoes: OpcoesColeta2026 = {},
): Promise<ColetaDespesas2026> {
  if (!validIdentity(identity) || !digits(electionId)) {
    return result(identity, "erro", `${ROOT}/eleicao/ordinarias`, "identidade_seed_invalida")
  }
  const fonte = consultaUrl(identity, electionId)
  let accountPayload: unknown
  try { accountPayload = await client.getJson(fonte) } catch { return result(identity, "erro", fonte, "fonte_indisponivel") }
  const account = asRecord(accountPayload)
  if (!contaConfere(account, identity, electionId)) return result(identity, "rejeitado", fonte, "conta_oficial_divergente")
  const coletadoEm = (opcoes.agora ?? (() => new Date()))().toISOString()

  // Sem nenhuma entrega: prestação não apresentada, totais continuam null.
  if (account.idUltimaEntrega === null && Array.isArray(account.historicoEntregas) && account.historicoEntregas.length === 0) {
    const normalizado = normalizarDespesas([], totaisDaConsulta(account), {
      ano_eleicao: 2026, sq_candidato: identity.sqCandidato, uf: identity.uf, municipio_codigo: null,
      cargo_candidatura: CARGOS_2026[identity.cargoCodigo ?? -1] ?? null, prestacao_parcial: true,
      data_entrega: null, id_ultima_entrega: null, tipo_entrega: null,
      fonte: FONTE_DESPESAS_2026, fonte_url: fonte, coletado_em: coletadoEm,
    })
    return result(identity, normalizado.divergencias.length ? "rejeitado" : "sem_prestacao", fonte, undefined, normalizado)
  }
  const entrega = validarEntrega(account)
  if (!entrega) return result(identity, "rejeitado", fonte, "entrega_divergente")
  const idPrestador = digits(account.idPrestador)!
  const listaUrl = despesasUrl(electionId, idPrestador, entrega.idUltimaEntrega)
  let lista: unknown
  try { lista = await client.getJson(listaUrl) } catch { return result(identity, "erro", listaUrl, "fonte_indisponivel") }
  if (!Array.isArray(lista)) return result(identity, "rejeitado", listaUrl, "resposta_oficial_invalida")

  if (opcoes.confirmarEntrega !== false) {
    let confirmacao: unknown
    try { confirmacao = await client.getJson(fonte) } catch { return result(identity, "erro", fonte, "fonte_indisponivel") }
    const conta = asRecord(confirmacao)
    if (!contaConfere(conta, identity, electionId) || digits(conta.idUltimaEntrega) !== entrega.idUltimaEntrega) {
      return result(identity, "rejeitado", fonte, "entrega_divergente")
    }
  }
  return normalizarColeta2026({ identity, electionId, account, entrega, lista, coletadoEm })
}

type WithClient = <T>(run: (client: TseChromeClient) => Promise<T>) => Promise<T>

/** Resolve identidade pelo DivulgaCand (mesmo caminho do coletor local) e coleta as despesas. */
export async function coletarDespesas2026(
  candidatos: readonly SeedCandidateIdentity[],
  withClient: WithClient = withVisibleTseChrome,
  opcoes: OpcoesColeta2026 = {},
): Promise<Array<{ slug: string; coleta: ColetaDespesas2026 }>> {
  return withClient(async (client) => {
    const resumos = await collectDivulgaCandidateFallback(candidatos, async (run) => run(client))
    const saida: Array<{ slug: string; coleta: ColetaDespesas2026 }> = []
    for (const resumo of resumos) {
      const identity: FinancingIdentity = {
        uf: resumo.uf,
        sqCandidato: resumo.sqCandidato,
        cargoCodigo: resumo.cargoCodigo ?? null,
        partidoNumero: resumo.partidoNumero ?? null,
        numeroCandidato: resumo.numeroCandidato ?? null,
      }
      if (resumo.status !== "ok" || !resumo.electionId) {
        const motivo: MotivoColetaDespesas = resumo.motivo === "eleicao_2026_nao_resolvida" ? "eleicao_2026_nao_resolvida" : "identidade_nao_resolvida"
        saida.push({ slug: resumo.slug, coleta: result(identity, "erro", resumo.source, motivo) })
        continue
      }
      saida.push({ slug: resumo.slug, coleta: await coletarDespesas2026ParaCliente(client, identity, resumo.electionId, opcoes) })
    }
    return saida
  })
}
