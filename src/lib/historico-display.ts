import { cargoCoerenteComOAno } from "@/lib/calendario-eleitoral"
import { canonicalCargo } from "@/lib/cargo-utils"
import { ehCargoNaoEletivo, ROTULO_CARGO_NAO_ELETIVO } from "@/lib/cargo-nao-eletivo"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import { sanitizeObservacaoPublica } from "@/lib/observacao-publica"
import {
  formatDesfechoEleitoralPublico,
  resolveResultadoEleitoral,
} from "@/lib/resultado-eleitoral"
import type { HistoricoPolitico } from "@/lib/types"

// MANUTENÇÃO: ano da eleicao em aberto. Marca candidaturas deste ano como
// "em disputa" no historico. Precisa ser atualizado a cada ciclo eleitoral
// (proxima revisão: apos a apuração de 2026, subir para 2028). Se ficar defasado,
// candidaturas ja decididas aparecem como indefinidas.
const CURRENT_UNDECIDED_ELECTION_YEAR = 2026

function isCurrentUndecidedCandidatura(
  item: Pick<
    HistoricoPolitico,
    "tipo_evento" | "periodo_inicio" | "periodo_fim" | "observacoes"
  >,
): boolean {
  const year = item.periodo_inicio ?? item.periodo_fim
  return (
    year != null &&
    year >= CURRENT_UNDECIDED_ELECTION_YEAR &&
    isHistoricoCandidaturaRow(item)
  )
}

// Até 15/08/2026 a observação distinguia pré-candidatura declarada de
// candidatura registrada e este rótulo variava. O prazo de registro passou
// (decisão editorial de 16/08): disputa de 2026 em aberto é sempre
// "Candidato" na tela; o grau de registro segue visível no selo de
// procedência do pleito e na observação da linha.
const CURRENT_UNDECIDED_CANDIDATURA_LABEL = "Candidato"

/** Chave alinhada a dedupe / ingest (`cargo_canonico` ou `canonicalCargo`). */
export function historicoCanonKey(
  item: Pick<HistoricoPolitico, "cargo" | "cargo_canonico">,
): string {
  return (item.cargo_canonico?.trim() || canonicalCargo(item.cargo ?? "")).trim()
}

/**
 * Vários registos do mesmo cargo com `periodo_fim` nulo: só o de maior `periodo_inicio` é
 * tratado como mandato em curso; os outros são dados abertos obsoletos (falta `periodo_fim`).
 */
export function isHistoricoOpenStale(
  item: Pick<
    HistoricoPolitico,
    "periodo_inicio" | "periodo_fim" | "cargo" | "cargo_canonico"
  >,
  all: HistoricoPolitico[],
): boolean {
  if (item.periodo_fim != null || item.periodo_inicio == null) return false
  const canon = historicoCanonKey(item)
  const openWithInicio = all.filter(
    (h) => historicoCanonKey(h) === canon && h.periodo_fim == null && h.periodo_inicio != null,
  )
  if (openWithInicio.length <= 1) return false
  const maxOpenInicio = Math.max(...openWithInicio.map((h) => h.periodo_inicio ?? 0))
  return (item.periodo_inicio ?? 0) < maxOpenInicio
}

/**
 * Quando um registo aberto é "obsoleto" (há outro aberto mais recente no mesmo cargo),
 * infere o ano de fim como o ano anterior ao `periodo_inicio` do mandato seguinte
 * (qualquer registo do mesmo cargo canônico com início maior), p.ex. 2002 → 2010 se o
 * próximo Presidente na lista começa em 2011.
 */
