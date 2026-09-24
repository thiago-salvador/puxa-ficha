import rawDataset from "../../scripts/data/representacoes-conselho-etica.json"
import { isFaseRepresentacao, type FaseRepresentacao } from "./representacoes-etica-fase"

/**
 * Representações ao Conselho de Ética aprovadas por revisão humana.
 *
 * O coletor (`scripts/coletar-representacoes-etica.ts`) só escreve numa fila
 * fora do repositório. Um item chega a este dataset apenas pelo comando de
 * aprovação, e a ficha lê daqui. Item que não passa na validação é descartado
 * por inteiro: nada meio validado aparece na ficha.
 */

export const REPRESENTACOES_ETICA_POLICY = "pf-representacoes-etica-v1"

interface CamposRepresentacaoEticaAprovada {
  id: string
  candidate_slug: string
  ultimo_andamento_em: string
  verificado_em: string
  url_oficial: string
  revisao: {
    aprovado: true
    revisor_tipo: "humano"
    aprovado_em: string
    ficha_nao_publicavel?: { permitido: true; opcao: "--permitir-ficha-nao-publicavel"; fonte: "candidatos_publico"; conferida_em: string }
  }
}

export interface RepresentacaoEticaCamaraAprovada extends CamposRepresentacaoEticaAprovada {
  casa: "camara"
  deputado_id: number
  proposicao: { id: number; sigla: "REP"; numero: number; ano: number }
  fase: FaseRepresentacao
  /** Como o deputado foi ligado ao candidato e quando isso foi reconferido nas fontes (sem CPF). */
  identidade: { metodo: "seed_ids_camara" | "cpf_tse_camara"; conferida_em: string }
}

export interface RepresentacaoEticaSenadoAprovada extends CamposRepresentacaoEticaAprovada {
  casa: "senado"
  senador_id: number
  processo: { id: number; sigla: "PCE"; numero: number; ano: number }
  situacao_oficial: { sigla: string; descricao: string }
  identidade: {
    metodo: "seed_ids_senado"
    conferida_em: string
    alvo: { metodo: "ementa" | "documento"; fonte_url: string; trecho_sha256: string; conferida_em: string }
  }
  revisao: {
    aprovado: true
    revisor_tipo: "humano"
    aprovado_em: string
    alvo_confirmado: true
    candidato_confirmado: true
    situacao_confirmada: true
    situacao_sigla: string
    situacao_descricao: string
    ficha_nao_publicavel?: { permitido: true; opcao: "--permitir-ficha-nao-publicavel"; fonte: "candidatos_publico"; conferida_em: string }
  }
}

export type RepresentacaoEticaAprovada = RepresentacaoEticaCamaraAprovada | RepresentacaoEticaSenadoAprovada

export type MetodoIdentidadeRepresentacao = "seed_ids_camara" | "cpf_tse_camara" | "seed_ids_senado"

interface RepresentacoesEticaIssue {
  index: number
  motivo: string
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Data civil (YYYY-MM-DD) em Brasília; datas de verificação e aprovação são dias locais, não UTC. */
export function dataEmBrasilia(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante)
}

export function urlFichaTramitacaoCamara(proposicaoId: number): string {
  return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${proposicaoId}`
}

export function urlProcessoSenado(processoId: number): string {
  return `https://legis.senado.leg.br/dadosabertos/processo/${processoId}?v=1`
}

export function idRepresentacaoEtica(proposicaoId: number, deputadoId: number): string {
  return `camara-rep-${proposicaoId}-dep-${deputadoId}`
}

