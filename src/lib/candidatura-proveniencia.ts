/**
 * Proveniencia do pleito declarado (`cargo_disputado` + `situacao_candidatura`).
 *
 * Motivo (auditoria de integridade 2026-07-24, achado A0.1): ate a etapa 2C o
 * site emitia `cargo_disputado` como se fosse fato oficial. O JSON-LD publicava
 * `jobTitle: "Presidente"` e o payload de `/api/candidato-profile/[slug]`
 * devolvia `situacao_candidatura: "pre-candidato"` sem nenhum campo dizendo de
 * onde aquilo vem. O único aviso de pre-candidatura vivia no rodapé da pagina,
 * longe do dado e invisível para crawler e para quem consome a API.
 *
 * O registro de candidatura de 2026 so existe depois do pedido ao TSE (Lei
 * 9.504/1997, art. 11). Enquanto isso, o pleito publicado aqui e declaracao
 * editorial apurada em fonte publica, nao registro deferido. Este modulo e a
 * fonte única dessa distinção, consumida pela ficha, pelo DTO publico e por
 * qualquer superficie nova.
 *
 * Modulo puro: sem import de next/*, server-only, fs ou Supabase.
 */

import { stripAccents } from "@/lib/strip-accents"
import {
  SITUACAO_JULGAMENTO_INDEFERIDO,
  SITUACAO_JULGAMENTO_PUBLICADO,
} from "@/lib/situacao-candidatura"

export type CargoDisputadoProveniencia =
  | "declaracao_editorial"
  | "registro_tse_pendente"
  | "registro_tse_situacao_nao_informada"
  | "registro_tse"
  | "registro_tse_indeferido"

/**
 * Tokens de `status`/`situacao_candidatura` que significam candidatura ja
 * pedida ou deferida no TSE. Hoje nenhuma linha publicável esta nesse conjunto
 * (184 de 184 sao `status = "pre-candidato"`, consultado em 2026-07-26), mas o
 * mapeamento existe para o dia em que o registro abrir e o pipeline atualizar.
 */
const TOKENS_REGISTRO_TSE: ReadonlySet<string> = new Set([
  "candidato",
  "registrado",
  "deferido",
  "deferido com recurso",
  "apto",
])

/**
 * Julgamento publicado, os quatro estados que o TSE so emite depois de decidir o
 * pedido de registro. Espelha `SITUACAO_JULGAMENTO_PUBLICADO`, e existe aqui
 * como Set para a comparacao ser exata: `deferido` nao pode casar dentro de
 * `indeferido`, que e o modo de falha obvio de fazer isto com `includes`.
 */
const TOKENS_JULGAMENTO: ReadonlySet<string> = new Set(SITUACAO_JULGAMENTO_PUBLICADO)
const TOKENS_JULGAMENTO_INDEFERIDO: ReadonlySet<string> = new Set(SITUACAO_JULGAMENTO_INDEFERIDO)

/**
 * Codigos de `chapas_2026.tse_situacao_codigo`, normalizados, que NAO
 * carregam julgamento nenhum ("nao informado"). Comparado sempre via
 * `normalizeToken`, nunca contra a grafia bruta: `tse_situacao_codigo` mistura
 * o sentinela legado (`#NE`) com a MESMA prosa humana de `situacao_candidatura`
 * ("Aguardando julgamento", "Deferido", "Pendente de julgamento", classificada
 * no ramo `if (input.chapa_2026)` abaixo), e comparar contra a grafia exata é
 * o que deixou passar o bug de 17/09/2026 (main dbcdb6fc): ruth-reis tem
 * `tse_situacao_codigo = "Aguardando julgamento"` numa chapa `fonte_tipo=
 * legado`, e o ramo abaixo tratava qualquer coisa != "#NE" como registro
 * concluido.
 */
const CHAPA_SEM_JULGAMENTO: ReadonlySet<string> = new Set(["#ne", "#ne#", "#nulo#", ""])

function normalizeToken(value: string | null | undefined): string {
  if (!value) return ""
  return stripAccents(value)
    .trim()
    .toLowerCase()
}

