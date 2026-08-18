import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  descreverEstadoDaFonte,
  estadoDaFonte,
  fechaCobertura,
  montarDestaquesDaFicha,
  sancaoVigente,
} from "../src/lib/destaques-ficha"
import type { PontoAtencao, Processo, SancaoAdministrativa, SancoesVerificacao } from "../src/lib/types"

/**
 * Itens 4 e 14, testados EXCLUSIVAMENTE contra as fixtures que a Trilha B
 * publicou no contrato B-E2. Nenhum dado inventado aqui: tudo o que este arquivo
 * usa sai de `QA/contratos/trilha-b-fixtures.json`, e é por isso que o teste
 * carrega o JSON em vez de repetir os objetos à mão. Fixture copiada vira
 * fixture desatualizada no dia em que a B mudar a forma.
 */
const FIXTURES = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "QA", "contratos", "trilha-b-fixtures.json"), "utf8")
) as Record<string, Record<string, unknown>>

const sancaoEncontrada = (FIXTURES.sancoes_administrativas
  .encontrado_SancaoAdministrativa as SancaoAdministrativa[])
const processoEncontrado = FIXTURES.processos.encontrado as Processo[]
const pontoCurado = FIXTURES.pontos_atencao.curado as PontoAtencao[]

const VERIF = FIXTURES.sancoes_verificacao as Record<string, SancoesVerificacao>
const HOJE = new Date("2026-08-10T12:00:00Z")

function montar(over: Partial<Parameters<typeof montarDestaquesDaFicha>[0]> = {}) {
  return montarDestaquesDaFicha({
    pontosAtencao: [],
    sancoes: [],
    processos: [],
    hoje: HOJE,
    ...over,
  })
}

describe("fixtures do contrato B-E2 (itens 4 e 14)", () => {
  test("as fixtures que este teste consome existem e têm a forma esperada", () => {
    assert.ok(sancaoEncontrada.length >= 2, "o contrato publica ao menos 2 sanções")
    assert.ok(processoEncontrado.length >= 1)
    assert.ok(pontoCurado.length >= 1)
    for (const chave of ["encontrado", "vazio_confirmado", "erro", "indeterminado"]) {
      assert.ok(VERIF[chave], `falta a fixture de sancoes_verificacao.${chave}`)
    }
  })

  test("o vocabulário fechado do contrato é o que o módulo trata", () => {
    const vocabulario = (FIXTURES.estados_terminais as Record<string, string[]>)
      .$vocabulario_fechado
    assert.deepEqual(
      [...vocabulario].sort(),
      ["encontrado", "erro", "indeterminado", "nao_aplicavel", "sem_achado_no_escopo", "vazio_confirmado"]
    )
    // Todo estado do vocabulário tem tradução, e nenhuma delas é silêncio.
    for (const resultado of vocabulario) {
      const estado = estadoDaFonte(false, { resultado, executado_em: "2026-08-09T14:02:11.000Z" } as SancoesVerificacao)
      assert.notEqual(estado.tipo, "tem_conteudo", resultado)
      assert.ok(descreverEstadoDaFonte({ chave: "sancoes", rotulo: "x", estado, categoria: "factual" }).length > 0, resultado)
    }
  })
})

