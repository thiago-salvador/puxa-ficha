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

export interface RepresentacaoEticaAprovada {
  id: string
  candidate_slug: string
  casa: "camara"
  deputado_id: number
  proposicao: { id: number; sigla: "REP"; numero: number; ano: number }
  fase: FaseRepresentacao
  /** Data (YYYY-MM-DD) do último andamento lido na API. */
  ultimo_andamento_em: string
  /** Data (YYYY-MM-DD) em que a fase foi conferida na fonte oficial. */
  verificado_em: string
  url_oficial: string
  /** Como o deputado foi ligado ao candidato e quando isso foi reconferido nas fontes (sem CPF). */
  identidade: { metodo: MetodoIdentidadeRepresentacao; conferida_em: string }
  revisao: { aprovado: true; revisor_tipo: "humano"; aprovado_em: string }
}

export type MetodoIdentidadeRepresentacao = "seed_ids_camara" | "cpf_tse_camara"

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

export function idRepresentacaoEtica(proposicaoId: number, deputadoId: number): string {
  return `camara-rep-${proposicaoId}-dep-${deputadoId}`
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
  const { id, candidate_slug, casa, deputado_id, proposicao, fase, ultimo_andamento_em, verificado_em, url_oficial, identidade, revisao } =
    value
  if (typeof candidate_slug !== "string" || candidate_slug.trim() === "") return { ok: false, motivo: "candidate_slug ausente" }
  if (casa !== "camara") return { ok: false, motivo: "casa diferente de camara" }
  if (!inteiroPositivo(deputado_id)) return { ok: false, motivo: "deputado_id inválido" }
  if (!isRecord(proposicao)) return { ok: false, motivo: "proposicao ausente" }
  if (proposicao.sigla !== "REP") return { ok: false, motivo: "proposicao não é REP" }
  if (!inteiroPositivo(proposicao.id) || !inteiroPositivo(proposicao.numero) || !inteiroPositivo(proposicao.ano)) {
    return { ok: false, motivo: "proposicao com id, número ou ano inválido" }
  }
  if (id !== idRepresentacaoEtica(proposicao.id, deputado_id)) return { ok: false, motivo: "id não bate com proposição e deputado" }
  if (!isFaseRepresentacao(fase)) return { ok: false, motivo: "fase fora do enum" }
  if (!dataValida(ultimo_andamento_em)) return { ok: false, motivo: "ultimo_andamento_em inválido" }
  if (!dataValida(verificado_em)) return { ok: false, motivo: "verificado_em inválido" }
  if (verificado_em < ultimo_andamento_em) return { ok: false, motivo: "verificado_em anterior ao último andamento" }
  if (url_oficial !== urlFichaTramitacaoCamara(proposicao.id)) return { ok: false, motivo: "url_oficial não é a ficha oficial da proposição" }
  if (
    !isRecord(identidade) ||
    (identidade.metodo !== "seed_ids_camara" && identidade.metodo !== "cpf_tse_camara") ||
    !dataValida(identidade.conferida_em)
  ) {
    return { ok: false, motivo: "sem registro da conferência de identidade" }
  }
  if (!isRecord(revisao) || revisao.aprovado !== true || revisao.revisor_tipo !== "humano" || !dataValida(revisao.aprovado_em)) {
    return { ok: false, motivo: "sem aprovação humana registrada" }
  }
  return {
    ok: true,
    item: {
      id,
      candidate_slug,
      casa,
      deputado_id,
      proposicao: { id: proposicao.id, sigla: "REP", numero: proposicao.numero, ano: proposicao.ano },
      fase,
      ultimo_andamento_em,
      verificado_em,
      url_oficial,
      identidade: { metodo: identidade.metodo, conferida_em: identidade.conferida_em as string },
      revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: revisao.aprovado_em as string },
    },
  }
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

export function representacaoTitulo(item: Pick<RepresentacaoEticaAprovada, "proposicao">): string {
  return `Representação ${item.proposicao.numero}/${item.proposicao.ano}`
}
