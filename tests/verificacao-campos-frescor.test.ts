import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHAVES_FORA_DO_PERFIL,
  CHAVE_AGREGADO_CURADO,
  CHAVES_TSE_PERFIL,
  ESTADOS_QUE_AVANCAM_FRESCOR,
  RESULTADOS_DE_COLETA_QUE_VERIFICAM,
  candidataDeColeta,
  construirPatchVerificacaoCampos,
  resolverFrescorTsePerfil,
  resolverUltimaVerificacaoDoPerfil,
  validarDataDeVerificacao,
} from "@/lib/verificacao-campos"
import { formatDate } from "@/lib/utils"

/**
 * Contrato de frescor por campo (etapa 7 do plano de re-verificacao).
 *
 * As duas regras que este arquivo protege:
 *
 * 1. ESCRITA. So `publicado` e `vazio_confirmado` carimbam data. Todo o resto
 *    produz CHAVE AUSENTE, nunca `"chave": null`. Isso nao e estilo: o merge no
 *    banco e `COALESCE(verificacao_campos,'{}') || patch`, e em jsonb o `||` com
 *    null do lado direito SOBRESCREVE. Um `{"social_networks": null}` apagaria
 *    uma data boa anterior, que e exatamente o oposto de preservar.
 *
 * 2. LEITURA. O agregado do perfil so avanca quando os TRES campos TSE
 *    aplicaveis estao resolvidos, e avanca pela data MAIS ANTIGA entre eles. Um
 *    perfil composto de tres campos esta verificado apenas desde o momento do
 *    componente mais velho; com o maximo, um recheque barato de um campo lavaria
 *    o selo inteiro.
 *
 * O ledger da B2 e a razao de o contrato existir: ele traz `verified_at` nos 194
 * x 3 campos, inclusive nos 149 que nunca foram consultados por falta de
 * identidade segura. Data no ledger nao e confirmacao de campo.
 */

const ONTEM = "2026-06-01"
const HOJE = "2026-08-06"

describe("escrita: construirPatchVerificacaoCampos", () => {
  it("publicado com data entra no patch", () => {
    const { patch } = construirPatchVerificacaoCampos(null, [
      { chave: "candidate_registration", estado: "publicado", verificadoEm: HOJE },
    ])
    assert.deepEqual(patch, { candidate_registration: HOJE })
  })

  it("vazio_confirmado com data entra no patch", () => {
    // O caso real: `no_row_for_safe_sq` em social_networks. A fonte foi
    // consultada com SQ seguro e respondeu sem registros, que
    // Settings/OBJECTIVE.md define como vazio_confirmado. O gerador antigo
    // gravava null aqui, e era a violacao do contrato na direcao oposta.
    const { patch } = construirPatchVerificacaoCampos(null, [
      { chave: "social_networks", estado: "vazio_confirmado", verificadoEm: HOJE },
    ])
    assert.deepEqual(patch, { social_networks: HOJE })
  })

  for (const estado of ["erro", "indeterminado", "nao_coletado", "nao_aplicavel"] as const) {
    it(`${estado} produz chave AUSENTE, nunca null`, () => {
      const { patch, preservadas } = construirPatchVerificacaoCampos(
        { social_networks: ONTEM },
        [{ chave: "social_networks", estado, verificadoEm: HOJE }],
      )
      assert.equal(Object.hasOwn(patch, "social_networks"), false)
      assert.deepEqual(patch, {})
      assert.equal(preservadas.length, 1)
      assert.equal(preservadas[0].estado, estado)
    })
  }

  it("o merge preserva a data anterior byte a byte", () => {
    // Este e o teste que falha com o comportamento antigo: um patch com
    // `{social_networks: null}` sobrescreveria ONTEM. Com chave ausente, nao.
    const atual = { candidate_registration: ONTEM, social_networks: ONTEM }
    const { patch } = construirPatchVerificacaoCampos(atual, [
      { chave: "candidate_registration", estado: "publicado", verificadoEm: HOJE },
      { chave: "social_networks", estado: "erro", verificadoEm: HOJE },
    ])
    assert.deepEqual({ ...atual, ...patch }, {
      candidate_registration: HOJE,
      social_networks: ONTEM,
    })
  })

  it("nenhum valor do patch e null, para nenhuma entrada", () => {
    const { patch } = construirPatchVerificacaoCampos({ photo: ONTEM }, [
      { chave: "candidate_registration", estado: "publicado", verificadoEm: HOJE },
      { chave: "candidate_complement", estado: "nao_coletado", verificadoEm: null },
      { chave: "social_networks", estado: "vazio_confirmado", verificadoEm: HOJE },
      { chave: "photo", estado: "indeterminado", verificadoEm: HOJE },
    ])
    for (const [chave, valor] of Object.entries(patch)) {
      assert.equal(typeof valor, "string", `${chave} nao e string`)
    }
    assert.equal(JSON.stringify(patch).includes("null"), false)
  })

  it("estado que avança sem data cai em rejeitadas e nao inventa now()", () => {
    const { patch, rejeitadas } = construirPatchVerificacaoCampos(null, [
      { chave: "candidate_registration", estado: "publicado", verificadoEm: null },
    ])
    assert.deepEqual(patch, {})
    assert.equal(rejeitadas.length, 1)
    assert.equal(rejeitadas[0].chave, "candidate_registration")
  })

  it("data invalida tambem e rejeitada, nao propagada", () => {
    const { patch, rejeitadas } = construirPatchVerificacaoCampos(null, [
      { chave: "candidate_registration", estado: "publicado", verificadoEm: "2026-13-45" },
    ])
    assert.deepEqual(patch, {})
    assert.equal(rejeitadas.length, 1)
  })

  it("lista vazia e a identidade", () => {
    const atual = { candidate_registration: ONTEM }
    const { patch } = construirPatchVerificacaoCampos(atual, [])
    assert.deepEqual(patch, {})
    assert.deepEqual({ ...atual, ...patch }, atual)
  })

  it("ESTADOS_QUE_AVANCAM_FRESCOR e exatamente publicado e vazio_confirmado", () => {
    assert.deepEqual([...ESTADOS_QUE_AVANCAM_FRESCOR], ["publicado", "vazio_confirmado"])
  })
})

