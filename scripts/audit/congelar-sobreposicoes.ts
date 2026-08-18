/**
 * Gera `scripts/audit/sobreposicoes-congeladas.json`, o manifesto par a par que
 * o auditor cobra.
 *
 * A separação é o ponto: a GERAÇÃO usa `classificarSobreposicoes` e é revisada
 * por gente no PR; a CONFERÊNCIA, em `auditar-classificacao-eleitoral.ts`, não
 * pode chamar o classificador, senão o esperado regride junto com o código e o
 * invariante (e) vira tautologia.
 *
 * Regenerar é ato deliberado, e o diff mostra exatamente qual par mudou de
 * classe. Uso:
 *   node --import tsx scripts/audit/congelar-sobreposicoes.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { createClient } from "@supabase/supabase-js"

import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import { classificarSobreposicoes } from "@/lib/mandato-precedencia"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import type { HistoricoPolitico } from "@/lib/types"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const linha of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(linha.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}
const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function chaveDoPar(slug: string, a: HistoricoPolitico, b: HistoricoPolitico): string {
  const lado = (r: HistoricoPolitico) =>
    `${(r.cargo ?? "").trim()}@${r.periodo_inicio ?? "?"}-${r.periodo_fim ?? "atual"}`
  const [x, y] = [lado(a), lado(b)].sort()
  return `${slug} | ${x} X ${y}`
}

async function paginar<T>(tabela: string, colunas: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

async function main() {
  const candidatos = await paginar<{ id: string; slug: string }>("candidatos", "id, slug")
  const historico = await paginar<HistoricoPolitico & { candidato_id: string }>(
    "historico_politico",
    "id, candidato_id, cargo, cargo_canonico, tipo_evento, periodo_inicio, periodo_fim, partido, estado, eleito_por, observacoes, proveniencia",
  )

  const porCandidato = new Map<string, HistoricoPolitico[]>()
  for (const row of historico) {
    const lista = porCandidato.get(row.candidato_id) ?? []
    lista.push(row)
    porCandidato.set(row.candidato_id, lista)
  }

  const pares: Array<Record<string, unknown>> = []
  for (const candidato of [...candidatos].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const bruto = porCandidato.get(candidato.id) ?? []
    if (bruto.length === 0) continue
    // Ordem do contrato: C1 sai do NORMALIZADO (é lá que a duplicata ainda
    // existe); C4 e C5 saem da lista PÚBLICA, já sem ela, para a duplicata não
    // inflar a contagem de sobreposição.
    const normalizado = normalizeHistoricoPoliticoForDisplay(bruto).sort((x, y) => (x.id < y.id ? -1 : 1))
    const publica = prepareHistoricoPoliticoPublicDisplayList(normalizado)
    const registrar = (lista: typeof normalizado, filtro: (c: string) => boolean) => {
      const porId = new Map(lista.map((r) => [r.id, r]))
      for (const par of classificarSobreposicoes(lista)) {
        if (!filtro(par.classe)) continue
        const a = porId.get(par.aId)!
        const b = porId.get(par.bId)!
        pares.push({
          chave: chaveDoPar(candidato.slug, a, b),
          classe: par.classe,
          campo_decisor: par.campoDecisor,
          motivo: par.motivo,
          linha_a: { cargo: a.cargo, periodo: [a.periodo_inicio, a.periodo_fim], proveniencia: a.proveniencia },
          linha_b: { cargo: b.cargo, periodo: [b.periodo_inicio, b.periodo_fim], proveniencia: b.proveniencia },
        })
      }
    }
    registrar(normalizado, (c) => c === "C1_duplicata")
    registrar(publica, (c) => c !== "C1_duplicata")
  }
  pares.sort((x, y) => String(x.chave).localeCompare(String(y.chave)))

  const tally: Record<string, number> = {}
  for (const p of pares) tally[String(p.classe)] = (tally[String(p.classe)] ?? 0) + 1

  writeFileSync(
    join("scripts", "audit", "sobreposicoes-congeladas.json"),
    `${JSON.stringify(
      {
        _comentario:
          "Manifesto CONGELADO das sobreposições de mandato, par a par e por classe. O auditor (auditar-classificacao-eleitoral.ts) compara contra este arquivo e contra a SAÍDA RENDERIZADA, e nunca chama classificarSobreposicoes: par novo, par que sumiu ou classe cuja evidência na tela não bate reprovam. Regenerar com scripts/audit/congelar-sobreposicoes.ts é ato deliberado e o diff mostra o que mudou.",
        congelado_em: "2026-08-10",
        total: pares.length,
        por_classe: tally,
        pares,
      },
      null,
      1,
    )}\n`,
  )
  console.log(`congelados ${pares.length} pares`, tally)
}

void main()
