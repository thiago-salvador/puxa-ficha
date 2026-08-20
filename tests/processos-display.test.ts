import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  PROCESS_STATUS_NEUTRAL,
  isProcessStatusNeutral,
  isTerminalProcessStatus,
  processoBorderColor,
  processoFonteLabel,
  processoPodeContarComoCriminal,
  processoTemporalLabel,
  processosMaiorVerificadoNaComparacao,
  processosOverviewDisplay,
  processosResumoLabel,
  processosListaCount,
} from "../src/lib/processos-display"
import { getProcessosEmptyState } from "../src/components/EmptyState"

describe("processosOverviewDisplay", () => {
  it("zero nunca vira '0': é ausência de verificação, não contagem", () => {
    assert.deepEqual(processosOverviewDisplay(0), { value: "—", sub: "não verificado" })
    assert.deepEqual(processosOverviewDisplay(null), { value: "—", sub: "não verificado" })
    assert.deepEqual(processosOverviewDisplay(undefined), { value: "—", sub: "não verificado" })
  })

  it("zero só aparece quando a coleta confirmou vazio no escopo", () => {
    assert.deepEqual(
      processosOverviewDisplay(0, 0, { resultado: "vazio_confirmado" }),
      { value: 0, sub: "escopo verificado" },
    )
  })

  it("contagem positiva continua numérica, com destaque criminal", () => {
    assert.deepEqual(processosOverviewDisplay(3, 1), { value: 3, sub: "1 criminal" })
    assert.deepEqual(processosOverviewDisplay(2, 0), { value: 2, sub: undefined })
  })
})

describe("processos encerrados", () => {
  const anulado = {
    status: "anulado",
    tipo: "criminal" as const,
    gravidade: "alta" as const,
    data_inicio: "2016-09-14",
    data_decisao: "2021-03-08",
  }

  it("remove semântica ativa de gravidade e usa a data da decisão", () => {
    assert.equal(isTerminalProcessStatus(anulado.status), true)
    assert.equal(processoBorderColor(anulado), "#d4d4d4")
    assert.deepEqual(processoTemporalLabel(anulado), {
      label: "Decisão em",
      date: "2021-03-08",
    })
  })
})

