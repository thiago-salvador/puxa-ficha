import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "../src/components/CandidatoProfile"
import { MoneyTabSection } from "../src/components/CandidatoProfileSections"
import { DeferredCandidatoProfile } from "../src/components/DeferredCandidatoProfile"
import { EmbedWidget } from "../src/components/EmbedWidget"
import { alertaEvolucaoPatrimonialVs2026, evolucaoPatrimonialVs2026 } from "../src/lib/evolucao-patrimonial"
import {
  estadoValorPatrimonio,
  parseValorPatrimonio,
  patrimonioTemValorComparavel,
  variacaoPatrimonialPct,
} from "../src/lib/patrimonio-contexto"
import { humanizarDetalheAusenciaPatrimonio } from "../src/lib/public-profile-dto"
import { extractCardData } from "../src/lib/social-card"
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
    assert.equal(estadoValorPatrimonio(linha(2010, 0, [])), "zero_sem_detalhamento")
    assert.equal(patrimonioTemValorComparavel(linha(2010, 0, [])), true)
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

describe("classificador: formas de sem bens, itens inconsistentes e total fora do tipo", () => {
  test("variações de 'não tenho bens' contam como declaração de ausência", () => {
    for (const descricao of ["Nada a declarar", "Não possui bens", "NÃO POSSUI NENHUM BEM", "Declara não possuir bens", "Sem bens"]) {
      assert.equal(estadoValorPatrimonio(linha(2010, 0, [bem(descricao, 0)])), "sem_bens_declarados", descricao)
    }
  })

  test("total zero com item de valor positivo ou sem valor não é zero declarado", () => {
    assert.equal(estadoValorPatrimonio(linha(2010, 0, [bem("Casa", 150_000)])), "valor_nao_informado")
    const semValor = { ...linha(2010, 0, []), bens: [{ tipo: "Casa", descricao: "Casa", valor: null as unknown as number }] }
    assert.equal(estadoValorPatrimonio(semValor), "valor_nao_informado")
  })

  test("total null é não informado; texto com R$ é lido ou vira não informado", () => {
    assert.equal(estadoValorPatrimonio({ valor_total: null, bens: [bem("Nenhum bem a declarar", 0)] }), "valor_nao_informado")
    assert.equal(parseValorPatrimonio("R$ 75.000,00"), 75_000)
    assert.equal(parseValorPatrimonio("75000.50"), 75_000.5)
    assert.equal(parseValorPatrimonio("R$ 0"), 0)
    assert.equal(parseValorPatrimonio("não informado"), null)
    assert.equal(estadoValorPatrimonio({ valor_total: "R$ 75.000,00", bens: [] }), "valor_informado")
    assert.equal(estadoValorPatrimonio({ valor_total: "R$ ???", bens: [] }), "valor_nao_informado")
    assert.equal(variacaoPatrimonialPct({ valor_total: "R$ 100,00" }, { valor_total: "R$ 150,00" }), 50)
  })
})

describe("série da lista pública (2026 contra o ano anterior)", () => {
  const anexo2022 = { ano_eleicao: 2022, valor_total: 0, bens: [bem("Declaração em anexo", 0)] }
  const semBens2022 = { ano_eleicao: 2022, valor_total: 0, bens: [bem("Nenhum bem a declarar", 0)] }
  const alvo2026 = { ano_eleicao: 2026, valor_total: 2_000_000, bens: [bem("Casa", 2_000_000)] }

  test("zero que é anexo sai da série como linha inválida", () => {
    const valida2018 = { ano_eleicao: 2018, valor_total: 500_000, bens: [bem("Casa", 500_000)] }
    assert.equal(evolucaoPatrimonialVs2026([valida2018, anexo2022, alvo2026]), 300)
    assert.equal(alertaEvolucaoPatrimonialVs2026([anexo2022, alvo2026]), null)
  })

  test("zero declarado segue como base do aumento absoluto, sem porcentagem", () => {
    assert.equal(evolucaoPatrimonialVs2026([semBens2022, alvo2026]), null)
    assert.equal(alertaEvolucaoPatrimonialVs2026([semBens2022, alvo2026])?.aumento, 2_000_000)
  })
})

describe("superfícies fora da ficha", () => {
  test("social card não imprime R$ 0 para valor não informado", () => {
    assert.equal(extractCardData(ficha([ANEXO_2006]), null).patrimonio, "N/D")
    assert.notEqual(extractCardData(ficha([SEM_BENS_2006]), null).patrimonio, "N/D")
  })

  test("embed mostra o que o zero significa", () => {
    const anexo = texto(renderToStaticMarkup(<EmbedWidget ficha={ficha([ANEXO_2006])} />))
    assert.match(anexo, /Valor não informado nos dados abertos \(2006\)/)
    const semBens = texto(renderToStaticMarkup(<EmbedWidget ficha={ficha([SEM_BENS_2006])} />))
    assert.match(semBens, /Declarou não ter bens \(2006\)/)
  })

  test("indicador da rota diferida não publica zero para valor não informado", () => {
    const html = renderToStaticMarkup(<DeferredCandidatoProfile ficha={ficha([ANEXO_2006])} initialTab="geral" />)
    assert.match(html, /data-pf-overview-patrimonio="N\/D"/)
  })

  test("gráfico da aba Dinheiro conta só os anos comparáveis", () => {
    const html = renderToStaticMarkup(
      <MoneyTabSection
        patrimonio={[ANEXO_2006, VALOR_2020]}
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
    )
    assert.doesNotMatch(html, /data-pf-patrimonio-chart/)
  })

  test("recibo 'para este sequencial' com ST_DECLARAR_BENS = N vira texto público", () => {
    const detalhe =
      "Pacote complementar do TSE declara ST_DECLARAR_BENS = N para este sequencial: o candidato informou nao possuir bens a declarar. Ausencia PROVADA pela fonte, nao lacuna de coleta."
    const publico = humanizarDetalheAusenciaPatrimonio(detalhe) ?? ""
    assert.doesNotMatch(publico, /ST_DECLARAR_BENS|PROVADA|nao /)
    assert.match(publico, /Nenhum registro de bens foi localizado/)
  })
})
