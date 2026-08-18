/**
 * Readback estrito da migration 20260810093000, somente leitura.
 *
 * Prova o delta que uma auditoria agregada nao enxerga: dois SQs publicados e
 * duas fichas que precisam ficar em `nao_coletado`, sem linha de patrimonio e
 * sem `patrimonio_ausencia_oficial`.
 *
 * Uso, somente depois de apply autorizado:
 *   node --import tsx scripts/audit/readback-patrimonio-rerun.ts
 */
import { readFileSync } from "node:fs"
import { buildPatrimonioEleicoes } from "../../src/lib/public-profile-dto"
import { normalizarComposicao, type Bem } from "../lib/rerun-patrimonio-baseline"
import { supabase } from "../lib/supabase"

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260810093000_rerun_patrimonio_2026_tse_publicou.sql",
  import.meta.url,
)
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf8")

const SQ_POR_SLUG = {
  "andre-marinho": "190002537524",
  "cleber-rabelo": "140002538631",
  "efraim-filho": "150002538692",
  "geraldo-carvalho": "180002537422",
  "ivan-moraes": "170002538097",
  "joao-campos": "170002537230",
  "joel-rodrigues": "180002538530",
  "raquel-lyra": "170002537227",
  "jose-estevao": "50002536579",
  "samara-mineiro": "70002537111",
  "priscila-voigt": "210002533355",
} as const

const INDETERMINADOS = ["dr-luisinho", "preta-lu"] as const

interface PublicadoEsperado {
  estado: "publicado"
  sq: string
  valor_total: number
  bens: Bem[]
  fonte: string
}

function desescaparSql(valor: string): string {
  return valor.replace(/''/g, "'")
}

function blocoWrite(slug: string): string {
  const inicio = MIGRATION_SQL.indexOf(`-- @write tabela=patrimonio slug=${slug} ano=2026`)
  if (inicio < 0) throw new Error(`readback: write de ${slug} nao encontrado na migration congelada`)
  const proximo = MIGRATION_SQL.indexOf("-- @write", inicio + 1)
  return MIGRATION_SQL.slice(inicio, proximo < 0 ? undefined : proximo)
}

