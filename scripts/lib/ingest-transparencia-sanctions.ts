import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const API = "https://api.portaldatransparencia.gov.br/api-de-dados"

type SancaoTipo = "CEIS" | "CNEP" | "CEAF" | "CEPIM"

interface CEISRecord {
  nomeInformacaoSancao?: string
  cnpjCpfSancionado?: string
  orgaoSancionador?: { nome?: string }
  dataInicioSancao?: string
  dataFimSancao?: string
  fundamentacaoLegal?: string
  numerosProcesso?: string[]
  ativo?: boolean
}

interface CNEPRecord {
  nomeInformacaoSancao?: string
  cnpjCpfSancionado?: string
  orgaoSancionador?: { nome?: string }
  dataInicioSancao?: string
  dataFimSancao?: string
  fundamentacaoLegal?: string
  numerosProcesso?: string[]
  ativo?: boolean
}

interface CEAFRecord {
  nomeSancionado?: string
  cpf?: string
  orgaoSancionador?: { nome?: string }
  dataPublicacao?: string
  fundamentacaoLegal?: string
  ativo?: boolean
}

interface CEPIMRecord {
  nomeEntidade?: string
  cnpj?: string
  orgaoConcedente?: { nome?: string }
  dataInicioImpedimento?: string
  dataFimImpedimento?: string
  ativo?: boolean
}

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

function stripDoc(doc: string): string {
  return doc.replace(/[.\-\/]/g, "")
}

