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
  it("carrega somente os seis estados que passaram pelo gate", () => {
    assert.deepEqual(
      [...carregarPesquisasGovernadores().keys()].sort(),
      ["DF", "MG", "PE", "PI", "RJ", "SP"],
    )
  })

  it("não cruza candidaturas ou resultados entre estados", () => {
    assert.equal(listarPesquisasGovernadorPorSlug("tarcisio-gov-sp", "SP")[0]?.resultado.valuePercent, 45)
    assert.equal(listarPesquisasGovernadorPorSlug("tarcisio-gov-sp", "RJ").length, 0)
    assert.equal(listarPesquisasGovernadorPorSlug("eduardo-paes", "RJ")[0]?.resultado.valuePercent, 41)
    assert.equal(listarPesquisasGovernadorPorSlug("eduardo-paes", "SP").length, 0)
  })

  it("preserva zero publicado e mantém UF sem rodada qualificada vazia", () => {
    assert.equal(listarPesquisasGovernadorPorSlug("henrique-areas", "MG")[0]?.resultado.valuePercent, 0)
    assert.deepEqual(listarPesquisasGovernadorPorSlug("ciro-gomes-gov-ce", "CE"), [])
    assert.deepEqual(listarPesquisasGovernadorPorSlug("governador-inexistente", "SP"), [])
  })

  it("vincula cada alias publicado a uma candidatura de governador na mesma UF", () => {
    const payload = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as unknown
    const candidatos = Array.isArray(payload)
      ? payload
      : ((payload as { candidatos?: unknown[] }).candidatos ?? [])

    for (const [uf, data] of carregarPesquisasGovernadores()) {
      for (const poll of data.pesquisas) {
        for (const scenario of poll.cenarios) {
          for (const result of scenario.resultados.filter(
            (entry) => entry.matchStatus === "exact_alias",
          )) {
            const candidato = candidatos.find(
              (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                (entry as { slug?: string }).slug === result.candidateSlug,
            ) as { cargo_disputado?: string; estado?: string } | undefined
            assert.ok(candidato, `${uf}: slug ausente ${result.candidateSlug}`)
            assert.equal(candidato.cargo_disputado, "Governador")
            assert.equal(candidato.estado, uf)
          }
        }
      }
    }
  })
})
