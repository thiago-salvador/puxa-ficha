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

export type CargoDisputadoProveniencia =
  | "declaracao_editorial"
  | "registro_tse_pendente"
  | "registro_tse_situacao_nao_informada"
  | "registro_tse"

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

const CHAPAS_POS_REGISTRO_SHA256 =
  "c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df"

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

  // A view de chapas só devolve a linha para quem foi vinculado por UUID como
  // titular ou vice. Portanto sua presença é prova mais forte e mais recente
  // do que os rótulos editoriais legados em `candidatos`.
  if (input.chapa_2026) {
    if (input.chapa_2026.fonte_sha256 === CHAPAS_POS_REGISTRO_SHA256) {
      return "registro_tse_pendente"
    }
    return input.chapa_2026.tse_situacao_codigo === "#NE"
      ? "registro_tse_situacao_nao_informada"
      : "registro_tse"
  }

  const status = normalizeToken(input.status)
  const situacao = normalizeToken(input.situacao_candidatura)

  if (situacao.includes("situacao nao informada")) {
    return "registro_tse_situacao_nao_informada"
  }

  if (situacao.includes("aguardando julgamento") || situacao === "pedido de registro") {
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