describe("conteúdo real encontrado aparece (itens 4 e 14)", () => {
  /**
   * O caminho que o contrato obrigou a existir: sanção NÃO vira ponto de
   * atenção, então se ela não entrar por caminho próprio a ficha some com
   * conteúdo verificado que ela já tem.
   */
  test("sanção encontrada permanece na fonte Justiça sem duplicar na aba Destaques", () => {
    const d = montar({
      sancoes: sancaoEncontrada,
      sancoesVerificacao: VERIF.encontrado,
    })
    assert.equal(d.pontosAtencao.length, 0, "o contrato proíbe sanção em pontos_atencao")
    assert.equal(d.totalExibido, 0)
    assert.equal(d.vazioHonesto, false)
    assert.equal(d.vazioPorNaoVerificado, true)
  })

  test("processo curado encontrado permanece fora da contagem editorial", () => {
    const d = montar({ processos: processoEncontrado, processosVerificacao: VERIF.encontrado })
    assert.equal(d.totalExibido, 0)
  })

  test("ponto de atenção curado continua aparecendo", () => {
    const d = montar({ pontosAtencao: pontoCurado })
    assert.equal(d.totalExibido, pontoCurado.length)
  })

  /**
   * Contrato 1.1: vigência sai de `data_fim`, e expirada CONTINUA na lista.
   * Somar a lista inteira como vigente anunciaria como atual o que já acabou.
   */
  test("sanção expirada continua na lista, separada da vigente", () => {
    const [primeira] = sancaoEncontrada
    const expirada = { ...primeira, id: "expirada", data_fim: "2020-01-01" }
    const semFim = { ...primeira, id: "sem-fim", data_fim: null }
    const d = montar({ sancoes: [expirada, semFim], sancoesVerificacao: VERIF.encontrado })

    assert.deepEqual(d.sancoesVigentes.map((s) => s.id), ["sem-fim"])
    assert.deepEqual(d.sancoesExpiradas.map((s) => s.id), ["expirada"])
    assert.equal(d.totalExibido, 0, "sanções não inflam a contagem editorial")
  })

  test("data_fim nula e data_fim futura contam como vigente", () => {
    const [base] = sancaoEncontrada
    assert.equal(sancaoVigente({ ...base, data_fim: null }, HOJE), true)
    assert.equal(sancaoVigente({ ...base, data_fim: "2030-01-01" }, HOJE), true)
    assert.equal(sancaoVigente({ ...base, data_fim: "2026-08-10" }, HOJE), true, "vence no fim do dia")
    assert.equal(sancaoVigente({ ...base, data_fim: "2026-08-09" }, HOJE), false)
  })
})

