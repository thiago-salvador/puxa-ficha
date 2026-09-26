import type { EntradaColeta } from "../coleta-log"
import type { FichaTseResult } from "./ficha-tse"
import { TSE_CANDIDACY_URL } from "./tse-source"

/**
 * Fonte própria do recibo da auditoria diária (`data-freshness-audit.yml`).
 * A auditoria baixa o pacote oficial `consulta_cand` do TSE, calcula o sha256,
 * lê as candidaturas e consulta o DivulgaCand. Isso prova que a fonte oficial
 * foi lida naquele dia. Não prova que campos das fichas foram atualizados, e
 * por isso a fonte não é `tse` nem `tse-observacao`. O alvo é o pacote.
 */
export const FONTE_TSE_AUDITORIA = "tse-auditoria-snapshot"

const LIMITE_MENSAGEM = 300
const SHA256 = /^[0-9a-f]{64}$/

export interface ArtefatosAuditoriaTse {
  /** Conteúdo de `source.json` escrito por `audit-data-freshness.ts`. */
  source: {
    status?: unknown
    mode?: unknown
    checked_at?: unknown
    source_url?: unknown
    source_sha256?: unknown
    error?: unknown
    divulgacand?: { status?: unknown; checked_at?: unknown } | null
  }
  /** Quantidade de candidaturas oficiais em `universe.json`, ou null. */
  officialCount: number | null
  /** `status` de `diff.json` (comparação com o publicado), ou null. */
  diffStatus: string | null
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function curto(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, LIMITE_MENSAGEM)
}

const RESSALVA =
  "Prova que a fonte oficial foi lida; não prova verificação de campo nem atualização da ficha."

/**
 * Recibo global da auditoria diária, ou null quando a rodada não consultou a
 * fonte ao vivo (snapshot versionado local não é coleta). `encontrado` exige
 * download ao vivo com sha256 válido e candidaturas lidas; `source_error` ou
 * pacote sem leitura vira `erro`. O resultado da comparação com o publicado
 * vai no detalhe, sem mudar o que a coleta prova.
 */
export function reciboAuditoriaTse(artefatos: ArtefatosAuditoriaTse): EntradaColeta | null {
  const { source } = artefatos
  const status = texto(source.status)
  const mode = texto(source.mode)
  const url = texto(source.source_url) ?? TSE_CANDIDACY_URL
  const alvo = "consulta_cand_2026"
  const base = {
    fonte: FONTE_TSE_AUDITORIA,
    escopo: "global" as const,
    alvo,
    url,
  }

  if (status === "source_error") {
    const erro = texto(source.error) ?? "erro sem mensagem"
    return {
      ...base,
      resultado: "erro",
      volume: 0,
      detalhe: `Auditoria diária não conseguiu ler a fonte oficial do TSE: ${curto(erro)}. ${RESSALVA}`,
    }
  }
  if (mode !== "live_official") return null

  const sha = texto(source.source_sha256)
  const checkedAt = texto(source.checked_at)
  const count = artefatos.officialCount
  if (status !== "fresh" || !sha || !SHA256.test(sha) || !checkedAt || !count || count <= 0) {
    return {
      ...base,
      resultado: "erro",
      volume: 0,
      detalhe:
        `Auditoria diária sem leitura completa do pacote oficial (status ${status ?? "ausente"}, ` +
        `sha256 ${sha ?? "ausente"}, candidaturas ${count ?? "ausente"}). ${RESSALVA}`,
    }
  }

  const divulgacand = texto(source.divulgacand?.checked_at)
  return {
    ...base,
    resultado: "encontrado",
    volume: count,
    detalhe:
      `Auditoria diária: pacote oficial ${alvo} baixado em ${checkedAt}, sha256 ${sha}, ` +
      `${count} candidatura(s) lida(s)` +
      (divulgacand ? `; DivulgaCand consultado em ${divulgacand}` : "") +
      `. Comparação com o publicado: ${artefatos.diffStatus ?? "não gerada"}. ${RESSALVA}`,
  }
}

/**
 * Fonte do recibo por ficha pública conferida pela auditoria diária. O contrato
 * do detalhe é consumido pela matriz de cobertura; nomes e valores são fixos.
 */
export const FONTE_TSE_AUDITORIA_CANDIDATURA = "tse-auditoria-candidatura"

export interface ReciboCandidatura extends EntradaColeta {
  escopo: "candidato"
  candidato_id: string
}

interface RevisaoFonte {
  url: string
  sha256: string
  checked_at: string
}

export interface ArtefatosRecibosCandidatura {
  /** `source.json` da auditoria. */
  source: {
    status?: unknown
    mode?: unknown
    checked_at?: unknown
    source_url?: unknown
    source_sha256?: unknown
    complementar?: { status?: unknown; url?: unknown; sha256?: unknown; checked_at?: unknown } | null
    rede_social?: { status?: unknown } | null
  }
  /** `ficha_checks.fichas` de `diff.json`, ou null quando a conferência não rodou. */
  fichas: readonly FichaTseResult[] | null
}

