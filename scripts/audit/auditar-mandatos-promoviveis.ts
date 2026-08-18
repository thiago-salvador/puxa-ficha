/**
 * Auditoria da regra positiva de promoção de trajetória (item 14).
 *
 * A regra vive em `src/lib/destaques-ficha.ts` e é fail-closed: só promove
 * cargo nomeado, e o default de tudo que não casa é não promover. Este script
 * roda a MESMA função sobre todas as linhas de trajetória do universo público e
 * imprime os dois lados, para a exclusão ser conferível em vez de confiável:
 *
 * - o que PASSA, agrupado por cargo canônico;
 * - o que NÃO passa, com o motivo e o texto original do cargo.
 *
 * Só leitura. Uso:
 *   npx tsx scripts/audit/auditar-mandatos-promoviveis.ts [--json=caminho]
 */
import { writeFileSync } from "node:fs"
import { supabase } from "../lib/supabase"
import { motivoNaoPromoverMandato, provenienciaDoMandato } from "../../src/lib/destaques-ficha"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import type { HistoricoPolitico } from "../../src/lib/types"

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    linhas.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return linhas
}

async function main() {
  const saida = process.argv.slice(2).find((a) => a.startsWith("--json="))?.split("=")[1] ?? null
  const candidatos = await todas<{ id: string; slug: string }>("candidatos_publico", "id, slug")
  const slugPor = new Map(candidatos.map((c) => [c.id, c.slug]))
  const historico = await todas<HistoricoPolitico>("historico_politico", "*")
  const publicas = historico.filter((h) => slugPor.has(h.candidato_id))

  const promovidas: Array<{
    slug: string
    canonico: string
    cargo: string
    inicio: number | null
    /** Coluna crua, que é nula em linha legada. */
    provenienciaPersistida: string | null
    /** Proveniência EFETIVA pelo contrato canônico. Nunca vazia. */
    provenienciaEfetiva: string
  }> = []
  const excluidas: Array<{ slug: string; canonico: string; cargo: string; motivo: string }> = []

  for (const linha of publicas) {
    const canonico = (linha.cargo_canonico ?? canonicalCargo(linha.cargo ?? "")).trim()
    const motivo = motivoNaoPromoverMandato(linha)
    if (motivo === null) {
      promovidas.push({
        slug: slugPor.get(linha.candidato_id)!,
        canonico,
        cargo: linha.cargo,
        inicio: linha.periodo_inicio,
        provenienciaPersistida: linha.proveniencia ?? null,
        provenienciaEfetiva: provenienciaDoMandato(linha).chave,
      })
    } else {
      excluidas.push({ slug: slugPor.get(linha.candidato_id)!, canonico, cargo: linha.cargo, motivo })
    }
  }

  const agrupar = <T extends { canonico: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) m.set(x.canonico, [...(m.get(x.canonico) ?? []), x])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }

  console.log(`linhas de trajetória no universo público: ${publicas.length}`)
  console.log(`promovidas: ${promovidas.length} | excluídas: ${excluidas.length}\n`)

  console.log("== PASSAM pela regra positiva, por cargo canônico ==")
  for (const [canonico, linhas] of agrupar(promovidas)) {
    console.log(`${String(linhas.length).padStart(4)}  ${canonico}`)
  }

  /**
   * Proveniência das promovidas. O que importa aqui é a segunda coluna: linha
   * com coluna nula é legado, e o contrato canônico resolve por `observacoes`,
   * cujo pior caso é `manual`. Card promovido sem proveniência efetiva é
   * defeito, e o script reprova se aparecer um.
   */
  const semEfetiva = promovidas.filter((p) => !p.provenienciaEfetiva)
  const nulasNaColuna = promovidas.filter((p) => p.provenienciaPersistida == null)
  const porEfetiva = new Map<string, number>()
  for (const p of promovidas) porEfetiva.set(p.provenienciaEfetiva, (porEfetiva.get(p.provenienciaEfetiva) ?? 0) + 1)

  console.log("\n== PROVENIÊNCIA das promovidas ==")
  console.log(`coluna persistida nula: ${nulasNaColuna.length} | sem proveniência efetiva: ${semEfetiva.length}`)
  for (const [chave, n] of [...porEfetiva.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(4)}  ${chave}`)
  }
  if (nulasNaColuna.length) {
    console.log("  legado resolvido, por efetiva:")
    const porLegado = new Map<string, number>()
    for (const p of nulasNaColuna) porLegado.set(p.provenienciaEfetiva, (porLegado.get(p.provenienciaEfetiva) ?? 0) + 1)
    for (const [chave, n] of porLegado) console.log(`    ${String(n).padStart(4)}  ${chave}`)
  }

  console.log("\n== EXCLUÍDAS, por motivo ==")
  const porMotivo = new Map<string, typeof excluidas>()
  for (const e of excluidas) porMotivo.set(e.motivo, [...(porMotivo.get(e.motivo) ?? []), e])
  for (const [motivo, linhas] of [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n-- ${motivo}: ${linhas.length}`)
    // `nao_e_mandato` é a maioria e não é interessante linha a linha: é toda
    // candidatura da base. Os outros motivos saem inteiros, porque é neles que
    // um cargo público legítimo poderia estar sendo perdido em silêncio.
    if (motivo === "nao_e_mandato") {
      for (const [canonico, l] of agrupar(linhas)) console.log(`   ${String(l.length).padStart(4)}  ${canonico}`)
      continue
    }
    for (const [canonico, l] of agrupar(linhas)) {
      console.log(`   ${String(l.length).padStart(4)}  ${canonico}   [${l.map((x) => x.slug).slice(0, 4).join(", ")}]`)
    }
  }

  if (saida) {
    writeFileSync(saida, JSON.stringify({ promovidas, excluidas }, null, 2))
    console.log(`\nDetalhe em ${saida}`)
  }

  if (semEfetiva.length) {
    console.error(
      `\nFALHA: ${semEfetiva.length} mandato(s) promovido(s) sem proveniência efetiva.`
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