describe("ausência confirmada vira estado vazio honesto, e só ela (itens 4 e 14)", () => {
  /**
   * `vazioHonesto` exige que TODA fonte factual feche cobertura, e depois do
   * bloqueio de 10/08 as fontes factuais são cinco. Sanção e processo em
   * `vazio_confirmado` não bastam: trajetória, patrimônio e votação continuam
   * sem verificação, e a ficha não pode dizer "nada a destacar" enquanto três
   * fontes nunca foram olhadas.
   */
  test("vazio_confirmado é o único vazio que autoriza afirmar, e exige todas as fontes factuais", () => {
    const parcial = montar({
      sancoesVerificacao: VERIF.vazio_confirmado,
      processosVerificacao: VERIF.vazio_confirmado,
    })
    assert.equal(parcial.totalExibido, 0)
    assert.equal(parcial.vazioHonesto, false, "três fontes factuais seguem não verificadas")
    assert.equal(parcial.vazioPorNaoVerificado, true)

    const d = montar({
      sancoesVerificacao: VERIF.vazio_confirmado,
      processosVerificacao: VERIF.vazio_confirmado,
      patrimonioEleicoes: [{ ano: 2022, estado: "vazio_confirmado", verificado_em: "2026-08-07" }] as never,
      historico: [{ cargo: "Deputado Federal", tipo_evento: "mandato", periodo_inicio: 2015 }] as never,
      votos: [{ id: "v1", votacao: { id: "vk", titulo: "x" } }] as never,
    })
    assert.equal(d.vazioHonesto, true, "fontes fechadas sem item editorial formam vazio honesto")
    assert.equal(d.totalExibido, 0)

    const sancoes = d.fontes.find((f) => f.chave === "sancoes")!
    assert.match(descreverEstadoDaFonte(sancoes), /Consultado, nada encontrado\. Última verificação em 09\/08\/2026\./)
  })

  test("trajetória e votações fecham vazio somente com auditoria dedicada e proveniência", () => {
    const trajetoriaVerificacao = {
      fonte: "destaques-trajetoria",
      resultado: "vazio_confirmado",
      executado_em: "2026-08-10T18:00:00.000Z",
      detalhe: "Recorte de mandatos promovíveis auditado; nenhum card publicável.",
    } as const
    const votacoesVerificacao = {
      fonte: "destaques-votacoes",
      resultado: "vazio_confirmado",
      executado_em: "2026-08-10T18:00:00.000Z",
      detalhe: "Recorte de votações-chave auditado; nenhum voto publicável.",
    } as const

    const d = montar({
      sancoesVerificacao: VERIF.vazio_confirmado,
      processosVerificacao: VERIF.vazio_confirmado,
      trajetoriaVerificacao,
      votacoesVerificacao,
      patrimonioEleicoes: [
        { ano: 2022, estado: "vazio_confirmado", verificado_em: "2026-08-07" },
      ] as never,
    })

    assert.equal(d.totalExibido, 0)
    assert.equal(d.vazioHonesto, true)
    assert.equal(d.vazioPorNaoVerificado, false)
    for (const [chave, fonte] of [
      ["trajetoria", "destaques-trajetoria"],
      ["votacoes", "destaques-votacoes"],
    ] as const) {
      const estado = d.fontes.find((item) => item.chave === chave)!
      assert.equal(estado.estado.tipo, "vazio_confirmado")
      assert.equal(estado.proveniencia?.fonte, fonte)
      assert.match(descreverEstadoDaFonte(estado), /Recorte de .* auditado/)
    }
  })

  test("resultado encontrado sem card na auditoria dedicada continua fail-closed", () => {
    const d = montar({
      trajetoriaVerificacao: {
        fonte: "destaques-trajetoria",
        resultado: "encontrado",
        executado_em: "2026-08-10T18:00:00.000Z",
        detalhe: "A auditoria declarou um card, mas o payload veio vazio.",
      },
    })
    const trajetoria = d.fontes.find((item) => item.chave === "trajetoria")!
    assert.equal(trajetoria.estado.tipo, "nao_foi_possivel_verificar")
    assert.equal(d.vazioHonesto, false)
  })

  test("erro e indeterminado nunca viram ficha limpa", () => {
    for (const caso of [VERIF.erro, VERIF.indeterminado]) {
      const d = montar({ sancoesVerificacao: caso, processosVerificacao: VERIF.vazio_confirmado })
      assert.equal(d.vazioHonesto, false, caso.resultado)
      assert.equal(d.vazioPorNaoVerificado, true, caso.resultado)
      const sancoes = d.fontes.find((f) => f.chave === "sancoes")!
      assert.match(descreverEstadoDaFonte(sancoes), /Não foi possível verificar/)
    }
  })

  test("nunca verificado é estado próprio, não ausência", () => {
    const d = montar({ sancoesVerificacao: null, processosVerificacao: undefined })
    assert.equal(d.vazioHonesto, false)
    assert.equal(d.vazioPorNaoVerificado, true)
    for (const chave of ["sancoes", "processos"] as const) {
      const f = d.fontes.find((x) => x.chave === chave)!
      assert.equal(f.estado.tipo, "nunca_verificado")
      assert.equal(descreverEstadoDaFonte(f), "Ainda não verificado.")
    }
  })

  test("sem_achado_no_escopo é curadoria limitada, nunca ausência", () => {
    const d = montar({
      sancoesVerificacao: { resultado: "sem_achado_no_escopo", executado_em: "2026-08-09T14:02:11.000Z" },
      processosVerificacao: VERIF.vazio_confirmado,
    })
    assert.equal(d.vazioHonesto, false)
    const f = d.fontes.find((x) => x.chave === "sancoes")!
    assert.match(descreverEstadoDaFonte(f), /Curadoria limitada/)
    assert.equal(fechaCobertura(f.estado), false)
  })

  /**
   * Divergência: a proveniência diz `encontrado` e a lista chegou vazia.
   * Afirmar "nada encontrado" contradiria a própria fonte.
   */
  test("proveniência encontrado com lista vazia fecha em não foi possível verificar", () => {
    const d = montar({ sancoesVerificacao: VERIF.encontrado, processosVerificacao: VERIF.vazio_confirmado })
    const f = d.fontes.find((x) => x.chave === "sancoes")!
    assert.equal(f.estado.tipo, "nao_foi_possivel_verificar")
    assert.equal(d.vazioHonesto, false)
  })

  test("só encontrado, vazio_confirmado e nao_aplicavel fecham cobertura", () => {
    const fecham = (FIXTURES.estados_terminais as Record<string, string[]>).fecham_cobertura
    const naoFecham = (FIXTURES.estados_terminais as Record<string, string[]>).nao_fecham_cobertura
    for (const r of fecham.filter((x) => x !== "encontrado")) {
      assert.equal(fechaCobertura(estadoDaFonte(false, { resultado: r, executado_em: null } as unknown as SancoesVerificacao)), true, r)
    }
    for (const r of naoFecham) {
      assert.equal(fechaCobertura(estadoDaFonte(false, { resultado: r, executado_em: null } as unknown as SancoesVerificacao)), false, r)
    }
  })

  /**
   * O gate desta frente é zero afirmações falsas, não zero fichas vazias. Uma
   * ficha sem conteúdo nenhum e sem verificação nenhuma tem de sair vazia E
   * dizer que não sabe, em vez de ser preenchida para não parecer vazia.
   */
  test("ficha sem nada não é preenchida para não parecer vazia", () => {
    const d = montar()
    assert.equal(d.totalExibido, 0)
    assert.equal(d.vazioPorNaoVerificado, true)
    assert.equal(d.sancoesVigentes.length, 0)
    assert.equal(d.processos.length, 0)
  })
})