describe("leitura: resolverFrescorTsePerfil", () => {
  it("tres de tres promove pela data MAIS ANTIGA", () => {
    const r = resolverFrescorTsePerfil({
      candidate_registration: "2026-08-06",
      candidate_complement: "2026-07-01",
      social_networks: "2026-08-05",
    })
    assert.equal(r.tipo, "completa")
    if (r.tipo !== "completa") return
    assert.equal(r.verificadoEm.bruto, "2026-07-01")
    assert.equal(r.verificadoEm.instante, Date.UTC(2026, 6, 1))
    assert.equal(r.chaveMaisAntiga, "candidate_complement")
  })

  it("dois de tres nao promove", () => {
    // Forma real de cleber-rabelo e gilberto-vasconcelos no jsonb de hoje.
    const r = resolverFrescorTsePerfil({
      candidate_registration: HOJE,
      candidate_complement: HOJE,
      social_networks: null,
    })
    assert.equal(r.tipo, "parcial")
    if (r.tipo !== "parcial") return
    assert.equal(r.resolvidas, 2)
  })

  it("um de tres nao promove", () => {
    const r = resolverFrescorTsePerfil({ candidate_registration: HOJE })
    assert.equal(r.tipo, "parcial")
  })

  it("zero de tres e ausente", () => {
    // Forma real de felicio-ramuth e dos outros 148.
    const r = resolverFrescorTsePerfil({
      candidate_registration: null,
      candidate_complement: null,
      social_networks: null,
      news_query: "2026-08-07T03:37:55.865Z",
      existing_profile_aggregate: "2026-04-14T00:00:00Z",
    })
    assert.equal(r.tipo, "ausente")
  })

  it("chave ausente e chave null dao o mesmo veredito", () => {
    const comNull = resolverFrescorTsePerfil({
      candidate_registration: HOJE,
      candidate_complement: HOJE,
      social_networks: null,
    })
    const semChave = resolverFrescorTsePerfil({
      candidate_registration: HOJE,
      candidate_complement: HOJE,
    })
    assert.deepEqual(comNull, semChave)
  })

  it("news_query e existing_profile_aggregate nunca promovem o agregado TSE", () => {
    // O defeito antigo: a selecao ordenava 4 chaves e pegava a mais recente, entao
    // o agregado curado ou uma data parcial promovia o perfil inteiro.
    const r = resolverFrescorTsePerfil({
      candidate_registration: "2026-08-06",
      candidate_complement: null,
      social_networks: null,
      news_query: "2026-08-09T00:00:00Z",
      existing_profile_aggregate: "2026-08-08T00:00:00Z",
    })
    assert.equal(r.tipo, "parcial")
  })

  it("data impossível no calendário é recusada, não rolada", () => {
    // `new Date("2026-02-30")` devolve 02/03/2026 sem reclamar. Uma data que o
    // calendário não tem só vem de erro ou adulteração, e transformá-la em outra
    // data silenciosamente é dado inventado.
    const r = resolverFrescorTsePerfil({
      candidate_registration: "2026-02-30",
      candidate_complement: HOJE,
      social_networks: HOJE,
    })
    assert.equal(r.tipo, "parcial")
    assert.equal(validarDataDeVerificacao("2026-02-30"), null)
    assert.equal(validarDataDeVerificacao("2025-02-29"), null)
    assert.equal(validarDataDeVerificacao("2024-02-29")?.bruto, "2024-02-29")
  })

  it("timestamp sem fuso é recusado: o resultado não pode depender da máquina", () => {
    // Medido: `new Date("2026-08-06T23:30:00")` dá 1786059000000 em UTC e
    // 1786069800000 em America/Sao_Paulo, três horas de diferença. Uma data de
    // verificação que muda de valor conforme quem lê não é verificação.
    for (const semFuso of [
      "2026-08-06T23:30:00",
      "2026-08-06T23:30",
      "2026-08-06 23:30:00",
      "2026-08-06T23:30:00.123",
    ]) {
      assert.equal(validarDataDeVerificacao(semFuso), null, `"${semFuso}" foi aceito sem fuso`)
    }
    // Com Z ou offset explícito, aceita e o instante é o mesmo em qualquer fuso.
    assert.equal(validarDataDeVerificacao("2026-08-06T23:30:00Z")?.instante, 1786059000000)
    assert.equal(validarDataDeVerificacao("2026-08-06T23:30:00-03:00")?.instante, 1786069800000)
    assert.equal(validarDataDeVerificacao("2026-08-06T23:30:00-0300")?.instante, 1786069800000)
    // Data pura é ancorada em meia-noite UTC, que é explícito e estável.
    assert.equal(validarDataDeVerificacao("2026-08-06")?.instante, Date.UTC(2026, 7, 6))
  })

  it("formato fora do ISO é recusado", () => {
    for (const valor of ["Aug 6 2026", "06/08/2026", "2026", "2026-8-6", "20260806"]) {
      assert.equal(validarDataDeVerificacao(valor), null, `"${valor}" foi aceito`)
    }
    assert.equal(validarDataDeVerificacao("2026-08-06")?.bruto, "2026-08-06")
    assert.equal(validarDataDeVerificacao("2026-08-07T03:42:25.708Z")?.bruto, "2026-08-07T03:42:25.708Z")
  })

  it("o mínimo é por instante, com ordem lexical DIVERGENTE da cronológica", () => {
    // O par existe para que as duas ordens discordem; sem isso o teste passaria
    // também com `.sort()` de strings e não provaria nada.
    //
    //   "2026-08-06T23:00:00Z"      -> 2026-08-06T23:00Z
    //   "2026-08-07T00:30:00+03:00" -> 2026-08-06T21:30Z  (MAIS ANTIGO)
    const antigoNoRelogio = "2026-08-07T00:30:00+03:00"
    const antigoNoAlfabeto = "2026-08-06T23:00:00Z"
    assert.ok(antigoNoAlfabeto < antigoNoRelogio, "as strings não divergem: o caso perdeu a graça")
    assert.ok(
      new Date(antigoNoRelogio).getTime() < new Date(antigoNoAlfabeto).getTime(),
      "os instantes não divergem: o caso perdeu a graça",
    )

    const r = resolverFrescorTsePerfil({
      candidate_registration: antigoNoAlfabeto,
      candidate_complement: antigoNoRelogio,
      social_networks: "2026-08-08T12:00:00Z",
    })
    assert.equal(r.tipo, "completa")
    if (r.tipo !== "completa") return
    // A chave mais antiga é a que a ordenação lexical colocaria por ÚLTIMO.
    assert.equal(r.chaveMaisAntiga, "candidate_complement")
    assert.equal(new Date(r.verificadoEm.instante).toISOString(), "2026-08-06T21:30:00.000Z")
    // O texto gravado atravessa intacto: precisão e fuso não se perdem.
    assert.equal(r.verificadoEm.bruto, antigoNoRelogio)
  })

  it("data pura exibe o dia gravado; timestamp com fuso converte para São Paulo", () => {
    // Regressão medida em produção em 09/08/2026: "2026-08-09" gravado nas três
    // frentes era exibido como "Perfil verificado em 08/08/2026" nas 12 fichas
    // materializadas. O resolver devolvia só um Date (meia-noite UTC) e o
    // formatador público (America/Sao_Paulo) recuava um dia. O `bruto` existe
    // para a exibição preservar a data de calendário.
    const dataPura = resolverFrescorTsePerfil({
      candidate_registration: "2026-08-09",
      candidate_complement: "2026-08-09",
      social_networks: "2026-08-09",
    })
    assert.equal(dataPura.tipo, "completa")
    if (dataPura.tipo !== "completa") return
    assert.equal(formatDate(dataPura.verificadoEm.bruto), "09/08/2026")

    // Timestamp com fuso explícito continua sendo um INSTANTE: 01:00Z de 10/08
    // é 22:00 de 09/08 em São Paulo, e é assim que o público deve ler.
    const comFuso = resolverFrescorTsePerfil({
      candidate_registration: "2026-08-10T01:00:00Z",
      candidate_complement: "2026-08-10T01:00:00Z",
      social_networks: "2026-08-10T01:00:00Z",
    })
    assert.equal(comFuso.tipo, "completa")
    if (comFuso.tipo !== "completa") return
    assert.equal(formatDate(comFuso.verificadoEm.bruto), "09/08/2026")
  })

  it("lixo nao vira data e nao lanca", () => {
    for (const valor of ["", "sim", "2026-13-45", "   "]) {
      const r = resolverFrescorTsePerfil({
        candidate_registration: valor,
        candidate_complement: HOJE,
        social_networks: HOJE,
      })
      assert.equal(r.tipo, "parcial", `"${valor}" foi aceito como data`)
    }
  })

  it("nulo e indefinido sao ausentes", () => {
    assert.equal(resolverFrescorTsePerfil(null).tipo, "ausente")
    assert.equal(resolverFrescorTsePerfil(undefined).tipo, "ausente")
    assert.equal(resolverFrescorTsePerfil({}).tipo, "ausente")
  })

  it("data no ledger com no_safe_match nao avanca o frescor", () => {
    // felicio-ramuth: o ledger traz verified_at 2026-08-07 e source_date
    // 2026-08-06 em TODAS as 12 propostas dele, com query_result no_safe_match.
    // O estado correto e nao_coletado, e o patch tem de sair vazio.
    const { patch } = construirPatchVerificacaoCampos(null, [
      { chave: "candidate_registration", estado: "nao_coletado", verificadoEm: "2026-08-07T03:42:25.708Z" },
      { chave: "candidate_complement", estado: "nao_coletado", verificadoEm: "2026-08-06" },
      { chave: "social_networks", estado: "nao_coletado", verificadoEm: "2026-08-06" },
    ])
    assert.deepEqual(patch, {})

    const guardado = { existing_profile_aggregate: "2026-04-14T00:00:00Z", ...patch }
    assert.equal(resolverFrescorTsePerfil(guardado).tipo, "ausente")
    assert.equal(guardado.existing_profile_aggregate, "2026-04-14T00:00:00Z")
  })
})

