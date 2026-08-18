import { mkdirSync, readdirSync, rmSync } from "fs"
import { resolve } from "path"
import { execFileSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { parseCSV } from "./helpers"
import { log, warn, error } from "./logger"
import { resolveCanonicalParty } from "./party-canonical"
import {
  canReconcileTseObservedPartyChanges,
  deriveTseObservedPartyChanges,
  planTseObservedPartyChangeReconciliation,
} from "./party-timeline-consistency"
import type { IngestResult, CandidatoConfig } from "./types"
import type { ResolveMethod } from "./tse-resolver"
import { createTSEResolver, isWeakNameMatch, shouldSkipWeakMatch } from "./tse-resolver"
import { canonicalCargo } from "./cargo-utils"
import { sanitizeTemplateText } from "./ptbr-sanitize"
import { canonicalizeEstadoForStorage } from "@/lib/br-uf"
import { downloadToFile } from "./download-to-file"

const DATA_DIR = resolve(process.cwd(), "data/tse-historico")
// Eleicoes gerais (federais/estaduais): anos pares divisíveis por 4 (exceto 2000s)
// Eleicoes municipais: anos pares NÃO divisíveis por 4
// TSE tem dados desde 1994. Incluímos todas para cobertura máxima.
const ANOS = [
  1994, 1996, 1998, 2000, 2002, 2004, 2006, 2008,
  2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024,
]

const CARGO_MAP: Record<string, string> = {
  PRESIDENTE: "Presidente",
  "VICE-PRESIDENTE": "Vice-Presidente",
  GOVERNADOR: "Governador",
  "VICE-GOVERNADOR": "Vice-Governador",
  SENADOR: "Senador",
  "DEPUTADO FEDERAL": "Deputado Federal",
  "DEPUTADO ESTADUAL": "Deputado Estadual",
  "DEPUTADO DISTRITAL": "Deputado Distrital",
  PREFEITO: "Prefeito",
  "VICE-PREFEITO": "Vice-Prefeito",
  VEREADOR: "Vereador",
  "1O SUPLENTE SENADOR": "1o Suplente Senador",
  "2O SUPLENTE SENADOR": "2o Suplente Senador",
  "1º SUPLENTE": "1o Suplente Senador",
  "2º SUPLENTE": "2o Suplente Senador",
}

function normalizeCargo(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return CARGO_MAP[upper] ?? raw.trim()
}

function normalizePartySigla(value: string): string {
  if (!value) return ""
  const canonical = resolveCanonicalParty(value)
  return canonical?.sigla ?? value.trim().toUpperCase()
}

function parseEleitoStatus(dsSitTotTurno: string): { eleito: boolean; descricao: string } {
  const upper = (dsSitTotTurno || "").trim().toUpperCase()
  // "NÃO ELEITO" contains "ELEITO" — must check negatives first
  const naoEleitoTerms = ["NAO ELEITO", "NÃO ELEITO", "NULO", "#NULO#", "INDEFERIDO", "RENÚNCIA", "RENUNCIA", "CASSADO", "FALECIDO", "2º TURNO", "2O TURNO", "SUPLENTE"]
  if (!upper || naoEleitoTerms.some((t) => upper.includes(t))) {
    return { eleito: false, descricao: dsSitTotTurno.trim() || "Resultado não informado" }
  }
  const eleitoTerms = ["ELEITO", "ELEITO POR QP", "ELEITO POR MEDIA", "MEDIA"]
  const isEleito = eleitoTerms.some((t) => upper.includes(t))
  return { eleito: isEleito, descricao: dsSitTotTurno.trim() || "Resultado não informado" }
}

/** Não persistir em historico (decisão editorial): sem pleito válido ou registro cassado/falecido. */
function shouldOmitFromHistoricoDescricao(descricao: string): boolean {
  const u = descricao.toUpperCase()
  return (
    u.includes("INDEFERIDO") ||
    u.includes("#NULO#") ||
    u.includes("RENÚNCIA") ||
    u.includes("RENUNCIA") ||
    u.includes("CASSADO") ||
    u.includes("FALECIDO")
  )
}

interface CandidacyRecord {
  slug: string
  ano: number
  cargo: string
  partido: string
  estado: string
  situacao_resultado: string
  eleito: boolean
  /** Degrau do tse-resolver que ancorou a linha. `name-*` e o degrau fraco. */
  match_method: ResolveMethod
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("tse-historico", `  Cache hit: ${path}`),
    onStart: (source) => log("tse-historico", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("tse-historico", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("tse-historico", `  Falha no download: ${err}`),
  })
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true })
  execFileSync("unzip", ["-o", zipPath, "-d", extractDir], { stdio: "pipe" })
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
    log("tse-historico", `  Cleanup: ${dir}`)
  } catch {
    warn("tse-historico", `  Nao conseguiu limpar: ${dir}`)
  }
}