describe("comunicação processual sem mérito inferido", () => {
  const comunicacao = {
    status: PROCESS_STATUS_NEUTRAL,
    tipo: "criminal" as const,
    gravidade: null,
    data_inicio: null,
    data_decisao: null,
  }

  it("permanece neutra e fora do contador criminal", () => {
    assert.equal(isProcessStatusNeutral(comunicacao.status), true)
    assert.equal(isTerminalProcessStatus(comunicacao.status), false)
    assert.equal(processoBorderColor(comunicacao), "#d4d4d4")
    assert.equal(processoPodeContarComoCriminal(comunicacao), false)
    assert.equal(processoTemporalLabel(comunicacao), null)
  })

  it("usa a mesma regra no agregador-base consumido por API, overview e embeds", () => {
    const fonte = readFileSync("src/lib/api.ts", "utf8")
    assert.match(
      fonte,
      /processos_criminais: \(processos\.data \?\? \[\]\)\.filter\(processoPodeContarComoCriminal\)\.length/,
    )
    assert.doesNotMatch(
      fonte,
      /processos_criminais:[\s\S]{0,160}p\.tipo === ["']criminal["']/,
    )
  })
})

describe("processosMaiorVerificadoNaComparacao", () => {
  it("exibe o selo apenas para o maior quando todos foram verificados", () => {
    assert.equal(processosMaiorVerificadoNaComparacao(3, [3, 1]), true)
    assert.equal(processosMaiorVerificadoNaComparacao(1, [3, 1]), false)
  })

  it("não exibe o selo quando um selecionado não foi verificado", () => {
    assert.equal(processosMaiorVerificadoNaComparacao(3, [3, 0]), false)
    assert.equal(processosMaiorVerificadoNaComparacao(0, [3, 0]), false)
  })

  it("não exibe o selo quando todos têm zero não verificado", () => {
    assert.equal(processosMaiorVerificadoNaComparacao(0, [0, 0]), false)
  })
})

describe("processosResumoLabel", () => {
  /*
    2026-08-19: na lista compacta o texto longo quebrava o card no mobile.
    0 processos é o display da ausência de contagem, não afirmação de ficha
    limpa. A ficha continua em processosOverviewDisplay.
  */
  it("mostra 0 processos quando não há contagem verificada", () => {
    assert.equal(processosResumoLabel(0), "0 processos")
    assert.equal(processosResumoLabel(null), "0 processos")
    assert.equal(processosResumoLabel(1), "1 processo")
    assert.equal(processosResumoLabel(3), "3 processos")
  })

  it("a coluna numérica da lista usa 0 no mesmo caso", () => {
    assert.equal(processosListaCount(0), 0)
    assert.equal(processosListaCount(null), 0)
    assert.equal(processosListaCount(4), 4)
  })
})

describe("getProcessosEmptyState", () => {
  it("não afirma consulta que não houve, e nega a inferência de ficha limpa", () => {
    const estado = getProcessosEmptyState()
    const texto = `${estado.title} ${estado.description}`
    assert.ok(!texto.includes("bases consultadas"), "copy antiga afirmava consulta inexistente")
    assert.ok(!texto.toLowerCase().includes("nenhum processo encontrado"))
    assert.ok(texto.includes("não significa ficha limpa"))
    assert.ok(texto.includes("tentativa de busca"))
  })
})

describe("ComparadorPanel: a mesma régua do overview vale na comparação, a lista é compacta", () => {
  const fonte = readFileSync("src/components/ComparadorPanel.tsx", "utf-8")

  it("nenhuma superfície visível renderiza total_processos cru", () => {
    // O único `{candidato.total_processos}` que pode sobrar é o data-attribute.
    const semDataAttr = fonte.replace(/data-pf-comparador-processos=\{candidato\.total_processos\}/g, "")
    assert.doesNotMatch(semDataAttr, /(?<!\$)\{candidato\.total_processos\}/)
    assert.match(fonte, /processosOverviewDisplay\(candidato\.total_processos\)/)
    assert.match(fonte, /processosListaCount\(candidato\.total_processos\)/)
  })

  it("a lista compacta e o aria-label usam 0 processos, não o texto longo", () => {
    const ocorrencias = fonte.match(/processosResumoLabel\(candidato\.total_processos\)/g) ?? []
    assert.equal(ocorrencias.length, 2, "esperado no aria-label e na lista compacta")
    assert.doesNotMatch(fonte, /sem contagem de processos verificada/)
    assert.doesNotMatch(fonte, /sem contagem verificada/)
  })

  it("a lista não mostra colunas de votações nem de gastos, e a comparação não usa 0 de CEAP", () => {
    assert.doesNotMatch(fonte, /heading: "Votações"/)
    assert.doesNotMatch(fonte, /heading: "Gastos"/)
    assert.doesNotMatch(fonte, /heading: "Destaques"/)
    assert.doesNotMatch(fonte, /total_votos_mapeados\} votações/)
    assert.doesNotMatch(fonte, /sem gasto mapeado/)
    assert.match(fonte, /COMPARADOR_NAO_SE_APLICA/)
    assert.match(fonte, /heading: "Alertas graves"/)
    assert.doesNotMatch(fonte, /bg-destructive\/10/)
  })

  it("o atributo cru continua disponível e o selo usa a regra compartilhada", () => {
    assert.match(fonte, /data-pf-comparador-processos=\{candidato\.total_processos\}/)
    assert.match(fonte, /processosMaiorVerificadoNaComparacao\(/)
    assert.doesNotMatch(fonte, /candidato\.total_processos === max/)
  })
})

describe("CandidatoProfileSkeleton: a legenda não pode sumir na primeira pintura", () => {
  const fonte = readFileSync("src/components/DeferredCandidatoProfileClient.tsx", "utf-8")

  it("renderiza .sub junto com .value, calculando o display uma vez só", () => {
    // Só .value fazia o "—" aparecer sem "não verificado" durante o
    // carregamento, reintroduzindo a afirmação de ficha limpa que a PR desfaz.
    assert.match(fonte, /const processosDisplay = processosOverviewDisplay\(/)
    assert.match(fonte, /processosDisplay\.sub &&/)
    assert.doesNotMatch(fonte, /processosOverviewDisplay\(overview\.processos\)\.value/)
  })

  it("o atributo cru de overview segue intacto", () => {
    assert.match(fonte, /data-pf-overview-raw=\{overview\.processos\}/)
  })
})

describe("rótulo da fonte e absolvição", () => {
  it("portal judiciário continua Fonte oficial", () => {
    assert.equal(
      processoFonteLabel({
        status: "comunicacao_processual_publicada_merito_nao_inferido",
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=10399713220248260002",
      }),
      "Fonte oficial",
    )
  })

  it("absolvido com URL de imprensa vira Fonte jornalística e não conta no criminal", () => {
    const processo = {
      status: "absolvido",
      tipo: "criminal" as const,
      url_fonte:
        "https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml",
    }
    assert.equal(processoFonteLabel(processo), "Fonte jornalística")
    assert.equal(processoPodeContarComoCriminal(processo), false)
    assert.equal(isTerminalProcessStatus(processo.status), true)
  })
})
