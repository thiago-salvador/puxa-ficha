import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "../src/components/CandidatoProfile"
import { MoneyTabSection } from "../src/components/CandidatoProfileSections"
import {
  estadoValorPatrimonio,
  patrimonioTemValorComparavel,
  variacaoPatrimonialPct,
} from "../src/lib/patrimonio-contexto"
import { buildTimelineEvents } from "../src/lib/timeline-utils"
import type { BemDeclarado, FichaCandidato, Patrimonio } from "../src/lib/types"

function bem(descricao: string, valor: number): BemDeclarado {
  return { tipo: "Outros bens e direitos", descricao, valor }
}

function linha(ano: number, valor_total: number, bens: BemDeclarado[]): Patrimonio {
  return { id: `pat-${ano}`, candidato_id: "cand-1", ano_eleicao: ano, valor_total, bens }
}

// Formatos medidos nas 28 declarações de total zero publicadas (26/09/2026).
const SEM_BENS_2006 = linha(2006, 0, [bem("Nenhum bem a declarar", 0)])
const ANEXO_2006 = linha(2006, 0, [bem("Declaração de bens em anexo", 0)])
const LISTA_SEM_VALOR_2006 = linha(2006, 0, [bem("Imóvel rural", 0), bem("Automóvel", 0)])
const CONTA_ZERADA_2022 = linha(2022, 0, [bem("Conta corrente", 0)])
const VALOR_2020 = linha(2020, 75_000, [bem("Terra nua", 75_000)])

describe("estado do valor patrimonial", () => {
  test("classifica os quatro formatos de total zero pelos bens declarados", () => {
    assert.equal(estadoValorPatrimonio(VALOR_2020), "valor_informado")
    assert.equal(estadoValorPatrimonio(SEM_BENS_2006), "sem_bens_declarados")
    assert.equal(estadoValorPatrimonio(CONTA_ZERADA_2022), "bens_valor_zero")
    assert.equal(estadoValorPatrimonio(ANEXO_2006), "valor_nao_informado")
    assert.equal(estadoValorPatrimonio(LISTA_SEM_VALOR_2006), "valor_nao_informado")
    assert.equal(estadoValorPatrimonio(linha(2010, 0, [])), "valor_nao_informado")
    assert.equal(patrimonioTemValorComparavel(SEM_BENS_2006), true)
    assert.equal(patrimonioTemValorComparavel(ANEXO_2006), false)
  })

  test("0 -> X não tem porcentagem", () => {
    assert.equal(variacaoPatrimonialPct(SEM_BENS_2006, VALOR_2020), null)
    assert.equal(variacaoPatrimonialPct(ANEXO_2006, VALOR_2020), null)
  })

  test("X -> 0 é queda de 100% só quando o zero é declaração real", () => {
    const semBens2024 = { ...SEM_BENS_2006, ano_eleicao: 2024 }
    const anexo2024 = { ...ANEXO_2006, ano_eleicao: 2024 }
    assert.equal(variacaoPatrimonialPct(VALOR_2020, semBens2024), -100)
    assert.equal(variacaoPatrimonialPct(VALOR_2020, anexo2024), null)
  })

  test("X -> Y segue a conta de sempre", () => {
    assert.equal(variacaoPatrimonialPct(VALOR_2020, linha(2024, 150_000, [bem("Casa", 150_000)])), 100)
  })
})

function ficha(patrimonio: Patrimonio[]): FichaCandidato {
  return {
    id: "cand-1",
    slug: "ficha-de-teste",
    nome: "Ficha de Teste",
    nome_urna: "Ficha de Teste",
    partido: "TESTE",
    estado: "RR",
    cargo_disputado: "Governador",
    pontos_atencao: [],
    sancoes_administrativas: [],
    processos: [],
    historico: [],
    patrimonio,
    patrimonio_ausencias_oficiais: [],
    votos: [],
    mudancas_partido: [],
    financiamento: [],
    gastos_parlamentares: [],
    projetos_lei: [],
  } as unknown as FichaCandidato
}

function texto(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ")
}

function cartaoPatrimonio(html: string): string {
  const inicio = html.indexOf("data-pf-overview-patrimonio")
  assert.ok(inicio >= 0, "card de patrimônio ausente")
  return texto(html.slice(inicio, html.indexOf("Trocas de partido", inicio)))
}

describe("card de patrimônio da ficha", () => {
  test("0 -> X (caso farah-mesquita) não mostra seta nem porcentagem", () => {
    const card = cartaoPatrimonio(renderToStaticMarkup(<CandidatoProfile ficha={ficha([SEM_BENS_2006, VALOR_2020])} initialTab="geral" />))
    assert.doesNotMatch(card, /[↓↑]/)
    assert.doesNotMatch(card, /%/)
  })

  test("X -> 0 com declaração de ausência de bens mostra a queda real", () => {
    const semBens2022 = { ...SEM_BENS_2006, id: "pat-2022", ano_eleicao: 2022 }
    const card = cartaoPatrimonio(renderToStaticMarkup(<CandidatoProfile ficha={ficha([VALOR_2020, semBens2022])} initialTab="geral" />))
    assert.match(card, /↓ 100% \(2020-2022\)/)
  })

  test("ano ausente: registro único não tem porcentagem e o zero ganha rótulo", () => {
    const card = cartaoPatrimonio(renderToStaticMarkup(<CandidatoProfile ficha={ficha([SEM_BENS_2006])} initialTab="geral" />))
    assert.doesNotMatch(card, /%/)
    assert.match(card, /Declarou não ter bens \(2006\)/)
  })

  test("zero que é anexo não vira R$ 0", () => {
    const card = cartaoPatrimonio(renderToStaticMarkup(<CandidatoProfile ficha={ficha([ANEXO_2006])} initialTab="geral" />))
    assert.doesNotMatch(card, /R\$\s*0/)
    assert.match(card, /Valor não informado nos dados abertos \(2006\)/)
  })
})

describe("aba Dinheiro e linha do tempo", () => {
  const renderMoney = (patrimonio: Patrimonio[]) =>
    texto(
      renderToStaticMarkup(
        <MoneyTabSection
          patrimonio={patrimonio}
          patrimonioEleicoes={[]}
          financiamento={[]}
          doadoresRecorrentes={null}
          financiamentoEleicoes={[]}
          historico={[]}
          gastos={[]}
          transparencia={[]}
          gastosExecutivo={[]}
          historicoLength={0}
          suggestion={null}
          highlightTimelineRef={null}
        />,
      ),
    )

  test("cada total zero aparece com o que ele significa", () => {
    const money = renderMoney([ANEXO_2006, VALOR_2020])
    assert.match(money, /Valor não informado nos dados abertos/)
    assert.doesNotMatch(money, /R\$\s*0(?![\d.,])/)
    const semBens = renderMoney([SEM_BENS_2006, VALOR_2020])
    assert.match(semBens, /Declarou não ter bens/)
  })

  test("timeline não calcula variação a partir de base zero nem até zero sem valor", () => {
    const eventos = buildTimelineEvents(ficha([SEM_BENS_2006, VALOR_2020, { ...ANEXO_2006, id: "pat-2024", ano_eleicao: 2024 }]))
      .filter((evento) => evento.type === "patrimonio")
    const porAno = new Map(eventos.map((evento) => [evento.year_start, evento]))
    assert.equal(porAno.get(2020)?.description, undefined)
    assert.equal(porAno.get(2024)?.description, undefined)
    assert.equal(porAno.get(2024)?.value, undefined)
    assert.match(porAno.get(2006)?.value_formatted ?? "", /Declarou não ter bens/)
  })
})
