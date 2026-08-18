import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"
import { motivoRecusaDeFonte } from "../../src/lib/public-attention-point"

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

// Retorno null = fonte indisponível (HTTP != 200, payload inválido, rede).
// null NUNCA pode ser tratado como lista vazia: vazio verdadeiro é 200 + [].
async function fetchTCUInabilitados(cpf: string): Promise<TCUInabilitado[] | null> {
  try {
    const res = await fetch(`${TCU_BASE}/condenacao/consulta/inabilitados/${cpf}`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data as TCUInabilitado[]
  } catch {
    return null
  }
}

// O ORDS antigo (`/consenec/rest/consulta/cadirreg/{cpf}`) morreu: 404 para
// qualquer CPF, inclusive fictício (verificado em 2026-08-14). A fonte viva é a
// Plataforma de Certidões, POST com body JSON e sem auth.
const TCU_CADIRREG_URL =
  "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares"

async function fetchTCUCadirreg(cpf: string): Promise<TCUCadirreg[] | null> {
  try {
    const res = await fetch(TCU_CADIRREG_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ cpf }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data as TCUCadirreg[]
  } catch {
    return null
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

  // Guard de fonte (auditoria de 2026-07-24, achados V1 e A3).
  //
  // Esta rota grava gravidade "critica" sem nenhuma fonte, e "automatico" nao
  // e "ia", entao o gate antigo deixava a claim ir ao ar mesmo com
  // verificado = false. O gate de 20260725160000 recusa esse INSERT no banco.
  // Aqui a gente para ANTES, com aviso legivel, em vez de deixar o pipeline
  // estourar no meio.
  //
  // Para religar esta rota: anexar em `fontes` a URL publica do TCU que
  // sustenta a inabilitacao, com caminho (dominio nu nao passa) e SEM CPF na
  // query string, que e dado pessoal e `fontes` e superficie publica.
  const recusa = motivoRecusaDeFonte(row.gravidade, undefined)
  if (recusa) {
    warn("tcu", `ponto de atencao nao gravado (${recusa}): ${titulo}`)
    return
  }

  if (existing) {
    await supabase.from("pontos_atencao").update(row).eq("id", existing.id)
  } else {
    await supabase.from("pontos_atencao").insert(row)
  }
}

export async function ingestTCU(): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
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

      // Fonte indisponível não é ausência de sanção: sem resposta 200 da fonte,
      // as flags não são tocadas e o candidato fica com erro registrado.
      if (inabilitados === null || cadirreg === null) {
        const fontesMortas = [
          inabilitados === null ? "TCU inabilitados" : null,
          cadirreg === null ? "TCU CADIRREG (certidoes)" : null,
        ].filter(Boolean)
        result.errors.push(`Fonte indisponivel, flags nao atualizadas: ${fontesMortas.join(", ")}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

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
          primeiro.numero_acordao ? `Acórdão: ${primeiro.numero_acordao}` : null,
          primeiro.dt_inicio ? `Início: ${primeiro.dt_inicio}` : null,
          primeiro.dt_fim ? `Fim: ${primeiro.dt_fim}` : null,
          primeiro.fundamentacao ? `Fundamento: ${primeiro.fundamentacao}` : null,
        ]
          .filter(Boolean)
          .join(" | ")

        await upsertPontoAtencao(
          candidatoId,
          "Inabilitado pelo TCU",
          descricao || "Condenação de inabilitação registrada no TCU"
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
          primeiro.numero_acordao ? `Acórdão: ${primeiro.numero_acordao}` : null,
          primeiro.tribunal ? `Tribunal: ${primeiro.tribunal}` : null,
          primeiro.exercicio ? `Exercício: ${primeiro.exercicio}` : null,
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
