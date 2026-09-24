/** Coleta processos do CEDP do Senado para revisão editorial, sem ligar alvo a senador. */
import { idProcessoEticaSenado, urlProcessoSenado } from "../../src/lib/representacoes-etica"

export const SENADO_DADOS_ABERTOS = "https://legis.senado.leg.br/dadosabertos"
export const FILA_PCE_SCHEMA_VERSION = 1 as const
export const SENADO_LEGISLATURA_PCE = 57

export interface ApiSenado {
  get(path: string): Promise<unknown>
}

export interface CandidatoSeedSenado {
  slug: string
  ids?: { senado?: number | null } | null
}

export interface SenadorRosterPce {
  senador_id: number
  nome: string
  nome_completo: string
  uf: string | null
}

export interface DocumentoPceFila {
  id: number | null
  sigla: string | null
  identificacao: string | null
  descricao: string | null
  data: string | null
  url: string | null
}

export interface SituacaoPceFila {
  sigla: string | null
  descricao: string
  inicio: string | null
  fim: string | null
  colegiado: string | null
}

export interface ItemPceFila {
  id: string
  status_revisao: "pendente_identidade_editorial"
  processo: { id: number; sigla: "PCE"; numero: number; ano: number }
  ementa_oficial: string
  data_apresentacao: string | null
  situacao_atual: { sigla: string | null; descricao: string; data: string | null }
  ultimo_andamento_em: string | null
  tramitacoes: SituacaoPceFila[]
  documentos_estado: "carregados" | "nenhum_confirmado" | "falha"
  documentos: DocumentoPceFila[]
  url_oficial: string
  /** Sempre null na coleta: o alvo da ementa não é um campo estruturado da fonte. */
  alvo: null
  /** Sempre null na coleta: só pode existir após a revisão individual das duas pontes. */
  candidato_slug: null
}

export interface FilaPceSenado {
  schema_version: typeof FILA_PCE_SCHEMA_VERSION
  fonte: "senado-dadosabertos-pce-v1"
  legislatura_recorte: number
  gerado_em: string
  fontes: { processos: string; senadores: string }
  contagem_por_ano: Record<string, number>
  total_processos: number
  roster: SenadorRosterPce[]
  candidatos_por_senador_id: Record<string, string[]>
  itens: ItemPceFila[]
}

type Rec = Record<string, unknown>

function record(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null
}

function objectAtPath(value: unknown, keys: string[]): unknown {
  let current = value
  for (const key of keys) current = record(current)?.[key]
  return current
}

