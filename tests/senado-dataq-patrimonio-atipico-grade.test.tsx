/**
 * F3 na grade: as páginas de lista (home, /uf/[uf] e /uf/[uf]/senado) montam os
 * mapas da grade a partir do DTO `CandidatoResumo`, incluindo
 * `patrimonio_atipico`. O card mostra o aviso e a ordenação por patrimônio
 * manda o candidato marcado para o fim.
 *
 * Fixtures sintéticas: nomes, slugs e valores fictícios.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { CandidatoGrid, ordenarCandidatosGrid } from "@/components/CandidatoGrid"
import { GlobalSearchProvider } from "@/components/GlobalSearchProvider"
import type { CandidatoResumo } from "@/lib/api"
import { buildCandidatoGridMaps } from "@/lib/candidato-grid-maps"
import { PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
import type { Candidato } from "@/lib/types"

const candidato = (slug: string, nome: string): Candidato =>
  ({
    id: `id-${slug}`,
    slug,
    nome_urna: nome,
    nome_completo: nome,
    partido_sigla: "PX",
    partido_atual: "PX",
    foto_url: null,
    cargo_disputado: "Governador",
    estado: "SP",
    redes_sociais: {},
  }) as unknown as Candidato

const resumo = (
  slug: string,
  nome: string,
  patrimonio: number | null,
  patrimonio_atipico: boolean,
): CandidatoResumo => ({
  candidato: candidato(slug, nome),
  patrimonio,
  patrimonio_atipico,
  processos: 1,
  processos_ordenacao: 1,
  pontos_atencao: 0,
})

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
}

const RESUMOS: CandidatoResumo[] = [
  resumo("pessoa-alfa", "Pessoa Alfa", 1_000_000, false),
  resumo("pessoa-beta", "Pessoa Beta", 90_000_000, true),
  resumo("pessoa-gama", "Pessoa Gama", 50_000, false),
]

describe("grade: patrimonio_atipico do DTO chega ao card e à ordenação", () => {
  it("buildCandidatoGridMaps leva o booleano do DTO para patrimoniosAtipicos", () => {
    const maps = buildCandidatoGridMaps(RESUMOS)
    assert.deepEqual(maps.patrimoniosAtipicos, { "pessoa-beta": true })
    assert.deepEqual(maps.patrimonios, {
      "pessoa-alfa": 1_000_000,
      "pessoa-beta": 90_000_000,
      "pessoa-gama": 50_000,
    })
    assert.deepEqual(maps.processos, { "pessoa-alfa": 1, "pessoa-beta": 1, "pessoa-gama": 1 })
    assert.deepEqual(maps.processSortCounts, { "pessoa-alfa": 1, "pessoa-beta": 1, "pessoa-gama": 1 })
  })

  it("o card do candidato marcado mostra o aviso, e só ele", () => {
    const maps = buildCandidatoGridMaps(RESUMOS)
    const html = renderToStaticMarkup(
      <AppRouterContext.Provider value={router as never}>
        <GlobalSearchProvider>
          <CandidatoGrid candidatos={RESUMOS.map((r) => r.candidato)} {...maps} />
        </GlobalSearchProvider>
      </AppRouterContext.Provider>,
    )
    assert.match(html, new RegExp(PATRIMONIO_ATIPICO_ROTULO, "i"))
    const marcados = [...html.matchAll(/<a[^>]*href="\/candidato\/([^"]+)"[\s\S]*?<\/a>/g)]
      .filter((match) => match[0].includes("data-pf-patrimonio-atipico"))
      .map((match) => match[1])
    assert.deepEqual([...new Set(marcados)], ["pessoa-beta"])
  })

  it("ordenação por patrimônio manda o atípico para o fim", () => {
    const maps = buildCandidatoGridMaps(RESUMOS)
    const ordenados = ordenarCandidatosGrid(
      RESUMOS.map((r) => r.candidato),
      "patrimonio",
      maps,
    )
    assert.deepEqual(
      ordenados.map((c) => c.slug),
      ["pessoa-alfa", "pessoa-gama", "pessoa-beta"],
    )
  })

  for (const page of [
    "src/app/(site)/page.tsx",
    "src/app/(site)/uf/[uf]/page.tsx",
    "src/app/(site)/uf/[uf]/senado/page.tsx",
  ]) {
    it(`${page} repassa patrimoniosAtipicos à grade`, () => {
      const source = readFileSync(page, "utf8")
      assert.match(source, /buildCandidatoGridMaps\(/)
      assert.match(source, /<(Deferred)?CandidatoGrid[\s\S]*?patrimoniosAtipicos=\{patrimoniosAtipicos\}[\s\S]*?\/>/)
    })
  }
})