function cleanupFile(filePath: string) {
  try {
    rmSync(filePath, { force: true })
    log("tse-historico", `  Cleanup: ${filePath}`)
  } catch {
    warn("tse-historico", `  Nao conseguiu limpar: ${filePath}`)
  }
}

function findCSVs(dir: string): string[] {
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.endsWith(".csv") && f.startsWith("consulta_cand_"))
      .map((f: string) => resolve(dir, f))
  } catch {
    return []
  }
}

/**
 * Processa CSVs de um ano, coletando candidaturas de todos os candidatos do projeto.
 * Diferente do ingest-tse-situacao que guarda so o match mais recente,
 * aqui guardamos TODOS os matches (multiplos por candidato, um por ano).
 */
async function processAno(
  ano: number,
  candidatos: CandidatoConfig[]
): Promise<{ records: CandidacyRecord[]; success: boolean }> {
  const zipUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
  const zipPath = resolve(DATA_DIR, `consulta_cand_${ano}.zip`)
  const extractDir = resolve(DATA_DIR, `consulta_cand_${ano}`)

  log("tse-historico", `=== Processando ano ${ano} ===`)

  const ok = await downloadFile(zipUrl, zipPath)
  if (!ok) {
    return { records: [], success: false }
  }

  try {
    extractZip(zipPath, extractDir)
  } catch (err) {
    error("tse-historico", `Falha ao extrair ZIP ${ano}: ${err}`)
    cleanupFile(zipPath)
    return { records: [], success: false }
  }

  const csvPaths = findCSVs(extractDir)
  if (csvPaths.length === 0) {
    warn("tse-historico", `Nenhum CSV encontrado no ZIP ${ano}`)
    cleanupDir(extractDir)
    cleanupFile(zipPath)
    return { records: [], success: false }
  }

  log("tse-historico", `  Parseando ${csvPaths.length} arquivo(s) CSV do ano ${ano}`)
  const resolver = await createTSEResolver(candidatos, ano)

  // Coleta todas as candidaturas encontradas neste ano
  // Usa Map para deduplicar por slug+cargo, preferindo resultado definitivo (turno 2)
  const bestRecord = new Map<string, CandidacyRecord>()

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const match = resolver.resolveRow(row)
      if (!match) return
      if (shouldSkipWeakMatch(match.method)) return

      const cargo = normalizeCargo(row.DS_CARGO || "")
      if (!cargo) return

      const dedupeKey = `${match.slug}|${cargo}`
      const turno = parseInt(row.NR_TURNO || "1", 10)
      const partido = normalizePartySigla(row.SG_PARTIDO || "")
      const estado = canonicalizeEstadoForStorage(row.SG_UF) ?? ""
      const resultado = parseEleitoStatus(row.DS_SIT_TOT_TURNO || "")

      const candidate: CandidacyRecord = {
        slug: match.slug,
        ano,
        cargo,
        partido,
        estado,
        situacao_resultado: resultado.descricao,
        eleito: resultado.eleito,
        match_method: match.method,
      }

      const existing = bestRecord.get(dedupeKey)
      if (!existing) {
        bestRecord.set(dedupeKey, candidate)
      } else if (turno > 1) {
        // Turno 2 tem resultado definitivo — sempre substitui turno 1
        bestRecord.set(dedupeKey, candidate)
      }
    })
  }

  cleanupDir(extractDir)
  cleanupFile(zipPath)

  const records = [...bestRecord.values()]

  log(
    "tse-historico",
    `  Stats ${ano}: sq=${resolver.stats.sqPreloaded}, cpf=${resolver.stats.cpf}, nome-unico=${resolver.stats.nameUnique}, nome-uf=${resolver.stats.nameUf}, ambiguo=${resolver.stats.ambiguous}, bloqueado=${resolver.stats.bloqueado}, candidaturas=${records.length}`
  )
  if (resolver.ambiguousSlugs.length > 0) {
    warn("tse-historico", `  Ambiguos ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }

  return { records, success: true }
}

// Suplentes de senador nao sao cargos independentes — agrupar com Senador
const SKIP_SUPLENTE_CARGOS = new Set([
  "1o Suplente Senador",
  "2o Suplente Senador",
])

function historicoPartyObservationKey(input: {
  cargo: string | null
  cargo_canonico?: string | null
  ano: number | null
  partido: string | null
}): string | null {
  if (!input.cargo || input.ano == null || !input.partido) return null
  const cargo = input.cargo_canonico || canonicalCargo(input.cargo)
  const partido = normalizePartySigla(input.partido)
  return cargo && partido ? `${cargo}|${input.ano}|${partido}` : null
}

export async function ingestTSEHistorico(): Promise<IngestResult[]> {
  const slugArg = process.argv.find((arg) => arg.startsWith("--slug="))
  const filterSlugs = slugArg
    ? new Set(slugArg.slice("--slug=".length).split(",").map((slug) => slug.trim()).filter(Boolean))
    : null
  const candidatos = (await loadCandidatosPublicos()).filter(
    (cand) => !filterSlugs || filterSlugs.has(cand.slug)
  )
  mkdirSync(DATA_DIR, { recursive: true })

  // Coleta candidaturas de todos os anos
  const allRecords: CandidacyRecord[] = []
  const anosComFalha: number[] = []

  for (const ano of ANOS) {
    const { records, success } = await processAno(ano, candidatos)
    if (success) {
      allRecords.push(...records)
    } else {
      anosComFalha.push(ano)
    }
  }

  log("tse-historico", `Total de candidaturas encontradas: ${allRecords.length}`)

  // Agrupa por candidato
  const bySlug = new Map<string, CandidacyRecord[]>()
  for (const record of allRecords) {
    const existing = bySlug.get(record.slug) ?? []
    existing.push(record)
    bySlug.set(record.slug, existing)
  }

  log("tse-historico", `Candidatos com candidaturas: ${bySlug.size}`)

  // Persiste no banco
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const records = bySlug.get(cand.slug)
    if (!records || records.length === 0) {
      // O candidato participou da varredura dos arquivos. Se todos os anos
      // responderam, ausencia de casamento e um vazio confirmado; se algum ano
      // falhou, a mesma ausencia fica indeterminada. Em ambos os casos precisa
      // existir IngestResult para o orquestrador registrar a tentativa.
      results.push({
        source: "tse-historico",
        candidato: cand.slug,
        tables_updated: [],
        rows_upserted: 0,
        errors: [],
        duration_ms: 0,
        coleta_resultado: anosComFalha.length === 0 ? "vazio_confirmado" : "indeterminado",
        coleta_detalhe:
          anosComFalha.length === 0
            ? `Nenhuma candidatura encontrada nos ${ANOS.length} anos consultados`
            : `Nenhuma candidatura encontrada; anos com falha: ${anosComFalha.join(", ")}`,
      })
      continue
    }

    const result: IngestResult = {
      source: "tse-historico",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      for (const record of records) {
        // Pula suplentes de senador — nao sao cargos independentes
        if (SKIP_SUPLENTE_CARGOS.has(record.cargo)) continue

        if (shouldOmitFromHistoricoDescricao(record.situacao_resultado)) {
          log("tse-historico", `  ${cand.slug}: omitido historico ${record.cargo} ${record.ano} — ${record.situacao_resultado}`)
          continue
        }

        const eleitoPor = record.eleito ? "voto direto" : null
        const cargoCanonico = canonicalCargo(record.cargo)

        // Upsert por (candidato, cargo canônico, ano) — evita Presidente vs Presidente da República duplicado
        const { data: existingRows, error: existingError } = await supabase
          .from("historico_politico")
          .select("id, observacoes, periodo_fim")
          .eq("candidato_id", candidatoId)
          .eq("cargo_canonico", cargoCanonico)
          .eq("periodo_inicio", record.ano)
          .limit(1)
        if (existingError) {
          result.errors.push(`Erro ao localizar historico ${record.cargo} ${record.ano}: ${existingError.message}`)
          continue
        }

        // Linhas legadas podem ter cargo_canonico nulo, mas continuam cobertas
        // pelo indice unico antigo (candidato_id, cargo, periodo_inicio). Sem o
        // fallback, o select acima nao as ve e o insert falha por duplicidade.
        let existing = existingRows?.[0]
        if (!existing) {
          const { data: legacyRows, error: legacyError } = await supabase
            .from("historico_politico")
            .select("id, observacoes, periodo_fim")
            .eq("candidato_id", candidatoId)
            .eq("cargo", record.cargo)
            .eq("periodo_inicio", record.ano)
            .limit(1)
          if (legacyError) {
            result.errors.push(`Erro ao localizar historico legado ${record.cargo} ${record.ano}: ${legacyError.message}`)
            continue
          }
          existing = legacyRows?.[0]
        }

        const observacoes = sanitizeTemplateText(record.eleito
          ? `${record.situacao_resultado} (TSE ${record.ano})`
          : `Candidatura: ${record.situacao_resultado} (TSE ${record.ano})`)

        // Guard-rail de homonimo (2026-07-26). O resolver casa em tres degraus:
        // SQ_CANDIDATO, CPF e, por ultimo, NOME. O degrau de nome era silencioso,
        // e foi ele que trouxe seis candidaturas de outra pessoa para a ficha do
        // jeronimo, porque o CPF divergente desligou o degrau anterior.
        //
        // Linha NOVA vinda de casamento por nome passa a nascer fora da
        // superficie publica, esperando revisao. O dado e gravado igual, so nao
        // aparece na ficha ate alguem conferir.
        const resolvidoPorNome = isWeakNameMatch(record.match_method)

        // Campos comuns ao insert e ao update. O estado de despublicacao fica
        // FORA daqui de proposito: no update a linha ja existe e pode ter sido
        // revisada ou curada a mao, e reescrever esses campos a cada re-ingest
        // desfaria decisao humana em silencio, que e o mesmo defeito do
        // guard-rail, invertido. O marcador so vale no insert.
        const row = {
          candidato_id: candidatoId,
          cargo: record.cargo,
          cargo_canonico: cargoCanonico,
          tipo_evento: record.eleito ? "mandato" : "candidatura",
          periodo_inicio: record.ano,
          periodo_fim: record.eleito ? null : record.ano,
          partido: record.partido,
          estado: record.estado || cand.estado || null,
          eleito_por: eleitoPor,
          observacoes,
          proveniencia: "tse" as const,
        }

        if (existing) {
          const updateRow = {
            ...row,
            // Nao reverter mandato ja fechado: para eleito, `row.periodo_fim` e null,
            // e um re-ingest cego apagava o periodo_fim que o backfill (ou curadoria)
            // preencheu, reintroduzindo os "cargos sobrepostos" de 2026-04-10
            // (review 2026-06-09). COALESCE preserva o valor existente.
            periodo_fim: row.periodo_fim ?? existing.periodo_fim ?? null,
          }
          const { error: updateErr } = await supabase
            .from("historico_politico")
            .update(updateRow)
            .eq("id", existing.id)

          if (updateErr) {
            result.errors.push(`Erro ao atualizar historico ${record.cargo} ${record.ano}: ${updateErr.message}`)
            continue
          }
        } else {
          const { error: insertErr } = await supabase
            .from("historico_politico")
            .insert({
              ...row,
              despublicado_em: resolvidoPorNome ? new Date().toISOString() : null,
              despublicacao_motivo: resolvidoPorNome
                ? `Linha resolvida por casamento de nome (${record.match_method}), sem SQ_CANDIDATO nem CPF. Fora da ficha publica ate revisao manual, para nao repetir a atribuicao por homonimo de 2026-07-26.`
                : null,
            })

          if (insertErr) {
            result.errors.push(`Erro ao inserir historico ${record.cargo} ${record.ano}: ${insertErr.message}`)
            continue
          }
        }

        result.rows_upserted++
        if (!result.tables_updated.includes("historico_politico")) {
          result.tables_updated.push("historico_politico")
        }

        log(
          "tse-historico",
          `  ${cand.slug}: ${record.cargo} ${record.ano} ${record.partido} — ${record.situacao_resultado}`
        )
      }

      if (!canReconcileTseObservedPartyChanges(anosComFalha, [])) {
        const detalhe = `Reconciliação de mudanças partidárias bloqueada por anos TSE com falha: ${anosComFalha.join(", ")}`
        result.errors.push(detalhe)
        warn("tse-historico", `  ${cand.slug}: ${detalhe}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const { data: historicoRows, error: historicoRowsError } = await supabase
        .from("historico_politico")
        .select("cargo,cargo_canonico,periodo_inicio,partido,despublicado_em")
        .eq("candidato_id", candidatoId)

      if (historicoRowsError) {
        result.errors.push(`Erro ao carregar visibilidade do historico: ${historicoRowsError.message}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const visibleHistoricoKeys = new Set(
        (historicoRows ?? [])
          .filter((row) => row.despublicado_em == null)
          .map((row) =>
            historicoPartyObservationKey({
              cargo: row.cargo,
              cargo_canonico: row.cargo_canonico,
              ano: row.periodo_inicio,
              partido: row.partido,
            }),
          )
          .filter((key): key is string => key != null),
      )

      const { data: existingMudancas, error: existingMudancasError } = await supabase
        .from("mudancas_partido")
        .select("id, partido_anterior, partido_novo, ano, data_mudanca, contexto, despublicado_em")
        .eq("candidato_id", candidatoId)

      if (existingMudancasError) {
        result.errors.push(`Erro ao carregar mudancas_partido existentes: ${existingMudancasError.message}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const derivacao = deriveTseObservedPartyChanges(
        records
          .filter((record) => record.partido && !SKIP_SUPLENTE_CARGOS.has(record.cargo))
          .map((record) => ({
            ano: record.ano,
            partido: record.partido,
            match_method: record.match_method,
            historico_visivel: visibleHistoricoKeys.has(
              historicoPartyObservationKey({
                cargo: record.cargo,
                ano: record.ano,
                partido: record.partido,
              }) ?? "",
            ),
          })),
        (existingMudancas ?? []).filter((row) => row.despublicado_em == null),
      )

      for (const conflito of derivacao.conflitos) {
        const detalhe = `Conflito de identidade no TSE ${conflito.ano}: ${conflito.partidos.join(" x ")}; nenhuma transicao derivada para o ano`
        result.errors.push(detalhe)
        warn("tse-historico", `  ${cand.slug}: ${detalhe}`)
      }

      if (!canReconcileTseObservedPartyChanges([], derivacao.conflitos)) {
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const reconciliation = planTseObservedPartyChangeReconciliation(
        existingMudancas ?? [],
        derivacao.mudancas,
      )
      let reconciliationFailed = false

      for (const update of reconciliation.updates) {
        const { error: updateErr } = await supabase
          .from("mudancas_partido")
          .update(update.values)
          .eq("candidato_id", candidatoId)
          .eq("id", update.id)
        if (updateErr) {
          reconciliationFailed = true
          result.errors.push(`Erro ao atualizar mudanca derivada ${update.values.ano}: ${updateErr.message}`)
        } else {
          result.rows_upserted++
        }
      }

      if (reconciliation.inserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("mudancas_partido")
          .insert(reconciliation.inserts.map((row) => ({ candidato_id: candidatoId, ...row })))
        if (insertErr) {
          reconciliationFailed = true
          result.errors.push(`Erro ao inserir mudancas derivadas: ${insertErr.message}`)
        } else {
          result.rows_upserted += reconciliation.inserts.length
        }
      }

      if (!reconciliationFailed && reconciliation.deleteIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from("mudancas_partido")
          .delete()
          .eq("candidato_id", candidatoId)
          .in("id", reconciliation.deleteIds)
        if (deleteErr) {
          result.errors.push(`Erro ao remover mudancas derivadas obsoletas: ${deleteErr.message}`)
        } else {
          result.rows_upserted += reconciliation.deleteIds.length
        }
      }

      if (
        reconciliation.updates.length > 0 ||
        reconciliation.inserts.length > 0 ||
        reconciliation.deleteIds.length > 0
      ) {
        if (!result.tables_updated.includes("mudancas_partido")) {
          result.tables_updated.push("mudancas_partido")
        }
        log(
          "tse-historico",
          `  ${cand.slug}: derivacao TSE reconciliada (insert=${reconciliation.inserts.length}, update=${reconciliation.updates.length}, delete=${reconciliation.deleteIds.length})`,
        )
      }

      if (result.rows_upserted === 0 && result.errors.length === 0) {
        result.coleta_resultado = "nao_aplicavel"
        result.coleta_detalhe =
          "Candidaturas encontradas, mas todas foram omitidas por regra editorial"
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  // Cleanup data dir se vazio
  try {
    const remaining = (readdirSync(DATA_DIR) as string[]).filter((f) => f !== ".DS_Store")
    if (remaining.length === 0) {
      cleanupDir(DATA_DIR)
    }
  } catch {
    // ignore
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTSEHistorico().then((r) => console.log(JSON.stringify(r, null, 2)))
}