describe("vocabulário sem deriva", () => {
  it("as 7 chaves do modulo sao exatamente as 7 que a migration escreve", () => {
    // Medido em supabase/migrations/20260807052000_b2_current_profiles_tse_2026.sql:
    // 194 linhas, cada uma com estas 7 chaves. Chave nova no pipeline tem de
    // aparecer aqui em vez de ser ignorada em silencio, como campaign_proposals,
    // photo e news_query eram pelo leitor antigo.
    const doModulo = new Set<string>([
      ...CHAVES_TSE_PERFIL,
      CHAVE_AGREGADO_CURADO,
      ...CHAVES_FORA_DO_PERFIL,
    ])
    assert.deepEqual(
      [...doModulo].sort(),
      [
        "campaign_proposals",
        "candidate_complement",
        "candidate_registration",
        "existing_profile_aggregate",
        "news_query",
        "photo",
        "social_networks",
      ],
    )
  })

  it("as tres chaves TSE estao na ordem declarada", () => {
    assert.deepEqual([...CHAVES_TSE_PERFIL], [
      "candidate_registration",
      "candidate_complement",
      "social_networks",
    ])
  })
})

/**
 * A semantica publica do bloco "Perfil atual", mudada em 09/08/2026.
 *
 * O selo passou a responder "quando qualquer dado deste perfil foi verificado
 * pela ultima vez", e nao mais "quando o perfil foi verificado". A diferenca
 * tem duas consequencias testaveis: verificacoes de OUTRAS fontes (sancoes,
 * processos) entram na conta, e consultas que FALHARAM continuam fora dela.
 */