export function resolveCargoDisputadoProveniencia(
  input: {
    status?: string | null
    situacao_candidatura?: string | null
    chapa_2026?: {
      tse_situacao_codigo?: string | null
      fonte_sha256?: string | null
    } | null
  } | null | undefined,
): CargoDisputadoProveniencia {
  if (!input) return "declaracao_editorial"

  const status = normalizeToken(input.status)
  const situacao = normalizeToken(input.situacao_candidatura)

  // Julgamento publicado vence snapshot de chapa, e por isso e conferido ANTES
  // do ramo de `chapa_2026`. O motivo e de ordem de precisao, nao de gosto: o
  // codigo do snapshot vale `#NE`, que significa literalmente "situacao nao
  // informada", enquanto `situacao_candidatura` carrega a decisao que o TSE ja
  // publicou em `DS_SITUACAO_JULGAMENTO`. Deixar o `#NE` mandar faria as 4
  // fichas com registro INDEFERIDO exibirem "Pedido de registro no TSE", que e
  // a afirmacao vencida que a migration 20260903210000 existe para corrigir.
  // Se um dia o snapshot passar a trazer codigo de julgamento proprio, ele
  // volta a mandar: a excecao e so para codigo que nao afirma nada.
  const codigoChapa = normalizeToken(input.chapa_2026?.tse_situacao_codigo)
  const chapaSemJulgamento = !input.chapa_2026 || CHAPA_SEM_JULGAMENTO.has(codigoChapa)
  if (chapaSemJulgamento && TOKENS_JULGAMENTO.has(situacao)) {
    return TOKENS_JULGAMENTO_INDEFERIDO.has(situacao) ? "registro_tse_indeferido" : "registro_tse"
  }

  // A situação normalizada do candidato vem da mesma coleta oficial e não
  // pode ser rebaixada só porque o arquivo de chapas ainda usa #NE. Vincular a
  // semântica a um SHA específico fez o texto voltar a "não informada" assim
  // que o TSE publicou um snapshot novo, apesar de a ficha já dizer
  // explicitamente "aguardando julgamento".
  //
  // "pendente de julgamento" entra na MESMA verificação (issue #340/#346,
  // domínio alargado em 20260916130000): é um código de julgamento distinto
  // de "aguardando julgamento" (a distinção jurídica é real e continua
  // preservada em SITUACAO_JULGAMENTO_PUBLICADO, que nenhum dos dois
  // integra), mas os dois significam a mesma coisa para o selo público —
  // pedido registrado, julgamento não concluído, não deferido. Sem esta
  // linha, 'pendente de julgamento' caía no ramo genérico de chapa presente
  // abaixo e produzia "situação ainda não foi informada", contradizendo o
  // campo "Situação: pendente de julgamento" exibido ao lado (bug de
  // produção observado em godeiro-linharess/ruth-reis/leonardo-avalanche
  // após main dbcdb6fc).
  if (
    chapaSemJulgamento &&
    (situacao.includes("aguardando julgamento") ||
      situacao.includes("pendente de julgamento") ||
      situacao === "pedido de registro")
  ) {
    return "registro_tse_pendente"
  }

  // A view de chapas só devolve a linha para quem foi vinculado por UUID como
  // titular ou vice. Portanto sua presença é prova mais forte e mais recente
  // do que os rótulos editoriais legados em `candidatos`, e por isso
  // `tse_situacao_codigo` manda aqui. Mas ele PRECISA ser classificado pela
  // mesma prosa de julgamento que `situacao_candidatura` usa, não reduzido a
  // "é #NE ou não é": o campo carrega tanto o sentinela (`#NE`) quanto os
  // mesmos códigos humanos ("Aguardando julgamento", "Deferido", "Pendente de
  // julgamento", ver `chapas_2026_fonte_detalhe_check`), inclusive em chapas
  // `fonte_tipo=legado` reconciliadas manualmente (ruth-reis, 20260916140000).
  // Tratar qualquer coisa != "#NE" como registro concluído foi exatamente o
  // bug de produção observado em 17/09/2026 (main dbcdb6fc): a chapa de
  // ruth-reis diz "Aguardando julgamento" e a ficha exibia "Candidatura
  // registrada no TSE", como se o julgamento tivesse terminado.
  if (input.chapa_2026) {
    if (TOKENS_JULGAMENTO.has(codigoChapa)) {
      return TOKENS_JULGAMENTO_INDEFERIDO.has(codigoChapa) ? "registro_tse_indeferido" : "registro_tse"
    }
    if (codigoChapa.includes("aguardando julgamento") || codigoChapa.includes("pendente de julgamento")) {
      return "registro_tse_pendente"
    }
    return chapaSemJulgamento ? "registro_tse_situacao_nao_informada" : "registro_tse"
  }

  if (situacao.includes("situacao nao informada")) {
    return "registro_tse_situacao_nao_informada"
  }

  if (
    situacao.includes("aguardando julgamento") ||
    situacao.includes("pendente de julgamento") ||
    situacao === "pedido de registro"
  ) {
    return "registro_tse_pendente"
  }

  if (TOKENS_REGISTRO_TSE.has(status) || TOKENS_REGISTRO_TSE.has(situacao)) {
    return "registro_tse"
  }

  return "declaracao_editorial"
}

/** Rotulo curto, para badge ao lado do cargo. */
const CARGO_DISPUTADO_PROVENIENCIA_LABEL: Record<CargoDisputadoProveniencia, string> = {
  // Pós-prazo de registro do TSE (15/08/2026), o vocabulário público do site
  // não usa mais "pré-candidato" (decisão editorial de 16/08). A distinção
  // honesta entre declaração editorial e registro segue na nota abaixo.
  declaracao_editorial: "Candidatura declarada",
  registro_tse_pendente: "Pedido de registro no TSE",
  registro_tse_situacao_nao_informada: "Pedido de registro no TSE",
  registro_tse: "Candidatura registrada no TSE",
  registro_tse_indeferido: "Registro indeferido pelo TSE",
}

/** Frase completa, para tooltip, aria-label e payload da API. */
const CARGO_DISPUTADO_PROVENIENCIA_NOTA: Record<CargoDisputadoProveniencia, string> = {
  declaracao_editorial:
    "Pleito declarado publicamente e apurado pela equipe editorial. Não é registro de candidatura deferido pelo TSE.",
  registro_tse_pendente:
    "O pedido de registro consta no TSE e aguarda julgamento. Isso não equivale a candidatura deferida.",
  registro_tse_situacao_nao_informada:
    "O pedido de registro consta no snapshot do TSE, mas a situação ainda não foi informada. Isso não equivale a candidatura deferida nem a julgamento pendente.",
  registro_tse: "Candidatura registrada no TSE.",
  registro_tse_indeferido:
    "O pedido de registro consta no TSE e foi indeferido. Indeferimento não equivale a estar fora da urna: o TSE pode seguir classificando a candidatura como concorrendo enquanto couber recurso.",
}

export function buildCargoDisputadoProvenienceLabel(
  proveniencia: CargoDisputadoProveniencia,
): string {
  return CARGO_DISPUTADO_PROVENIENCIA_LABEL[proveniencia]
}

export function buildCargoDisputadoProvenienceNote(
  proveniencia: CargoDisputadoProveniencia,
): string {
  return CARGO_DISPUTADO_PROVENIENCIA_NOTA[proveniencia]
}