export function inferStaleOpenEndYear(
  item: Pick<HistoricoPolitico, "id" | "periodo_inicio" | "periodo_fim" | "cargo" | "cargo_canonico">,
  all: HistoricoPolitico[],
): number | null {
  if (!isHistoricoOpenStale(item, all) || item.periodo_inicio == null) return null
  const canon = historicoCanonKey(item)
  const ini = item.periodo_inicio

  const sameStartClosed = all.filter(
    (h) =>
      h.id !== item.id &&
      historicoCanonKey(h) === canon &&
      h.periodo_inicio === ini &&
      h.periodo_fim != null,
  )
  if (sameStartClosed.length > 0) {
    const mf = Math.max(...sameStartClosed.map((h) => h.periodo_fim!))
    if (mf >= ini) return mf
  }

  const later = all.filter(
    (h) =>
      h.id !== item.id &&
      historicoCanonKey(h) === canon &&
      h.periodo_inicio != null &&
      h.periodo_inicio > ini,
  )
  if (later.length === 0) return null
  const nextStart = Math.min(...later.map((h) => h.periodo_inicio!))
  const diff = nextStart - ini
  // Não esticar um mandato até um retorno muito posterior (ex.: 2002→2022) sem dados intermédios.
  if (diff >= 16) return null
  // Mandatos consecutivos no mesmo ciclo eleitoral brasileiro (4 anos): fim = ano do próximo início.
  const end = diff === 4 || diff === 8 ? nextStart : nextStart - 1
  return end >= ini ? end : null
}

/**
 * Período para UI: quando há mais de um registo do mesmo cargo com `periodo_fim` nulo,
 * só o de maior `periodo_inicio` pode ser tratado como "atual" (evita dois "atual" na ficha).
 */
export function formatHistoricoPeriodoDisplay(
  item: Pick<
    HistoricoPolitico,
    | "id"
    | "periodo_inicio"
    | "periodo_fim"
    | "observacoes"
    | "eleito_por"
    | "cargo"
    | "cargo_canonico"
    | "tipo_evento"
  >,
  all: HistoricoPolitico[],
): string {
  // Conflitos entre períodos continuam como linhas independentes, com os
  // trechos que cada fonte sustenta. O diagnóstico pertence ao gate editorial,
  // não ao vocabulário público da ficha.
  return formatHistoricoPeriodoBase(item, all)
}

function formatHistoricoPeriodoBase(
  item: Pick<
    HistoricoPolitico,
    | "id"
    | "periodo_inicio"
    | "periodo_fim"
    | "observacoes"
    | "eleito_por"
    | "cargo"
    | "cargo_canonico"
    | "tipo_evento"
  >,
  all: HistoricoPolitico[],
): string {
  // Situação CONHECIDA do registro vence o atalho de "candidatura do ano
  // corrente". Registro indeferido, cancelado ou inapto em 2026 não é
  // "Candidato": a disputa dele já terminou antes de começar, e chamar isso de
  // candidatura em aberto é a mesma afirmação falsa do item 12, só que no
  // futuro.
  const classificacao = resolveResultadoEleitoral(item)
  if (classificacao.situacao != null) {
    const desfecho = formatDesfechoEleitoralPublico(classificacao)
    if (desfecho != null) {
      return item.periodo_inicio != null ? `${item.periodo_inicio} - ${desfecho}` : desfecho
    }
  }

  if (isCurrentUndecidedCandidatura(item)) {
    return CURRENT_UNDECIDED_CANDIDATURA_LABEL
  }

  if (item.periodo_inicio != null && item.periodo_fim != null) {
    if (item.periodo_inicio === item.periodo_fim) {
      // Ano fechado em si mesmo é a forma de um evento de pleito. O DESFECHO
      // vem do registro (`resultado-eleitoral.ts`), nunca da forma: era daqui
      // que saíam "2002 - Não Eleito" e "2022 - Não Eleito" na ficha do Lula.
      //
      // Mas a forma também aparece em linha de POSSE com `periodo_fim` torto
      // (ratinho-junior, mandato de 2003 cuja eleição foi em 2002). Afirmar
      // desfecho ali inventaria um pleito que não houve naquele ano, então o
      // ano precisa comportar uma eleição para aquele cargo. Sem isso, e sem
      // desfecho com lastro, imprime só o ano e não afirma nada.
      const desfecho = cargoCoerenteComOAno(item.cargo, item.periodo_inicio)
        ? formatDesfechoEleitoralPublico(resolveResultadoEleitoral(item))
        : null
      return desfecho ? `${item.periodo_inicio} - ${desfecho}` : `${item.periodo_inicio}`
    }
    return `${item.periodo_inicio} - ${item.periodo_fim}`
  }

  if (item.periodo_inicio != null && item.periodo_fim == null) {
    if (isHistoricoOpenStale(item, all)) {
      const inferred = inferStaleOpenEndYear(item, all)
      if (inferred != null) {
        return `${item.periodo_inicio} - ${inferred}`
      }
      return `${item.periodo_inicio} - mandato encerrado`
    }

    return `${item.periodo_inicio} - atual`
  }

  if (item.periodo_fim != null) {
    return `Até ${item.periodo_fim}`
  }

  return "Período não determinado"
}

