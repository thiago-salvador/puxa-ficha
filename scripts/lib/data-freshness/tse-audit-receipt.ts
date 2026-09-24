import type { EntradaColeta } from "../coleta-log"
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

/** Credenciais do cliente de escrita dos scripts, sem ler o valor da chave. */
export function temCredencialDeEscrita(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean((env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) && env.SUPABASE_SERVICE_ROLE_KEY)
}
