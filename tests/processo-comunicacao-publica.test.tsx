import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "@/components/CandidatoProfile"
import type { FichaCandidato } from "@/lib/types"

const DESCRICAO =
  "O DJEN registra comunicação processual oficial no processo 0000000-00.2026.0.00.0000, " +
  "na classe Ação Penal, perante Vara Única (TJ). O candidato consta no polo ativo. " +
  "A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho."

function fichaComComunicacao(): FichaCandidato {
  return {
    id: "cand-judicial",
    slug: "candidato-judicial",
    nome_completo: "Pessoa Candidata",
    nome_urna: "Pessoa",
    partido_atual: "Partido",
    partido_sigla: "PTD",
    cargo_disputado: "Governador",
    status: "candidato",
    fonte_dados: ["DJEN"],
    ultima_atualizacao: "2026-08-10T00:00:00Z",
    processos: [
      {
        id: "proc-comunicacao",
        candidato_id: "cand-judicial",
        tipo: "criminal",
        tribunal: "TJ",
        numero_processo: "0000000-00.2026.0.00.0000",
        descricao: DESCRICAO,
        status: "comunicacao_processual_publicada_merito_nao_inferido",
        data_inicio: null,
        data_decisao: null,
        gravidade: null,
        fonte: "DJEN",
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=00000000020260000000",
      },
    ],
    total_processos: 1,
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

describe("comunicação processual no DOM público", () => {
  it("expõe polo e fonte sem inventar gravidade, mérito ou intervalo", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile ficha={fichaComComunicacao()} initialTab="justica" />,
    )

    assert.match(html, /Comunicações processuais/)
    assert.match(html, /mérito não inferido/i)
    assert.match(html, /polo ativo/)
    assert.match(html, /Fonte oficial/)
    assert.match(html, /comunica\.pje\.jus\.br\/consulta/)
    assert.doesNotMatch(html, /comunicaapi\.pje\.jus\.br/)
    assert.doesNotMatch(html, />Média</)
    assert.doesNotMatch(html, /1 criminal/)
    assert.doesNotMatch(html, />Desde</)
  })

  it("absolvição jornalística vai para Histórico, sem CNJ e sem contar no criminal", () => {
    const descricao =
      "Renan Santos foi absolvido pela Justiça de São Paulo em processo no qual era acusado de estupro. " +
      "O Ministério Público de São Paulo confirmou ao g1, em 4 de agosto de 2026, que a Promotoria pediu a absolvição após a instrução, por insuficiência de provas, e que a Justiça acolheu o pedido. " +
      "O processo tramitou em segredo de Justiça para preservar a identidade da denunciante. O número do processo não é público. " +
      "As informações desta linha vêm de cobertura jornalística ampla. O status de absolvido foi confirmado pelo Ministério Público de São Paulo, não por consulta aos autos."
    const ficha = fichaComComunicacao()
    ficha.processos = [
      {
        id: "proc-absolvido",
        candidato_id: ficha.id,
        tipo: "criminal",
        tribunal: "Justiça de São Paulo",
        numero_processo: null,
        descricao,
        status: "absolvido",
        data_inicio: null,
        data_decisao: null,
        gravidade: null,
        fonte: "g1, confirmação do MP-SP",
        url_fonte:
          "https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml",
      },
      {
        id: "proc-civel",
        candidato_id: ficha.id,
        tipo: "civil",
        tribunal: "TJSP",
        numero_processo: "1039971-32.2024.8.26.0002",
        descricao:
          "Procedimento comum cível de indenização por dano moral no TJSP, Foro Regional II de Santo Amaro. O candidato consta no polo passivo.",
        status: "comunicacao_processual_publicada_merito_nao_inferido",
        data_inicio: null,
        data_decisao: null,
        gravidade: null,
        fonte: "DJEN",
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=10399713220248260002",
      },
    ]
    ficha.total_processos = 2

    const html = renderToStaticMarkup(
      <CandidatoProfile ficha={ficha} initialTab="justica" />,
    )

    assert.match(html, /Histórico judicial/)
    assert.match(html, />Absolvido</)
    assert.match(html, /Fonte jornalística/)
    assert.match(html, /número do processo não é público/)
    assert.match(html, /g1\.globo\.com/)
    assert.match(html, /Procedimento comum cível de indenização por dano moral/)
    assert.match(html, /Fonte oficial/)
    assert.match(html, /comunica\.pje\.jus\.br\/consulta\?numeroProcesso=10399713220248260002/)
    assert.doesNotMatch(html, /1 criminal/)
    assert.doesNotMatch(html, /comunicaapi\.pje\.jus\.br/)
  })
})
