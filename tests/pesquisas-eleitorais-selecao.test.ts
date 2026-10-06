import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import type {
  parsePesquisasEleitoraisJson as ParsePesquisasEleitoraisJsonExport,
  selecionarPesquisasMaisRecentesComparaveis as SelecionarPesquisasMaisRecentesComparaveisExport,
} from "@/lib/pesquisas-eleitorais"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const {
  carregarPesquisasGovernadores,
  listarPesquisasGovernadorPorSlug,
  listarPesquisasPresidenciaisPorSlug,
  parsePesquisasEleitoraisJson,
  selecionarPesquisasMaisRecentesComparaveis,
} = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais") & {
  parsePesquisasEleitoraisJson: typeof ParsePesquisasEleitoraisJsonExport
  selecionarPesquisasMaisRecentesComparaveis: typeof SelecionarPesquisasMaisRecentesComparaveisExport
}

function catalogo() {
  return parsePesquisasEleitoraisJson(
    readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8"),
    readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8"),
  )
}

describe("seleção da pesquisa mais recente comparável", () => {
  it("exige eleição, cargo, geografia, turno e cenário exatamente iguais", () => {
    const data = catalogo()
    const poll = data.pesquisas[0]
    const scenario = poll.cenarios[0]
    const result = scenario.resultados.find((entry) => entry.candidateSlug)
    assert.ok(result?.candidateSlug)
    const base = {
      electionYear: poll.electionYear,
      office: poll.office,
      geographyCode: poll.geography.code,
      turn: scenario.turn,
      comparabilityKey: scenario.comparabilityKey,
    }
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, base).length, 1)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, { ...base, electionYear: 2022 }).length, 0)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, { ...base, office: "Governador" }).length, 0)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, { ...base, geographyCode: "SP" }).length, 0)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, { ...base, turn: scenario.turn === 1 ? 2 : 1 }).length, 0)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, { ...base, comparabilityKey: `${base.comparabilityKey}-outro` }).length, 0)
  })

  it("seleciona por slug literal, sem normalização ou fuzzy match", () => {
    const data = catalogo()
    const poll = data.pesquisas[0]
    const scenario = poll.cenarios[0]
    const result = scenario.resultados.find((entry) => entry.candidateSlug)
    assert.ok(result?.candidateSlug)
    const scope = {
      electionYear: poll.electionYear,
      office: poll.office,
      geographyCode: poll.geography.code,
      turn: scenario.turn,
      comparabilityKey: scenario.comparabilityKey,
    }
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug.toUpperCase(), scope).length, 0)
    assert.equal(selecionarPesquisasMaisRecentesComparaveis(data, `${result.candidateSlug} `, scope).length, 0)
    assert.ok(listarPesquisasPresidenciaisPorSlug(result.candidateSlug).length > 0)
    assert.equal(listarPesquisasPresidenciaisPorSlug(result.candidateSlug.toUpperCase()).length, 0)
  })

  it("mantém apenas a rodada mais recente por fonte dentro do mesmo escopo", () => {
    const data = catalogo()
    const original = data.pesquisas[0]
    const scenario = original.cenarios[0]
    const result = scenario.resultados.find((entry) => entry.candidateSlug)
    assert.ok(result?.candidateSlug)
    const newer = structuredClone(original)
    newer.id = `${original.id}-mais-recente`
    newer.publicationDate.value = "2099-01-01"
    data.pesquisas.push(newer)
    const selected = selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, {
      electionYear: original.electionYear,
      office: original.office,
      geographyCode: original.geography.code,
      turn: scenario.turn,
      comparabilityKey: scenario.comparabilityKey,
    })
    assert.equal(selected.length, 1)
    assert.equal(selected[0].id, newer.id)
  })

  it("não volta para rodada antiga quando o candidato está ausente na mais recente", () => {
    const data = catalogo()
    const original = data.pesquisas[0]
    const scenario = original.cenarios[0]
    const result = scenario.resultados.find((entry) => entry.candidateSlug)
    assert.ok(result?.candidateSlug)
    const newer = structuredClone(original)
    newer.id = `${original.id}-sem-candidato`
    newer.publicationDate.value = "2099-01-01"
    newer.cenarios[0].resultados = newer.cenarios[0].resultados.filter(
      (entry) => entry.candidateSlug !== result.candidateSlug,
    )
    data.pesquisas.push(newer)

    assert.deepEqual(
      selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, {
        electionYear: original.electionYear,
        office: original.office,
        geographyCode: original.geography.code,
        turn: scenario.turn,
        comparabilityKey: scenario.comparabilityKey,
      }),
      [],
    )
  })

  it("preserva rótulo bruto, resultado canônico, estados e proveniência", () => {
    const data = catalogo()
    const poll = data.pesquisas[0]
    const scenario = poll.cenarios[0]
    const result = scenario.resultados.find((entry) => entry.candidateSlug)
    assert.ok(result?.candidateSlug)
    const [selected] = selecionarPesquisasMaisRecentesComparaveis(data, result.candidateSlug, {
      electionYear: poll.electionYear,
      office: poll.office,
      geographyCode: poll.geography.code,
      turn: scenario.turn,
      comparabilityKey: scenario.comparabilityKey,
    })
    assert.equal(selected.resultado.rawLabel, result.rawLabel)
    assert.equal(selected.resultado.candidateSlug, result.candidateSlug)
    assert.equal(selected.resultado.valuePercent, result.valuePercent)
    assert.equal(selected.resultado.status, result.status)
    assert.equal(selected.state, poll.state)
    assert.equal(selected.provenance.resultUrl, poll.provenance.resultUrl)
    assert.equal(selected.provenance.capture.sha256, poll.provenance.capture.sha256)
  })
})

