import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidateGeneralData } from "@/components/CandidateGeneralData"
import type { Candidato } from "@/lib/types"

function candidate(overrides: Partial<Candidato> = {}): Candidato {
  return {
    id: "candidate-general-data",
    nome_completo: "Luiz Inácio Lula da Silva",
    nome_urna: "Lula",
    slug: "lula",
    data_nascimento: "1945-10-27",
    idade: 80,
    naturalidade: "Garanhuns/PE",
    formacao: "PRIMÁRIO",
    formacao_instituicao: null,
    profissao_declarada: "Torneiro mecânico",
    genero: "Masculino",
    estado_civil: "Casado(a)",
    cor_raca: "Branca",
    partido_atual: "Partido dos Trabalhadores",
    partido_sigla: "PT",
    cargo_atual: "Presidente da República",
    cargo_disputado: "Presidente",
    estado: null,
    status: "candidato",
    situacao_candidatura: "Pedido de registro no TSE",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["TSE", "Curadoria Puxa Ficha"],
    ultima_atualizacao: "2026-08-19T03:00:00Z",
    ...overrides,
  }
}

test("renderiza os dados gerais públicos com fonte e atualização", () => {
  const html = renderToStaticMarkup(<CandidateGeneralData ficha={candidate()} />)

  assert.match(html, /data-pf-candidate-general-data=""/)
  assert.match(html, /<section/)
  assert.match(html, /<h2[^>]*>Dados gerais<\/h2>/)
  assert.match(html, /<dl/)
  assert.match(html, /<dt[^>]*>Nome completo<\/dt>/)
  assert.match(html, /<dd[^>]*>Luiz Inácio Lula da Silva<\/dd>/)
  assert.match(html, /<dt[^>]*>Formação<\/dt>/)
  assert.match(html, /<dd[^>]*>Primário<\/dd>/)
  assert.match(html, /<dt[^>]*>Situação da candidatura<\/dt>/)
  assert.match(html, /Pedido de registro no TSE/)
  assert.match(html, /Fontes: TSE, Curadoria Puxa Ficha\./)
  assert.match(html, /Atualizado em 19\/08\/2026\./)
  assert.match(html, /href="\/metodologia"/)
})

test("mantém ausência explícita e não inventa TSE quando a fonte não existe", () => {
  const html = renderToStaticMarkup(
    <CandidateGeneralData
      ficha={candidate({
        nome_completo: "",
        idade: null,
        naturalidade: null,
        formacao: null,
        profissao_declarada: null,
        genero: null,
        estado_civil: null,
        cor_raca: null,
        partido_sigla: "SEM PARTIDO",
        cargo_disputado: "Nenhum",
        situacao_candidatura: null,
        fonte_dados: [],
        ultima_atualizacao: undefined as unknown as string,
      })}
    />,
  )

  assert.equal((html.match(/Não informado/g) ?? []).length, 10)
  assert.match(html, /Fontes: Não informadas\./)
  assert.match(html, /Atualizado em Data indisponível\./)
  assert.doesNotMatch(html, /Fontes: TSE/)
  assert.doesNotMatch(html, /CPF/i)
})

test("resume fontes técnicas em rótulos públicos sem inventar procedência", () => {
  const html = renderToStaticMarkup(
    <CandidateGeneralData
      ficha={candidate({
        fonte_dados: [
          "curadoria",
          "ficha-completa-2026-07-01",
          "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura",
        ],
      })}
    />,
  )

  assert.match(html, /Fontes: Curadoria Puxa Ficha, TSE\./)
  assert.doesNotMatch(html, /ficha-completa|https:\/\//)
})

test("fica no fim da Visão Geral sem criar uma aba", () => {
  const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
  const generalData = readFileSync("src/components/CandidateGeneralData.tsx", "utf8")
  const tabs = readFileSync("src/lib/candidato-profile-tabs.ts", "utf8")
  const overviewStart = profile.indexOf('{activeTab === "geral"')
  const overviewEnd = profile.indexOf("{/* PESQUISAS TAB */}", overviewStart)
  const overview = profile.slice(overviewStart, overviewEnd)

  assert.ok(overviewStart >= 0 && overviewEnd > overviewStart)
  assert.ok(overview.indexOf("<ProfileOverview") < overview.indexOf("<StateIndicators"))
  assert.ok(overview.indexOf("<StateIndicators") < overview.indexOf("<FollowCandidateButton"))
  assert.ok(overview.indexOf("<FollowCandidateButton") < overview.indexOf("<CandidateGeneralData"))
  assert.match(generalData, /grid-cols-1 gap-x-8 sm:grid-cols-2/)
  assert.doesNotMatch(tabs, /["']dados["']/)
})