describe("ultima verificacao de qualquer dado do perfil", () => {
  const emIso = (iso: string, fonte: string, ordem: number) => ({
    instante: new Date(iso).getTime(),
    exibicao: iso,
    fonte,
    ordem,
  })

  it("vence a candidata MAIS RECENTE, ao contrario do agregado TSE", () => {
    // Assimetria deliberada: as tres frentes TSE compoem UM atributo e por isso
    // valem desde a mais antiga; ja as fontes aqui sao atributos independentes,
    // e a pergunta e sobre a ultima visita a qualquer um deles.
    const r = resolverUltimaVerificacaoDoPerfil([
      emIso("2026-06-09T00:00:00Z", "Perfil factual curado", 1),
      emIso("2026-08-05T18:12:57Z", "Sanções: CEIS, CNEP e CEAF", 2),
      emIso("2026-07-01T00:00:00Z", "TSE candidaturas 2026", 0),
    ])
    assert.equal(r?.fonte, "Sanções: CEIS, CNEP e CEAF")
    assert.equal(r?.exibicao, "2026-08-05T18:12:57Z")
  })

  it("coleta com erro ou indeterminado NAO conta como verificacao", () => {
    // O caso que motivou a regra: 30 fichas com `erro` na consulta de sancoes de
    // 05/08. Deixa-las avancar a data transformaria uma consulta que falhou em
    // selo de frescor, que e a mentira mais cara que este site pode contar.
    for (const resultado of ["erro", "indeterminado", "nao_aplicavel"]) {
      assert.equal(
        candidataDeColeta({ resultado, executado_em: "2026-08-05T18:00:00Z" }, "Sanções", 2),
        null,
        `${resultado} nao pode virar candidata`,
      )
    }
    assert.equal(candidataDeColeta(null, "Sanções", 2), null)
    assert.equal(candidataDeColeta(undefined, "Sanções", 2), null)
  })

  it("encontrado e vazio_confirmado contam, e vazio_confirmado e o caso comum", () => {
    // `vazio_confirmado` e a maioria das 163 linhas reais de sancoes: a fonte
    // foi consultada e respondeu sem registros. Esconder isso transformaria
    // ausencia confirmada em lacuna, o defeito inverso.
    for (const resultado of RESULTADOS_DE_COLETA_QUE_VERIFICAM) {
      const c = candidataDeColeta({ resultado, executado_em: "2026-08-05T18:00:00Z" }, "Sanções", 2)
      assert.equal(c?.fonte, "Sanções")
      assert.equal(c?.instante, new Date("2026-08-05T18:00:00Z").getTime())
    }
  })

  it("data ilegivel na coleta e descartada em vez de virar NaN", () => {
    assert.equal(
      candidataDeColeta({ resultado: "encontrado", executado_em: "ontem" }, "Sanções", 2),
      null,
    )
    assert.equal(candidataDeColeta({ resultado: "encontrado", executado_em: "" }, "Sanções", 2), null)
  })

  it("empate de instante resolve pela ordem declarada, nao pela ordem do array", () => {
    const r = resolverUltimaVerificacaoDoPerfil([
      emIso("2026-08-06T00:00:00Z", "Curadoria de processos", 3),
      emIso("2026-08-06T00:00:00Z", "TSE candidaturas 2026", 0),
    ])
    assert.equal(r?.fonte, "TSE candidaturas 2026")
  })

  it("sem nenhuma fonte valida devolve null, e o bloco cai em `missing`", () => {
    assert.equal(resolverUltimaVerificacaoDoPerfil([]), null)
    assert.equal(resolverUltimaVerificacaoDoPerfil([null, null]), null)
  })

  it("uma fonte sozinha vence sem depender de comparacao", () => {
    const r = resolverUltimaVerificacaoDoPerfil([
      null,
      emIso("2026-04-14T00:00:00Z", "Perfil factual curado", 1),
      null,
    ])
    assert.equal(r?.fonte, "Perfil factual curado")
  })

  it("o caso real do augusto-cury: curadoria de junho perde para processos de agosto", () => {
    const r = resolverUltimaVerificacaoDoPerfil([
      emIso("2026-06-09T14:31:33Z", "Perfil factual curado", 1),
      candidataDeColeta(
        { resultado: "erro", executado_em: "2026-08-05T18:12:57Z" },
        "Sanções: CEIS, CNEP e CEAF",
        2,
      ),
      candidataDeColeta(
        { resultado: "vazio_confirmado", executado_em: "2026-08-06T00:47:13Z" },
        "Curadoria de processos",
        3,
      ),
    ])
    assert.equal(r?.fonte, "Curadoria de processos")
    assert.equal(r?.exibicao, "2026-08-06T00:47:13Z")
  })
})
