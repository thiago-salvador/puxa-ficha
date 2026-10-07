/**
 * Recorte da auditoria de frescor pela coorte de atualização.
 *
 * `data-freshness-snapshot.sql` publica `atualizacao_encerrada`: fichas cuja
 * atualização foi encerrada depois do turno, com o SQ do titular e dos vices
 * das chapas dele. A comparação com o TSE deixa essas candidaturas de fora nos
 * DOIS lados (oficial e publicado), para que o resultado da eleição, que muda
 * a situação delas no TSE, não vire alerta de ficha desatualizada. A ficha
 * continua no ar com a nota "Dados atualizados até".
 */
import { naCoorteAtualizacao } from "../../../src/lib/coorte-atualizacao"

export interface CandidaturaEncerrada {
  candidato_id: string
  slug: string
  atualizacao_encerrada_em: string
  sq_candidatos: string[]
}

export interface RecorteCoorte {
  itens: CandidaturaEncerrada[]
  slugs: ReadonlySet<string>
  sqs: ReadonlySet<string>
}

export function lerCandidaturasEncerradas(valor: unknown): RecorteCoorte {
  const itens: CandidaturaEncerrada[] = []
  if (valor !== undefined && valor !== null && !Array.isArray(valor)) {
    throw new Error("snapshot publicado: atualizacao_encerrada não é lista")
  }
  for (const bruto of (valor ?? []) as unknown[]) {
    const item = bruto as Partial<CandidaturaEncerrada> | null
    if (!item || typeof item.slug !== "string" || !item.slug || typeof item.candidato_id !== "string") {
      throw new Error("snapshot publicado: item de atualizacao_encerrada sem slug ou candidato_id")
    }
    if (naCoorteAtualizacao({ atualizacao_encerrada_em: item.atualizacao_encerrada_em ?? null })) continue
    const sqs = Array.isArray(item.sq_candidatos) ? item.sq_candidatos.filter((sq): sq is string => typeof sq === "string" && sq.length > 0) : []
    itens.push({ candidato_id: item.candidato_id, slug: item.slug, atualizacao_encerrada_em: String(item.atualizacao_encerrada_em), sq_candidatos: sqs })
  }
  return {
    itens,
    slugs: new Set(itens.map((i) => i.slug)),
    sqs: new Set(itens.flatMap((i) => i.sq_candidatos)),
  }
}

export function semEncerradasPorSq<T extends { sq_candidato?: string | null }>(linhas: readonly T[], recorte: RecorteCoorte): T[] {
  if (recorte.sqs.size === 0) return [...linhas]
  return linhas.filter((linha) => !linha.sq_candidato || !recorte.sqs.has(linha.sq_candidato))
}

export function semEncerradasPorSlug<T extends { slug?: string | null }>(linhas: readonly T[], recorte: RecorteCoorte): T[] {
  if (recorte.slugs.size === 0) return [...linhas]
  return linhas.filter((linha) => !linha.slug || !recorte.slugs.has(linha.slug))
}

/**
 * Titular substituído ou vice inapta, nunca publicados, numa vaga (uf:cargo:coligação)
 * cuja candidatura publicada foi encerrada. Antes do corte eles casavam com a vigente
 * ("substituted" ou "inactive_vice"); com a vigente fora da comparação, sobrariam
 * sozinhos e virariam "inclusion".
 *
 * Só sai quem tem evidência própria: `resolvidasPelaVigente` são os SQs que a própria
 * comparação, rodada sem o recorte, classificou como substituídos (lista revisada) ou
 * vice inapta (detalhe atual do TSE). Candidatura nova na mesma vaga, sem essa
 * classificação, continua na auditoria e vira "inclusion". Recebe o oficial e o
 * publicado ANTES do recorte por SQ, porque é a vigente encerrada que fecha a vaga.
 */
export function semOrfasDeVagaEncerrada<T extends { sq_candidato: string }>(
  oficial: readonly T[],
  sqsPublicados: ReadonlySet<string>,
  recorte: RecorteCoorte,
  vaga: (linha: T) => string,
  resolvidasPelaVigente: ReadonlySet<string>,
): T[] {
  if (recorte.sqs.size === 0 || resolvidasPelaVigente.size === 0) return [...oficial]
  const fechadas = new Set(oficial
    .filter((linha) => recorte.sqs.has(linha.sq_candidato) && sqsPublicados.has(linha.sq_candidato))
    .map(vaga))
  return oficial.filter((linha) =>
    sqsPublicados.has(linha.sq_candidato)
    || !fechadas.has(vaga(linha))
    || !resolvidasPelaVigente.has(linha.sq_candidato))
}
