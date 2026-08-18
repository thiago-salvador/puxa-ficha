/**
 * Procedência do zero no relatório de cobertura (2026-08-04).
 *
 * O que estes testes protegem é uma distinção editorial, não um detalhe de
 * implementação: até 04/08 o relatório dizia "zero" para 954 células sem
 * conseguir separar "consultamos e não havia" de "nunca fomos olhar". Quem lê
 * "0 sanções" ao lado de um político com cinco mandatos precisa saber qual dos
 * dois é. Errar aqui é publicar silêncio como se fosse resposta.
 *
 * A regra sob teste é conservadora de propósito: só vira `vazio_confirmado`
 * quando TODAS as fontes daquela coluna responderam, e qualquer sinal de falha
 * ou de fonte não consultada rebaixa o veredito.
 */

import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  COLUNAS,
  COLUNAS_DO_INDICE,
  FONTES_POR_COLUNA,
  PATRIMONIO_ANO_INICIAL_APLICAVEL,
  calcularCelulas,
  calcularFontesNaoAplicaveis,
  patrimonioPorEleicao,
  provenienciaDoZero,
  type CandidatoCoverage,
  type ColetaPorFonte
} from "../scripts/audit/lib/coverage-model"
import type { UltimaColeta } from "../scripts/audit/lib/coleta-proveniencia"
import { removerBlocoDeAusencias, removerBlocoDeColeta } from "../scripts/audit/lib/snapshot-fetch"
import { lerSnapshot } from "../scripts/audit/coverage-report"

/** Candidato mínimo: tudo vazio, que é o cenário em que a procedência importa. */
function candidato(over: Partial<CandidatoCoverage> = {}): CandidatoCoverage {
  return {
    slug: "fulano",
    nome_urna: "Fulano",
    partido_sigla: "XPTO",
    cargo_disputado: "Governador",
    estado: "SP",
    foto: false,
    foto_url: null,
    foto_origem: null,
    bio: false,
    redes: false,
    idade: null,
    naturalidade: null,
    formacao: null,
    profissao: null,
    historico: [],
    temSqNoSeed: false,
    temIdCamaraNoSeed: false,
    temIdSenadoNoSeed: false,
    mudancas: 0,
    patrimonioAnos: [],
    patrimonioAnosComBens: [],
    patrimonioAusenciasOficiais: [],
    financiamentoAnos: [],
    financiamentoAnosComDoadores: [],
    votos: 0,
    contradicoes: 0,
    processos: 0,
    alertas: 0,
    projetos: 0,
    destaquesVisiveis: 0,
    destaquesTotais: 0,
    gastosAnos: [],
    legislacaoExecutivo: 0,
    noticias: 0,
    posicoesTemasVerificados: [],
    posicoesTemasPendentes: [],
    sancoes: 0,
    itensRevisar: [],
    ...over
  }
}

