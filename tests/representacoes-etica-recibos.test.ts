import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { coberturaCamara, cortarNaPontuacao, indiceDeNomes, indicesDeCandidatos, resolverAlvos, type Fila } from "../scripts/lib/representacoes-etica-coleta"
import { alvoDaEmentaPce, montarRecibosRepresentacoes } from "../scripts/lib/representacoes-etica-recibos"
import type { FilaPceSenado } from "../scripts/lib/representacoes-etica-senado"
import { divergentes, exigirFilaRecente } from "../scripts/registrar-recibos-representacoes"
import { FONTES } from "../scripts/lib/coleta-log"

const roster = [
  { senador_id: 1, nome: "Ana Senadora", nome_completo: "Ana Maria Senadora", uf: "MA" },
  { senador_id: 2, nome: "Fulvio", nome_completo: "Fulvio Teste Silva", uf: "SP" },
  { senador_id: 3, nome: "Bruno Senador", nome_completo: "Bruno Senador Costa", uf: "AC" },
]

function pce(numero: number, ementa: string) {
  return {
    id: `pce-${numero}`, status_revisao: "pendente_identidade_editorial" as const,
    processo: { id: numero, sigla: "PCE" as const, numero, ano: 2026 },
    ementa_oficial: ementa, data_apresentacao: "2026-01-01",
    situacao_atual: { sigla: null, descricao: "x", data: null }, ultimo_andamento_em: null, tramitacoes: [],
    documentos_estado: "carregados" as const, documentos: [], url_oficial: `https://legis.senado.leg.br/dadosabertos/processo/${numero}`,
    alvo: null, candidato_slug: null,
  }
}

function filaSenado(itens: FilaPceSenado["itens"] = [
  pce(1, "Requer a abertura de procedimento disciplinar em face do Senador Fulvio com fundamento na Resolução nº 20"),
  pce(2, "Requer a abertura de procedimento em face dos Senadores que impediram a sessão"),
]): FilaPceSenado {
  return {
    schema_version: 1, fonte: "senado-dadosabertos-pce-v1", legislatura_recorte: 57,
    gerado_em: "2026-09-25T21:00:00Z",
    fontes: { processos: "https://legis.senado.leg.br/dadosabertos/processo?sigla=PCE", senadores: "x" },
    contagem_por_ano: {}, total_processos: itens.length, roster,
    candidatos_por_senador_id: { "1": ["ana"], "2": ["fulvio"] },
    itens,
  }
}

