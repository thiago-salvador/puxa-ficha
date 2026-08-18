import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "../src/components/CandidatoProfile"
import type { FichaCandidato, PontoAtencao } from "../src/lib/types"

const ALERTA: PontoAtencao = {
  id: "alerta-1",
  candidato_id: "cand-1",
  categoria: "contradição",
  titulo: "Alerta editorial",
  descricao: "Descrição do alerta",
  fontes: [],
  gravidade: "media",
  verificado: true,
  gerado_por: "curadoria",
}

const POSITIVO: PontoAtencao = {
  id: "positivo-1",
  candidato_id: "cand-1",
  categoria: "feito_positivo",
  titulo: "Ponto positivo editorial",
  descricao: "Descrição do ponto positivo",
  fontes: [],
  gravidade: "baixa",
  verificado: true,
  gerado_por: "curadoria",
}

function renderDestaques(parcial: Partial<FichaCandidato>): string {
  const ficha = {
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
  return renderToStaticMarkup(<CandidatoProfile ficha={ficha} initialTab="alertas" />)
}

function texto(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
}

describe("aba Destaques reordenada", () => {
  test("renderiza somente Alertas, Pontos positivos e Estado das outras fontes, nessa ordem", () => {
    const html = renderDestaques({
      pontos_atencao: [ALERTA, POSITIVO],
      historico: [{
        id: "mandato-1",
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
      }],
      patrimonio: [{
        id: "patrimonio-1",
        candidato_id: "cand-1",
        ano_eleicao: 2022,
        valor_total: 100_000,
        bens: [],
      }],
      votos: [{
        id: "voto-1",
        candidato_id: "cand-1",
        votacao_id: "votacao-1",
        voto: "sim",
        contradicao: false,
        contradicao_descricao: null,
        votacao: {
          id: "votacao-1",
          titulo: "Votação de teste",
          descricao: "Descrição",
          data_votacao: "2022-01-01",
          casa: "Câmara",
          proposicao_id: "1",
          tema: "teste",
          impacto_popular: "Teste",
        },
      }],
      processos: [{ id: "processo-1", candidato_id: "cand-1", descricao: "Processo", status: "em andamento" }],
    } as unknown as Partial<FichaCandidato>)
    const conteudo = texto(html)
    const alertas = conteudo.indexOf("Alertas (1)")
    const positivos = conteudo.indexOf("Pontos positivos (1)")
    const fontes = conteudo.indexOf("Estado das outras fontes")

    assert.ok(alertas >= 0)
    assert.ok(positivos > alertas)
    assert.ok(fontes > positivos)
    for (const removida of [
      "Processos judiciais",
      "Mandatos exercidos",
      "Patrimônio declarado",
      "Votações-chave",
    ]) {
      assert.ok(!conteudo.includes(removida), removida)
    }
    assert.doesNotMatch(html, /data-pf-(?:processo|mandato|patrimonio|votacao|sancao)-destaque/)
  })

  test("contador da aba, overview e cabeçalho contam apenas alertas e positivos", () => {
    const html = renderDestaques({
      pontos_atencao: [ALERTA, POSITIVO],
      historico: [{
        id: "mandato-1",
        candidato_id: "cand-1",
        cargo: "Deputado Federal",
        tipo_evento: "mandato",
        periodo_inicio: 2019,
      }],
    } as unknown as Partial<FichaCandidato>)
    assert.match(html, /data-pf-overview-destaques="2"/)
    assert.match(texto(html), /Destaques \(2\)/)
    assert.equal((html.match(/data-pf-ponto-destaque=/g) ?? []).length, 2)
  })

  test("sem item editorial, categorias continuam fora e o rodapé de fontes permanece", () => {
    const html = renderDestaques({
      historico: [{
        id: "mandato-1",
        candidato_id: "cand-1",
        cargo: "Deputado Federal",
        tipo_evento: "mandato",
        periodo_inicio: 2019,
      }],
    } as unknown as Partial<FichaCandidato>)
    assert.match(texto(html), /Destaques \(0\)/)
    assert.match(texto(html), /Estado das outras fontes/)
    assert.doesNotMatch(html, /data-pf-mandato-destaque/)
  })
})
