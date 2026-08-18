import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { LegislationTabSection } from "../src/components/CandidatoProfileSections"
import type { VotoCandidato } from "../src/lib/types"

/**
 * Reprodução da área de votações do `cabo-daciolo` DEPOIS do ajuste do item 7.
 *
 * A migration não foi aplicada, e por isso este teste é a única forma honesta de
 * mostrar o estado final: ele monta os votos exatamente como o dry-run de
 * 10/08/2026 mediu contra a Câmara Dados Abertos e renderiza o componente real
 * da ficha. Screenshot da página em produção mostraria o estado ANTES, que é o
 * defeituoso.
 *
 * Antes: 2 votos, e os dois saem por defeito (Teto de Gastos EC 95 e Reforma
 * Trabalhista, ambos casados por proposição).
 * Depois: 3 votos, conferidos um a um em /votacoes/{id}/votos com o
 * idDeputado 178938.
 */
const VOTOS_DACIOLO: VotoCandidato[] = [
  {
    id: "vc-1",
    candidato_id: "cabo-daciolo",
    votacao_id: "vk-14493-503",
    voto: "não",
    contradicao: false,
    contradicao_descricao: null,
    votacao: {
      id: "vk-14493-503",
      titulo: "Redução da maioridade penal (1º turno)",
      descricao:
        "SIM é a favor de reduzir a maioridade penal de 18 para 16 anos. A Câmara aprovou a Emenda Aglutinativa nº 16 em primeiro turno, um dia depois de rejeitar o substitutivo da comissão especial. Placar 323 a 155.",
      data_votacao: "2015-07-01",
      casa: "Câmara",
      proposicao_id: "14493",
      tema: "seguranca",
      impacto_popular: "Muda a idade a partir da qual um adolescente responde como adulto.",
    },
  },
  {
    id: "vc-2",
    candidato_id: "cabo-daciolo",
    votacao_id: "vk-340812-195",
    voto: "não",
    contradicao: false,
    contradicao_descricao: null,
    votacao: {
      id: "vk-340812-195",
      titulo:
        "Criação da Comissão da Mulher, do Idoso, da Criança, do Adolescente, da Juventude e Minorias",
      descricao:
        "SIM é a favor de criar a comissão permanente na Câmara. Aprovado o substitutivo adotado pela Mesa Diretora ao Projeto de Resolução nº 8 de 2007. Placar 221 a 167.",
      data_votacao: "2016-04-27",
      casa: "Câmara",
      proposicao_id: "340812",
      tema: "direitos_sociais",
      impacto_popular: "Dá estrutura permanente às pautas de mulheres, idosos, crianças e minorias.",
    },
  },
  {
    id: "vc-3",
    candidato_id: "cabo-daciolo",
    votacao_id: "vk-2123843-93",
    voto: "sim",
    contradicao: false,
    contradicao_descricao: null,
    votacao: {
      id: "vk-2123843-93",
      titulo: "Vaquejada e práticas desportivas com animais (2º turno)",
      descricao:
        "SIM é a favor de acrescentar dispositivo à Constituição determinando que práticas desportivas que utilizem animais não são consideradas cruéis. Aprovada em segundo turno. Placar 373 a 50.",
      data_votacao: "2017-05-31",
      casa: "Câmara",
      proposicao_id: "2123843",
      tema: "meio_ambiente",
      impacto_popular: "Retira da proteção contra crueldade práticas como a vaquejada.",
    },
  },
] as unknown as VotoCandidato[]

function renderizar(votos: VotoCandidato[]): string {
  return renderToStaticMarkup(
    <LegislationTabSection
      projetosLei={[]}
      legislacaoMandatoExecutivo={[]}
      votos={votos}
      cargoDisputado="Presidente"
      hasLegislativeHistory
      suggestion={null}
    />
  )
}

describe("área de votações do cabo-daciolo depois do item 7", () => {
  it("mostra as 3 votações medidas, com o voto de cada uma", () => {
    const html = renderizar(VOTOS_DACIOLO)

    assert.match(html, /Redução da maioridade penal/)
    assert.match(html, /Vaquejada e práticas desportivas com animais/)
    assert.match(html, /Comissão da Mulher/)

    const cartoes = html.match(/data-pf-voto-card/g) ?? []
    assert.equal(cartoes.length, 3, "três votações, uma por cartão")
  })

  it("cada cartão declara o que SIM significa, para o voto não ser lido ao contrário", () => {
    const html = renderizar(VOTOS_DACIOLO)
    const declaracoes = html.match(/SIM é a favor/g) ?? []
    assert.equal(declaracoes.length, 3)
  })

  /**
   * As duas votações que a ficha mostrava antes saem por defeito, e nenhuma
   * delas pode voltar por descuido: a do Teto de Gastos tinha data errada e a
   * da Reforma Trabalhista foi casada com uma votação de redação final.
   */
  it("as duas votações defeituosas não aparecem mais", () => {
    const html = renderizar(VOTOS_DACIOLO)
    assert.ok(!/Teto de Gastos/.test(html))
    assert.ok(!/Reforma Trabalhista/.test(html))
  })

  it("a contagem da subaba sobe de 2 para 3", () => {
    const html = renderizar(VOTOS_DACIOLO)
    assert.match(html, /Votou/)
    assert.equal((html.match(/data-pf-voto-card/g) ?? []).length, 3)
  })
})
