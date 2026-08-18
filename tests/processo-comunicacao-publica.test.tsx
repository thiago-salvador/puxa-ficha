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
        url_fonte: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=1",
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
    assert.match(html, /comunicaapi\.pje\.jus\.br/)
    assert.doesNotMatch(html, />Média</)
    assert.doesNotMatch(html, /1 criminal/)
    assert.doesNotMatch(html, />Desde</)
  })
})
