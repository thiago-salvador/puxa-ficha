import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "@/components/CandidatoProfile"
import { MetaBadge } from "@/components/MetaBadge"
import { ProfileOverview } from "@/components/ProfileOverview"
import {
  groupProcessosForDisplay,
  processStatusRepeatsDescription,
} from "@/lib/processos-display"
import { buildTimelineEvents } from "@/lib/timeline-utils"
import type { FichaCandidato, Processo } from "@/lib/types"

const FIXTURE_DESCRICAO = "condenacao 1a instancia"
const GROUP_DESCRIPTION =
  "Três processos trabalhistas vinculam a pessoa candidata a atos de execução relacionados às mesmas empresas. As comunicações registram bloqueio de ativos e reserva de créditos, sem provar ilícito eleitoral, penal ou de gestão pública."
const REPEATED_STATUS =
  `${GROUP_DESCRIPTION} Limitações: os três processos têm fases e resultados distintos e não representam condenações pessoais equivalentes.`

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

describe("contenção de textos longos nos cards", () => {
  it("badge compartilhado quebra sequências sem espaços dentro do contêiner", () => {
    const html = renderToStaticMarkup(
      <MetaBadge>{"STATUSPROCESSUAL".repeat(40)}</MetaBadge>,
    )

    assert.match(html, /min-w-0/)
    assert.match(html, /max-w-full/)
    assert.match(html, /shrink-0/)
    assert.match(html, /whitespace-normal/)
    assert.match(html, /\[overflow-wrap:anywhere\]/)
  })

  it("superfícies de processo contêm status e descrições extensos", () => {
    const textoSemEspacos = "STATUSPROCESSUAL".repeat(40)
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaComResumo([
          processo({
            status: textoSemEspacos,
            descricao: textoSemEspacos,
            url_fonte: "https://example.org/processo",
          }),
        ])}
        initialTab="justica"
      />,
    )

    assert.match(
      html,
      /class="min-w-0 max-w-full \[overflow-wrap:anywhere\][^"]*"[^>]*data-pf-timeline-ref=/,
    )
    assert.doesNotMatch(html, /whitespace-nowrap/)
  })
})

describe("agrupamento de narrativas processuais repetidas", () => {
  function repeatedProcesses(): Processo[] {
    return [
      processo({
        id: "proc-grupo-1",
        tribunal: "TRT3",
        numero_processo: "0010000-01.2026.5.03.0001",
        descricao: GROUP_DESCRIPTION,
        status: REPEATED_STATUS,
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=00100000120265030001",
      }),
      processo({
        id: "proc-grupo-2",
        tribunal: "TRT3",
        numero_processo: "0010000-02.2026.5.03.0002",
        descricao: GROUP_DESCRIPTION,
        status: REPEATED_STATUS,
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=00100000220265030002",
      }),
      processo({
        id: "proc-grupo-3",
        tribunal: "TRT3",
        numero_processo: "0010000-03.2026.5.03.0003",
        descricao: GROUP_DESCRIPTION,
        status: REPEATED_STATUS,
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=00100000320265030003",
      }),
    ]
  }

  it("identifica status narrativo redundante sem esconder status curto", () => {
    assert.equal(processStatusRepeatsDescription(repeatedProcesses()[0]), true)
    assert.equal(
      processStatusRepeatsDescription(
        processo({ descricao: GROUP_DESCRIPTION, status: "em_andamento" }),
      ),
      false,
    )
  })

  it("agrupa descrições iguais mesmo com status distintos, sem perder os status", () => {
    const groups = groupProcessosForDisplay([
      processo({ id: "status-a", descricao: GROUP_DESCRIPTION, status: "em_andamento" }),
      processo({ id: "status-b", descricao: GROUP_DESCRIPTION, status: "sentenca_confirmada" }),
    ])

    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0].map((item) => item.status), ["em_andamento", "sentenca_confirmada"])
  })

  it("aba Justiça mostra uma narrativa e preserva os três processos e fontes", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile ficha={fichaComResumo(repeatedProcesses())} initialTab="justica" />,
    )

    assert.equal(html.split(GROUP_DESCRIPTION).length - 1, 1)
    assert.match(html, /data-pf-process-group-size="3"/)
    assert.equal((html.match(/data-pf-processo-link=/g) ?? []).length, 3)
    assert.match(html, /0010000-01\.2026\.5\.03\.0001/)
    assert.match(html, /0010000-02\.2026\.5\.03\.0002/)
    assert.match(html, /0010000-03\.2026\.5\.03\.0003/)
    assert.doesNotMatch(html, new RegExp(REPEATED_STATUS))
  })

  it("Visão Geral mostra um único teaser para a narrativa compartilhada", () => {
    const html = renderToStaticMarkup(
      <ProfileOverview
        ficha={fichaComResumo(repeatedProcesses())}
        onNavigateTab={() => {}}
      />,
    )

    assert.equal(html.split(GROUP_DESCRIPTION).length - 1, 1)
    assert.match(html, /data-pf-process-group-size="3"/)
    assert.match(html, /3 processos relacionados/)
    assert.doesNotMatch(html, new RegExp(REPEATED_STATUS))
  })

  it("timeline mostra uma narrativa e um evento para o grupo", () => {
    const events = buildTimelineEvents(fichaComResumo(repeatedProcesses()))
    const processEvents = events.filter((event) => event.type === "processo")

    assert.equal(processEvents.length, 1)
    assert.equal(processEvents[0].label, "Civil, 3 processos")
    assert.equal(processEvents[0].description, GROUP_DESCRIPTION)
    assert.doesNotMatch(processEvents[0].description ?? "", new RegExp(REPEATED_STATUS))
  })
})