function list(value: unknown): Rec[] {
  if (Array.isArray(value)) return value.map(record).filter((item): item is Rec => item !== null)
  const item = record(value)
  return item ? [item] : []
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const date = new Date(`${match[1]}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ? null : match[1]
}

export function normalizarRosterPceSenado(raw: unknown): SenadorRosterPce[] {
  const parlamentar = objectAtPath(raw, ["ListaParlamentarLegislatura", "Parlamentares", "Parlamentar"])
  const seen = new Set<number>()
  return list(parlamentar).flatMap((item) => {
    const id = positiveInt(objectAtPath(item, ["IdentificacaoParlamentar", "CodigoParlamentar"]))
    const nome = text(objectAtPath(item, ["IdentificacaoParlamentar", "NomeParlamentar"]))
    const nomeCompleto = text(objectAtPath(item, ["IdentificacaoParlamentar", "NomeCompletoParlamentar"])) ?? nome
    const uf = text(objectAtPath(item, ["IdentificacaoParlamentar", "UfParlamentar"]))
    if (!id || !nome || !nomeCompleto || seen.has(id)) return []
    seen.add(id)
    return [{ senador_id: id, nome, nome_completo: nomeCompleto, uf }]
  }).sort((a, b) => a.senador_id - b.senador_id)
}

function parseDocumentos(raw: unknown): DocumentoPceFila[] {
  return list(raw).map((doc) => ({
    id: positiveInt(doc.id),
    sigla: text(doc.siglaTipo),
    identificacao: text(doc.identificacao),
    descricao: text(doc.descricao),
    data: isoDate(doc.dataDocumento),
    url: text(doc.urlDocumento),
  }))
}

function documentosDoDetalhe(raw: Rec): DocumentoPceFila[] {
  const docs: DocumentoPceFila[] = []
  const documento = record(raw.documento)
  if (documento) docs.push(...parseDocumentos([{
    id: documento.id,
    siglaTipo: documento.siglaTipo,
    identificacao: documento.identificacao,
    descricao: documento.tipo,
    dataDocumento: documento.data,
    urlDocumento: documento.url,
  }]))
  for (const autuacao of list(raw.autuacoes)) {
    for (const informe of list(autuacao.informesLegislativos)) {
      docs.push(...parseDocumentos(informe.documentosAssociados))
    }
  }
  return uniqueDocs(docs)
}

function uniqueDocs(docs: DocumentoPceFila[]): DocumentoPceFila[] {
  const seen = new Set<string>()
  return docs.filter((doc) => {
    const key = doc.url ?? `${doc.sigla}:${doc.identificacao}:${doc.data}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function tramitacoesDoDetalhe(raw: Rec): SituacaoPceFila[] {
  const rows: SituacaoPceFila[] = []
  for (const autuacao of list(raw.autuacoes)) {
    for (const situacao of list(autuacao.situacoes)) {
      rows.push({
        sigla: text(situacao.sigla),
        descricao: text(situacao.descricao) ?? "",
        inicio: isoDate(situacao.inicio),
        fim: isoDate(situacao.fim),
        colegiado: text(objectAtPath(situacao, ["colegiado", "sigla"])) ?? text(objectAtPath(situacao, ["enteAdministrativo", "sigla"])),
      })
    }
  }
  return rows.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "") || (a.sigla ?? "").localeCompare(b.sigla ?? ""))
}

function candidatoSlugs(seed: readonly CandidatoSeedSenado[]): Record<string, string[]> {
  const groups = new Map<number, string[]>()
  for (const candidate of seed) {
    const id = positiveInt(candidate.ids?.senado)
    if (!id || !candidate.slug.trim()) continue
    groups.set(id, [...(groups.get(id) ?? []), candidate.slug])
  }
  return Object.fromEntries([...groups].map(([id, slugs]) => [String(id), [...new Set(slugs)].sort()]))
}

function dataMaisRecente(values: Array<string | null>): string | null {
  return values.filter((value): value is string => value !== null).sort().at(-1) ?? null
}

function mapearItemPce(entry: Rec, detailValue: unknown, docsValue: unknown): ItemPceFila {
  const detail = record(detailValue)
  const processId = positiveInt(entry.id)
  if (!detail || !processId || positiveInt(detail.id) !== processId || text(detail.sigla) !== "PCE") {
    throw new Error("resposta oficial incompatível com item PCE da lista")
  }
  const numero = positiveInt(detail.numero)
  const ano = positiveInt(detail.ano)
  const ementa = text(objectAtPath(detail, ["conteudo", "ementa"])) ?? text(entry.ementa)
  if (!numero || !ano || !ementa) throw new Error(`PCE ${processId}: identificadores ou ementa ausentes na fonte oficial`)

  const situacaoSigla = text(detail.siglaSituacaoAtual)
  const situacaoDescricao = text(detail.situacaoAtual) ?? text(entry.situacaoAtual) ?? ""
  const situacaoData = isoDate(detail.dataSituacaoAtual) ?? isoDate(entry.dataSituacaoAtual)
  const tramitacoes = tramitacoesDoDetalhe(detail)
  const ultimoAndamento = dataMaisRecente([situacaoData, ...tramitacoes.map((row) => row.inicio), ...tramitacoes.map((row) => row.fim)])
  const docsDetail = documentosDoDetalhe(detail)
  const docsAdicionais = docsValue === null ? [] : parseDocumentos(docsValue)
  const documentos = uniqueDocs([...docsDetail, ...docsAdicionais])

  return {
    id: `pce-${processId}`,
    status_revisao: "pendente_identidade_editorial",
    processo: { id: processId, sigla: "PCE", numero, ano },
    ementa_oficial: ementa,
    data_apresentacao: isoDate(detail.dataInicioEfetivo) ?? isoDate(detail.documento && record(detail.documento)?.dataApresentacao) ?? isoDate(entry.dataApresentacao),
    situacao_atual: { sigla: situacaoSigla, descricao: situacaoDescricao, data: situacaoData },
    ultimo_andamento_em: ultimoAndamento,
    tramitacoes,
    documentos_estado: docsValue === null ? "falha" : documentos.length ? "carregados" : "nenhum_confirmado",
    documentos,
    url_oficial: urlProcessoSenado(processId),
    alvo: null,
    candidato_slug: null,
  }
}