function filaCamara(overrides: Partial<Fila> = {}): Fila {
  return {
    schema_version: 1, fonte: "camara-dadosabertos-v2",
    legislatura: { id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
    gerado_em: "2026-09-25T21:00:00Z", contagem_por_ano: {}, total_representacoes: 1,
    identidade: { candidatos_no_seed: 5, com_id_camara: 2, com_cpf_tse: 3, deputados_na_legislatura: 3 },
    itens: [{
      candidato: { slug: "dep-com-rep" }, representacao: { numero: 8, ano: 2023 },
    }] as unknown as Fila["itens"],
    alvos_sem_candidato: [],
    alvos_nao_resolvidos: [{ proposicao_id: 9, numero: 16, ano: 2023, trecho: "x", ambiguos: [{ nome: "X", deputado_ids: [300] }] }],
    cobertura: {
      deputados_candidatos: [
        { slug: "dep-com-rep", deputado_id: 100, metodo: "seed_ids_camara" },
        { slug: "dep-limpo", deputado_id: 200, metodo: "cpf_tse_camara" },
        { slug: "dep-ambiguo", deputado_id: 300, metodo: "cpf_tse_camara" },
      ],
      candidatos_sem_identificador: ["sem-id"],
      vinculos_bloqueados: [],
    },
    ...overrides,
  }
}

const publicos = [
  { slug: "dep-com-rep", nome_completo: "Deputada Com Rep" },
  { slug: "dep-limpo", nome_completo: "Deputado Limpo" },
  { slug: "dep-ambiguo", nome_completo: "Deputado Ambiguo" },
  { slug: "sem-id", nome_completo: "Sem Identificador" },
  { slug: "ana", nome_completo: "Ana Maria Senadora" },
  { slug: "fulvio", nome_completo: "Fulvio Teste Silva" },
  { slug: "homonimo-bruno", nome_completo: "Bruno Senador Costa" },
  { slug: "governador", nome_completo: "Fulano Governador" },
]

describe("recibo por candidato da busca de representações", () => {
  it("lê o representado da ementa, inclusive nome parlamentar de um token", () => {
    assert.deepEqual(alvoDaEmentaPce("em face do Senador Fulvio com fundamento", roster).senador_ids, [2])
    const coletivo = alvoDaEmentaPce("em face dos Senadores que impediram a sessão", roster)
    assert.equal(coletivo.sem_alvo_individual, true)
    const fora = alvoDaEmentaPce("em face do Senador Otavio Pires, com fundamento no art. 55", roster)
    assert.deepEqual(fora.senador_ids, [])
    assert.equal(fora.texto_alvo, "OTAVIO PIRES")
    assert.equal(alvoDaEmentaPce("Despacho sobre petição", roster).sem_alvo_individual, true)
  })

  it("autor citado depois do alvo nunca vira representado", () => {
    const autorDepois = alvoDaEmentaPce(
      "Requer a abertura de procedimento disciplinar em face do Senador Fulvio, por representação do Senador Bruno Senador Costa, com fundamento no art. 55",
      roster,
    )
    assert.deepEqual(autorDepois.senador_ids, [2])
    const autorNome = alvoDaEmentaPce("em face do Senador Fulvio, formulada pela Senadora Ana Maria Senadora", roster)
    assert.deepEqual(autorNome.senador_ids, [2])
    const fundamento = alvoDaEmentaPce("em face do Senador Otavio Pires com fundamento em denúncia do Senador Fulvio", roster)
    assert.deepEqual(fundamento.senador_ids, [])
    assert.equal(fundamento.texto_alvo, "OTAVIO PIRES")
  })

  it("iniciativa, relator e subscrição depois do alvo nunca viram representados", () => {
    const iniciativa = alvoDaEmentaPce("Representação em face do Senador Fulvio de iniciativa do Senador Bruno Senador Costa", roster)
    assert.deepEqual(iniciativa.senador_ids, [2])
    const relator = alvoDaEmentaPce("Denúncia em face do Senador Otavio Pires. Relator: Senador Fulvio", roster)
    assert.deepEqual(relator.senador_ids, [])
    assert.equal(relator.texto_alvo, "OTAVIO PIRES")
    const subscrita = alvoDaEmentaPce("Representação em face do Senador Fulvio subscrita pela Senadora Ana Maria Senadora", roster)
    assert.deepEqual(subscrita.senador_ids, [2])
    const doisPontos = alvoDaEmentaPce("Em face do Senador Fulvio; representante: Senador Bruno Senador Costa", roster)
    assert.deepEqual(doisPontos.senador_ids, [2])
  })

  it("mantém vários representados ligados por 'e do Senador'", () => {
    const dois = alvoDaEmentaPce("em face do Senador Fulvio e da Senadora Ana Maria Senadora, nos termos do Código de Ética", roster)
    assert.deepEqual(dois.senador_ids, [1, 2])
  })

  it("distingue encontrado, vazio verificado, indeterminado e não aplicável", () => {
    const recibos = new Map(montarRecibosRepresentacoes({ publicos, camara: filaCamara(), senado: filaSenado() })
      .map((r) => [r.alvo, r]))
    assert.equal(recibos.get("dep-com-rep")?.resultado, "encontrado")
    assert.equal(recibos.get("dep-com-rep")?.volume, 1)
    assert.equal(recibos.get("dep-limpo")?.resultado, "vazio_confirmado")
    assert.equal(recibos.get("dep-ambiguo")?.resultado, "indeterminado")
    assert.equal(recibos.get("sem-id")?.resultado, "indeterminado")
    assert.equal(recibos.get("ana")?.resultado, "vazio_confirmado")
    assert.equal(recibos.get("fulvio")?.resultado, "encontrado")
    assert.equal(recibos.get("homonimo-bruno")?.resultado, "indeterminado", "nome do roster sem ids.senado")
    assert.match(recibos.get("ana")?.detalhe ?? "", /PCE 2\/2026/)
    for (const recibo of recibos.values()) {
      assert.equal(recibo.fonte, "representacoes-etica")
      assert.equal(recibo.volume === 0, recibo.resultado !== "encontrado")
    }
  })

  it("não aplicável só para quem não é parlamentar em nenhuma das casas", () => {
    const camara = filaCamara({ cobertura: { deputados_candidatos: [], candidatos_sem_identificador: [], vinculos_bloqueados: [] } })
    const recibos = new Map(montarRecibosRepresentacoes({ publicos, camara, senado: filaSenado() }).map((r) => [r.alvo, r]))
    assert.equal(recibos.get("governador")?.resultado, "nao_aplicavel")
    assert.equal(recibos.get("ana")?.resultado, "vazio_confirmado")
  })

  it("recusa fila sem cobertura, Senado com documento em falha e fila velha", () => {
    assert.throws(() => montarRecibosRepresentacoes({ publicos, camara: filaCamara({ cobertura: undefined }), senado: filaSenado() }), /sem cobertura/)
    const falha = filaSenado([{ ...pce(1, "x"), documentos_estado: "falha" as const }])
    assert.throws(() => montarRecibosRepresentacoes({ publicos, camara: filaCamara(), senado: falha }), /documentos em falha/)
    assert.throws(() => exigirFilaRecente("2026-09-20T00:00:00Z", "Câmara", Date.parse("2026-09-25T00:00:00Z")), /36 h/)
    assert.doesNotThrow(() => exigirFilaRecente("2026-09-25T00:00:00Z", "Câmara", Date.parse("2026-09-25T10:00:00Z")))
  })

  it("cobertura da Câmara casa todos os deputados, não só alvos, e lista quem não tem identificador", () => {
    const seed = [
      { slug: "a", nome_urna: "A", cargo_disputado: "Governador", estado: "SP", ids: { camara: 10 } },
      { slug: "b", nome_urna: "B", cargo_disputado: "Senador", estado: "SP", ids: {} },
    ]
    const cobertura = coberturaCamara(
      [{ id: 10, nome: "A", nomeCivil: "A", cpf: null }, { id: 11, nome: "Z", nomeCivil: "Z", cpf: null }] as never,
      indicesDeCandidatos(seed as never, new Map()),
    )
    assert.deepEqual(cobertura.deputados_candidatos.map((d) => d.slug), ["a"])
    assert.deepEqual(cobertura.candidatos_sem_identificador, ["b"])
  })

  it("correção grava só o recibo que mudou", () => {
    const entradas = [
      { fonte: "representacoes-etica", alvo: "a", resultado: "encontrado" as const, detalhe: "x" },
      { fonte: "representacoes-etica", alvo: "b", resultado: "vazio_confirmado" as const, detalhe: "y" },
      { fonte: "representacoes-etica", alvo: "c", resultado: "nao_aplicavel" as const, detalhe: "z" },
    ]
    const ultima = [
      { alvo: "a", resultado: "encontrado", detalhe: "x" },
      { alvo: "b", resultado: "encontrado", detalhe: "y" },
    ]
    assert.deepEqual(divergentes(entradas, ultima).map((e) => e.alvo), ["b", "c"])
  })

  it("fonte nova tem escopo de candidato", () => {
    assert.equal(FONTES["representacoes-etica"], "candidato")
  })
})

describe("re-revisão do #504: localizador de alvo e autor/relator", () => {
  it("acha o representado depois de outra construção 'em face' e nas variantes", () => {
    assert.deepEqual(alvoDaEmentaPce("Recurso em face da decisão da Mesa. Representação em face do Senador Fulvio, por quebra de decoro", roster).senador_ids, [2])
    assert.deepEqual(alvoDaEmentaPce("Representação em face do então Senador Fulvio", roster).senador_ids, [2])
    assert.deepEqual(alvoDaEmentaPce("Denúncia em desfavor do Senador Fulvio", roster).senador_ids, [2])
    assert.deepEqual(alvoDaEmentaPce("Representação contra o Senador Fulvio", roster).senador_ids, [2])
  })

  it("senador citado em PCE sem alvo parseado fica indeterminado, nunca vazio", () => {
    const destinatario = alvoDaEmentaPce("Excelentíssimo Senhor Senador Fulvio, requer providências", roster)
    assert.deepEqual(destinatario.senador_ids, [])
    assert.deepEqual(destinatario.nomes_citados, [2])
    const senado = filaSenado([pce(9, "Excelentíssimo Senhor Senador Fulvio, requer providências")])
    const recibos = new Map(montarRecibosRepresentacoes({ publicos, camara: filaCamara(), senado }).map((r) => [r.alvo, r]))
    assert.equal(recibos.get("fulvio")?.resultado, "indeterminado")
    assert.match(recibos.get("fulvio")?.detalhe ?? "", /PCE 9\/2026, sem representado parseado/)
    assert.equal(recibos.get("ana")?.resultado, "vazio_confirmado")
  })

  it("marcador de fim não corta dentro de nome", () => {
    const rosterNome = [...roster, { senador_id: 4, nome: "Paraiso Autorino", nome_completo: "Paraiso Autorino Relatorio", uf: "PA" }]
    assert.deepEqual(alvoDaEmentaPce("em face do Senador Paraiso Autorino Relatorio, com fundamento", rosterNome).senador_ids, [4])
  })

  it("Câmara: iniciativa, relator, autor e autoria nunca viram alvo", () => {
    const deputados = [
      { id: 10, nome: "Fulana Alvo", nomeCivil: "Fulana Alvo Silva", cpf: null },
      { id: 20, nome: "Beltrano Autor", nomeCivil: "Beltrano Autor Souza", cpf: null },
    ]
    const indice = indiceDeNomes(deputados as never)
    const casos = [
      "Representação em desfavor da Deputada Fulana Alvo de iniciativa do Deputado Beltrano Autor",
      "Representação em desfavor da Deputada Fulana Alvo. Relator: Deputado Beltrano Autor",
      "Representação em desfavor da Deputada Fulana Alvo - Autor: Deputado Beltrano Autor",
      "Representação em desfavor da Deputada Fulana Alvo, de autoria do Deputado Beltrano Autor",
    ]
    for (const ementa of casos) {
      assert.deepEqual(resolverAlvos(ementa, indice).resolvidos.map((r) => r.deputado_id), [10], ementa)
    }
    assert.equal(cortarNaPontuacao("Senhor Dep. Fulana Alvo. Imputação"), "Senhor Dep. Fulana Alvo")
  })
})

describe("re-revisão Opus do #504: PCE com sigla, SEN. e citado não parseado", () => {
  it("sigla de partido entre parênteses não corta o segundo representado", () => {
    const ementa = "Representação contra o Senador Fulvio Teste Silva (PL-RJ) e o Senador Ana Maria Senadora (PT-BA), por quebra de decoro"
    assert.deepEqual(alvoDaEmentaPce(ementa, roster).senador_ids, [1, 2])
  })

  it("nome de uma palavra depois de SEN. ou de vírgula vira representado", () => {
    assert.deepEqual(alvoDaEmentaPce("Denúncia em desfavor do Sen. Fulvio por quebra de decoro", roster).senador_ids, [2])
    assert.deepEqual(alvoDaEmentaPce("Denúncia em desfavor do Sen. Fulvio", roster).nomes_citados, [2])
    assert.deepEqual(alvoDaEmentaPce("Representação contra os Senadores Ana Maria Senadora, Fulvio e outros", roster).senador_ids, [1, 2])
  })

  it("senador citado mas não parseado como alvo fica indeterminado mesmo com outro alvo no PCE", () => {
    const senado = filaSenado([pce(7, "Representação contra o Senador Fulvio; cita a Senadora Ana Maria Senadora")])
    const recibos = new Map(montarRecibosRepresentacoes({ publicos, camara: filaCamara(), senado }).map((r) => [r.alvo, r]))
    assert.equal(recibos.get("fulvio")?.resultado, "encontrado")
    assert.equal(recibos.get("ana")?.resultado, "indeterminado")
    assert.match(recibos.get("ana")?.detalhe ?? "", /PCE 7\/2026, sem representado parseado/)
  })
})

describe("rodada 4 do #504: nome de um token citado e siglas", () => {
  it("M5: nome de um token fora do título entra em nomes_citados e vira indeterminado", () => {
    for (const ementa of [
      "Representação em face do Senador da República Fulvio por quebra de decoro",
      "Representação em face do Senador licenciado Fulvio",
      "Requerimento do Senador Bruno Senador Costa contra Fulvio",
    ]) {
      assert.ok(alvoDaEmentaPce(ementa, roster).nomes_citados.includes(2), ementa)
      const senado = filaSenado([pce(11, ementa)])
      const recibos = new Map(montarRecibosRepresentacoes({ publicos, camara: filaCamara(), senado }).map((r) => [r.alvo, r]))
      assert.notEqual(recibos.get("fulvio")?.resultado, "vazio_confirmado", ementa)
    }
  })

  it("m7: sigla sem UF e com travessão não corta o segundo representado", () => {
    assert.deepEqual(alvoDaEmentaPce("Representação contra o Senador Fulvio Teste Silva (PL) e o Senador Ana Maria Senadora (PT), por quebra de decoro", roster).senador_ids, [1, 2])
    assert.deepEqual(alvoDaEmentaPce("Representação contra o Senador Fulvio Teste Silva (PL – RJ) e o Senador Ana Maria Senadora (PT—BA)", roster).senador_ids, [1, 2])
  })
})