/** Mesma convenção do overview e da aba Trajetória (`prepareHistoricoPoliticoPublicDisplayList` em `trajetoria-public-display.ts`). */
export function formatHistoricoPartidoEstadoLine(
  item: Pick<HistoricoPolitico, "partido" | "estado">,
): string {
  const left = item.partido?.trim() ?? ""
  const right = item.estado?.trim() ? `(${item.estado.trim()})` : ""
  return [left, right].filter(Boolean).join(" ").trim()
}

/** Prefixo interno "Candidatura:"/"candidatura:", em qualquer caixa. */
const PREFIXO_CANDIDATURA_INTERNO = /^\s*candidatura:\s*/i

/**
 * Observação que sobra depois de tirar o prefixo interno e o que o rótulo do
 * período já diz. Ex.: "Candidatura: NÃO ELEITO (TSE 2018)" é redundante com
 * "2018 - Não Eleito" e some; já o motivo do indeferimento do Lula em 2018 é a
 * informação que faltava na ficha e passa a aparecer.
 */
const APENAS_DESFECHO_REDUNDANTE =
  /^(n(a|ã)o[\s-]*eleit[oa]|eleit[oa](\s+por\s+(qp|m(e|é)dia))?|suplente|indeferid[oa]|inapt[oa])\s*(\(tse\s*\d{4}\))?\s*\.?\s*$/i

export function formatHistoricoObservacaoPublica(obs: string | null | undefined): string | null {
  if (!obs) return null
  // Sanitiza aqui também, e não só no DTO: esta função é chamada com linha crua
  // pela timeline agregada e por superfícies que não passam pelo DTO. Como a
  // observação do indeferimento do Lula passou a ser EXIBIDA, o identificador
  // do TSE que vinha nela vazaria junto.
  const limpo = sanitizeObservacaoPublica(obs) ?? ""
  const semPrefixo = limpo.replace(PREFIXO_CANDIDATURA_INTERNO, "").trim()
  if (!semPrefixo) return null
  if (APENAS_DESFECHO_REDUNDANTE.test(semPrefixo)) return null
  return semPrefixo
}

/** Título do cargo na ficha: distingue pleito (candidatura) de mandato. */
export function formatHistoricoCargoTituloPublico(
  item: Pick<
    HistoricoPolitico,
    "cargo" | "tipo_evento" | "observacoes" | "periodo_inicio" | "periodo_fim"
  >,
): string {
  // Direção de partido ou de sindicato continua na ficha, porque é cargo real e
  // não existe superfície separada para cargo não eletivo. O que muda é o
  // rótulo: sem a marca, "2025 - atual · Presidente Nacional do Partido Missão"
  // se lê como mandato conquistado em urna (item 13 da nota).
  if (ehCargoNaoEletivo(item.cargo)) return `${item.cargo} · ${ROTULO_CARGO_NAO_ELETIVO}`
  if (!isHistoricoCandidaturaRow(item)) return item.cargo
  // "Candidatura: Candidatura a Vereador" era o que a ficha do jarbas-soares
  // mostrava. O rótulo já diz que é candidatura; repetir o prefixo que veio no
  // texto do cargo é gagueira. Vale para as três formas que o banco tem
  // ("Candidatura a", "Candidato a", "Candidata a"), sem depender de a coluna
  // ter sido normalizada.
  const cargo = (item.cargo ?? "")
    .trim()
    .replace(/^(?:pré|pre)?[- ]?candidat(?:ura|o|a)\s+(?:a|ao|à|as|aos)\s+/i, "")
    .trim()
  return `Candidatura: ${cargo || item.cargo}`
}
