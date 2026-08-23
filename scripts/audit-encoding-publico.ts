/**
 * Varre recursivamente todos os textos que alimentam a ficha dos candidatos
 * publicados. Somente leitura. O gate falha diante de U+00BF, U+FFFD,
 * controles C1 ou mojibake reversivel.
 */
import { createClient } from "@supabase/supabase-js"
import { pathToFileURL } from "node:url"

import {
  detectPublicTextEncodingArtifacts,
  type PublicTextEncodingArtifacts,
} from "../src/lib/public-text-encoding"
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"

export const PUBLIC_CANDIDATE_TABLES = [
  "financiamento",
  "gastos_executivo",
  "gastos_parlamentares",
  "historico_politico",
  "legislacao_mandato_executivo",
  "mudancas_partido",
  "noticias_candidato",
  "patrimonio",
  "pontos_atencao",
  "posicoes_declaradas",
  "processos",
  "projetos_lei",
  "sancoes_administrativas",
  "votos_candidato",
] as const

export type EncodingFinding = {
  table: string
  recordId: string
  slug: string
  path: string
  counts: PublicTextEncodingArtifacts
  sample: string
}

type PublicCandidate = { id: string; slug: string } & Record<string, unknown>

function hasCounts(counts: PublicTextEncodingArtifacts): boolean {
  return Object.values(counts).some((count) => count > 0)
}

export function findEncodingArtifacts(
  value: unknown,
  path = "$",
): Array<{ path: string; counts: PublicTextEncodingArtifacts; sample: string }> {
  if (typeof value === "string") {
    const counts = detectPublicTextEncodingArtifacts(value)
    return hasCounts(counts)
      ? [{ path, counts, sample: maskDocumentLikeSequences(value).replace(/\s+/g, " ").slice(0, 160) }]
      : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findEncodingArtifacts(item, `${path}[${index}]`))
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      findEncodingArtifacts(item, `${path}.${key}`),
    )
  }
  return []
}

async function main(): Promise<void> {
  const gate = process.argv.includes("--gate")
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios; sem leitura nao ha prova de ausencia.",
    )
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: candidates, error: candidateError } = await supabase
    .from("candidatos_publico")
    .select("*")
    .order("id")

  if (candidateError || !candidates) {
    throw new Error(`candidatos_publico: ${candidateError?.message ?? "sem retorno"}`)
  }

  const published = candidates as PublicCandidate[]
  const slugById = new Map(published.map((candidate) => [candidate.id, candidate.slug]))
  const findings: EncodingFinding[] = []

  for (const candidate of published) {
    for (const found of findEncodingArtifacts(candidate)) {
      findings.push({
        table: "candidatos_publico",
        recordId: candidate.id,
        slug: candidate.slug,
        ...found,
      })
    }
  }

  const pageSize = 500
  for (const table of PUBLIC_CANDIDATE_TABLES) {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .in("candidato_id", [...slugById.keys()])
        .order("id")
        .range(offset, offset + pageSize - 1)

      if (error) throw new Error(`${table}: ${error.message}`)
      const rows = (data ?? []) as Array<Record<string, unknown>>
      for (const row of rows) {
        const candidateId = String(row.candidato_id ?? "")
        for (const found of findEncodingArtifacts(row)) {
          findings.push({
            table,
            recordId: String(row.id ?? "?"),
            slug: slugById.get(candidateId) ?? "?",
            ...found,
          })
        }
      }
      if (rows.length < pageSize) break
    }
  }

  console.log(`candidatos publicados auditados: ${published.length}`)
  console.log(`tabelas satelite auditadas: ${PUBLIC_CANDIDATE_TABLES.length}`)
  console.log(`campos com artefato de encoding: ${findings.length}`)

  for (const finding of findings) {
    console.log(
      `${finding.table} ${finding.recordId} ${finding.slug} ${finding.path} `
      + `${JSON.stringify(finding.counts)} ${finding.sample}`,
    )
  }

  if (gate && findings.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
