import { supabase } from "./supabase"
import { loadCandidatos, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const TCU_BASE = "https://contas.tcu.gov.br/ords"

function stripCPF(cpf: string): string {
  return cpf.replace(/[.\-]/g, "")
}

interface TCUInabilitado {
  nome?: string
  cpf?: string
  dt_inicio?: string
  dt_fim?: string
  fundamentacao?: string
  numero_acordao?: string
}

interface TCUCadirreg {
  nome?: string
  cpf?: string
  tribunal?: string
  numero_acordao?: string
  exercicio?: string
}

async function fetchTCUInabilitados(cpf: string): Promise<TCUInabilitado[]> {
  try {
    const res = await fetch(`${TCU_BASE}/condenacao/consulta/inabilitados/${cpf}`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as TCUInabilitado[]
  } catch {
    return []
  }
}

async function fetchTCUCadirreg(cpf: string): Promise<TCUCadirreg[]> {
  try {
    const res = await fetch(`${TCU_BASE}/consenec/rest/consulta/cadirreg/${cpf}`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as TCUCadirreg[]
  } catch {
    return []
  }
}

async function upsertPontoAtencao(
  candidatoId: string,
  titulo: string,
  descricao: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("pontos_atencao")
    .select("id")
    .eq("candidato_id", candidatoId)
    .eq("titulo", titulo)
    .single()

  const row = {
    candidato_id: candidatoId,
    categoria: "processo_grave",
    titulo,
    descricao,
    gravidade: "critica",
    verificado: false,
    gerado_por: "automatico",
  }

  if (existing) {
    await supabase.from("pontos_atencao").update(row).eq("id", existing.id)
  } else {
    await supabase.from("pontos_atencao").insert(row)
  }
}

export async function ingestTCU(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "tcu",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("tcu", `Processando ${cand.slug}`)

    try {
      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("id, cpf, slug")
        .eq("slug", cand.slug)
        .single()

      if (!dbCand) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      if (!dbCand.cpf) {
        warn("tcu", `  ${cand.slug}: sem CPF no banco, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const cpfLimpo = stripCPF(dbCand.cpf)
      const candidatoId = dbCand.id

      const [inabilitados, cadirreg] = await Promise.all([
        fetchTCUInabilitados(cpfLimpo),
        fetchTCUCadirreg(cpfLimpo),
      ])

      const tcuInabilitado = inabilitados.length > 0
      const tcuContasIrregulares = cadirreg.length > 0

      const { error: updateErr } = await supabase
        .from("candidatos")
        .update({
          tcu_inabilitado: tcuInabilitado,
          tcu_contas_irregulares: tcuContasIrregulares,
        })
        .eq("id", candidatoId)

      if (updateErr) {
        result.errors.push(`Erro ao atualizar candidatos: ${updateErr.message}`)
      } else {
        result.tables_updated.push("candidatos")
        result.rows_upserted++
      }

      if (tcuInabilitado) {
        const primeiro = inabilitados[0]
        const descricao = [
          primeiro.numero_acordao ? `Acordao: ${primeiro.numero_acordao}` : null,
          primeiro.dt_inicio ? `Inicio: ${primeiro.dt_inicio}` : null,
          primeiro.dt_fim ? `Fim: ${primeiro.dt_fim}` : null,
          primeiro.fundamentacao ? `Fundamento: ${primeiro.fundamentacao}` : null,
        ]
          .filter(Boolean)
          .join(" | ")

        await upsertPontoAtencao(
          candidatoId,
          "Inabilitado pelo TCU",
          descricao || "Condenacao de inabilitacao registrada no TCU"
        )

        if (!result.tables_updated.includes("pontos_atencao")) {
          result.tables_updated.push("pontos_atencao")
        }
        result.rows_upserted++
        log("tcu", `  ${cand.slug}: INABILITADO (${inabilitados.length} registro(s))`)
      }

      if (tcuContasIrregulares) {
        const primeiro = cadirreg[0]
        const descricao = [
          primeiro.numero_acordao ? `Acordao: ${primeiro.numero_acordao}` : null,
          primeiro.tribunal ? `Tribunal: ${primeiro.tribunal}` : null,
          primeiro.exercicio ? `Exercicio: ${primeiro.exercicio}` : null,
        ]
          .filter(Boolean)
          .join(" | ")

        await upsertPontoAtencao(
          candidatoId,
          "Contas irregulares no TCU",
          descricao || "Contas julgadas irregulares registradas no CADIRREG/TCU"
        )

        if (!result.tables_updated.includes("pontos_atencao")) {
          result.tables_updated.push("pontos_atencao")
        }
        result.rows_upserted++
        log("tcu", `  ${cand.slug}: CONTAS IRREGULARES (${cadirreg.length} registro(s))`)
      }

      if (!tcuInabilitado && !tcuContasIrregulares) {
        log("tcu", `  ${cand.slug}: sem irregularidades no TCU`)
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTCU().then((r) => console.log(JSON.stringify(r, null, 2)))
}
