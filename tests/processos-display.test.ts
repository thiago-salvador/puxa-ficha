import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  PROCESS_STATUS_NEUTRAL,
  isProcessStatusNeutral,
  isTerminalProcessStatus,
  processoBorderColor,
  processoPodeContarComoCriminal,
  processoTemporalLabel,
  processosMaiorVerificadoNaComparacao,
  processosOverviewDisplay,
  processosResumoLabel,
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
    Correção de 2026-08-10: o rótulo dizia "processos não verificados", que é
    falso para as fichas cuja busca judicial FOI feita e fechou como identidade
    não confirmada. O comparador só recebe a contagem, nunca o desfecho, então
    o texto passa a afirmar apenas o que é verdade nos dois casos.
  */
  it("afirma só a ausência de contagem, que vale com ou sem busca feita", () => {
    assert.equal(processosResumoLabel(0), "sem contagem de processos verificada")
    assert.equal(processosResumoLabel(null), "sem contagem de processos verificada")
    assert.equal(processosResumoLabel(1), "1 processo")
    assert.equal(processosResumoLabel(3), "3 processos")
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

describe("ComparadorPanel: a mesma régua do overview vale no comparador", () => {
  const fonte = readFileSync("src/components/ComparadorPanel.tsx", "utf-8")

  it("nenhuma superfície visível renderiza total_processos cru", () => {
    // As duas células que exibiam o número entravam em contradição com a
    // ficha: "0 processos" afirma busca ativa que não houve. O único
    // `{candidato.total_processos}` que pode sobrar é o data-attribute, que
    // por contrato carrega o valor cru.
    // O lookbehind deixa passar `${...}`: as interpolações que sobraram estão
    // dentro do ramo guardado por `total_processos > 0`, onde o número é real.
    const semDataAttr = fonte.replace(/data-pf-comparador-processos=\{candidato\.total_processos\}/g, "")
    assert.doesNotMatch(semDataAttr, /(?<!\$)\{candidato\.total_processos\}/)
    assert.match(fonte, /processosOverviewDisplay\(candidato\.total_processos\)/)
  })

  it("a lista compacta e o aria-label dizem não verificado em vez de zero", () => {
    const ocorrencias = fonte.match(/processosResumoLabel\(candidato\.total_processos\)/g) ?? []
    assert.equal(ocorrencias.length, 2, "esperado no aria-label e na lista compacta")
    assert.doesNotMatch(fonte, /\$\{candidato\.total_processos\} processos, /)
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
