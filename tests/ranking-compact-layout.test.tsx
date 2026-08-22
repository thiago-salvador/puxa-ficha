import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RankingCard } from "../src/components/RankingCard"
import { RankingTable } from "../src/components/RankingTable"
import { StateRankingCards } from "../src/components/StateRankingCards"
import type {
  RankingDataset,
  RankingDefinition,
  RankingEntry,
} from "../src/lib/rankings"
import type { StateRankingResult } from "../src/lib/state-ranking"

const definition: RankingDefinition = {
  slug: "gastos-parlamentares",
  title: "Gastos parlamentares",
  eyebrow: "Dinheiro público",
  description: "Descrição pública",
  metricLabel: "Total gasto",
  metricUnit: "currency",
  contextExplanation: "Contexto público preservado.",
  sortDirection: "desc",
  queryType: "aggregate-table",
  tableName: "gastos_parlamentares",
  aggregateField: "total_gasto",
  supportsUf: true,
}

const entries: RankingEntry[] = [
  {
    candidato: {
      id: "1",
      nome_urna: "Ana Silva",
      slug: "ana-silva",
      partido_sigla: "PT",
      cargo_disputado: "Presidente",
      estado: "SP",
      foto_url: "/candidates/ana-silva.webp",
    },
    metricValue: 3000,
  },
  {
    candidato: {
      id: "2",
      nome_urna: "Bruno Souza",
      slug: "bruno-souza",
      partido_sigla: "PSOL",
      cargo_disputado: "Presidente",
      estado: "RJ",
      foto_url: "/candidates/bruno-souza.webp",
    },
    metricValue: 2000,
  },
  {
    candidato: {
      id: "3",
      nome_urna: "Carla Lima",
      slug: "carla-lima",
      partido_sigla: "REDE",
      cargo_disputado: "Presidente",
      estado: "MG",
      foto_url: null,
    },
    metricValue: 1000,
  },
  {
    candidato: {
      id: "4",
      nome_urna: "Davi Costa",
      slug: "davi-costa",
      partido_sigla: "PDT",
      cargo_disputado: "Presidente",
      estado: "BA",
      foto_url: null,
    },
    metricValue: 500,
  },
]

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length
}

function assertInOrder(value: string, tokens: string[]) {
  let cursor = -1
  for (const token of tokens) {
    const next = value.indexOf(token, cursor + 1)
    assert.ok(next > cursor, `esperava ${JSON.stringify(token)} após índice ${cursor}`)
    cursor = next
  }
}

