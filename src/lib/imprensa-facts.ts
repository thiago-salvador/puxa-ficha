import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import { MESA_COM, MESA_ORDEM, type MesaQuery } from "@/lib/imprensa-nav"

/**
 * Fatos da seção /imprensa calculados a partir das linhas do dataset público.
 * Sala (Brasil), pacote da UF e Mesa (recorte) usam esta mesma função e os
 * mesmos cards, para que número, redação e ressalva sejam idênticos.
 * Nenhum número é fixado aqui: tudo sai das linhas recebidas.
 */

export type ImprensaFactsRow = Pick<ImprensaPageRow, "cargo" | "patrimonio" | "processos" | "sancoes" | "tcu" | "gastos" | "chapa">

export interface ImprensaFacts {
  total: number
  porCargo: Array<{ cargo: string; total: number }>
  patrimonio: {
    /** Declaração mais recente publicada (estado "publicado"). */
    publicado: number
    /** Com variação entre duas declarações comparáveis. */
    comVariacao: number
    variacaoAcima100: number
    acima10Milhoes: number
  }
  processos: {
    /** Estado publicado ou cobertura parcial. */
    candidatosComProcesso: number
    publicado: number
    coberturaParcial: number
    /** Soma de registros exibidos para os candidatos com processo. */
    registros: number
    emConfirmacao: number
    /** Nome encontrado sem um segundo dado oficial que confirme a pessoa. */
    indeterminado: number
    vazioConfirmado: number
  }
  sancoes: { comRegistro: number; vazioConfirmado: number; naoVerificado: number }
  tcu: { encontradoEmRevisao: number; vazioVerificado: number; pendente: number; naoVerificado: number }
  cota: { publicado: number }
  chapas: {
    /** Chapas a presidente e governador. */
    titulares: number
    vicePublicado: number
    senadores: number
    suplentesPublicados: number
    suplentesIndeferidos: number
  }
}

const CARGO_ORDER = ["Presidente", "Governador", "Senador"]

