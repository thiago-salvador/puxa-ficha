import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { LegislationTabSection } from "../src/components/CandidatoProfileSections"
import { LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT } from "../src/lib/fetch-gastos-votos-in-batch"
import type { LegislacaoMandatoExecutivo } from "../src/lib/types"

const COVERAGE_ID_CAIADO = "ronaldo-caiado-go-completo-leis-2019-01-01-2026-03-27"
const TOTAL_CAIADO = 3600

function buildAtoExecutivo(index: number): LegislacaoMandatoExecutivo {
  return {
    id: `lme-${index}`,
    candidato_id: "cand-1",
    historico_politico_id: null,
    tipo_relacao: "lei_sancionada",
    esfera: "estadual",
    uf_norma: "GO",
    municipio_norma: null,
    tipo_norma: "lei",
    numero: String(index),
    ano: 2026,
    data_norma: `2026-03-${String((index % 27) + 1).padStart(2, "0")}`,
    ementa: `Institui programa de saude e assistencia social ${index}`,
    signatario: "RONALDO CAIADO",
    autoridade_papel: "titular",
    fonte_primaria_url: "https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/1",
    fonte_primaria_titulo: "Legisla Goias",
    fonte_tramitacao_url: null,
    identificador_fonte: `LEGISLA-GO:${index}`,
    metadata: { coverage_id: COVERAGE_ID_CAIADO },
    created_at: "2026-03-27T00:00:00.000Z",
  }
}

const previa = Array.from({ length: LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT }, (_, i) =>
  buildAtoExecutivo(i),
)

function renderLegislationTab(props: Partial<Parameters<typeof LegislationTabSection>[0]> = {}) {
  return renderToStaticMarkup(
    <LegislationTabSection
      projetosLei={[]}
      legislacaoMandatoExecutivo={previa}
      votos={[]}
      cargoDisputado="Presidente"
      hasLegislativeHistory={false}
      suggestion={null}
      {...props}
    />,
  )
}

describe("aba Legislação com o inventário do Executivo carregado sob demanda", () => {
  it("renderiza a aba com a prévia e conta o acervo inteiro", () => {
    const html = renderLegislationTab({
      legislacaoExecutivoTotal: TOTAL_CAIADO,
      legislacaoExecutivoLoadState: "loading",
    })

    // A aba existe e desenhou as sub-abas.
    assert.match(html, /Executivo/)
    assert.match(html, /Destaques/)

    // A contagem exibida é a do acervo, não a dos 25 que chegaram.
    assert.match(html, new RegExp(String(TOTAL_CAIADO)))

    // E o leitor é avisado de que o restante está a caminho.
    assert.match(html, /Carregando o inventário completo do Executivo/)
  })

  it("nunca afirma completude sobre o tamanho da prévia", () => {
    const html = renderLegislationTab({ legislacaoExecutivoTotal: TOTAL_CAIADO })
    assert.doesNotMatch(html, /completo de 25 atos/)
  })

  it("avisa quando o inventário não pôde ser carregado, sem esconder a prévia", () => {
    const html = renderLegislationTab({
      legislacaoExecutivoTotal: TOTAL_CAIADO,
      legislacaoExecutivoLoadState: "failed",
    })

    assert.match(html, /Não foi possível carregar os 3600 atos do Executivo agora/)
    // A prévia continua na tela: a falha degrada, não apaga.
    assert.match(html, /Institui programa de saude e assistencia social/)
  })

  it("com o inventário completo em mãos, a aba não mostra aviso nenhum", () => {
    const completo = Array.from({ length: 120 }, (_, i) => buildAtoExecutivo(i))
    const html = renderLegislationTab({
      legislacaoMandatoExecutivo: completo,
      legislacaoExecutivoTotal: completo.length,
      legislacaoExecutivoLoadState: "loaded",
    })

    assert.doesNotMatch(html, /Carregando o inventário completo do Executivo/)
    assert.doesNotMatch(html, /Não foi possível carregar os/)
    assert.match(html, new RegExp(`inventário completo de ${completo.length} atos`))
  })
})

describe("rotulo do recorte de destaques do Executivo", () => {
  // Regressao de 08/08/2026. O selo era "Destaque editorial", mas a selecao deste
  // recorte e algoritmica (scoreLegislationTextPublicRelevance, regex de palavra-chave
  // na ementa) e `legislacao_mandato_executivo` nao tem campo de curadoria: medido no
  // banco, 4 de 14.061 linhas de projetos_lei tem destaque editorial de verdade, e a
  // tabela do Executivo nao tem a coluna. Prometer julgamento editorial onde ha
  // heuristica e a mesma classe de erro dos alertas que eram so ausencia de mandato.
  it("nomeia o critério real e não promete curadoria que não existe", () => {
    const html = renderLegislationTab({
      legislacaoExecutivoTotal: TOTAL_CAIADO,
      legislacaoExecutivoLoadState: "loaded",
    })

    assert.match(html, /Relev[aâ]ncia p[uú]blica/)
    assert.doesNotMatch(
      html,
      /Destaque editorial/,
      "o selo editorial pertence a lista parlamentar, condicionado a projeto.destaque",
    )
  })
})