describe("bloqueio de 10/08: universo público, Renan e fontes elegíveis", () => {
  /**
   * `pontos_atencao` é curadoria editorial e NÃO tem proveniência de coleta.
   * Dizer "consultado, nada encontrado" ali afirma uma consulta que não houve.
   */
  test("pontos_atencao vazio nunca produz Consultado, nada encontrado", () => {
    const d = montar({ sancoesVerificacao: VERIF.vazio_confirmado, processosVerificacao: VERIF.vazio_confirmado })
    const editorial = d.fontes.find((f) => f.chave === "pontos_atencao")!
    assert.equal(editorial.categoria, "editorial")
    assert.equal(editorial.estado.tipo, "sem_curadoria_editorial")
    assert.equal(descreverEstadoDaFonte(editorial), "Nenhum destaque editorial publicado.")
    assert.ok(!descreverEstadoDaFonte(editorial).includes("Consultado"))
    assert.equal(fechaCobertura(editorial.estado), false, "editorial não fecha cobertura factual")
  })

  /**
   * O caso real do `renan-santos`, lido do banco em 10/08/2026: 1 ponto de
   * atenção, 0 sanções, 0 processos, 0 votos, 0 patrimônio, e trajetória com
   * DUAS linhas que não podem virar destaque. A promoção honesta aqui é
   * nenhuma, e o teste existe para provar que a régua não inventa.
   */
  test("Renan não ganha destaque a partir de conteúdo que não sustenta afirmação", () => {
    const trajetoria = [
      // Item 13 da triagem: cargo interno de partido gravado como mandato.
      { cargo: "Presidente Nacional do Partido Missão", tipo_evento: "mandato", periodo_inicio: 2025 },
      // A própria candidatura de 2026: é pleito, não feito.
      { cargo: "Presidente", tipo_evento: "candidatura", periodo_inicio: 2026 },
    ] as unknown as Parameters<typeof montarDestaquesDaFicha>[0]["historico"]

    const d = montar({ pontosAtencao: pontoCurado, historico: trajetoria })
    assert.equal(d.mandatos.length, 0, "nenhuma das duas linhas é mandato promovível")
    assert.equal(d.totalExibido, 1, "continua com o único destaque editorial real")
  })

  test("mandato real vira destaque, e a régua diz por quê", () => {
    const real = [
      { cargo: "Deputado Federal", tipo_evento: "mandato", periodo_inicio: 2015, periodo_fim: 2019 },
      { cargo: "Prefeito", tipo_evento: "mandato", periodo_inicio: null },
    ] as unknown as Parameters<typeof montarDestaquesDaFicha>[0]["historico"]
    const d = montar({ historico: real })
    assert.equal(d.mandatos.length, 1, "sem ano de início não dá para dizer o que a pessoa fez")
    assert.equal(d.mandatos[0].cargo, "Deputado Federal")
  })

  test("trajetória, patrimônio e votação alimentam fontes sem inflar Destaques", () => {
    const d = montar({
      historico: [{ cargo: "Senador", tipo_evento: "mandato", periodo_inicio: 2019 }] as never,
      patrimonioEleicoes: [
        { ano: 2018, estado: "publicado" },
        { ano: 2022, estado: "nao_coletado" },
      ] as never,
      votos: [{ id: "v1", votacao: { id: "vk", titulo: "x" } }] as never,
    })
    assert.equal(d.mandatos.length, 1)
    assert.equal(d.patrimonioPublicado.length, 1, "só publicado conta; nao_coletado não")
    assert.equal(d.votacoes.length, 1)
    assert.equal(d.totalExibido, 0)
    for (const chave of ["trajetoria", "patrimonio", "votacoes"] as const) {
      assert.equal(d.fontes.find((f) => f.chave === chave)!.estado.tipo, "tem_conteudo", chave)
    }
  })

  test("patrimônio vazio_confirmado é ausência honesta, nunca destaque", () => {
    const d = montar({
      patrimonioEleicoes: [{ ano: 2022, estado: "vazio_confirmado", verificado_em: "2026-08-07" }] as never,
    })
    assert.equal(d.patrimonioPublicado.length, 0)
    const f = d.fontes.find((x) => x.chave === "patrimonio")!
    assert.equal(f.estado.tipo, "vazio_confirmado")
    assert.match(descreverEstadoDaFonte(f), /Consultado, nada encontrado/)
  })

  test("o readback mede o universo público, não a tabela inteira", () => {
    const fonte = readFileSync(
      join(import.meta.dirname, "..", "scripts", "audit", "readback-destaques-ficha.ts"),
      "utf8"
    )
    assert.match(fonte, /"candidatos_publico"/)
    assert.ok(
      !/(^|[^_])"candidatos"/.test(fonte),
      "medir os 280 conta ficha que a superfície pública nunca mostra"
    )
  })

  test("o readback consome a MESMA forma que a ficha, não uma montagem própria", () => {
    const fonte = readFileSync(
      join(import.meta.dirname, "..", "scripts", "audit", "readback-destaques-ficha.ts"),
      "utf8"
    )
    // Patrimônio pela função canônica, não por um caminho paralelo.
    assert.match(fonte, /buildPatrimonioEleicoes\(pat, aus, h\)/)
    // Votos COM o join da votação-chave; sem ele a fonte media zero sempre.
    assert.match(fonte, /votacao: votacaoPorId\.get\(v\.votacao_id\)/)
    // As mesmas normalizações que `src/lib/api.ts` aplica antes da ficha.
    assert.match(fonte, /normalizeHistoricoPoliticoForDisplay\(/)
    assert.match(fonte, /normalizePatrimonioForDisplay\(/)
    // E a prova de DOM: renderiza o componente real e compara as contagens.
    assert.match(fonte, /renderToStaticMarkup\(/)
    assert.match(fonte, /noDom !== d\.totalExibido/)
    assert.match(
      fonte,
      /--simular-proveniencia/,
      "o pós-migration precisa ser mensurável sem escrever no banco",
    )
    // Os nomes canônicos do log, sem aliases que nunca são gravados.
    for (const fonteCanonica of [
      "transparencia-sanctions",
      "processos-curadoria",
      "destaques-trajetoria",
      "destaques-votacoes",
    ]) {
      assert.match(fonte, new RegExp(fonteCanonica))
    }
    assert.doesNotMatch(fonte, /\$\{c\.id\}:sancoes`/)
    assert.doesNotMatch(fonte, /\$\{c\.id\}:processos`/)
    assert.match(
      fonte,
      /todas<[\s\S]*?Coleta[\s\S]*?>\(\s*"coleta_log_ultima"/,
      "a view passa de 1.000 linhas; leitura sem paginação perde proveniência",
    )
  })
})
