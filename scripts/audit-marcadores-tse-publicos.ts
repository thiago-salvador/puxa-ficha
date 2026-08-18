/**
 * Gate: marcador tecnico do TSE nao pode existir em dado publicado.
 *
 * Os pacotes do TSE usam `#NULO#` e `#NE#` para campo sem valor. Eles nao sao
 * texto para leitor nenhum. A ficha ja sanitiza na exibicao
 * (sanitizePublicText em src/lib/public-text.ts), mas dado sujo no banco volta a
 * aparecer em qualquer superficie nova que esqueca o sanitizador, e falseia
 * qualquer contagem feita direto na tabela.
 *
 * Por que este gate existe: em 07/08/2026 a limpeza foi declarada concluida com
 * "readback confirmou zero marcador restante". Duas coisas estavam erradas ao
 * mesmo tempo. O readback do script rodava sem o filtro dos publicados, e a
 * migration 20260807182000, do mesmo dia, reintroduziu 9 marcadores porque os
 * geradores de backfill aplicavam so maskDocumentLikeSequences e nunca o
 * sanitizador. A limpeza durou horas. Sem um gate, a terceira reintroducao
 * depende de alguem notar.
 *
 * Uso:
 *   npx tsx scripts/audit-marcadores-tse-publicos.ts          # relatorio
 *   npx tsx scripts/audit-marcadores-tse-publicos.ts --gate   # sai != 0 se achar
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Somente leitura.
 */
import { createClient } from "@supabase/supabase-js"

const MARCADOR = /#(?:NULO|NE)#?/i
const GATE = process.argv.includes("--gate")

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios. Sem eles o gate nao\n" +
      "pode afirmar nada: ausencia de leitura nao e ausencia de marcador.",
  )
  process.exit(GATE ? 1 : 0)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Achado = { tabela: string; campo: string; slug: string; amostra: string }

async function main(): Promise<void> {
  const { data: publicados, error: erroPublicados } = await supabase
    .from("candidatos_publico")
    .select("id, slug")

  if (erroPublicados || !publicados) {
    console.error(`falha lendo candidatos_publico: ${erroPublicados?.message}`)
    process.exit(GATE ? 1 : 0)
  }

  const slugPorId = new Map(publicados.map((c) => [c.id as string, c.slug as string]))
  const ids = [...slugPorId.keys()]
  const achados: Achado[] = []

  // Paginado: o recorte publicado tem ~194 candidatos, mas patrimonio tem varias
  // linhas por candidato e o default do PostgREST truncaria em silencio.
  const PAGINA = 500

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("patrimonio")
      .select("candidato_id, bens")
      .in("candidato_id", ids)
      .order("id")
      .range(offset, offset + PAGINA - 1)

    if (error) {
      console.error(`falha lendo patrimonio: ${error.message}`)
      process.exit(GATE ? 1 : 0)
    }
    for (const linha of data ?? []) {
      const texto = JSON.stringify(linha.bens ?? null)
      if (MARCADOR.test(texto)) {
        achados.push({
          tabela: "patrimonio",
          campo: "bens[].descricao",
          slug: slugPorId.get(linha.candidato_id as string) ?? "?",
          amostra: texto.slice(0, 120),
        })
      }
    }
    if ((data ?? []).length < PAGINA) break
  }

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("historico_politico")
      .select("candidato_id, observacoes, despublicado_em")
      .in("candidato_id", ids)
      .order("id")
      .range(offset, offset + PAGINA - 1)

    if (error) {
      console.error(`falha lendo historico_politico: ${error.message}`)
      process.exit(GATE ? 1 : 0)
    }
    for (const linha of data ?? []) {
      if (linha.despublicado_em) continue
      const texto = typeof linha.observacoes === "string" ? linha.observacoes : ""
      if (MARCADOR.test(texto)) {
        achados.push({
          tabela: "historico_politico",
          campo: "observacoes",
          slug: slugPorId.get(linha.candidato_id as string) ?? "?",
          amostra: texto.slice(0, 120),
        })
      }
    }
    if ((data ?? []).length < PAGINA) break
  }

  console.log(`candidatos publicados auditados: ${ids.length}`)
  console.log(`linhas com marcador tecnico: ${achados.length}`)

  if (achados.length === 0) {
    console.log("nenhum #NULO# ou #NE# no recorte publicado.")
    return
  }

  for (const a of achados) {
    console.log(`  ${a.tabela}.${a.campo}  ${a.slug}  ${a.amostra}`)
  }

  console.log(
    "\nA correcao nao e mascarar na UI: e sanear o dado e conferir de onde ele veio.\n" +
      "Se apareceu depois de um backfill, o gerador esqueceu sanitizePublicText.",
  )

  if (GATE) process.exit(1)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(GATE ? 1 : 0)
})