function cargoRank(cargo: string): number {
  const index = CARGO_ORDER.indexOf(cargo)
  return index === -1 ? CARGO_ORDER.length : index
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function computeImprensaFacts(rows: readonly ImprensaFactsRow[]): ImprensaFacts {
  const facts: ImprensaFacts = {
    total: rows.length,
    porCargo: [],
    patrimonio: { publicado: 0, comVariacao: 0, variacaoAcima100: 0, acima10Milhoes: 0 },
    processos: { candidatosComProcesso: 0, publicado: 0, coberturaParcial: 0, registros: 0, emConfirmacao: 0, indeterminado: 0, vazioConfirmado: 0 },
    sancoes: { comRegistro: 0, vazioConfirmado: 0, naoVerificado: 0 },
    tcu: { encontradoEmRevisao: 0, vazioVerificado: 0, pendente: 0, naoVerificado: 0 },
    cota: { publicado: 0 },
    chapas: { titulares: 0, vicePublicado: 0, senadores: 0, suplentesPublicados: 0, suplentesIndeferidos: 0 },
  }
  const cargos = new Map<string, number>()

  for (const row of rows) {
    cargos.set(row.cargo, (cargos.get(row.cargo) ?? 0) + 1)

    const { patrimonio } = row
    if (patrimonio.estado === "publicado") {
      facts.patrimonio.publicado += 1
      if (isNumber(patrimonio.total) && patrimonio.total > 10_000_000) facts.patrimonio.acima10Milhoes += 1
      if (isNumber(patrimonio.variacaoPct)) {
        facts.patrimonio.comVariacao += 1
        if (patrimonio.variacaoPct > 100) facts.patrimonio.variacaoAcima100 += 1
      }
    }

    const { processos } = row
    if (processos.estado === "publicado" || processos.estado === "cobertura_parcial") {
      facts.processos.candidatosComProcesso += 1
      if (processos.estado === "publicado") facts.processos.publicado += 1
      else facts.processos.coberturaParcial += 1
      facts.processos.registros += processos.quantidade ?? 0
      facts.processos.emConfirmacao += processos.quantidadeEmConfirmacao ?? 0
    } else if (processos.estado === "indeterminado") {
      facts.processos.indeterminado += 1
    } else if (processos.estado === "vazio_confirmado") {
      facts.processos.vazioConfirmado += 1
    }

    const { sancoes } = row
    if (sancoes.estado === "com-registros" && (sancoes.quantidade ?? 0) > 0) facts.sancoes.comRegistro += 1
    else if (sancoes.estado === "vazio-confirmado") facts.sancoes.vazioConfirmado += 1
    else if (sancoes.estado === "nao-verificado") facts.sancoes.naoVerificado += 1

    switch (row.tcu.estado) {
      case "encontrado_em_revisao": facts.tcu.encontradoEmRevisao += 1; break
      case "vazio_verificado": facts.tcu.vazioVerificado += 1; break
      case "pendente": facts.tcu.pendente += 1; break
      case "nao_verificado": facts.tcu.naoVerificado += 1; break
    }

    if (row.gastos.estado === "publicado") facts.cota.publicado += 1

    if (row.cargo === "Presidente" || row.cargo === "Governador") {
      facts.chapas.titulares += 1
      if (row.chapa.estado === "publicado" && row.chapa.viceNome) facts.chapas.vicePublicado += 1
    } else if (row.cargo === "Senador") {
      facts.chapas.senadores += 1
      if (row.chapa.suplentesEstado === "publicado") facts.chapas.suplentesPublicados += 1
      else if (row.chapa.suplentesEstado === "indeferidos_comprovados") facts.chapas.suplentesIndeferidos += 1
    }
  }

  facts.porCargo = [...cargos.entries()]
    .sort(([a], [b]) => cargoRank(a) - cargoRank(b) || a.localeCompare(b, "pt-BR"))
    .map(([cargo, total]) => ({ cargo, total }))
  return facts
}

// ---------------------------------------------------------------------------
// Cards de fatos: mesma redação e mesma ressalva em toda a seção.
// ---------------------------------------------------------------------------

export type ImprensaFactCardId = "patrimonio_variacao" | "processos" | "sancoes" | "cota" | "patrimonio_acima_10mi" | "chapas"

export interface ImprensaFactCard {
  id: ImprensaFactCardId
  value: number
  /** Frase que completa o número, já no singular ou no plural. */
  label: string
  /** Denominador: de quantos o número sai. Sempre visível, inclusive quando o valor é zero. */
  detail: string
  /** Ressalva obrigatória, nunca omitida. */
  caveat: string
  /** Texto do link para a Mesa. */
  cta: string
  /** Parâmetros `ordem` ou `com` da Mesa que abrem a tabela já ordenada ou filtrada. */
  mesaQuery: MesaQuery
}

/** Ordem padrão. Registro do TCU em revisão editorial nunca vira card. */
export const IMPRENSA_FACT_CARD_ORDER: readonly ImprensaFactCardId[] = [
  "patrimonio_variacao",
  "processos",
  "sancoes",
  "cota",
  "patrimonio_acima_10mi",
  "chapas",
]

const IMPRENSA_FACT_CAVEATS = {
  patrimonio: "Variação nominal, sem correção pela inflação. Declaração ao TSE, não auditoria.",
  patrimonioValor: "Última declaração única ao TSE. Declaração ao TSE, não auditoria.",
  processos: "Processo não é condenação. Homônimo não confirmado não entra.",
  sancoes: "CEIS, CNEP ou CEAF, da CGU.",
  cota: "Anos em revisão ficam fora do total.",
  chapas: "Situação oficial do TSE ao lado do nome.",
} as const

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function cardFor(id: ImprensaFactCardId, facts: ImprensaFacts): ImprensaFactCard {
  const { patrimonio, processos, sancoes, cota, chapas } = facts
  switch (id) {
    case "patrimonio_variacao":
      return {
        id,
        value: patrimonio.variacaoAcima100,
        label: plural(patrimonio.variacaoAcima100, "patrimônio cresceu mais de 100% entre duas eleições", "patrimônios cresceram mais de 100% entre duas eleições"),
        detail: `Entre ${patrimonio.comVariacao} ${plural(patrimonio.comVariacao, "candidato", "candidatos")} com duas declarações comparáveis, de ${patrimonio.publicado} ${plural(patrimonio.publicado, "declaração publicada", "declarações publicadas")}.`,
        caveat: IMPRENSA_FACT_CAVEATS.patrimonio,
        cta: "Ordenar por variação",
        mesaQuery: { ordem: MESA_ORDEM.variacao },
      }
    case "processos":
      return {
        id,
        value: processos.candidatosComProcesso,
        label: plural(processos.candidatosComProcesso, "candidato com processo e link do tribunal", "candidatos com processo e link do tribunal"),
        detail: `${processos.registros} ${plural(processos.registros, "registro", "registros")} na ficha; ${processos.emConfirmacao} com fonte oficial em confirmação.`,
        caveat: IMPRENSA_FACT_CAVEATS.processos,
        cta: "Ver quem tem processo",
        mesaQuery: { com: MESA_COM.processo },
      }
    case "sancoes":
      return {
        id,
        value: sancoes.comRegistro,
        label: plural(sancoes.comRegistro, "candidato em cadastro federal de sanções", "candidatos em cadastro federal de sanções"),
        detail: `${sancoes.vazioConfirmado} ${plural(sancoes.vazioConfirmado, "consultado", "consultados")} sem registro; ${sancoes.naoVerificado} sem consulta.`,
        caveat: IMPRENSA_FACT_CAVEATS.sancoes,
        cta: "Ver na Mesa",
        mesaQuery: { com: MESA_COM.sancao },
      }
    case "cota":
      return {
        id,
        value: cota.publicado,
        label: plural(cota.publicado, "candidato com cota parlamentar publicada", "candidatos com cota parlamentar publicada"),
        detail: `Gastos por ano na Câmara ou no Senado, entre ${facts.total} ${plural(facts.total, "candidato", "candidatos")}.`,
        caveat: IMPRENSA_FACT_CAVEATS.cota,
        cta: "Ordenar por gasto",
        mesaQuery: { ordem: MESA_ORDEM.gasto },
      }
    case "patrimonio_acima_10mi":
      return {
        id,
        value: patrimonio.acima10Milhoes,
        label: plural(patrimonio.acima10Milhoes, "candidato declarou mais de R$ 10 milhões", "candidatos declararam mais de R$ 10 milhões"),
        detail: `De ${patrimonio.publicado} ${plural(patrimonio.publicado, "declaração publicada", "declarações publicadas")}.`,
        caveat: IMPRENSA_FACT_CAVEATS.patrimonioValor,
        cta: "Ordenar por valor",
        mesaQuery: { ordem: MESA_ORDEM.patrimonio },
      }
    case "chapas": {
      const composicao = chapas.vicePublicado + chapas.suplentesPublicados
      return {
        id,
        value: composicao,
        label: plural(composicao, "chapa com composição publicada", "chapas com composição publicada"),
        detail: `${chapas.vicePublicado} de ${chapas.titulares} com vice, a presidente e governador; ${chapas.suplentesPublicados} de ${chapas.senadores} com suplentes, ao Senado; ${chapas.suplentesIndeferidos} com suplentes indeferidos.`,
        caveat: IMPRENSA_FACT_CAVEATS.chapas,
        cta: "Ver chapas",
        mesaQuery: { com: MESA_COM.chapa },
      }
    }
  }
}

/** Cards na ordem pedida (padrão: `IMPRENSA_FACT_CARD_ORDER`). */
export function buildImprensaFactCards(
  facts: ImprensaFacts,
  ids: readonly ImprensaFactCardId[] = IMPRENSA_FACT_CARD_ORDER,
): ImprensaFactCard[] {
  return ids.map((id) => cardFor(id, facts))
}

// ---------------------------------------------------------------------------
// Estados do dado: quatro grupos, mesma palavra e mesma cor em toda a seção.
// ---------------------------------------------------------------------------

export type ImprensaDataBucket = "publicado" | "nada_consta" | "parcial" | "sem_confirmacao"

export const IMPRENSA_DATA_BUCKETS: ReadonlyArray<{ id: ImprensaDataBucket; label: string; description: string }> = [
  { id: "publicado", label: "Publicado", description: "O dado está na ficha, com fonte oficial e data de coleta." },
  { id: "nada_consta", label: "Buscado, nada consta", description: "A consulta à fonte oficial foi feita e voltou sem registro." },
  { id: "parcial", label: "Parcial ou em revisão", description: "Parte do dado está publicada, ou o registro ainda passa por conferência." },
  { id: "sem_confirmacao", label: "Sem confirmação ou sem dado", description: "Não há consulta que comprove o dado, ou a identidade da pessoa não foi confirmada. Não equivale a zero." },
]

const BUCKET_BY_STATE: Record<string, ImprensaDataBucket> = {
  publicado: "publicado",
  "com-registros": "publicado",
  encontrado: "publicado",
  indeferidos_comprovados: "publicado",
  vazio_confirmado: "nada_consta",
  "vazio-confirmado": "nada_consta",
  vazio_verificado: "nada_consta",
  cobertura_parcial: "parcial",
  encontrado_em_revisao: "parcial",
  contraditorio: "parcial",
}

/**
 * Agrupa um estado interno do dataset em um dos quatro grupos. "nao_aplicavel"
 * devolve null (não há dado a esperar). Qualquer estado desconhecido cai em
 * "sem_confirmacao", nunca em publicado nem em nada consta.
 */
export function imprensaDataBucket(state: string | null | undefined): ImprensaDataBucket | null {
  if (state === "nao_aplicavel") return null
  return (state && BUCKET_BY_STATE[state]) || "sem_confirmacao"
}

export function imprensaDataBucketLabel(bucket: ImprensaDataBucket): string {
  return IMPRENSA_DATA_BUCKETS.find((item) => item.id === bucket)?.label ?? "Sem confirmação ou sem dado"
}