describe("PF-18 ranking compacto", () => {
  it("compacta RankingCard sem mudar preview, ordem, métricas ou links", () => {
    const dataset: RankingDataset = {
      definition,
      cargo: "Presidente",
      entries,
    }
    const html = renderToStaticMarkup(<RankingCard dataset={dataset} />)

    assert.equal(countMatches(html, /data-pf-ranking-card/g), 1)
    assert.equal(countMatches(html, /data-pf-ranking-preview-row/g), 3)
    assert.equal(countMatches(html, /href="\/rankings\/gastos-parlamentares"/g), 2)
    assertInOrder(html, ["Ana Silva", "Bruno Souza", "Carla Lima"])
    assert.doesNotMatch(html, /Davi Costa/)
    assert.match(html, /R\$ 3\.000/)
    assert.match(html, /R\$ 2\.000/)
    assert.match(html, /R\$ 1\.000/)
    assert.match(html, /p-4 sm:p-5/)
    assert.match(html, /space-y-2/)
    assert.match(html, /px-3 py-2\.5/)
  })

  it("compacta RankingTable preservando as duas representações DOM e todos os dados", () => {
    const html = renderToStaticMarkup(
      <RankingTable definition={definition} entries={entries.slice(0, 2)} />
    )
    const positions = [...html.matchAll(/data-pf-ranking-position="(\d+)"/g)].map(
      (match) => match[1]
    )
    const slugs = [...html.matchAll(/data-pf-ranking-slug="([^"]+)"/g)].map(
      (match) => match[1]
    )

    assert.deepEqual(positions, ["1", "2", "1", "2"])
    assert.deepEqual(slugs, ["ana-silva", "bruno-souza", "ana-silva", "bruno-souza"])
    assert.equal(countMatches(html, /href="\/candidato\/ana-silva"/g), 2)
    assert.equal(countMatches(html, /href="\/candidato\/bruno-souza"/g), 2)
    assert.equal(countMatches(html, />Ana Silva</g), 2)
    assert.equal(countMatches(html, />Bruno Souza</g), 2)
    assert.equal(countMatches(html, /R\$ 3\.000/g), 2)
    assert.equal(countMatches(html, /R\$ 2\.000/g), 2)
    assert.match(html, />PT · SP</)
    assert.match(html, />PSOL · RJ</)
    assert.equal(countMatches(html, />PT</g), 1)
    assert.equal(countMatches(html, />PSOL</g), 1)
    assert.equal(countMatches(html, />Presidente</g), 4)
    assert.equal(countMatches(html, />SP</g), 1)
    assert.equal(countMatches(html, />RJ</g), 1)
    assert.equal(countMatches(html, /width="44"/g), 2)
    assert.equal(countMatches(html, /height="44"/g), 2)
    assert.equal(countMatches(html, /sizes="44px"/g), 2)
    assert.equal(countMatches(html, /width="40"/g), 2)
    assert.equal(countMatches(html, /height="40"/g), 2)
    assert.equal(countMatches(html, /sizes="40px"/g), 2)
    assert.match(html, /space-y-2 md:hidden/)
    assert.match(html, /bg-card p-3 sm:p-4/)
    assert.match(html, /mt-3 rounded-\[14px\]/)
    assert.match(html, /py-3 pr-3/)
  })

  it("mantém o estado vazio do RankingTable", () => {
    const html = renderToStaticMarkup(<RankingTable definition={definition} entries={[]} />)

    assert.match(html, /data-pf-ranking-entry-count="0"/)
    assert.match(html, /data-pf-ranking-empty="true"/)
    assert.match(html, /Nenhum candidato com dados suficientes para este recorte\./)
    assert.doesNotMatch(html, /data-pf-ranking-row/)
  })

  it("compacta StateRankingCards preservando ordem, valores, fontes e qualidade", () => {
    const ranking: StateRankingResult = {
      estado: "SP",
      rankings: [
        {
          indicador: "gini",
          valor: 0.421,
          ano: 2024,
          posicao: 3,
          total: 27,
          acimaDaMedia: false,
          mediaNacional: 0.45,
          label: "3o de 27",
          qualidade: "bom",
          fonte: "ipeadata",
        },
        {
          indicador: "populacao_estimada",
          valor: 45_000_000,
          ano: 2025,
          posicao: 1,
          total: 27,
          acimaDaMedia: true,
          mediaNacional: 7_500_000,
          label: "1o de 27",
          qualidade: "bom",
          fonte: "ibge",
        },
        {
          indicador: "taxa_desemprego",
          valor: 7.5,
          ano: 2024,
          posicao: 10,
          total: 27,
          acimaDaMedia: false,
          mediaNacional: 8,
          label: "10o de 27",
          qualidade: "neutro",
          fonte: "ibge-pnad",
        },
      ],
    }
    const html = renderToStaticMarkup(<StateRankingCards ranking={ranking} />)
    const indicators = [
      ...html.matchAll(/data-pf-state-ranking-indicator="([^"]+)"/g),
    ].map((match) => match[1])

    assert.deepEqual(indicators, ["populacao_estimada", "taxa_desemprego", "gini"])
    assert.equal(countMatches(html, /data-pf-state-ranking-card/g), 3)
    assertInOrder(html, ["População", "Taxa de Desemprego", "Índice de Gini"])
    for (const token of ["45 mi", "7,5%", "0,421", "1o de 27", "10o de 27", "3o de 27"]) {
      assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    }
    for (const source of ["ibge", "ibge-pnad", "ipeadata"]) {
      assert.match(html, new RegExp(`data-pf-source-value="${source}"`))
    }
    assert.equal(countMatches(html, />Melhor que a média</g), 2)
    assert.equal(countMatches(html, />Próximo da média</g), 1)
    assert.equal(countMatches(html, /ano 2025/g), 1)
    assert.equal(countMatches(html, /ano 2024/g), 2)
    assert.equal(countMatches(html, /min-w-0 rounded-\[14px\][^"]*px-4 py-4/g), 3)
  })
})
