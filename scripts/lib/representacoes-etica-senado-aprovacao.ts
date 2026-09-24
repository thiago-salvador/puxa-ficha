import { createHash } from "node:crypto"
import {
  REPRESENTACOES_ETICA_POLICY,
  dataEmBrasilia,
  parseRepresentacaoAprovada,
  validateRepresentacoesEticaDataset,
  type RepresentacaoEticaAprovada,
} from "../../src/lib/representacoes-etica"
import { stripAccents } from "../../src/lib/strip-accents"
import { idDatasetPceSenado, type FilaPceSenado, type ItemPceFila, type SenadorRosterPce } from "./representacoes-etica-senado"

export interface RevisaoPceSenado {
  item_id: string
  senador_id: number
  candidate_slug: string
  trecho_ementa: string
  papel_confirmado: "representado"
  alvo_confirmado_por_humano: true
  candidato_confirmado_por_humano: true
  situacao_confirmada_por_humano: true
  situacao_sigla: string
  situacao_descricao: string
  aprovado_em: string
}

export interface ProcessoPceAtual {
  id: number
  sigla: string
  numero: number | string
  ano: number
  conteudo?: { ementa?: string }
  ementa?: string
  siglaSituacaoAtual?: string
  situacaoAtual?: string
  dataSituacaoAtual?: string
  autuacoes?: Array<{ situacoes?: Array<{ inicio?: string; fim?: string }> }>
}

export interface CandidatoSenadoAprovacao {
  slug: string
  ids?: { senado?: number | null } | null
}

function compact(value: string): string {
  return stripAccents(value).toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

const papeisDeAlvo = [["EM", "FACE", "DO"], ["EM", "FACE", "DA"], ["CONTRA", "O"], ["CONTRA", "A"]] as const
const tratamentosSimples = new Set(["SENADOR", "SENADORA", "SR", "SRA", "SENHOR", "SENHORA", "EXMO", "EXMA", "EXCELENTISSIMO", "EXCELENTISSIMA"])

function tratamentoFormal(tokens: readonly string[]): boolean {
  if (tokens.length > 3) return false
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === "EX") {
      if (tokens[index + 1] !== "SENADOR" && tokens[index + 1] !== "SENADORA") return false
      index += 1
    } else if (!tratamentosSimples.has(tokens[index]!)) {
      return false
    }
  }
  return true
}

/** Confere nome oficial depois de papel explícito e até três tokens de tratamento formal. */
export function temPapelDeAlvo(trecho: string, nomeOficial: string): boolean {
  const tokens = compact(trecho).split(" ").filter(Boolean)
  const nome = compact(nomeOficial).split(" ").filter(Boolean)
  if (nome.length === 0) return false
  return papeisDeAlvo.some((papel) => tokens.some((_, index) => {
    if (!papel.every((token, offset) => tokens[index + offset] === token)) return false
    const inicio = index + papel.length
    return [0, 1, 2, 3].some((quantidade) => {
      const nomeEm = inicio + quantidade
      return tratamentoFormal(tokens.slice(inicio, nomeEm)) && nome.every((token, offset) => tokens[nomeEm + offset] === token)
    })
  }))
}