export interface ResultadoRecibosCandidatura {
  recibos: ReciboCandidatura[]
  /** Por que nenhum recibo por candidato foi montado; null quando houve recibos. */
  ignorado: string | null
}

function revisao(url: unknown, sha: unknown, checkedAt: unknown): RevisaoFonte | null {
  const u = texto(url)
  const s = texto(sha)
  const c = texto(checkedAt)
  if (!u || !s || !SHA256.test(s) || !c || !Number.isFinite(Date.parse(c))) return null
  return { url: u, sha256: s, checked_at: c }
}

/**
 * Um recibo `tse-auditoria-candidatura` por ficha pública conferida.
 *
 * - `encontrado`, volume 1: identidade fechada por SQ+cargo+UF e todos os
 *   checks aplicáveis `ok` (`chapa_vice` do Senado é `nao_aplicavel`).
 * - `indeterminado`, volume 0: algum check diverge, falta, não foi verificado,
 *   ou a identidade não fecha.
 * - Fonte com erro (ou revisão do pacote sem SHA-256 válido): nenhum recibo por
 *   candidato. O `erro` fica no recibo global `tse-auditoria-snapshot`; gravar
 *   513 erros iguais só apagaria da view `coleta_log_ultima` a última conferência
 *   válida de cada ficha sem dizer nada novo sobre ela.
 *
 * O detalhe é JSON sem nome completo, CPF ou texto livre da fonte.
 */
export function recibosAuditoriaCandidatura(artefatos: ArtefatosRecibosCandidatura): ResultadoRecibosCandidatura {
  const { source } = artefatos
  if (texto(source.status) === "source_error") {
    return { recibos: [], ignorado: "fonte oficial com erro; só o recibo global registra a falha" }
  }
  const fonte = revisao(source.source_url, source.source_sha256, source.checked_at)
  if (!fonte) {
    return { recibos: [], ignorado: "revisão do consulta_cand sem URL, SHA-256 ou horário válidos" }
  }
  if (!artefatos.fichas) {
    return { recibos: [], ignorado: "conferência por ficha ausente do diff.json" }
  }
  // Complementar (situação) e redes (sites) são lidos sem derrubar a rodada. Se
  // um deles falhou, toda ficha viraria indeterminado por falta de fonte, não
  // por divergência, e apagaria da coleta_log_ultima a última conferência
  // válida. A falha fica só no recibo global.
  for (const [nome, recurso] of [["consulta_cand_complementar", source.complementar], ["rede_social_candidato", source.rede_social]] as const) {
    const status = texto(recurso?.status)
    if (status !== "ok") {
      return { recibos: [], ignorado: `${nome} não lido (status ${status ?? "ausente"}); só o recibo global registra a rodada` }
    }
  }
  const complementar = revisao(source.complementar?.url, source.complementar?.sha256, source.complementar?.checked_at)
  if (!complementar) {
    return { recibos: [], ignorado: "revisão do consulta_cand_complementar sem URL, SHA-256 ou horário válidos" }
  }

  const recibos = artefatos.fichas.flatMap((ficha): ReciboCandidatura[] => {
    if (!ficha.candidato_id || !ficha.slug || !ficha.cargo || !ficha.uf) return []
    const encontrado = ficha.identity_match &&
      Object.values(ficha.checks).every((value) => value === "ok" || value === "nao_aplicavel")
    const detalhe = {
      contract_version: 1,
      kind: "tse-daily-candidacy-check",
      source_revision: fonte,
      complementar_revision: complementar,
      identity: {
        sq_candidato: ficha.sq_candidato ?? "",
        cargo: ficha.cargo,
        uf: ficha.uf,
        match: "SQ_CANDIDATO+CARGO+UF",
      },
      checks: {
        nome_urna: ficha.checks.nome_urna,
        partido_sigla: ficha.checks.partido_sigla,
        situacao: ficha.checks.situacao,
        numero_urna: ficha.checks.numero_urna,
        sites: ficha.checks.sites,
        chapa_vice: ficha.checks.chapa_vice,
      },
      divergences: ficha.divergences,
    }
    return [{
      fonte: FONTE_TSE_AUDITORIA_CANDIDATURA,
      escopo: "candidato",
      alvo: ficha.slug,
      candidato_id: ficha.candidato_id,
      url: fonte.url,
      resultado: encontrado ? "encontrado" : "indeterminado",
      volume: encontrado ? 1 : 0,
      detalhe: JSON.stringify(detalhe),
    }]
  })
  return recibos.length > 0
    ? { recibos, ignorado: null }
    : { recibos, ignorado: "nenhuma ficha conferida com identidade completa" }
}

/** Credenciais do cliente de escrita dos scripts, sem ler o valor da chave. */
export function temCredencialDeEscrita(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean((env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) && env.SUPABASE_SERVICE_ROLE_KEY)
}