function origemFoto(url: string): "local" | "tse" | "wikimedia" | "oficial" | "terceiro" {
  if (url.startsWith("/") && !url.startsWith("//")) return "local"
  if (/^https?:\/\/([a-z0-9-]+\.)*tse\.jus\.br([/:?#]|$)/i.test(url)) return "tse"
  if (/^https?:\/\/([a-z0-9-]+\.)*(wikimedia|wikipedia)\.org([/:?#]|$)/i.test(url)) {
    return "wikimedia"
  }
  if (
    /^https?:\/\/([a-z0-9-]+\.)*(camara\.leg\.br|senado\.leg\.br|gov\.br)([/:?#]|$)/i.test(
      url
    )
  ) {
    return "oficial"
  }
  return "terceiro"
}

type Desfecho = UltimaColeta["resultado"]

/** Todas as fontes de uma coluna com o mesmo desfecho. */
function todas(coluna: string, r: Desfecho): ColetaPorFonte {
  return Object.fromEntries(FONTES_POR_COLUNA[coluna].map((f) => [f, { resultado: r }]))
}

test("sem log de coleta lido, nenhum zero afirma nada", () => {
  assert.equal(provenienciaDoZero("sancoes", undefined), "desconhecida")
  // E o relatório precisa dizer isso na célula, não esconder.
  const cel = calcularCelulas(candidato()).sancoes
  assert.equal(cel.state, "zero")
  assert.equal(cel.proveniencia, "desconhecida")
})

test("candidato olhado mas sem nenhuma tentativa é 'nunca verificado', não 'vazio'", () => {
  // A diferença entre `undefined` (não lemos o log) e `{}` (lemos, e não há
  // tentativa) é o coração da feature: colapsar as duas repete o bug antigo.
  assert.equal(provenienciaDoZero("sancoes", {}), "nunca_verificado")
})

test("só vira zero provado quando toda fonte da coluna respondeu vazio", () => {
  assert.equal(provenienciaDoZero("sancoes", todas("sancoes", "vazio_confirmado")), "zero_provado")

  // `cargos` depende de quatro fontes; três não bastam.
  const parcial = { ...todas("cargos", "vazio_confirmado") }
  delete parcial[FONTES_POR_COLUNA.cargos[0]]
  assert.equal(provenienciaDoZero("cargos", parcial), "nunca_verificado")
})

test("uma falha rebaixa o veredito mesmo com as outras fontes confirmadas", () => {
  const comErro: ColetaPorFonte = {
    ...todas("alertas", "vazio_confirmado"),
    tcu: { resultado: "erro" }
  }
  assert.equal(provenienciaDoZero("alertas", comErro), "nao_sabemos")

  const semVeredito: ColetaPorFonte = {
    ...todas("alertas", "vazio_confirmado"),
    tcu: { resultado: "indeterminado" }
  }
  assert.equal(provenienciaDoZero("alertas", semVeredito), "nao_sabemos")
})

test("'nao_aplicavel' não impede o zero de ser confirmado", () => {
  // A fonte declarou que a pergunta não cabe para este alvo. Isso é resposta,
  // não silêncio, então não pode rebaixar o veredito das outras.
  const misto: ColetaPorFonte = {
    ...todas("partidos", "vazio_confirmado"),
    filiacao: { resultado: "nao_aplicavel" }
  }
  assert.equal(provenienciaDoZero("partidos", misto), "zero_provado")
})

test("'encontrado' com célula zerada não vira zero provado", () => {
  // A coleta trouxe dado e a ficha está vazia: o vazio é do recorte da régua
  // (uma cota antiga demais para a janela, por exemplo), e não da fonte. O que
  // não pode acontecer é esse zero sair vendido como confirmado.
  assert.equal(provenienciaDoZero("sancoes", todas("sancoes", "encontrado")), "coletado")
})

test("processos e contradições têm procedência de curadoria manual", () => {
  assert.deepEqual(FONTES_POR_COLUNA.processos, ["processos-curadoria"])
  assert.deepEqual(FONTES_POR_COLUNA.contradicoes, ["contradicoes-curadoria"])
  assert.equal(provenienciaDoZero("processos", {}), "nunca_verificado")
  assert.equal(provenienciaDoZero("processos", undefined), "desconhecida")
})

test("tentativa artificial não fecha cobertura de curadoria", () => {
  const tentativa: ColetaPorFonte = {
    "contradicoes-curadoria": { resultado: "indeterminado" }
  }
  assert.equal(provenienciaDoZero("contradicoes", tentativa), "nao_sabemos")

  const concluida: ColetaPorFonte = {
    "contradicoes-curadoria": { resultado: "sem_achado_no_escopo" }
  }
  assert.equal(
    provenienciaDoZero("contradicoes", concluida),
    "curadoria_concluida_sem_achado"
  )
})

test("célula com dado não recebe procedência", () => {
  const cel = calcularCelulas(candidato({ sancoes: 2 }))
  assert.equal(cel.sancoes.state, "ok")
  assert.equal(cel.sancoes.proveniencia, undefined)
})

test("candidatura sem mandato continua sendo trajetória preenchida", () => {
  const cel = calcularCelulas(candidato({
    historico: [{
      cargo_canonico: "Presidente",
      tipo_evento: "candidatura",
      periodo_inicio: 2022,
      periodo_fim: 2022,
    }],
  })).cargos

  assert.equal(cel.state, "ok")
  assert.equal(cel.text, "0 mandatos · 1 candidatura")
})

test("origem técnica da foto não altera o índice nem presume direitos", () => {
  const local = calcularCelulas(candidato({ foto: true, foto_origem: "local" })).foto_origem
  const oficial = calcularCelulas(candidato({ foto: true, foto_origem: "tse" })).foto_origem
  const semFoto = calcularCelulas(candidato()).foto_origem

  assert.deepEqual({ state: local.state, text: local.text }, { state: "partial", text: "Local" })
  assert.match(local.tip ?? "", /não afirma autoria, licença ou titularidade/)
  assert.deepEqual({ state: oficial.state, text: oficial.text }, { state: "ok", text: "TSE" })
  assert.equal(semFoto.state, "na")
  assert.ok(!COLUNAS_DO_INDICE.includes("foto_origem" as never))
})

test("placeholder persistido não conta como foto preenchida", () => {
  const celulas = calcularCelulas(candidato({
    foto: true,
    foto_url: "https://ui-avatars.com/api/?name=Fulano",
    foto_origem: "terceiro",
  }))

  assert.equal(celulas.foto.state, "missing")
  assert.equal(celulas.foto_origem.state, "na")
})

test("origem técnica da foto exige hostname confiável", () => {
  const sql = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "coverage-snapshot.sql"),
    "utf8"
  )

  assert.equal(origemFoto("/candidates/foto.jpg"), "local")
  assert.equal(origemFoto("//example.org/foto.jpg"), "terceiro")
  assert.equal(origemFoto("https://tse.jus.br/foto.jpg"), "tse")
  assert.equal(origemFoto("https://upload.wikimedia.org/foto.jpg"), "wikimedia")
  assert.equal(origemFoto("https://www.gov.br/foto.jpg"), "oficial")
  assert.equal(origemFoto("https://example.org/tse.jus.br/foto.jpg"), "terceiro")
  assert.equal(origemFoto("https://example.org/foto.jpg?ref=senado.leg.br"), "terceiro")
  assert.equal(origemFoto("https://evilgov.br/foto.jpg"), "terceiro")

  assert.match(sql, /c\.foto_url not like '\/\/%'/)
  assert.match(sql, /\^https\?:\/\/\(\[a-z0-9-\]\+\\\.\)\*tse\\\.jus\\\.br/)
  assert.doesNotMatch(sql, /like '%tse\.jus\.br%'/)
})

test("candidato sem tentativa e log não lido não se confundem na célula", () => {
  const comTentativa = candidato({
    coletas: { "transparencia-sanctions": { resultado: "vazio_confirmado" } }
  })
  const olhadoSemTentativa = candidato({ coletas: {} })

  assert.equal(calcularCelulas(comTentativa).sancoes.proveniencia, "zero_provado")
  assert.equal(calcularCelulas(olhadoSemTentativa).sancoes.proveniencia, "nunca_verificado")
  assert.equal(calcularCelulas(candidato()).sancoes.proveniencia, "desconhecida")
})

test("fontes federais sem ID nem mandato são N/A, não trabalho pendente", () => {
  assert.deepEqual(calcularFontesNaoAplicaveis(candidato()), {
    camara: "N/A pelo histórico e pelo seed: sem mandato ou ID da Câmara",
    jarbas: "N/A pelo histórico e pelo seed: sem mandato ou ID da Câmara",
    senado: "N/A pelo histórico e pelo seed: sem mandato ou ID do Senado",
    "ceaps-senado": "N/A pelo histórico e pelo seed: sem mandato ou ID do Senado"
  })
})

test("mandato registrado mantém a fonte aplicável mesmo se o ID faltar no seed", () => {
  const deputado = candidato({
    historico: [
      {
        cargo_canonico: "Deputado Federal",
        tipo_evento: "mandato",
        periodo_inicio: 2019,
        periodo_fim: 2023
      }
    ]
  })
  const senador = candidato({
    historico: [
      {
        cargo_canonico: "Senador",
        tipo_evento: "mandato",
        periodo_inicio: 2019,
        periodo_fim: 2027
      }
    ]
  })

  assert.equal(calcularFontesNaoAplicaveis(deputado).camara, undefined)
  assert.equal(calcularFontesNaoAplicaveis(deputado).jarbas, undefined)
  assert.ok(calcularFontesNaoAplicaveis(deputado).senado)
  assert.equal(calcularFontesNaoAplicaveis(senador).senado, undefined)
  assert.equal(calcularFontesNaoAplicaveis(senador)["ceaps-senado"], undefined)
  assert.ok(calcularFontesNaoAplicaveis(senador).camara)
})

test("o bloco de coleta do SQL é removível, para banco sem a migration", () => {
  // A guarda não cabe dentro do SELECT (a relação é resolvida na análise do
  // comando), então a degradação depende destes marcadores. Renomeá-los sem
  // mexer no strip deixaria o relatório quebrado em banco novo.
  const sql = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "coverage-snapshot.sql"),
    "utf8"
  )
  assert.ok(sql.includes("from coleta_log_ultima"), "o SQL completo lê a view")

  const semColeta = removerBlocoDeColeta(sql)
  assert.ok(
    !semColeta.includes("from coleta_log_ultima"),
    "sem a migration, a view não pode ser referenciada por nenhuma cláusula"
  )
  assert.ok(semColeta.includes("'historico'"), "o resto do snapshot continua inteiro")
  assert.throws(() => removerBlocoDeColeta("select 1"), /marcadores/)
})

test("o mapa de fontes cobre todas as colunas do relatório", () => {
  // Coluna nova sem entrada aqui sairia como procedência desconhecida para
  // sempre, sem ninguém perceber. O mapa é canônico: ele descreve as 23 colunas
  // e não só as de zero ambíguo, então o teste cobra a lista inteira.
  const semMapa = COLUNAS.map((c) => c.key).filter((k) => !FONTES_POR_COLUNA[k])
  assert.deepEqual(semMapa, [], "coluna do relatório sem entrada em FONTES_POR_COLUNA")
})

test("o mapa lista todo ingest que escreve na tabela da coluna", () => {
  // Fonte a menos aqui é pior que fonte a mais: `zero_provado` exige que TODAS
  // as fontes tenham respondido, então esquecer uma faz um zero passar por
  // confirmado sem que ela tenha sido ouvida. Estes dois furos foram achados em
  // 04/08 comparando o mapa com quem escreve em cada tabela.
  assert.deepEqual(
    [...FONTES_POR_COLUNA.cargos].sort(),
    ["senado", "tse-historico", "wiki-historico", "wikidata-politico"],
    "historico_politico tem quatro escritores recorrentes"
  )
  assert.deepEqual(
    [...FONTES_POR_COLUNA.alertas].sort(),
    ["jarbas", "tcu", "transparencia-sanctions"],
    "pontos_atencao é escrita por três ingests, não é coluna derivada"
  )
})

// ── Patrimônio por eleição aplicável (2026-08-07) ───────────────────
//
// Até aqui a célula de patrimônio dizia "ok" para qualquer bem publicado e
// escondia eleições aplicáveis sem dado: quem publicou 2006 e 2010 saía
// completo mesmo com a candidatura de 2014 sem registro em lugar nenhum. A
// régua passa a medir cobertos/aplicáveis, com ausência oficial confirmada
// contando como cobertura.

test("patrimônio: publicado + vazio confirmado sem lacunas = ok", () => {
  // Caso real que motivou a régua nova: rui-costa-pimenta tem bens 2006/2010
  // publicados e a eleição de 2014 confirmada sem bens no pacote oficial do
  // TSE. As três eleições ficam cobertas.
  const cel = calcularCelulas(
    candidato({
      temSqNoSeed: true,
      patrimonioAnos: [2006, 2010],
      patrimonioAnosComBens: [2006, 2010],
      patrimonioAusenciasOficiais: [2014]
    })
  ).patrimonio

  assert.equal(cel.state, "ok")
  assert.equal(cel.text, "3/3 · 1 ausência confirmada")
  assert.match(cel.tip ?? "", /2014/)
  assert.match(cel.tip ?? "", /pacote oficial/)
})

test("patrimônio: publicado com lacuna = parcial, e a lacuna aparece", () => {
  // Candidatura registrada no TSE em 2018 sem dado publicado: a régua antiga
  // dizia "1 ano" (ok); a nova cobra a eleição faltante.
  const cel = calcularCelulas(
    candidato({
      historico: [
        {
          cargo_canonico: "Deputado Federal",
          tipo_evento: "candidatura",
          periodo_inicio: 2018,
          periodo_fim: 2018,
          proveniencia: "tse"
        }
      ],
      patrimonioAnos: [2006],
      patrimonioAnosComBens: [2006]
    })
  ).patrimonio

  assert.equal(cel.state, "partial")
  assert.equal(cel.text, "1/2")
  assert.match(cel.tip ?? "", /sem dado nem confirmação: 2018/)
})

test("eleição com ausência oficial conta como cobertura mesmo sem histórico", () => {
  // A ausência confirmada entra na união das eleições aplicáveis: não depende
  // de a eleição estar no histórico para contar.
  const cel = calcularCelulas(
    candidato({
      temSqNoSeed: true,
      patrimonioAusenciasOficiais: [2018]
    })
  )

  assert.equal(cel.patrimonio.state, "ok")
  assert.equal(cel.patrimonio.text, "1/1 · 1 ausência confirmada")
  // Sem conjunto publicado e sem lacuna, evolução e bens não têm o que medir:
  // n/a, nunca lacuna (o vazio foi confirmado na fonte oficial).
  assert.equal(cel.evolucao.state, "na")
  assert.equal(cel.bens.state, "na")
})

test("ausência confirmada sem mais nada publicado não vira parcial", () => {
  // Publicada nenhuma + lacunas: é missing, porque parcial exige publicado.
  const cel = calcularCelulas(
    candidato({
      temSqNoSeed: true,
      patrimonioAusenciasOficiais: [2018],
      historico: [
        {
          cargo_canonico: "Governador",
          tipo_evento: "candidatura",
          periodo_inicio: 2022,
          periodo_fim: 2022,
          proveniencia: "tse"
        }
      ]
    })
  ).patrimonio

  assert.equal(cel.state, "missing")
  assert.equal(cel.text, "1/2 · 1 ausência confirmada")
})

test("eleição anterior a 2006 não entra na régua de patrimônio", () => {
  assert.equal(PATRIMONIO_ANO_INICIAL_APLICAVEL, 2006)

  const r = patrimonioPorEleicao(
    candidato({
      historico: [
        {
          cargo_canonico: "Deputado Estadual",
          tipo_evento: "mandato",
          periodo_inicio: 2002,
          periodo_fim: 2006,
          proveniencia: "tse"
        }
      ],
      patrimonioAnos: [2004],
      patrimonioAusenciasOficiais: [2004]
    })
  )
  assert.deepEqual(r.aplicaveis, [])
})

test("sem eleições aplicáveis mantém n/a", () => {
  // Quem nunca declarou: o gate antigo continua valendo.
  assert.equal(calcularCelulas(candidato()).patrimonio.state, "na")

  // Quem declarou só antes de 2006: janela não cobre nada, n/a em vez de lacuna.
  const pre2006 = calcularCelulas(
    candidato({
      historico: [
        {
          cargo_canonico: "Deputado Estadual",
          tipo_evento: "mandato",
          periodo_inicio: 1999,
          periodo_fim: 2003,
          proveniencia: "tse"
        }
      ]
    })
  )
  assert.equal(pre2006.patrimonio.state, "na")
  assert.match(pre2006.patrimonio.tip ?? "", /nenhuma eleição aplicável/)
})

test("eleições aplicáveis: união deduplicada, proveniência tse e janela >= 2006", () => {
  const r = patrimonioPorEleicao(
    candidato({
      historico: [
        {
          cargo_canonico: "Governador",
          tipo_evento: "candidatura",
          periodo_inicio: 2014,
          periodo_fim: 2014,
          proveniencia: "tse"
        },
        {
          cargo_canonico: "Governador",
          tipo_evento: "candidatura",
          periodo_inicio: 2004,
          periodo_fim: 2004,
          proveniencia: "tse"
        },
        {
          cargo_canonico: "Senador",
          tipo_evento: "mandato",
          periodo_inicio: 2015,
          periodo_fim: 2023,
          proveniencia: "wikidata"
        }
      ],
      patrimonioAnos: [2014, 2018],
      patrimonioAusenciasOficiais: [2018, 2022]
    })
  )

  // 2004 cai pela janela; wikidata não cria eleição; 2014 e 2018 deduplicam.
  assert.deepEqual(r.aplicaveis, [2014, 2018, 2022])
  // Publicado precede ausência confirmada no mesmo ano.
  assert.deepEqual(r.publicados, [2014, 2018])
  assert.deepEqual(r.ausenciasConfirmadas, [2022])
  assert.deepEqual(r.lacunas, [])
})

test("histórico sem proveniência (snapshot antigo) não cria eleição aplicável", () => {
  const cel = calcularCelulas(
    candidato({
      temSqNoSeed: true,
      historico: [
        {
          cargo_canonico: "Presidente",
          tipo_evento: "candidatura",
          periodo_inicio: 2014,
          periodo_fim: 2014
        }
      ]
    })
  ).patrimonio

  // Declarou ao TSE (SQ no seed), mas sem proveniência conhecida não há
  // eleição aplicável: n/a, nunca lacuna inventada.
  assert.equal(cel.state, "na")
})

test("o bloco de ausências oficiais do SQL é removível, para banco sem a migration", () => {
  // A tabela patrimonio_ausencia_oficial só existe depois do apply; o relatório
  // continua funcionando hoje porque o bloco sai do SQL antes do envio, pelo
  // mesmo mecanismo do bloco de coleta.
  const sql = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "coverage-snapshot.sql"),
    "utf8"
  )
  assert.ok(sql.includes("from patrimonio_ausencia_oficial"), "o SQL completo lê a tabela")

  const semAusencias = removerBlocoDeAusencias(sql)
  assert.ok(
    !semAusencias.includes("from patrimonio_ausencia_oficial"),
    "sem a migration, a tabela não pode ser referenciada por nenhuma cláusula"
  )
  assert.ok(semAusencias.includes("'patrimonioAnosComBens'"), "o resto do snapshot continua inteiro")
  assert.ok(semAusencias.includes("'financiamentoAnos'"))
  assert.throws(() => removerBlocoDeAusencias("select 1"), /marcadores/)

  // Os dois blocos opcionais saem juntos sem quebrar o restante.
  const semNenhum = removerBlocoDeAusencias(removerBlocoDeColeta(sql))
  assert.ok(!semNenhum.includes("from coleta_log_ultima"))
  assert.ok(!semNenhum.includes("from patrimonio_ausencia_oficial"))
  assert.ok(semNenhum.includes("'historico'"))
})

