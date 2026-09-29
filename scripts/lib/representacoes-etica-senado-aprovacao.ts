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
import { exigirFichaPublica, FONTE_FICHA_PUBLICA, OPCAO_FICHA_NAO_PUBLICAVEL } from "./ficha-publica-representacoes"

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
  /**
   * Prova de alvo pelo documento do próprio processo, para ementa que nomeia o
   * senador sem "em face do/da" nem "contra o/a" ("por parte do Senador X",
   * "a visita do Senador X"). Só vale se a ementa oficial citar exatamente um
   * senador do roster, o escolhido, e o trecho do documento o nomear.
   */
  alvo_por_documento?: {
    documento_url: string
    trecho_documento: string
    confirmado_por_humano: true
  }
}

const DOCUMENTO_SENADO = /^https:\/\/legis\.senado\.(?:gov|leg)\.br\/sdleg-getter\/documento\?dm=\d+$/

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
  tramitando?: string
  autuacoes?: Array<{ situacoes?: Array<{ sigla?: string; descricao?: string; inicio?: string; fim?: string }> }>
}

/**
 * Processo encerrado ("tramitando": "Não") pode vir sem situação atual no topo;
 * aí vale a última situação oficial registrada nas autuações (maior início),
 * copiada como veio. Processo em tramitação sem situação atual continua bloqueado.
 */
function situacaoDeProcessoEncerrado(current: ProcessoPceAtual): { sigla: string; descricao: string } | null {
  if (current.tramitando?.trim() !== "Não") return null
  const situacoes = (current.autuacoes ?? []).flatMap((autuacao) => autuacao.situacoes ?? [])
    .filter((state) => date(state.inicio) && state.sigla?.trim() && state.descricao?.trim())
    .sort((a, b) => date(a.inicio)!.localeCompare(date(b.inicio)!))
  const ultima = situacoes.at(-1)
  return ultima ? { sigla: ultima.sigla!.trim(), descricao: ultima.descricao!.trim() } : null
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

const papeisDeAlvoPlural = [["EM", "FACE", "DOS"], ["EM", "FACE", "DAS"], ["CONTRA", "OS"], ["CONTRA", "AS"]] as const
const tratamentosPlural = new Set(["SENADORES", "SENADORAS"])
const artigosDaLista = new Set(["DO", "DA", "DOS", "DAS"])
// Palavra que encerra a lista de representados ("..., com fundamento", "por quebra de decoro").
const fimDaLista = new Set([".", "COM", "POR", "PELO", "PELA", "PELOS", "PELAS", "PARA", "QUE", "EM", "NOS", "NO", "NA", "NAS", "AO", "AOS", "CONFORME", "TENDO"])

function tokensComVirgula(value: string): string[] {
  return stripAccents(value).toLocaleUpperCase("pt-BR").replace(/[,;]/g, " , ").replace(/\./g, " . ").replace(/[^A-Z0-9,.]+/g, " ").trim().split(/\s+/).filter(Boolean)
}

/**
 * Nomes da lista depois de "em face dos/das" ou "contra os/as". A lista vai até
 * a primeira palavra de fim ("com fundamento"); os itens são separados por
 * vírgula ou "e", e cada item perde artigo e tratamento ("e da Senadora X").
 */
function alvosDaListaPlural(trecho: string): string[] {
  const tokens = tokensComVirgula(trecho)
  const alvos: string[] = []
  for (const papel of papeisDeAlvoPlural) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (!papel.every((token, offset) => tokens[index + offset] === token)) continue
      let fim = index + papel.length
      while (fim < tokens.length && !fimDaLista.has(tokens[fim]!)) fim += 1
      const itens: string[][] = [[]]
      for (const token of tokens.slice(index + papel.length, fim)) {
        if (token === "," || token === "E") itens.push([])
        else itens[itens.length - 1]!.push(token)
      }
      for (const item of itens) {
        let inicio = 0
        if (artigosDaLista.has(item[inicio] ?? "") && (tratamentosPlural.has(item[inicio + 1] ?? "") || tratamentosSimples.has(item[inicio + 1] ?? ""))) inicio += 1
        while (inicio < item.length && (tratamentosPlural.has(item[inicio]!) || tratamentosSimples.has(item[inicio]!))) inicio += 1
        if (inicio < item.length) alvos.push(item.slice(inicio).join(" "))
      }
    }
  }
  return alvos
}