function date(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const parsed = new Date(`${match[1]}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1] ? null : match[1]
}

function maxDate(values: Array<string | null | undefined>): string | null {
  return values.map(date).filter((value): value is string => value !== null).sort().at(-1) ?? null
}

function findBySenadorId(roster: readonly SenadorRosterPce[], id: number): SenadorRosterPce | null {
  const matches = roster.filter((senator) => senator.senador_id === id)
  return matches.length === 1 ? matches[0] : null
}

function checkCurrentSource(queueItem: ItemPceFila, current: ProcessoPceAtual): { ementa: string; status: { sigla: string; descricao: string }; lastDate: string } {
  if (current.sigla !== "PCE" || current.id !== queueItem.processo.id) throw new Error("fonte oficial atual não corresponde ao PCE da fila")
  const numero = Number(current.numero)
  if (numero !== queueItem.processo.numero || current.ano !== queueItem.processo.ano) throw new Error("número ou ano do PCE mudou; recolete a fila")
  const ementa = current.conteudo?.ementa ?? current.ementa ?? ""
  if (!ementa || compact(ementa) !== compact(queueItem.ementa_oficial)) throw new Error("ementa mudou desde a coleta; recolete e revise novamente")
  const descricao = current.situacaoAtual?.trim() ?? ""
  const sigla = current.siglaSituacaoAtual?.trim() ?? ""
  if (!descricao || !sigla) throw new Error("estado oficial atual incompleto; não há rótulo seguro para publicar")
  const lastDate = maxDate([
    current.dataSituacaoAtual,
    ...(current.autuacoes ?? []).flatMap((autuacao) => (autuacao.situacoes ?? []).flatMap((state) => [state.inicio, state.fim])),
  ])
  if (!lastDate) throw new Error("fonte oficial atual sem data de situação; publicação bloqueada")
  return { ementa, status: { sigla, descricao }, lastDate }
}

/** Constrói um registro sem escrever em disco; o CLI continua em dry-run por padrão. */
export function aprovarPceSenado(options: {
  fila: FilaPceSenado
  itemId: string
  revisao: RevisaoPceSenado
  processoAtual: ProcessoPceAtual
  roster: readonly SenadorRosterPce[]
  seed: readonly CandidatoSenadoAprovacao[]
  dataset: unknown
  agora: Date
  substituir?: boolean
}): { item: RepresentacaoEticaAprovada; dataset: { policy: string; itens: RepresentacaoEticaAprovada[] } } {
  const { fila, itemId, revisao } = options
  if (fila.schema_version !== 1 || fila.fonte !== "senado-dadosabertos-pce-v1") throw new Error("arquivo de fila PCE inválido ou de outra versão")
  const queueItem = fila.itens.find((item) => item.id === itemId)
  if (!queueItem) throw new Error(`item ${itemId} não está na fila`)
  if (queueItem.alvo !== null || queueItem.candidato_slug !== null) throw new Error("fila já contém identidade materializada; rejeitada por segurança")
  if (revisao.item_id !== itemId || !Number.isSafeInteger(revisao.senador_id) || revisao.senador_id <= 0) throw new Error("recibo de revisão não corresponde ao item")
  if (!revisao.candidate_slug.trim() || revisao.papel_confirmado !== "representado" || revisao.alvo_confirmado_por_humano !== true || revisao.candidato_confirmado_por_humano !== true || revisao.situacao_confirmada_por_humano !== true) {
    throw new Error("recibo humano deve confirmar alvo representado, candidato e situação oficial")
  }
  const aprovadoEm = date(revisao.aprovado_em)
  if (!aprovadoEm || aprovadoEm !== revisao.aprovado_em) throw new Error("aprovado_em deve ser uma data ISO válida")
  const verificadoEm = dataEmBrasilia(options.agora)
  if (aprovadoEm > verificadoEm) throw new Error("aprovação está no futuro")

  const current = checkCurrentSource(queueItem, options.processoAtual)
  if (typeof revisao.situacao_sigla !== "string" || typeof revisao.situacao_descricao !== "string" || revisao.situacao_sigla.trim() !== current.status.sigla || revisao.situacao_descricao.trim() !== current.status.descricao) {
    throw new Error("situação oficial mudou desde a revisão humana; revise novamente antes de aplicar")
  }
  const senator = findBySenadorId(options.roster, revisao.senador_id)
  if (!senator) throw new Error("id do senador não está no roster oficial consultado")
  const evidence = compact(revisao.trecho_ementa)
  if (evidence.length < 8 || !compact(current.ementa).includes(evidence)) throw new Error("trecho de identidade não confere com a ementa oficial atual")
  const evidencePadded = ` ${evidence} `
  const rosterMentions = options.roster.filter((entry) => {
    const names = [entry.nome, entry.nome_completo].map(compact).filter(Boolean)
    return names.some((name) => evidencePadded.includes(` ${name} `))
  })
  if (rosterMentions.length > 1) throw new Error("trecho de identidade menciona mais de um senador do roster oficial")
  const senatorNames = [senator.nome, senator.nome_completo].filter(Boolean)
  const alvoExplicito = senatorNames.some((name) => temPapelDeAlvo(evidence, name))
  if (!alvoExplicito) throw new Error("trecho não identifica o senador escolhido como representado após 'em face do/da' ou 'contra o/a'")

  const candidates = options.seed.filter((candidate) => candidate.ids?.senado === revisao.senador_id)
  if (candidates.length !== 1 || candidates[0].slug !== revisao.candidate_slug) throw new Error("ponte senador → candidato não é única e exata por ids.senado")
  const dataset = validateRepresentacoesEticaDataset(options.dataset)
  if (dataset.issues.length > 0) throw new Error("dataset atual inválido; aprovação recusada")

  const record = {
    id: idDatasetPceSenado({ processo: queueItem.processo, senador_id: revisao.senador_id }),
    candidate_slug: revisao.candidate_slug,
    casa: "senado",
    senador_id: revisao.senador_id,
    processo: queueItem.processo,
    situacao_oficial: current.status,
    ultimo_andamento_em: current.lastDate,
    verificado_em: verificadoEm,
    url_oficial: queueItem.url_oficial,
    identidade: {
      metodo: "seed_ids_senado",
      conferida_em: verificadoEm,
      alvo: {
        metodo: "ementa",
        fonte_url: queueItem.url_oficial,
        trecho_sha256: createHash("sha256").update(revisao.trecho_ementa).digest("hex"),
        conferida_em: verificadoEm,
      },
    },
    revisao: {
      aprovado: true,
      revisor_tipo: "humano",
      aprovado_em: aprovadoEm,
      alvo_confirmado: true,
      candidato_confirmado: true,
      situacao_confirmada: true,
      situacao_sigla: current.status.sigla,
      situacao_descricao: current.status.descricao,
    },
  }
  const parsed = parseRepresentacaoAprovada(record)
  if (!parsed.ok) throw new Error(`item recusado: ${parsed.motivo}`)
  const existing = dataset.itens.find((item) => item.id === parsed.item.id)
  if (existing && !options.substituir) throw new Error(`item ${parsed.item.id} já aprovado; use --substituir para atualizar`)
  if (existing && (parsed.item.verificado_em < existing.verificado_em || parsed.item.ultimo_andamento_em < existing.ultimo_andamento_em)) {
    throw new Error(`fonte atual mais antiga que o item aprovado ${parsed.item.id}`)
  }
  const itens = [...dataset.itens.filter((item) => item.id !== parsed.item.id), parsed.item].sort((a, b) => a.id.localeCompare(b.id))
  return { item: parsed.item, dataset: { policy: REPRESENTACOES_ETICA_POLICY, itens } }
}