test("o histórico do snapshot carrega a proveniência, insumo da régua por eleição", () => {
  // Sem esta linha no SQL, o modelo não distingue linha tse de curadoria e a
  // régua por eleição perde o denominador inteiro (silenciosamente).
  const sql = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "coverage-snapshot.sql"),
    "utf8"
  )
  assert.match(sql, /'proveniencia', h\.proveniencia/)
})

test("snapshot sem a chave de ausências oficiais degrada para lista vazia", () => {
  const dir = mkdtempSync(join(tmpdir(), "regua-cobertura-"))
  const caminho = join(dir, "snapshot.json")
  writeFileSync(
    caminho,
    JSON.stringify([
      {
        slug: "fulano",
        nome_urna: "Fulano",
        partido_sigla: "XPTO",
        cargo_disputado: "Governador",
        estado: "SP",
        historico: [],
        patrimonioAnos: [],
        patrimonioAusenciasOficiais: [2018, "x", null]
      },
      {
        slug: "ciclano",
        nome_urna: "Ciclano",
        partido_sigla: "XPTO",
        cargo_disputado: "Governador",
        estado: "SP",
        historico: [],
        patrimonioAnos: []
      }
    ])
  )

  const [comLista, semLista] = lerSnapshot(caminho)
  assert.deepEqual(comLista.patrimonioAusenciasOficiais, [2018])
  assert.deepEqual(semLista.patrimonioAusenciasOficiais, [])
})

