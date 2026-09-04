/**
 * Reconciliacao por SQ entre o que o site publica em `situacao_candidatura` e o
 * julgamento que o TSE publica em `consulta_cand_complementar`.
 *
 * SOMENTE LEITURA. Nao escreve no banco, nao roda ingest. Serve para responder
 * "quantas fichas afirmam hoje algo que a fonte ja superou" sem depender de API
 * ao vivo: o pacote e baixavel e diffavel, entao o numero e reproduzivel.
 *
 * O cruzamento e por `sq_candidato_2026`, nunca por nome. Ficha sem SQ nao entra
 * na comparacao e sai listada a parte: sem ancora de identidade, dizer que ela
 * diverge seria afirmar sobre uma pessoa que nao foi identificada.
 *
 *   npx tsx scripts/audit/reconciliar-situacao-julgamento.ts
 *   npx tsx scripts/audit/reconciliar-situacao-julgamento.ts --json=caminho.json
 */

import { writeFileSync } from "fs"
import { supabase } from "../lib/supabase"
import { carregarJulgamentoPorSq, PLEITO_CORRENTE } from "../lib/ingest-tse-situacao"
import { mapearJulgamento, censoPorDescricao } from "../lib/tse-situacao-julgamento"

interface FichaPublica {
  slug: string
  situacao_candidatura: string | null
  sq_candidato_2026: string | null
  publicavel?: boolean
  status?: string | null
}

interface Divergencia {
  slug: string
  sq: string
  publicado: string | null
  fonte_codigo: string
  fonte_descricao: string
  deveria_ser: string
}

/**
 * Exportada de proposito: o guard `import.meta.url === file://argv[1]` nao
 * dispara quando o caminho do repositorio tem espaco, porque `import.meta.url`
 * percent-encoda e `argv[1]` nao. Com a funcao exportada, quem precisa chamar
 * chama, e o CLI segue funcionando onde o guard funciona.
 */
export async function reconciliarSituacaoJulgamento(destinoJson?: string): Promise<void> {
  const julgamentoPorSq = await carregarJulgamentoPorSq(PLEITO_CORRENTE)
  if (!julgamentoPorSq) {
    console.error("FALHA: pacote complementar indisponivel; nada foi comparado")
    process.exitCode = 2
    return
  }

  // Le de `candidatos`, nao de `candidatos_publico`: `sq_candidato_2026` e coluna
  // INTERNA e nao entra na view publica nem no DTO, por decisao da migration
  // 20260817053000 que a criou. O recorte de publicaveis e reproduzido no filtro,
  // igual ao que os readbacks deste pacote usam.
  const { data, error } = await supabase
    .from("candidatos")
    .select("slug, situacao_candidatura, sq_candidato_2026, publicavel, status")
    .eq("publicavel", true)
    .neq("status", "removido")
  if (error) {
    console.error(`FALHA ao ler candidatos: ${error.message}`)
    process.exitCode = 2
    return
  }

  const fichas = (data ?? []) as FichaPublica[]
  const semSq: string[] = []
  const semJulgamento: string[] = []
  const bloqueadas: { slug: string; motivo: string }[] = []
  const divergencias: Divergencia[] = []
  let conferem = 0

  for (const f of fichas) {
    const sq = f.sq_candidato_2026?.trim()
    if (!sq) {
      semSq.push(f.slug)
      continue
    }
    const j = julgamentoPorSq.get(sq)
    if (!j) {
      semJulgamento.push(f.slug)
      continue
    }
    const mapeado = mapearJulgamento(j)
    if (!mapeado.ok) {
      bloqueadas.push({ slug: f.slug, motivo: mapeado.bloqueio })
      continue
    }
    if (f.situacao_candidatura === mapeado.valor) {
      conferem++
    } else {
      divergencias.push({
        slug: f.slug,
        sq,
        publicado: f.situacao_candidatura,
        fonte_codigo: j.codigo,
        fonte_descricao: j.descricao,
        deveria_ser: mapeado.valor,
      })
    }
  }

  const relatorio = {
    gerado_em: new Date().toISOString(),
    pacote: `consulta_cand_complementar_${PLEITO_CORRENTE}`,
    sq_no_pacote: julgamentoPorSq.size,
    censo_do_pacote: censoPorDescricao(julgamentoPorSq),
    fichas_publicaveis: fichas.length,
    conferem,
    divergentes: divergencias.length,
    sem_sq: semSq,
    sem_julgamento_no_pacote: semJulgamento,
    bloqueadas,
    divergencias: divergencias.sort((a, b) => a.slug.localeCompare(b.slug)),
  }

  const destino = destinoJson ?? process.argv.find((a) => a.startsWith("--json="))?.split("=")[1]
  if (destino) {
    writeFileSync(destino, `${JSON.stringify(relatorio, null, 2)}\n`)
    console.log(`relatorio salvo em ${destino}`)
  }

  console.log(`pacote            : ${relatorio.pacote} (${relatorio.sq_no_pacote} SQ)`)
  console.log(`fichas publicaveis: ${relatorio.fichas_publicaveis}`)
  console.log(`conferem          : ${conferem}`)
  console.log(`divergentes       : ${divergencias.length}`)
  console.log(`sem SQ            : ${semSq.length}`)
  console.log(`sem julgamento    : ${semJulgamento.length}`)
  console.log(`bloqueadas        : ${bloqueadas.length}`)
  const porDeveriaSer: Record<string, number> = {}
  for (const d of divergencias) porDeveriaSer[d.deveria_ser] = (porDeveriaSer[d.deveria_ser] ?? 0) + 1
  for (const [valor, n] of Object.entries(porDeveriaSer).sort((a, b) => b[1] - a[1])) {
    console.log(`  deveria ser ${valor}: ${n}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void reconciliarSituacaoJulgamento()
}
