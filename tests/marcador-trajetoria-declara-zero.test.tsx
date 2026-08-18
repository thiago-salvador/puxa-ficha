import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "../src/components/CandidatoProfile"
import { DeferredCandidatoProfile } from "../src/components/DeferredCandidatoProfile"
import type { FichaCandidato, HistoricoPolitico } from "../src/lib/types"

/**
 * O marcador `data-pf-trajetoria-count` é o que a prova da Fase 4 lê no primeiro
 * paint para saber quantos itens de trajetória a ficha declara.
 *
 * Ele só era emitido quando `historico.length > 0`. O perfil novo de Orleans,
 * criado pelo split de identidade e sem trajetória nenhuma, ficava então sem
 * marcador algum, e a prova esperava 30s por um atributo que nunca chegava. A
 * Fase 4 (run 31643039377) morreu ali, depois de vencer todo o resto.
 *
 * Uma ficha sem trajetória tem que declarar o estado. Zero sem verificação é
 * falso; ausência de marcador também seria silêncio.
 */

const HISTORICO_MINIMO: HistoricoPolitico = {
  id: "h-1",
  candidato_id: "cand-1",
  cargo: "Deputado Federal",
  cargo_canonico: "Deputado Federal",
  tipo_evento: "mandato",
  periodo_inicio: 2019,
  periodo_fim: 2023,
  partido: "TESTE",
  estado: "SP",
  eleito_por: "SP",
  observacoes: null,
  proveniencia: "tse",
}

function fichaCom(parcial: Partial<FichaCandidato>): FichaCandidato {
  return {
    id: "cand-1",
    slug: "ficha-de-teste",
    nome: "Ficha de Teste",
    nome_urna: "Ficha de Teste",
    partido: "TESTE",
    estado: "SP",
    cargo_disputado: "Deputado Federal",
    pontos_atencao: [],
    sancoes_administrativas: [],
    processos: [],
    historico: [],
    patrimonio: [],
    patrimonio_ausencias_oficiais: [],
    votos: [],
    mudancas_partido: [],
    financiamento: [],
    gastos_parlamentares: [],
    projetos_lei: [],
    sancoes_verificacao: null,
    processos_verificacao: null,
    trajetoria_verificacao: null,
    votacoes_verificacao: null,
    ...parcial,
  } as unknown as FichaCandidato
}

function contagemDeclarada(html: string): string | null {
  const achado = html.match(/data-pf-trajetoria-count="([^"]+)"/)
  return achado ? achado[1] : null
}

function partidosDeclarados(html: string): string | null {
  const achado = html.match(/data-pf-partidos-count="([^"]+)"/)
  return achado ? achado[1] : null
}

describe("marcador de trajetória distingue zero verificado de não coletado", () => {
  test("ficha sem trajetória nem verificação declara não coletado", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile ficha={fichaCom({ historico: [] })} initialTab="trajetoria" />,
    )
    assert.equal(
      contagemDeclarada(html),
      "nao_coletado",
      "ficha sem trajetória precisa declarar pendência, não um zero presumido",
    )
    assert.equal(partidosDeclarados(html), "nao_coletado")
  })

  test("ficha sem trajetória declara pendência na rota diferida", () => {
    const html = renderToStaticMarkup(
      <DeferredCandidatoProfile ficha={fichaCom({ historico: [] })} initialTab="trajetoria" />,
    )
    assert.equal(contagemDeclarada(html), "nao_coletado")
    assert.equal(partidosDeclarados(html), "nao_coletado")
  })

  test("vazio confirmado declara zero", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaCom({
          historico: [],
          trajetoria_verificacao: {
            resultado: "vazio_confirmado",
            executado_em: "2026-08-13T00:00:00Z",
          },
        })}
        initialTab="trajetoria"
      />,
    )
    assert.equal(contagemDeclarada(html), "0")
    assert.equal(partidosDeclarados(html), "0")
  })

  test("ficha com trajetória continua declarando a contagem real", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaCom({ historico: [HISTORICO_MINIMO] })}
        initialTab="trajetoria"
      />,
    )
    assert.equal(contagemDeclarada(html), "1")
  })
})
