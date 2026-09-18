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
 * Superficie coberta: patrimonio.bens, historico_politico.observacoes e
 * financiamento_publico.maiores_doadores -- os mesmos campos que
 * scripts/audit/superficie-snapshot.sql serve como texto publico.
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

  // Paginado: patrimonio tem varias linhas por candidato e o default do
  // PostgREST truncaria em silencio.
  const PAGINA = 500

  // Lote de ids: o filtro `in(...)` viaja na query string. Em 12/09/2026 o
  // recorte publicado tinha 208 fichas (~7,9 KB de UUID) e passava raspando; o
  // relancamento levou a 515 (~19 KB) e o gateway passou a derrubar a conexao
  // antes de responder -- o erro chega como `TypeError: fetch failed`, que
  // parece rede instavel e nao limite de URL. Em lotes de 100 a query string
  // fica em ~3,8 KB e o gate volta a medir o recorte inteiro.
  const LOTE_IDS = 100

  const lotesDeIds: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    lotesDeIds.push(ids.slice(i, i + LOTE_IDS))
  }

  for (const lote of lotesDeIds) {
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabase
        .from("patrimonio")
        .select("candidato_id, bens")
        .in("candidato_id", lote)
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
  }

  for (const lote of lotesDeIds) {
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabase
        .from("historico_politico")
        .select("candidato_id, observacoes, despublicado_em")
        .in("candidato_id", lote)
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
  }

  // financiamento_publico.maiores_doadores entrou depois: em 17/09/2026 a
  // auditoria de superficie achou "#NULO" no nome de um doador de
  // dr-fernando-maximo (R6_marcador_tse) e ESTE gate passou verde no mesmo
  // repositorio, porque so lia patrimonio e historico_politico. Gate que ve
  // menos superficie que o auditor ao lado nao prova o que promete.
  for (const lote of lotesDeIds) {
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabase
        .from("financiamento_publico")
        .select("candidato_id, maiores_doadores")
        .in("candidato_id", lote)
        .order("id")
        .range(offset, offset + PAGINA - 1)

      if (error) {
        console.error(`falha lendo financiamento_publico: ${error.message}`)
        process.exit(GATE ? 1 : 0)
      }
      for (const linha of data ?? []) {
        const texto = JSON.stringify(linha.maiores_doadores ?? null)
        if (MARCADOR.test(texto)) {
          achados.push({
            tabela: "financiamento_publico",
            campo: "maiores_doadores[].nome",
            slug: slugPorId.get(linha.candidato_id as string) ?? "?",
            amostra: texto.slice(0, 120),
          })
        }
      }
      if ((data ?? []).length < PAGINA) break
    }
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