/**
 * Confere nome oficial depois de papel explícito e até três tokens de tratamento
 * formal, ou como item inteiro de uma lista plural de representados.
 */
export function temPapelDeAlvo(trecho: string, nomeOficial: string): boolean {
  const tokens = compact(trecho).split(" ").filter(Boolean)
  const nome = compact(nomeOficial).split(" ").filter(Boolean)
  if (nome.length === 0) return false
  if (alvosDaListaPlural(trecho).includes(nome.join(" "))) return true
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
  const encerrado = !current.situacaoAtual?.trim() && !current.siglaSituacaoAtual?.trim() ? situacaoDeProcessoEncerrado(current) : null
  const descricao = encerrado?.descricao ?? current.situacaoAtual?.trim() ?? ""
  const sigla = encerrado?.sigla ?? current.siglaSituacaoAtual?.trim() ?? ""
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
  fichaPublica: boolean
  permitirFichaNaoPublicavel?: boolean
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
  // Mais de um senador no trecho só vale quando cada um é alvo explícito: item da
  // lista plural de representados ou nome depois de papel singular.
  const todosAlvos = rosterMentions.every((entry) => [entry.nome, entry.nome_completo].filter(Boolean).some((name) => temPapelDeAlvo(revisao.trecho_ementa, name)))
  if (rosterMentions.length > 1 && !todosAlvos) throw new Error("trecho de identidade menciona mais de um senador do roster oficial")
  const senatorNames = [senator.nome, senator.nome_completo].filter(Boolean)
  const alvoExplicito = senatorNames.some((name) => temPapelDeAlvo(revisao.trecho_ementa, name))
  let alvoMetodo: "ementa" | "documento" = "ementa"
  let trechoAlvo = revisao.trecho_ementa
  if (!alvoExplicito) {
    const documento = revisao.alvo_por_documento
    const unicoNaEmenta = rosterMentions.length === 1 && rosterMentions[0]!.senador_id === senator.senador_id
    if (!documento || documento.confirmado_por_humano !== true || !unicoNaEmenta) {
      throw new Error("trecho não identifica o senador escolhido como representado após 'em face do/da' ou 'contra o/a', nem há prova de alvo pelo documento com a ementa citando só ele")
    }
    if (!DOCUMENTO_SENADO.test(documento.documento_url)) throw new Error("documento de alvo fora do repositório oficial do Senado")
    const trechoDocumento = ` ${compact(documento.trecho_documento)} `
    if (trechoDocumento.trim().length < 20 || !senatorNames.some((name) => trechoDocumento.includes(` ${compact(name)} `))) {
      throw new Error("trecho do documento não nomeia o senador escolhido")
    }
    alvoMetodo = "documento"
    trechoAlvo = documento.trecho_documento
  }

  const candidates = options.seed.filter((candidate) => candidate.ids?.senado === revisao.senador_id)
  if (candidates.length !== 1 || candidates[0].slug !== revisao.candidate_slug) throw new Error("ponte senador → candidato não é única e exata por ids.senado")
  const fichaNaoPublicavelPermitida = exigirFichaPublica(options.fichaPublica, options.permitirFichaNaoPublicavel === true)
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
        metodo: alvoMetodo,
        fonte_url: queueItem.url_oficial,
        trecho_sha256: createHash("sha256").update(trechoAlvo).digest("hex"),
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
      ...(fichaNaoPublicavelPermitida ? { ficha_nao_publicavel: {
        permitido: true, opcao: OPCAO_FICHA_NAO_PUBLICAVEL, fonte: FONTE_FICHA_PUBLICA, conferida_em: verificadoEm,
      } } : {}),
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