async function fetchSancoes<T>(
  endpoint: string,
  cpf: string,
  headers: Record<string, string>
): Promise<T[]> {
  try {
    const cpfLimpo = stripDoc(cpf)
    const data = await fetchJSON<T[]>(
      `${API}/${endpoint}?cpfCnpj=${cpfLimpo}&pagina=1`,
      headers
    )
    if (!Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
}

async function upsertSancao(
  candidatoId: string,
  tipo: SancaoTipo,
  descricao: string,
  orgaoSancionador: string | null,
  dataInicio: string | null,
  dataFim: string | null,
  fundamentacao: string | null,
  numeroProcesso: string | null,
  ativo: boolean
): Promise<boolean> {
  const existing = await supabase
    .from("sancoes_administrativas")
    .select("id")
    .eq("candidato_id", candidatoId)
    .eq("tipo", tipo)
    .eq("numero_processo", numeroProcesso ?? "")
    .single()

  const row = {
    candidato_id: candidatoId,
    tipo,
    descricao,
    orgao_sancionador: orgaoSancionador,
    data_inicio: dataInicio,
    data_fim: dataFim,
    fundamentacao,
    vinculo: "direto" as const,
    numero_processo: numeroProcesso,
    ativo,
    fonte: "Portal da Transparencia",
  }

  if (existing.data) {
    const { error } = await supabase
      .from("sancoes_administrativas")
      .update(row)
      .eq("id", existing.data.id)
    return !error
  }

  const { error } = await supabase.from("sancoes_administrativas").insert(row)
  return !error
}

async function upsertPontoAtencao(
  candidatoId: string,
  tipo: SancaoTipo,
  descricao: string
): Promise<void> {
  const titulo = `Sancao administrativa ativa (${tipo})`

  const { data: existing } = await supabase
    .from("pontos_atencao")
    .select("id")
    .eq("candidato_id", candidatoId)
    .eq("titulo", titulo)
    .single()

  const row = {
    candidato_id: candidatoId,
    categoria: "corrupcao",
    titulo,
    descricao,
    gravidade: "alta",
    verificado: false,
    gerado_por: "automatico",
  }

  if (existing) {
    await supabase.from("pontos_atencao").update(row).eq("id", existing.id)
  } else {
    await supabase.from("pontos_atencao").insert(row)
  }
}

export async function ingestTransparenciaSanctions(): Promise<IngestResult[]> {
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) {
    warn("transparencia-sanctions", "TRANSPARENCIA_API_KEY nao definida, pulando")
    return []
  }

  const headers = { "chave-api-dados": apiKey, Accept: "application/json" }
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "transparencia-sanctions",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("transparencia-sanctions", `Processando ${cand.slug}`)

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
        warn("transparencia-sanctions", `  ${cand.slug}: sem CPF no banco, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const candidatoId = dbCand.id
      const cpf = dbCand.cpf
      let totalUpserted = 0
      let hasSancaoAtiva = false
      const tiposComSancao: SancaoTipo[] = []

      // CEIS
      const ceis = await fetchSancoes<CEISRecord>("ceis", cpf, headers)
      for (const s of ceis) {
        const numProcesso = s.numerosProcesso?.[0] ?? null
        const ok = await upsertSancao(
          candidatoId,
          "CEIS",
          s.nomeInformacaoSancao ?? "Sancao CEIS",
          s.orgaoSancionador?.nome ?? null,
          s.dataInicioSancao ?? null,
          s.dataFimSancao ?? null,
          s.fundamentacaoLegal ?? null,
          numProcesso,
          s.ativo ?? true
        )
        if (ok) {
          totalUpserted++
          if (s.ativo !== false) {
            hasSancaoAtiva = true
            if (!tiposComSancao.includes("CEIS")) tiposComSancao.push("CEIS")
          }
        }
      }

      // CNEP
      const cnep = await fetchSancoes<CNEPRecord>("cnep", cpf, headers)
      for (const s of cnep) {
        const numProcesso = s.numerosProcesso?.[0] ?? null
        const ok = await upsertSancao(
          candidatoId,
          "CNEP",
          s.nomeInformacaoSancao ?? "Sancao CNEP",
          s.orgaoSancionador?.nome ?? null,
          s.dataInicioSancao ?? null,
          s.dataFimSancao ?? null,
          s.fundamentacaoLegal ?? null,
          numProcesso,
          s.ativo ?? true
        )
        if (ok) {
          totalUpserted++
          if (s.ativo !== false) {
            hasSancaoAtiva = true
            if (!tiposComSancao.includes("CNEP")) tiposComSancao.push("CNEP")
          }
        }
      }

      // CEAF
      const ceaf = await fetchSancoes<CEAFRecord>("ceaf", cpf, headers)
      for (const s of ceaf) {
        const ok = await upsertSancao(
          candidatoId,
          "CEAF",
          s.nomeSancionado ?? "Sancao CEAF",
          s.orgaoSancionador?.nome ?? null,
          s.dataPublicacao ?? null,
          null,
          s.fundamentacaoLegal ?? null,
          null,
          s.ativo ?? true
        )
        if (ok) {
          totalUpserted++
          if (s.ativo !== false) {
            hasSancaoAtiva = true
            if (!tiposComSancao.includes("CEAF")) tiposComSancao.push("CEAF")
          }
        }
      }

      // CEPIM
      const cepim = await fetchSancoes<CEPIMRecord>("cepim", cpf, headers)
      for (const s of cepim) {
        const ok = await upsertSancao(
          candidatoId,
          "CEPIM",
          s.nomeEntidade ?? "Sancao CEPIM",
          s.orgaoConcedente?.nome ?? null,
          s.dataInicioImpedimento ?? null,
          s.dataFimImpedimento ?? null,
          null,
          null,
          true
        )
        if (ok) {
          totalUpserted++
          hasSancaoAtiva = true
          if (!tiposComSancao.includes("CEPIM")) tiposComSancao.push("CEPIM")
        }
      }

      if (totalUpserted > 0) {
        result.tables_updated.push("sancoes_administrativas")
        result.rows_upserted += totalUpserted
      }

      if (hasSancaoAtiva) {
        for (const tipo of tiposComSancao) {
          const total =
            tipo === "CEIS"
              ? ceis.length
              : tipo === "CNEP"
                ? cnep.length
                : tipo === "CEAF"
                  ? ceaf.length
                  : cepim.length

          await upsertPontoAtencao(
            candidatoId,
            tipo,
            `${total} registro(s) encontrado(s) no cadastro ${tipo} do Portal da Transparencia`
          )
        }
        result.tables_updated.push("pontos_atencao")
        log(
          "transparencia-sanctions",
          `  ${cand.slug}: ${totalUpserted} sancao(oes) — ${tiposComSancao.join(", ")}`
        )
      } else {
        log("transparencia-sanctions", `  ${cand.slug}: sem sancoes nos cadastros`)
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(1500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTransparenciaSanctions().then((r) => console.log(JSON.stringify(r, null, 2)))
}