describe("seleção estadual por UF", () => {
  it("carrega os catálogos qualificados das 27 UFs", () => {
    assert.deepEqual(
      [...carregarPesquisasGovernadores().keys()].sort(),
      [
        "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
        "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
      ],
    )
  })

  it("não cruza candidaturas ou resultados entre estados", () => {
    assert.equal(listarPesquisasGovernadorPorSlug("omar-aziz", "AM")[0]?.resultado.valuePercent, 32.6)
    assert.equal(listarPesquisasGovernadorPorSlug("omar-aziz", "AC").length, 0)
    assert.equal(listarPesquisasGovernadorPorSlug("alan-rick", "AC")[0]?.id, "quaest-ac-02370-2026")
    assert.equal(listarPesquisasGovernadorPorSlug("alan-rick", "AC")[0]?.resultado.valuePercent, 33)
    assert.equal(listarPesquisasGovernadorPorSlug("alan-rick", "AM").length, 0)
    assert.ok(listarPesquisasGovernadorPorSlug("tarcisio-gov-sp", "SP").length > 0)
    assert.equal(listarPesquisasGovernadorPorSlug("tarcisio-gov-sp", "RJ").length, 0)
    assert.ok(listarPesquisasGovernadorPorSlug("eduardo-paes", "RJ").length > 0)
    assert.equal(listarPesquisasGovernadorPorSlug("eduardo-paes", "SP").length, 0)
    assert.ok(listarPesquisasGovernadorPorSlug("ciro-gomes-gov-ce", "CE").length > 0)
    assert.equal(listarPesquisasGovernadorPorSlug("ciro-gomes-gov-ce", "RS").length, 0)
    assert.ok(listarPesquisasGovernadorPorSlug("juliana-brizola", "RS").length > 0)
    assert.equal(listarPesquisasGovernadorPorSlug("juliana-brizola", "CE").length, 0)
  })

  it("preserva zeros publicados e seleciona o valor atual pela identidade exata", () => {
    const assertAtlasCE = (slug: string, valuePercent: number) => {
      const [selected] = listarPesquisasGovernadorPorSlug(slug, "CE")
      assert.ok(selected, `${slug} deve ter pesquisa selecionada no Ceará`)
      assert.equal(selected.id, "atlasintel-ce-01709-2026")
      assert.equal(selected.electionYear, 2026)
      assert.equal(selected.office, "Governador")
      assert.equal(selected.geography.code, "CE")
      assert.equal(selected.cenario.turn, 1)
      assert.equal(selected.resultado.candidateSlug, slug)
      assert.equal(selected.resultado.valuePercent, valuePercent)
    }

    assertAtlasCE("serley-leal", 0.1)
    assertAtlasCE("ze-batista", 0.1)
    assertAtlasCE("ieri-braga", 0)

    const henriqueMg = listarPesquisasGovernadorPorSlug("henrique-areas", "MG")
    assert.equal(henriqueMg[0]?.id, "datafolha-mg-09729-2026")
    assert.equal(henriqueMg[0]?.electionYear, 2026)
    assert.equal(henriqueMg[0]?.office, "Governador")
    assert.equal(henriqueMg[0]?.geography.code, "MG")
    assert.equal(henriqueMg[0]?.cenario.turn, 1)
    assert.equal(henriqueMg[0]?.resultado.candidateSlug, "henrique-areas")
    assert.equal(henriqueMg[0]?.resultado.valuePercent, 1)
    const quaestMg = carregarPesquisasGovernadores().get("MG")?.pesquisas.find(
      (poll) => poll.id === "quaest-mg-02019-2026",
    )
    assert.ok(quaestMg)
    assert.equal(quaestMg.instituto.value, "Quaest")
    assert.equal(quaestMg.geography.code, "MG")
    assert.equal(quaestMg.cenarios[0]?.resultados.find((result) => result.candidateSlug === "henrique-areas")?.valuePercent, 0)
    assert.deepEqual(listarPesquisasGovernadorPorSlug("governador-inexistente", "SP"), [])
  })

  it("vincula cada alias publicado ao roster oficial, seed histórico ou cadastro confirmado da mesma UF", () => {
    const roster = JSON.parse(
      readFileSync("data/candidate-roster-active-20260905.json", "utf8"),
    ) as {
      profiles: Array<{ profile_slug: string; office: string; uf: string; publication_status: string }>
    }
    const legacyPayload = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as unknown
    const legacyCandidates = Array.isArray(legacyPayload)
      ? legacyPayload
      : ((legacyPayload as { candidatos?: unknown[] }).candidatos ?? [])
    const registry = JSON.parse(
      readFileSync("tests/fixtures/pesquisas-identidades-20261005.json", "utf8"),
    ) as {
      source: { table: string; consulted_at: string; query: string }
      profiles: Array<{ slug: string; cargo_disputado: string; estado: string }>
    }
    assert.equal(registry.source.table, "public.candidatos")
    assert.equal(registry.source.consulted_at, "2026-10-05")
    assert.match(registry.source.query, /^SELECT slug,nome_completo,nome_urna,cargo_disputado,estado FROM candidatos WHERE/)
    assert.deepEqual(
      registry.profiles.map(({ slug, cargo_disputado, estado }) => [slug, cargo_disputado, estado]),
      [["jose-moita", "Governador", "PA"], ["subtenente-luiz-carlos", "Governador", "TO"]],
    )

    for (const [uf, data] of carregarPesquisasGovernadores()) {
      for (const poll of data.pesquisas) {
        for (const scenario of poll.cenarios) {
          for (const result of scenario.resultados.filter(
            (entry) => entry.matchStatus === "exact_alias",
          )) {
            const official = roster.profiles.find(
              (entry) =>
                entry.profile_slug === result.candidateSlug &&
                entry.office === "Governador" &&
                entry.uf === uf &&
                entry.publication_status === "active",
            )
            if (official) {
              continue
            }

            const legacy = [...legacyCandidates, ...registry.profiles].find(
              (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                (entry as { slug?: string }).slug === result.candidateSlug,
            ) as { cargo_disputado?: string; estado?: string } | undefined
            assert.ok(legacy, `${uf}: slug ausente do roster, seed e cadastro confirmado ${result.candidateSlug}`)
            assert.equal(legacy.cargo_disputado, "Governador")
            assert.equal(legacy.estado, uf)
          }
        }
      }
    }
  })
})