function esperadoPublicado(slug: keyof typeof SQ_POR_SLUG): PublicadoEsperado {
  const bloco = blocoWrite(slug)
  const insert = bloco.match(
    /SELECT c\.id, 2026, ([0-9.]+), '((?:[^']|'')*)'::jsonb,\s*'((?:[^']|'')*)'/,
  )
  const update = bloco.match(
    /SET valor_total = ([0-9.]+),\s*bens = '((?:[^']|'')*)'::jsonb,\s*fonte = '((?:[^']|'')*)'/,
  )
  const match = insert ?? update
  if (!match) throw new Error(`readback: literal exato de ${slug} nao encontrado na migration congelada`)
  return {
    estado: "publicado",
    sq: SQ_POR_SLUG[slug],
    valor_total: Number(match[1]),
    bens: JSON.parse(desescaparSql(match[2])) as Bem[],
    fonte: desescaparSql(match[3]),
  }
}

const ESPERADOS = {
  ...Object.fromEntries(
    (Object.keys(SQ_POR_SLUG) as Array<keyof typeof SQ_POR_SLUG>).map((slug) => [
      slug,
      esperadoPublicado(slug),
    ]),
  ),
  ...Object.fromEntries(INDETERMINADOS.map((slug) => [slug, { estado: "nao_coletado" as const }])),
} as Record<string, PublicadoEsperado | { estado: "nao_coletado" }>

async function main() {
  const slugs = Object.keys(ESPERADOS)
  const { data: candidatos, error: erroCandidatos } = await supabase
    .from("candidatos_publico")
    .select("id,slug")
    .in("slug", slugs)
  if (erroCandidatos) throw erroCandidatos
  if (candidatos?.length !== slugs.length) {
    throw new Error(`readback: ${candidatos?.length ?? 0} de ${slugs.length} fichas publicas encontradas`)
  }

  const ids = candidatos.map((c) => c.id)
  const [{ data: patrimonio, error: erroPatrimonio }, { data: ausencias, error: erroAusencias }, { data: historico, error: erroHistorico }] =
    await Promise.all([
      supabase.from("patrimonio").select("candidato_id,ano_eleicao,valor_total,bens,fonte").in("candidato_id", ids),
      supabase
        .from("patrimonio_ausencia_oficial")
        .select("candidato_id,ano_eleicao,fonte_url,verificado_em")
        .in("candidato_id", ids),
      supabase.from("historico_politico").select("*").in("candidato_id", ids),
    ])
  if (erroPatrimonio) throw erroPatrimonio
  if (erroAusencias) throw erroAusencias
  if (erroHistorico) throw erroHistorico

  const falhas: string[] = []
  const resultado: Record<string, unknown> = {}
  for (const candidato of candidatos) {
    const slug = candidato.slug as keyof typeof ESPERADOS
    const esperado = ESPERADOS[slug]
    const pat = (patrimonio ?? []).filter(
      (row) => row.candidato_id === candidato.id && row.ano_eleicao === 2026,
    )
    const aus = (ausencias ?? []).filter(
      (row) => row.candidato_id === candidato.id && row.ano_eleicao === 2026,
    )
    const hist = (historico ?? []).filter(
      (row) => row.candidato_id === candidato.id && row.despublicado_em == null,
    )
    const estado = buildPatrimonioEleicoes(pat, aus, hist).find((row) => row.ano === 2026)?.estado

    if (estado !== esperado.estado) falhas.push(`${slug}: estado ${estado ?? "ausente"}, esperado ${esperado.estado}`)
    if (esperado.estado === "publicado") {
      if (pat.length !== 1) falhas.push(`${slug}: ${pat.length} linhas de patrimonio, esperada 1`)
      if (aus.length !== 0) falhas.push(`${slug}: ausencia oficial sobreviveu ao patrimonio publicado`)
      const valor = Number(pat[0]?.valor_total)
      const nBens = Array.isArray(pat[0]?.bens) ? pat[0].bens.length : 0
      if (Math.abs(valor - esperado.valor_total) > 0.001) {
        falhas.push(`${slug}: valor ${valor}, esperado ${esperado.valor_total}`)
      }
      if (nBens !== esperado.bens.length) {
        falhas.push(`${slug}: ${nBens} bens, esperados ${esperado.bens.length}`)
      }
      const composicao = normalizarComposicao((pat[0]?.bens ?? []) as Bem[])
      const composicaoEsperada = normalizarComposicao(esperado.bens)
      if (JSON.stringify(composicao) !== JSON.stringify(composicaoEsperada)) {
        falhas.push(`${slug}: composicao de bens diverge do literal oficial congelado`)
      }
      if (pat[0]?.fonte !== esperado.fonte) {
        falhas.push(`${slug}: fonte diverge do literal oficial congelado`)
      }
      if (!esperado.fonte.includes(`SQ ${esperado.sq}`)) {
        falhas.push(`${slug}: fonte congelada nao preserva o SQ_CANDIDATO esperado`)
      }
    } else {
      if (pat.length !== 0) falhas.push(`${slug}: nao_coletado com linha de patrimonio`)
      if (aus.length !== 0) falhas.push(`${slug}: nao_coletado com ausencia oficial sem evidencia`)
    }
    resultado[slug] = {
      estado,
      patrimonio: pat.length,
      ausencias: aus.length,
      ...(esperado.estado === "publicado"
        ? {
            sq: esperado.sq,
            valor_total: Number(pat[0]?.valor_total),
            n_bens: Array.isArray(pat[0]?.bens) ? pat[0].bens.length : 0,
            composicao_exata: JSON.stringify(normalizarComposicao((pat[0]?.bens ?? []) as Bem[])) ===
              JSON.stringify(normalizarComposicao(esperado.bens)),
            fonte_exata: pat[0]?.fonte === esperado.fonte,
          }
        : {}),
    }
  }

  console.log(JSON.stringify({ universo: slugs.length, falhas, resultado }, null, 2))
  if (falhas.length > 0) process.exitCode = 1
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
