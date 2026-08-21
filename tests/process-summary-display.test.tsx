import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "@/components/CandidatoProfile"
import { ProfileOverview } from "@/components/ProfileOverview"
import type { FichaCandidato, Processo } from "@/lib/types"

const FIXTURE_DESCRICAO = "condenacao 1a instancia"

function processo(overrides: Partial<Processo> = {}): Processo {
  return {
    id: "proc-resumo",
    candidato_id: "cand-resumo",
    tipo: "civil",
    tribunal: "TJ",
    numero_processo: null,
    descricao: FIXTURE_DESCRICAO,
    status: "em_andamento",
    data_inicio: null,
    data_decisao: null,
    gravidade: null,
    fonte: "DJEN",
    url_fonte: null,
    ...overrides,
  }
}

function fichaComResumo(processos: Processo[]): FichaCandidato {
  return {
    id: "cand-resumo",
    slug: "candidato-resumo",
    nome_completo: "Pessoa Candidata",
    nome_urna: "Pessoa",
    partido_atual: "Partido",
    partido_sigla: "PTD",
    cargo_disputado: "Governador",
    status: "candidato",
    fonte_dados: ["DJEN"],
    ultima_atualizacao: "2026-08-10T00:00:00Z",
    processos,
    total_processos: processos.length,
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [],
    gastos_parlamentares: [],
    sancoes_administrativas: [],
    noticias: [],
    indicadores_estaduais: [],
  } as unknown as FichaCandidato
}

describe("resumo processual com acento na ficha", () => {
  it("Visão Geral mostra condenação, instância e Representação", () => {
    const html = renderToStaticMarkup(
      <ProfileOverview
        ficha={fichaComResumo([
          processo({ tipo: "representacao" as Processo["tipo"] }),
        ])}
        onNavigateTab={() => {}}
      />,
    )

    assert.match(html, /condenação/i)
    assert.match(html, /instância/)
    assert.match(html, /Representação/)
    assert.doesNotMatch(html, /condenacao/)
    assert.doesNotMatch(html, /instancia(?!s)/)
  })

  it("aba Justiça mostra condenação, instância e Representação", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaComResumo([
          processo({ tipo: "civil", descricao: FIXTURE_DESCRICAO }),
          processo({ id: "proc-tipo", tipo: "civil", descricao: "representacao" }),
        ])}
        initialTab="justica"
      />,
    )

    assert.match(html, /condenação/i)
    assert.match(html, /instância/)
    assert.match(html, /Representação/)
    assert.doesNotMatch(html, /condenacao/)
  })

  it("não inventa fatos além do fixture ASCII", () => {
    const html = renderToStaticMarkup(
      <ProfileOverview
        ficha={fichaComResumo([processo()])}
        onNavigateTab={() => {}}
      />,
    )

    assert.match(html, />Condenação 1a instância</)
    assert.doesNotMatch(html, /por peculato/)
    assert.doesNotMatch(html, /absolvido/i)
  })
})