/**
 * Vistoria dos PRs #141/#142. O denominador declarado pela Câmara só pode se
 * comparar com as linhas de fonte Câmara: `c.projetos` soma Senado e curadoria,
 * e 100 da Câmara + 104 do Senado passando por 204 declaradas seria o falso
 * completo da issue #138 de volta, agora assinado pela régua.
 */
test("acervo multi-fonte não vira ok contra o declarado pela Câmara", () => {
  const coletas: ColetaPorFonte = {
    "camara-proposicoes": { resultado: "encontrado", volume: 204 }
  }

  // O cenário exato da vistoria: 204 no total, mas só 100 vieram da Câmara.
  const truncada = calcularCelulas(
    candidato({ projetos: 204, projetosCamara: 100, coletas })
  ).projetos
  assert.equal(truncada.state, "partial")
  assert.match(truncada.text, /100\/204/)
  assert.match(truncada.tip ?? "", /truncado/)

  // Completo de verdade: as 204 da Câmara estão lá, extras de outras fontes não atrapalham.
  const completa = calcularCelulas(
    candidato({ projetos: 304, projetosCamara: 204, coletas })
  ).projetos
  assert.equal(completa.state, "ok")
})

test("snapshot antigo sem projetosCamara não afirma completude", () => {
  const coletas: ColetaPorFonte = {
    "camara-proposicoes": { resultado: "encontrado", volume: 204 }
  }
  const cel = calcularCelulas(candidato({ projetos: 204, coletas })).projetos
  assert.equal(cel.state, "partial")
  assert.match(cel.tip ?? "", /sem a contagem por fonte/)
})

test("sem registro camara-proposicoes no log, projetos positivos não viram ok", () => {
  const cel = calcularCelulas(candidato({ projetos: 100, projetosCamara: 100 })).projetos
  assert.equal(cel.state, "partial")
  assert.match(cel.tip ?? "", /sem cardinalidade declarada/)
})

test("o snapshot expõe a contagem por fonte da Câmara", () => {
  const sql = readFileSync(
    join(import.meta.dirname, "..", "scripts", "audit", "coverage-snapshot.sql"),
    "utf8"
  )
  assert.match(sql, /'projetosCamara'/)
  assert.match(sql, /pl\.fonte = 'Camara'/)
})