export function idProcessoEticaSenado(processoId: number, senadorId: number): string {
  return `senado-pce-${processoId}-sen-${senadorId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function inteiroPositivo(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function dataValida(value: unknown): value is string {
  if (typeof value !== "string" || !DATA.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Valida um item do dataset. Devolve o motivo da recusa em vez de lançar. */
export function parseRepresentacaoAprovada(
  value: unknown,
): { ok: true; item: RepresentacaoEticaAprovada } | { ok: false; motivo: string } {
  if (!isRecord(value)) return { ok: false, motivo: "item não é objeto" }
  const { id, candidate_slug, casa, deputado_id, senador_id, proposicao, processo, fase, situacao_oficial, ultimo_andamento_em, verificado_em, url_oficial, identidade, revisao } =
    value
  if (typeof candidate_slug !== "string" || candidate_slug.trim() === "") return { ok: false, motivo: "candidate_slug ausente" }
  if (!dataValida(ultimo_andamento_em)) return { ok: false, motivo: "ultimo_andamento_em inválido" }
  if (!dataValida(verificado_em)) return { ok: false, motivo: "verificado_em inválido" }
  if (verificado_em < ultimo_andamento_em) return { ok: false, motivo: "verificado_em anterior ao último andamento" }
  if (!isRecord(revisao) || revisao.aprovado !== true || revisao.revisor_tipo !== "humano" || !dataValida(revisao.aprovado_em)) {
    return { ok: false, motivo: "sem aprovação humana registrada" }
  }
  const fichaOverride = revisao.ficha_nao_publicavel
  if (fichaOverride !== undefined && (!isRecord(fichaOverride) || fichaOverride.permitido !== true ||
      fichaOverride.opcao !== "--permitir-ficha-nao-publicavel" || fichaOverride.fonte !== "candidatos_publico" ||
      !dataValida(fichaOverride.conferida_em))) {
    return { ok: false, motivo: "override de ficha não publicável inválido" }
  }
  const overrideValidado = isRecord(fichaOverride)
    ? { ficha_nao_publicavel: { permitido: true as const, opcao: "--permitir-ficha-nao-publicavel" as const, fonte: "candidatos_publico" as const, conferida_em: fichaOverride.conferida_em as string } }
    : {}
  if (casa === "camara") {
    if (!inteiroPositivo(deputado_id)) return { ok: false, motivo: "deputado_id inválido" }
    if (!isRecord(proposicao)) return { ok: false, motivo: "proposicao ausente" }
    if (proposicao.sigla !== "REP") return { ok: false, motivo: "proposicao não é REP" }
    if (!inteiroPositivo(proposicao.id) || !inteiroPositivo(proposicao.numero) || !inteiroPositivo(proposicao.ano)) {
      return { ok: false, motivo: "proposicao com id, número ou ano inválido" }
    }
    if (id !== idRepresentacaoEtica(proposicao.id, deputado_id)) return { ok: false, motivo: "id não bate com proposição e deputado" }
    if (!isFaseRepresentacao(fase)) return { ok: false, motivo: "fase fora do enum" }
    if (url_oficial !== urlFichaTramitacaoCamara(proposicao.id)) return { ok: false, motivo: "url_oficial não é a ficha oficial da proposição" }
    if (!isRecord(identidade) || (identidade.metodo !== "seed_ids_camara" && identidade.metodo !== "cpf_tse_camara") || !dataValida(identidade.conferida_em)) {
      return { ok: false, motivo: "sem registro da conferência de identidade" }
    }
    return {
      ok: true,
      item: {
        id, candidate_slug, casa, deputado_id,
        proposicao: { id: proposicao.id, sigla: "REP", numero: proposicao.numero, ano: proposicao.ano },
        fase, ultimo_andamento_em, verificado_em, url_oficial,
        identidade: { metodo: identidade.metodo, conferida_em: identidade.conferida_em as string },
        revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: revisao.aprovado_em as string, ...overrideValidado },
      },
    }
  }
  if (casa === "senado") {
    if (!inteiroPositivo(senador_id)) return { ok: false, motivo: "senador_id inválido" }
    if (!isRecord(processo) || processo.sigla !== "PCE" || !inteiroPositivo(processo.id) || !inteiroPositivo(processo.numero) || !inteiroPositivo(processo.ano)) {
      return { ok: false, motivo: "processo PCE inválido" }
    }
    if (id !== idProcessoEticaSenado(processo.id, senador_id)) return { ok: false, motivo: "id não bate com processo e senador" }
    if (url_oficial !== urlProcessoSenado(processo.id)) return { ok: false, motivo: "url_oficial não é a fonte oficial do processo no Senado" }
    if (!isRecord(situacao_oficial) || typeof situacao_oficial.sigla !== "string" || !situacao_oficial.sigla || typeof situacao_oficial.descricao !== "string" || !situacao_oficial.descricao.trim()) {
      return { ok: false, motivo: "situação oficial ausente" }
    }
    if (!isRecord(identidade) || identidade.metodo !== "seed_ids_senado" || !dataValida(identidade.conferida_em) || !isRecord(identidade.alvo)) {
      return { ok: false, motivo: "sem registro das duas pontes de identidade" }
    }
    const alvo = identidade.alvo
    if ((alvo.metodo !== "ementa" && alvo.metodo !== "documento") || typeof alvo.fonte_url !== "string" || !/^https:\/\/legis\.senado\.leg\.br\/dadosabertos\/processo(?:\/|\?)/.test(alvo.fonte_url) || typeof alvo.trecho_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(alvo.trecho_sha256) || !dataValida(alvo.conferida_em)) {
      return { ok: false, motivo: "evidência oficial do alvo incompleta" }
    }
    if (revisao.alvo_confirmado !== true || revisao.candidato_confirmado !== true || revisao.situacao_confirmada !== true || revisao.situacao_sigla !== situacao_oficial.sigla || revisao.situacao_descricao !== situacao_oficial.descricao) {
      return { ok: false, motivo: "aprovação humana não confirma alvo, candidato e situação" }
    }
    return {
      ok: true,
      item: {
        id, candidate_slug, casa, senador_id,
        processo: { id: processo.id, sigla: "PCE", numero: processo.numero, ano: processo.ano },
        situacao_oficial: { sigla: situacao_oficial.sigla, descricao: situacao_oficial.descricao },
        ultimo_andamento_em, verificado_em, url_oficial,
        identidade: {
          metodo: "seed_ids_senado", conferida_em: identidade.conferida_em as string,
          alvo: { metodo: alvo.metodo, fonte_url: alvo.fonte_url, trecho_sha256: alvo.trecho_sha256, conferida_em: alvo.conferida_em as string },
        },
        revisao: {
          aprovado: true, revisor_tipo: "humano", aprovado_em: revisao.aprovado_em as string,
          alvo_confirmado: true, candidato_confirmado: true, situacao_confirmada: true,
          situacao_sigla: revisao.situacao_sigla as string, situacao_descricao: revisao.situacao_descricao as string,
          ...overrideValidado,
        },
      },
    }
  }
  return { ok: false, motivo: "casa diferente de camara ou senado" }
}

export function validateRepresentacoesEticaDataset(dataset: unknown): {
  itens: RepresentacaoEticaAprovada[]
  issues: RepresentacoesEticaIssue[]
} {
  if (!isRecord(dataset) || dataset.policy !== REPRESENTACOES_ETICA_POLICY || !Array.isArray(dataset.itens)) {
    return { itens: [], issues: [{ index: -1, motivo: "dataset sem policy válida ou sem lista de itens" }] }
  }
  const itens: RepresentacaoEticaAprovada[] = []
  const issues: RepresentacoesEticaIssue[] = []
  const vistos = new Set<string>()
  dataset.itens.forEach((value, index) => {
    const parsed = parseRepresentacaoAprovada(value)
    if (!parsed.ok) {
      issues.push({ index, motivo: parsed.motivo })
      return
    }
    if (vistos.has(parsed.item.id)) {
      issues.push({ index, motivo: `id duplicado ${parsed.item.id}` })
      return
    }
    vistos.add(parsed.item.id)
    itens.push(parsed.item)
  })
  return { itens, issues }
}

export function selectRepresentacoesEtica(
  itens: readonly RepresentacaoEticaAprovada[],
  candidateSlug: string,
): RepresentacaoEticaAprovada[] {
  return itens
    .filter((item) => item.candidate_slug === candidateSlug)
    .sort((a, b) => b.ultimo_andamento_em.localeCompare(a.ultimo_andamento_em) || a.id.localeCompare(b.id))
}

/** Índice por slug, montado uma vez: a ficha pede por slug a cada render. */
export function indexarRepresentacoesEtica(dataset: unknown): (candidateSlug: string) => RepresentacaoEticaAprovada[] {
  const aprovadas = validateRepresentacoesEticaDataset(dataset).itens
  const porSlug = new Map(
    [...new Set(aprovadas.map((item) => item.candidate_slug))].map((slug) => [slug, selectRepresentacoesEtica(aprovadas, slug)]),
  )
  const nenhuma: RepresentacaoEticaAprovada[] = []
  return (candidateSlug) => porSlug.get(candidateSlug) ?? nenhuma
}

export const getRepresentacoesEticaAprovadas = indexarRepresentacoesEtica(rawDataset)

export function representacaoTitulo(item: RepresentacaoEticaAprovada): string {
  return item.casa === "camara"
    ? `Representação ${item.proposicao.numero}/${item.proposicao.ano}`
    : `PCE ${item.processo.numero}/${item.processo.ano}`
}