async function emLotes<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await fn(items[index])
    }
  }))
  return result
}

/**
 * Coleta PCE e estados oficiais para fila editorial. A ementa permanece como
 * texto-fonte; nenhum nome é convertido em ID de senador/candidato por código.
 */
export async function coletarFilaPceSenado(options: {
  api: ApiSenado
  legislatura?: number
  seed: readonly CandidatoSeedSenado[]
  agora: Date
  concorrencia?: number
}): Promise<FilaPceSenado> {
  const legislatura = options.legislatura ?? SENADO_LEGISLATURA_PCE
  const concurrency = Math.max(1, Math.min(8, options.concorrencia ?? 4))
  const processosUrl = "/processo?sigla=PCE&tramitouLegislaturaAtual=S&v=1"
  const senadoresUrl = `/senador/lista/legislatura/${legislatura}?participacao=T&exercicio=S&v=4`
  const [rawProcessos, rawSenadores] = await Promise.all([options.api.get(processosUrl), options.api.get(senadoresUrl)])
  const processoRows = list(rawProcessos)
  const roster = normalizarRosterPceSenado(rawSenadores)
  if (processoRows.length === 0 || roster.length === 0) throw new Error("lista oficial de PCE ou roster titular do Senado vazia/incompatível")
  const seen = new Set<number>()
  const unicos = processoRows.filter((row) => {
    const id = positiveInt(row.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  if (unicos.length !== processoRows.length) throw new Error("lista oficial de PCE contém id ausente ou duplicado")
  const itens = await emLotes(unicos, concurrency, async (row) => {
    const id = positiveInt(row.id)!
    const [detail, docs] = await Promise.all([
      options.api.get(`/processo/${id}?v=1`),
      options.api.get(`/processo/documento?idProcesso=${id}&v=1`).catch(() => null),
    ])
    return mapearItemPce(row, detail, docs)
  })
  const counts: Record<string, number> = {}
  for (const item of itens) counts[String(item.processo.ano)] = (counts[String(item.processo.ano)] ?? 0) + 1
  return {
    schema_version: FILA_PCE_SCHEMA_VERSION,
    fonte: "senado-dadosabertos-pce-v1",
    legislatura_recorte: legislatura,
    gerado_em: options.agora.toISOString(),
    fontes: { processos: `${SENADO_DADOS_ABERTOS}${processosUrl}`, senadores: `${SENADO_DADOS_ABERTOS}${senadoresUrl}` },
    contagem_por_ano: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b))),
    total_processos: itens.length,
    roster,
    candidatos_por_senador_id: candidatoSlugs(options.seed),
    itens: itens.sort((a, b) => a.processo.ano - b.processo.ano || a.processo.numero - b.processo.numero),
  }
}

export function idFilaPceSenado(value: { processo: { id: number } }): string {
  return `pce-${value.processo.id}`
}

export function idDatasetPceSenado(value: { processo: { id: number }; senador_id: number }): string {
  return idProcessoEticaSenado(value.processo.id, value.senador_id)
}
