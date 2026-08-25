import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  CARGOS_ALVO,
  CLASSE_QUE_PROMOVE_CHAVE,
  classificarIdentidade,
  derivarUniversoNoSafeMatch,
  ehSubconjunto,
  tokenizar,
  type FontesTse,
  type LinhaTse,
  type PerfilDaFicha,
} from "../scripts/lib/identidade-etapa2-classificador"
import {
  avaliarMaterializacaoTse2026,
  carregarIdentidadeEtapa2,
  conferirSeedContraEtapa2,
  criarIndiceIdentidadeEtapa2,
  exigirMaterializacaoTse2026,
  parseRegistroIdentidadeEtapa2,
  recomputarDiagnosticoSha256,
  recomputarSlugsHash,
  registroVencido,
  type CandidatoDoSeed,
} from "../scripts/lib/identidade-etapa2"

/**
 * Proteção versionada da etapa 2.
 *
 * ## O que este arquivo substitui
 *
 * `output/pf-reverificacao-20260809/verificar-etapa-2.test.mjs` roda apenas na
 * máquina que tem 3,3 MB de ZIPs do TSE e 2,98 MB de ledger, todos gitignorados
 * por `.gitignore:15`. Ele nunca chegou ao CI, e tinha quatro furos medidos:
 *
 * 1. o laço de contenção de chave é de forma vacuous-pass (diagnóstico vazio passa);
 * 2. nunca afirma que `match_fresco` TEM chave;
 * 3. não afirma contagem nenhuma, nem 71 nem 12/12/1/1/2/43;
 * 4. confere hashes contra o arquivo que o próprio script acabara de reescrever.
 *
 * Aqui não há nenhum acesso a `output/` e nenhum ramo de skip. As 71 entradas
 * versionadas reproduzem os dois hashes do pipeline original, e a cascata é
 * exercitada com fixtures inline de uma a três linhas.
 */

const RAIZ = join(import.meta.dirname, "..")

// ---------------------------------------------------------------------------
// Fixtures inline da cascata
// ---------------------------------------------------------------------------

function linha(over: Partial<LinhaTse> = {}): LinhaTse {
  return {
    SQ_CANDIDATO: "90002540993",
    NM_CANDIDATO: "DANIEL ELIAS CARVALHO VILELA",
    NM_URNA_CANDIDATO: "DANIEL VILELA",
    DS_CARGO: "GOVERNADOR",
    SG_UF: "GO",
    SG_PARTIDO: "MDB",
    NR_CANDIDATO: "15",
    ...over,
  }
}

function perfil(over: Partial<PerfilDaFicha> = {}): PerfilDaFicha {
  return {
    slug: "fx-slug",
    nome_completo: "Daniel Elias Carvalho Vilela",
    nome_urna: "Daniel Vilela",
    cargo_disputado: "Governador",
    estado: "GO",
    ...over,
  }
}

function fontes(todas: LinhaTse[], over: Partial<FontesTse> = {}): FontesTse {
  return {
    todas,
    sqComComplemento: new Set(),
    redesPorSq: new Map(),
    ...over,
  }
}

describe("cascata de identidade, degrau por degrau", () => {
  it("1. match exato promove chave e frentes", () => {
    const chamariz = linha({ SQ_CANDIDATO: "111", SG_UF: "SP" })
    const r = classificarIdentidade(
      perfil(),
      fontes([linha(), chamariz], {
        sqComComplemento: new Set(["90002540993"]),
        redesPorSq: new Map([["90002540993", 8]]),
      }),
    )
    assert.equal(r.classe, "match_fresco")
    assert.equal(r.chave?.value, "90002540993")
    assert.deepEqual(r.frentes_tse, {
      registration: true,
      complement: true,
      social_networks: true,
      social_count: 8,
    })
    assert.equal(r.hits.length, 1, "a linha de outra UF não pode entrar em hits")
  })

  it("2. match exato sem complemento nem redes não inventa frentes", () => {
    // Caso real: felicio-ramuth, zero redes declaradas.
    const r = classificarIdentidade(perfil(), fontes([linha()]))
    assert.deepEqual(r.frentes_tse, {
      registration: true,
      complement: false,
      social_networks: false,
      social_count: 0,
    })
  })

  it("3. duplicidade exata vira ambiguo e NÃO promove chave", () => {
    // Zero ocorrências no dado real: sem este caso sintético, a tier poderia ser
    // apagada num refactor e toda asserção sobre dado real continuaria verde.
    const r = classificarIdentidade(
      perfil(),
      fontes([linha({ SQ_CANDIDATO: "111" }), linha({ SQ_CANDIDATO: "222" })]),
    )
    assert.equal(r.classe, "ambiguo")
    assert.equal(r.hits.length, 2)
    assert.equal(Object.hasOwn(r, "chave"), false)
    assert.equal(Object.hasOwn(r, "frentes_tse"), false)
  })

  it("4. nome civil igual com urna divergente encaminha revisão", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "alysson-bezerra",
        nome_completo: "Allyson Leandro Bezerra Silva",
        nome_urna: "Alysson Bezerra",
        estado: "RN",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "200002535255",
          NM_CANDIDATO: "ALLYSON LEANDRO BEZERRA SILVA",
          NM_URNA_CANDIDATO: "ALLYSON",
          SG_UF: "RN",
        }),
      ]),
    )
    assert.equal(r.classe, "revisao_identidade")
    assert.match(r.motivo, /falta nome de urna/)
    assert.equal(Object.hasOwn(r, "chave"), false)
    // A evidência é preservada, e é o que torna a revisão possível.
    assert.equal(r.hits[0].sq, "200002535255")
  })

  it("5. subset do nome do TSE encaminha revisão", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "camila-falcao",
        nome_completo: "Camila Falcão",
        nome_urna: "Camila Falcao",
        estado: "PE",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "170002537320",
          NM_CANDIDATO: "MARIA CAMILA DA SILVA FALCÃO",
          NM_URNA_CANDIDATO: "PROFESSORA CAMILA",
          SG_UF: "PE",
        }),
      ]),
    )
    assert.equal(r.classe, "revisao_identidade")
    assert.match(r.motivo, /subconjunto/)
    assert.equal(Object.hasOwn(r, "chave"), false)
  })

  it("5b. chave independente promove quando a urna diverge mas a data de nascimento bate", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "fx-urna-diverge-com-data",
        nome_completo: "Allyson Leandro Bezerra Silva",
        nome_urna: "Alysson Bezerra",
        estado: "RN",
        data_nascimento: "1992-05-12",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "200002535255",
          NM_CANDIDATO: "ALLYSON LEANDRO BEZERRA SILVA",
          NM_URNA_CANDIDATO: "ALLYSON",
          SG_UF: "RN",
          DT_NASCIMENTO: "12/05/1992",
        }),
      ]),
    )
    assert.equal(r.classe, "match_fresco")
    assert.match(r.motivo, /chave independente/)
    assert.deepEqual(r.chave, { type: "SQ_CANDIDATO", value: "200002535255" })
    assert.equal(r.frentes_tse?.registration, true)
  })

  it("5c. chave independente promove no degrau do subconjunto", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "fx-subconjunto-com-data",
        nome_completo: "Mateus Simões",
        nome_urna: "Mateus Simoes",
        estado: "MG",
        data_nascimento: "1981-03-09",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "130002541911",
          NM_CANDIDATO: "MATEUS SIMÕES DE ALMEIDA",
          NM_URNA_CANDIDATO: "MATEUS SIMÕES DE ALMEIDA",
          SG_UF: "MG",
          DT_NASCIMENTO: "09/03/1981",
        }),
      ]),
    )
    assert.equal(r.classe, "match_fresco")
    assert.match(r.motivo, /chave independente/)
    assert.equal(r.chave?.value, "130002541911")
  })

  it("5d. dois hits com a MESMA data de nascimento não promovem", () => {
    // Homônimo com data igual é raro, não impossível, e foi o modo de falha que
    // derrubou a rota 2 do backfill de CPF. O guarda é a cardinalidade, não a data.
    const r = classificarIdentidade(
      perfil({
        nome_completo: "Daniel Elias Carvalho Vilela",
        nome_urna: "Outro Nome De Urna",
        data_nascimento: "1980-01-15",
      }),
      fontes([
        linha({ SQ_CANDIDATO: "111", NM_URNA_CANDIDATO: "DANIEL", DT_NASCIMENTO: "15/01/1980" }),
        linha({ SQ_CANDIDATO: "222", NM_URNA_CANDIDATO: "VILELA", DT_NASCIMENTO: "15/01/1980" }),
      ]),
    )
    assert.equal(r.classe, "revisao_identidade")
    assert.equal(Object.hasOwn(r, "chave"), false)
  })

  it("5e. data ausente de qualquer um dos lados mantém a revisão", () => {
    const semDataNaFicha = classificarIdentidade(
      perfil({ nome_urna: "Outro Nome", data_nascimento: null }),
      fontes([linha({ NM_URNA_CANDIDATO: "DANIEL", DT_NASCIMENTO: "15/01/1980" })]),
    )
    assert.equal(semDataNaFicha.classe, "revisao_identidade")

    const semDataNoTse = classificarIdentidade(
      perfil({ nome_urna: "Outro Nome", data_nascimento: "1980-01-15" }),
      fontes([linha({ NM_URNA_CANDIDATO: "DANIEL" })]),
    )
    assert.equal(semDataNoTse.classe, "revisao_identidade")
    assert.equal(Object.hasOwn(semDataNoTse, "chave"), false)
  })

  it("5f. data malformada, impossível ou divergente nunca promove", () => {
    const casos: [string | null, string][] = [
      ["1980-01-15", "1980-01-15"], // ISO no lado TSE, que usa DD/MM/YYYY
      ["1980-01-15", "15/1/1980"],
      ["1980-02-30", "30/02/1980"], // calendário não tem, e não pode rolar para 01/03
      ["1980-01-15", "16/01/1980"], // simplesmente diverge
      ["", "15/01/1980"],
    ]
    for (const [naFicha, noTse] of casos) {
      const r = classificarIdentidade(
        perfil({ nome_urna: "Outro Nome", data_nascimento: naFicha }),
        fontes([linha({ NM_URNA_CANDIDATO: "DANIEL", DT_NASCIMENTO: noTse })]),
      )
      assert.equal(r.classe, "revisao_identidade", `${naFicha} vs ${noTse} promoveu indevidamente`)
    }
  })

  it("5g. data idêntica não resgata cargo ou UF divergente", () => {
    const r = classificarIdentidade(
      perfil({
        nome_completo: "Eduardo Girão",
        nome_urna: "Eduardo Girao",
        estado: "CE",
        data_nascimento: "1970-07-07",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "280002539825",
          NM_CANDIDATO: "EDUARDO GIRÃO",
          NM_URNA_CANDIDATO: "GIRAO",
          DS_CARGO: "VICE-PRESIDENTE",
          SG_UF: "BR",
          DT_NASCIMENTO: "07/07/1970",
        }),
      ]),
    )
    assert.equal(r.classe, "conflito_cargo_uf")
    assert.equal(Object.hasOwn(r, "chave"), false)
  })

  it("6. conflito de cargo/UF não promove chave", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "eduardo-girao",
        nome_completo: "Eduardo Girão",
        nome_urna: "Eduardo Girao",
        cargo_disputado: "Governador",
        estado: "CE",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "280002539825",
          NM_CANDIDATO: "EDUARDO GIRÃO",
          NM_URNA_CANDIDATO: "GIRAO",
          DS_CARGO: "VICE-PRESIDENTE",
          SG_UF: "BR",
        }),
      ]),
    )
    assert.equal(r.classe, "conflito_cargo_uf")
    assert.equal(Object.hasOwn(r, "chave"), false)
    assert.equal(r.hits[0].sq, "280002539825")
  })

  it("7. registro em outro cargo é conflito editorial, não confirmação", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "jarir-pereira",
        nome_completo: "Jarir Pereira",
        nome_urna: "Jarir Pereira",
        estado: "CE",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "60002538337",
          NM_CANDIDATO: "FRANCISCO JARIR LIMA PEREIRA",
          NM_URNA_CANDIDATO: "JARIR",
          DS_CARGO: "DEPUTADO FEDERAL",
          SG_UF: "CE",
        }),
      ]),
    )
    assert.equal(r.classe, "registro_encontrado_outro_cargo")
    assert.match(r.motivo, /DEPUTADO FEDERAL/)
    assert.equal(Object.hasOwn(r, "chave"), false)
  })

  it("8. urna homônima vai para quarentena, com o SQ preservado como evidência", () => {
    const r = classificarIdentidade(
      perfil({
        slug: "adailton-furia",
        nome_completo: "Adailton de Souza Fúria",
        nome_urna: "Adailton Furia",
        estado: "RO",
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "220002536806",
          NM_CANDIDATO: "ADAILTON ANTUNES FERREIRA",
          NM_URNA_CANDIDATO: "ADAILTON FURIA",
          SG_UF: "RO",
        }),
      ]),
    )
    assert.equal(r.classe, "proxima_possivel_urna")
    assert.equal(Object.hasOwn(r, "chave"), false)
    // O invariante é "nenhuma chave promovida", não "nenhum SQ em lugar nenhum".
    assert.equal(r.hits[0].sq, "220002536806")
  })

  it("9. não localizado não é prova de ausência de registro", () => {
    const r = classificarIdentidade(
      perfil({ slug: "amelio-cayres", nome_completo: "Amelio Cayres de Almeida", nome_urna: "Amelio Cayres", estado: "TO" }),
      fontes([linha()]),
    )
    assert.equal(r.classe, "nao_localizado_pelos_matchers")
    assert.equal(r.hits.length, 0)
    assert.match(r.motivo, /janela de registro aberta até 15\/08/)
  })

  it("10. presidenciável sem UF continua casando (ufOk permissiva)", () => {
    // Sem isto, os 3 presidenciáveis dos 12 cairiam para nao_localizado num
    // refactor de `ufOk`.
    const r = classificarIdentidade(
      perfil({
        slug: "hertz-dias",
        nome_completo: "Hertz Dias",
        nome_urna: "Hertz Dias",
        cargo_disputado: "Presidente",
        estado: null,
      }),
      fontes([
        linha({
          SQ_CANDIDATO: "280002541457",
          NM_CANDIDATO: "HERTZ DIAS",
          NM_URNA_CANDIDATO: "HERTZ DIAS",
          DS_CARGO: "PRESIDENTE",
          SG_UF: "BR",
        }),
      ]),
    )
    assert.equal(r.classe, "match_fresco")
  })

  it("11. a ordem dos degraus é contrato: subset vence urna homônima", () => {
    const porSubset = linha({
      SQ_CANDIDATO: "333",
      NM_CANDIDATO: "MARIA CAMILA DA SILVA FALCAO",
      NM_URNA_CANDIDATO: "OUTRA COISA",
      SG_UF: "PE",
    })
    const porUrna = linha({
      SQ_CANDIDATO: "444",
      NM_CANDIDATO: "PESSOA COMPLETAMENTE DIFERENTE",
      NM_URNA_CANDIDATO: "CAMILA FALCAO",
      SG_UF: "PE",
    })
    const r = classificarIdentidade(
      perfil({ nome_completo: "Camila Falcao", nome_urna: "Camila Falcao", estado: "PE" }),
      fontes([porUrna, porSubset]),
    )
    assert.equal(r.classe, "revisao_identidade")
  })

  it("12. stopwords e subconjunto vazio são regra, não acidente", () => {
    assert.deepEqual(tokenizar("Maria de Souza dos Santos"), ["MARIA", "SOUZA", "SANTOS"])
    assert.equal(ehSubconjunto("Maria Souza", linha({ NM_CANDIDATO: "MARIA DA SILVA SOUZA" })), true)
    // Nome vazio seria subconjunto de todo mundo; o guarda impede.
    assert.equal(ehSubconjunto("", linha()), false)
  })

  it("13. os cargos-alvo são os quatro do universo", () => {
    assert.deepEqual([...CARGOS_ALVO].sort(), [
      "GOVERNADOR",
      "PRESIDENTE",
      "VICE-GOVERNADOR",
      "VICE-PRESIDENTE",
    ])
  })
})

// ---------------------------------------------------------------------------
// Ledger perturbado, sem o ledger de 2,98 MB
// ---------------------------------------------------------------------------

const UNIVERSO_SINTETICO = ["fx-a", "fx-b", "fx-c", "fx-d", "candidatos"]
const LEDGER_SINTETICO = [
  { candidate_slug: "fx-a", proposals: [{ field: "current_candidacy_status", query_result: "no_safe_match" }] },
  { candidate_slug: "fx-b", proposals: [{ field: "current_candidacy_status", query_result: "no_safe_match" }] },
  { candidate_slug: "fx-c", proposals: [{ field: "current_candidacy_status", query_result: "no_safe_match" }] },
  {
    candidate_slug: "fx-d",
    proposals: [{ field: "current_candidacy_status", query_result: "safe_official_registration_found" }],
  },
]

describe("derivação do universo, fail-closed", () => {
  it("deriva os no_safe_match, ordenados, sem o token espúrio", () => {
    const r = derivarUniversoNoSafeMatch(UNIVERSO_SINTETICO, LEDGER_SINTETICO, 3)
    assert.deepEqual(r, ["fx-a", "fx-b", "fx-c"])
    assert.equal(r.includes("candidatos"), false)
  })

  it("ledger perturbado derruba a derivação", () => {
    // Reproduz, sem o artefato, a prova do teste original: virar UM
    // query_result faz o conjunto encolher, e encolher em silêncio pareceria uma
    // classificação bem-sucedida com menos gente.
    const perturbado = LEDGER_SINTETICO.map((l) =>
      l.candidate_slug === "fx-b"
        ? {
            ...l,
            proposals: [{ field: "current_candidacy_status", query_result: "teste_controlado" }],
          }
        : l,
    )
    assert.throws(
      () => derivarUniversoNoSafeMatch(UNIVERSO_SINTETICO, perturbado, 3),
      /esperado 3 no_safe_match, derivado 2/,
    )
  })

  it("slug ausente do ledger não entra por omissão", () => {
    assert.throws(
      () => derivarUniversoNoSafeMatch([...UNIVERSO_SINTETICO, "fx-fantasma"], LEDGER_SINTETICO, 4),
      /esperado 4 no_safe_match, derivado 3/,
    )
  })
})

// ---------------------------------------------------------------------------
// O registro versionado
// ---------------------------------------------------------------------------

const CAMINHO_REGISTRO = join(RAIZ, "data/identidade-etapa2-2026.json")
const TEXTO_REGISTRO = readFileSync(CAMINHO_REGISTRO, "utf8")

/** Registro sintético coerente, para provar que o parser aceita o caminho feliz. */
function registroSintetico(entradas: unknown[]) {
  const contagem: Record<string, number> = {}
  for (const e of entradas as { classe: string }[]) contagem[e.classe] = (contagem[e.classe] ?? 0) + 1
  return {
    versao: 1,
    execucao: "fixture",
    pleito: 2026,
    decidido_em: "2026-08-09",
    total: entradas.length,
    contrato: { classe_que_promove_chave: "match_fresco" },
    renovacao: {
      revalidar_ate: "2026-08-16",
      responsavel: "fixture",
      procedimento: ["npm run data:identidade-etapa2:gerar"],
    },
    consumidores: ["fixture"],
    fonte: {
      diagnostico_final_71_sha256: recomputarDiagnosticoSha256(entradas as never),
      slugs_derivados_71_sha256: recomputarSlugsHash(entradas as never),
    },
    contagem,
    entradas,
  }
}

const ENTRADA_FRESCA = {
  slug: "fx-fresco",
  nome_completo: "Fulano de Tal",
  nome_urna: "Fulano",
  cargo_disputado: "Governador",
  estado: "GO",
  classe: "match_fresco",
  motivo: "casamento exato",
  hits: [{ sq: "123", nome_civil: "FULANO DE TAL", nome_urna: "FULANO", cargo: "GOVERNADOR", uf: "GO", partido: "X", numero: "1" }],
  chave: { type: "SQ_CANDIDATO", value: "123" },
  frentes_tse: { registration: true, complement: true, social_networks: false, social_count: 0 },
}

const ENTRADA_BLOQUEADA = {
  slug: "fx-bloqueado",
  nome_completo: "Sicrano de Tal",
  nome_urna: "Sicrano",
  cargo_disputado: "Governador",
  estado: "GO",
  classe: "revisao_identidade",
  motivo: "nome civil 1:1, urna diverge",
  hits: [{ sq: "999", nome_civil: "SICRANO DE TAL", nome_urna: "OUTRO", cargo: "GOVERNADOR", uf: "GO", partido: "Y", numero: "2" }],
}

describe("parser do registro: adulteração reprova", () => {
  it("o caminho feliz parseia, senão um parser que sempre lança passaria", () => {
    const bom = registroSintetico([ENTRADA_FRESCA, ENTRADA_BLOQUEADA])
    const r = parseRegistroIdentidadeEtapa2(JSON.stringify(bom))
    assert.equal(r.entradas.length, 2)
  })

  it("um caractere alterado em chave.value quebra o hash", () => {
    const adulterado = TEXTO_REGISTRO.replace('"value": "90002540993"', '"value": "90002540994"')
    assert.notEqual(adulterado, TEXTO_REGISTRO, "a substituição não encontrou o alvo")
    assert.throws(
      () => parseRegistroIdentidadeEtapa2(adulterado),
      /diagnostico_final_71_sha256 divergente/,
    )
  })

  it("classe bloqueada promovida a match_fresco reprova", () => {
    const bom = registroSintetico([ENTRADA_FRESCA, ENTRADA_BLOQUEADA])
    const mau = JSON.parse(JSON.stringify(bom))
    mau.entradas[1].classe = "match_fresco"
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /sem chave SQ_CANDIDATO/)
  })

  it("chave em classe bloqueada reprova", () => {
    const bom = registroSintetico([ENTRADA_FRESCA, ENTRADA_BLOQUEADA])
    const mau = JSON.parse(JSON.stringify(bom))
    mau.entradas[1].chave = { type: "SQ_CANDIDATO", value: "999" }
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /expõe propriedade chave/)
  })

  it("reescrever o hash para acomodar a adulteração ainda reprova", () => {
    // Os dois hashes cobrem eixos diferentes: um cobre o conteúdo das entradas,
    // o outro o conjunto de slugs. Ajustar um deixa o outro acusando.
    const mau = JSON.parse(TEXTO_REGISTRO)
    mau.entradas[0].motivo = "motivo reescrito à mão"
    mau.fonte.diagnostico_final_71_sha256 = recomputarDiagnosticoSha256(mau.entradas)
    // Agora o diagnóstico bate, mas o slug set continua íntegro; troque um slug:
    mau.entradas[0].slug = "slug-inventado"
    mau.fonte.diagnostico_final_71_sha256 = recomputarDiagnosticoSha256(mau.entradas)
    assert.throws(
      () => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)),
      /slugs_derivados_71_sha256 divergente/,
    )
  })

  it("contagem declarada divergente reprova", () => {
    const mau = JSON.parse(JSON.stringify(registroSintetico([ENTRADA_FRESCA, ENTRADA_BLOQUEADA])))
    mau.contagem.match_fresco = 5
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /contagem/)
  })

  it("total divergente reprova", () => {
    const mau = JSON.parse(JSON.stringify(registroSintetico([ENTRADA_FRESCA])))
    mau.total = 9
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /total declarado/)
  })

  it("slug duplicado reprova", () => {
    const mau = registroSintetico([ENTRADA_FRESCA, { ...ENTRADA_FRESCA }])
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /slug duplicado/)
  })

  it("bloco de renovação incompleto reprova", () => {
    const mau = JSON.parse(JSON.stringify(registroSintetico([ENTRADA_FRESCA])))
    delete mau.renovacao.responsavel
    assert.throws(() => parseRegistroIdentidadeEtapa2(JSON.stringify(mau)), /renovacao. incompleto/)
  })

  it("JSON inválido e arquivo sem entradas reprovam", () => {
    assert.throws(() => parseRegistroIdentidadeEtapa2("{ nao json"), /JSON inválido/)
    assert.throws(() => parseRegistroIdentidadeEtapa2('{"outra":[]}'), /sem a lista .entradas./)
  })
})

describe("o registro real, contra a passagem vazia", () => {
  const indice = criarIndiceIdentidadeEtapa2(parseRegistroIdentidadeEtapa2(TEXTO_REGISTRO))
  const todos = indice.todos
  const frescos = todos.filter((e) => e.classe === CLASSE_QUE_PROMOVE_CHAVE)
  const bloqueadas = todos.filter((e) => e.classe !== CLASSE_QUE_PROMOVE_CHAVE)

  it("as contagens exatas, que o teste antigo nunca afirmou", () => {
    assert.equal(todos.length, 71)
    // Regenerado em 17/08 contra o snapshot do TSE de 16/08. Os 43 anteriores foram medidos
    // contra o de 08/08, ANTES de a janela de pedido de registro fechar em 15/08: por isso
    // quase todos apareciam como nao localizados. Nao e o gerador ficando permissivo, e a
    // janela tendo fechado. Conferi os 49 contra o CSV oficial: 49 de 49 com o sequencial
    // presente no pacote, zero ausente.
    assert.deepEqual(indice.contagem(), {
      match_fresco: 49,
      revisao_identidade: 13,
      conflito_cargo_uf: 1,
      registro_encontrado_outro_cargo: 2,
      proxima_possivel_urna: 5,
      nao_localizado_pelos_matchers: 1,
    })
  })

  it("os hashes reproduzem o registro publicado, sem tocar em output/", () => {
    // O hash de diagnóstico é o da versão 2 do registro (09/08/2026), quando 10
    // entradas passaram de `revisao_identidade` a `match_fresco` por chave
    // independente. O valor anterior era `fc3e2235…3f8d1cf7`, da v1. Ele é
    // literal de propósito: recomputar dos dados aqui seria tautológico, e é
    // justamente este literal que acusa regeneração silenciosa.
    //
    // O hash dos SLUGS não mudou entre v1 e v2, e não mudar é a prova de que a
    // promoção reclassificou sem mexer no universo dos 71.
    assert.equal(
      recomputarDiagnosticoSha256(todos),
      // v4, regeneracao de 25/08 contra o snapshot publicado pelo TSE em 24/08. As
      // classes e contagens ficaram estaveis, mas sete entradas receberam evidencia
      // oficial atualizada. O valor anterior era `e229a61e…0410641`, da v3 (17/08).
      "1d1f45b9df8318e00511a9461385f6d1a9859404daa2178a8553597d3ae8030b",
    )
    assert.equal(
      recomputarSlugsHash(todos),
      "c05993541835f5ee06879ae084b96450fd78f44e97feffac86987431e22bcff9",
    )
  })

  it("as 22 bloqueadas não têm chave nem frentes, e o laço não é vazio", () => {
    assert.equal(bloqueadas.length, 22)
    for (const e of bloqueadas) {
      assert.equal(Object.hasOwn(e, "chave"), false, `${e.slug} expõe chave`)
      assert.equal(Object.hasOwn(e, "frentes_tse"), false, `${e.slug} expõe frentes_tse`)
    }
  })

  it("os 49 match_fresco TÊM chave e frentes (o positivo que faltava)", () => {
    assert.equal(frescos.length, 49)
    for (const e of frescos) {
      assert.equal(e.chave?.type, "SQ_CANDIDATO")
      assert.match(e.chave?.value ?? "", /^\d+$/)
      assert.equal(e.frentes_tse?.registration, true)
    }
    assert.deepEqual(frescos.map((e) => e.slug), [
      "alysson-bezerra",
      "amelio-cayres",
      "arthur-henrique",
      "celina-leao",
      "cicero-lucena",
      "clecio-luis",
      "daniel-vilela",
      "douglas-ruas",
      "dr-daniel",
      "edegar-pretto",
      "edmilson-costa",
      "eduardo-paes",
      "elmano-de-freitas",
      "eudo-raffael",
      "expedito-netto",
      "fabio-trad",
      "felicio-ramuth",
      "felipe-camarao",
      "flavio-bolsonaro",
      "gabriel-souza",
      "haddad-gov-sp",
      "hana-ghassan",
      "hertz-dias",
      "hildon-chaves",
      "jeremias-cosmo",
      "jeronimo",
      "juliana-brizola",
      "laurez-moreira",
      "leandro-grass",
      "luan-monteiro",
      "lucas-ribeiro",
      "marcelo-brigadeiro",
      "marcelo-maranata",
      "maria-do-carmo",
      "mateus-simoes",
      "otaviano-pivetta",
      "paula-belmonte",
      "renan-santos",
      "requiao-filho",
      "ricardo-ferraco",
      "romeu-zema",
      "rui-costa-pimenta",
      "samara-martins",
      "sergio-moro-gov-pr",
      "tarcisio-gov-sp",
      "tiao-bocalom",
      "vicentinho-junior",
      "wilder-morais",
      "ze-batista",
    ])
  })

  it("nenhum dos 22 de antes foi REBAIXADO na regeneracao", () => {
    // A regeneracao so pode promover. Se um slug que tinha chave em 09/08 perdeu a chave em
    // 16/08, alguma coisa quebrou no matcher, e isso e mais grave do que um nao localizado a
    // mais: significaria que o registro publicado piorou sem ninguem ver.
    const promovidosNaV2 = [
      "alysson-bezerra",
      "clecio-luis",
      "daniel-vilela",
      "douglas-ruas",
      "eduardo-paes",
      "expedito-netto",
      "fabio-trad",
      "felicio-ramuth",
      "felipe-camarao",
      "gabriel-souza",
      "hertz-dias",
      "hildon-chaves",
      "jeremias-cosmo",
      "jeronimo",
      "marcelo-maranata",
      "maria-do-carmo",
      "mateus-simoes",
      "renan-santos",
      "romeu-zema",
      "samara-martins",
      "sergio-moro-gov-pr",
      "tarcisio-gov-sp",
    ]
    const agora = new Set(frescos.map((e) => e.slug))
    for (const slug of promovidosNaV2) {
      assert.equal(agora.has(slug), true, `${slug} tinha chave na v2 e perdeu na v3`)
    }
  })

  it("as que seguem em revisão são exatamente as sem chave independente", () => {
    // `camila-falcao` e `witer-naves` não têm data de nascimento no cadastro, e
    // por isso continuam bloqueadas. Este teste é o que impede alguém "resolver"
    // o bloqueio preenchendo a data no chute: sem proveniência anterior ao
    // pleito, o gerador reprova antes de chegar aqui.
    assert.deepEqual(
      bloqueadas.filter((e) => e.classe === "revisao_identidade").map((e) => e.slug).sort(),
      [
      "andre-luis",
      "ataides-oliveira",
      "augusto-cury",
      "camila-falcao",
      "cleitinho",
      "dr-helton-monteiro",
      "gabriel-azevedo",
      "gisvaldo-oliveira",
      "joao-henrique-catan",
      "lais-chaud",
      "natasha-slhessarenko",
      "pazolini",
      "witer-naves",
      ],
    )
  })

  it("evidência sem promoção, quantificada", () => {
    // Fixa o caveat como número: limpar os hits para "esconder o SQ" quebraria
    // este teste em vez de passar despercebido, e destruiria a pista da revisão.
    // Eram 6 quando o bloqueado tinha 49. Com a regeneracao de 17/08 o bloqueado caiu para
    // 22, e este numero acompanha. O que o teste guarda nao e o valor, e o fato de a pista
    // sobreviver: limpar os hits para "esconder o SQ" continuaria quebrando aqui.
    assert.equal(bloqueadas.filter((e) => e.hits.some((h) => h.sq)).length, 21)
  })

  it("todo slug do registro existe no seed", () => {
    const seed = JSON.parse(readFileSync(join(RAIZ, "data/candidatos.json"), "utf8")) as {
      slug: string
    }[]
    const slugs = new Set(seed.map((c) => c.slug))
    const presentes = todos.filter((e) => slugs.has(e.slug))
    assert.equal(presentes.length, 71, "registro que fala de slug inexistente nunca barra nada")
  })

  it("nenhuma chave promovida colide com identidade já rejeitada por curadoria", () => {
    // Promover um SQ que a curadoria rejeitou seria a issue #130 voltando por
    // outra porta.
    const bloqueios = JSON.parse(
      readFileSync(join(RAIZ, "data/identidades-bloqueadas.json"), "utf8"),
    ) as { bloqueios: { sq_candidato?: string }[] }
    assert.ok(bloqueios.bloqueios.length > 0, "registro de bloqueios vazio: o teste não prova nada")
    const rejeitados = new Set(
      bloqueios.bloqueios.map((b) => b.sq_candidato).filter(Boolean) as string[],
    )
    for (const e of frescos) {
      assert.equal(rejeitados.has(e.chave!.value), false, `${e.slug} promove SQ já rejeitado`)
    }
  })

  it("a renovação é executável em checkout limpo", () => {
    const { renovacao } = indice.registro
    assert.match(renovacao.revalidar_ate, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(renovacao.responsavel.length > 0)
    assert.deepEqual(renovacao.procedimento, [
      "npm run data:identidade-etapa2:fontes",
      "npm run data:identidade-etapa2:gerar",
      "node --import tsx --test tests/etapa2-identidade-protecao.test.ts",
    ])
    // Os dois scripts do procedimento existem de fato.
    const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    assert.ok(pkg.scripts["data:identidade-etapa2:fontes"])
    assert.ok(pkg.scripts["data:identidade-etapa2:gerar"])
  })

  it("uma renovação rodada DEPOIS do vencimento não nasce vencida", () => {
    // O defeito: o gerador escrevia `decidido_em: "2026-08-09"` e
    // `revalidar_ate: "2026-08-16"` como literais, então renovar em 20/08
    // produzia um registro já vencido no instante em que era gerado, e a porta
    // de materialização continuava fechada por mais que se renovasse.
    //
    // A prova não roda o gerador (ele precisa de 3,3 MB de ZIPs gitignorados):
    // afirma a REGRA sobre o texto-fonte, e exercita o cálculo com o relógio
    // fixado depois do vencimento atual.
    const fonte = readFileSync(join(RAIZ, "scripts/audit/gerar-identidade-etapa2.ts"), "utf8")
    assert.doesNotMatch(fonte, /decidido_em: "20\d\d-\d\d-\d\d"/, "decidido_em voltou a ser literal")
    assert.doesNotMatch(fonte, /revalidar_ate: "20\d\d-\d\d-\d\d"/, "revalidar_ate voltou a ser literal")
    assert.match(fonte, /decidido_em: decididoEm/)
    assert.match(fonte, /revalidar_ate: revalidarAte/)
    const validade = Number(fonte.match(/const VALIDADE_EM_DIAS = (\d+)/)?.[1])
    assert.ok(validade > 0, "VALIDADE_EM_DIAS não encontrada")

    // Mesmo cálculo do gerador, com o relógio DEPOIS do vencimento atual.
    const emQualquerDia = (hoje: string) => {
      const base = new Date(hoje)
      const decidido = base.toISOString().slice(0, 10)
      const revalidar = new Date(base.getTime() + validade * 86_400_000).toISOString().slice(0, 10)
      return { decidido, revalidar }
    }
    for (const dia of ["2026-08-20", "2026-10-01", "2027-01-15"]) {
      const { decidido, revalidar } = emQualquerDia(dia)
      const forjado = criarIndiceIdentidadeEtapa2({
        ...indice.registro,
        decidido_em: decidido,
        renovacao: { ...indice.registro.renovacao, revalidar_ate: revalidar },
      })
      const agora = new Date(`${dia}T12:00:00Z`).getTime()
      assert.equal(
        registroVencido(forjado, agora),
        false,
        `renovação em ${dia} nasceu vencida (revalidar_ate ${revalidar})`,
      )
      assert.ok(
        exigirMaterializacaoTse2026("daniel-vilela", forjado, agora),
        `renovação em ${dia} não conseguiu promover chave`,
      )
    }
  })

  it("o prazo de revalidação é posterior à decisão e bem formado", () => {
    const { decidido_em } = indice.registro
    const { revalidar_ate } = indice.registro.renovacao
    assert.ok(
      new Date(revalidar_ate).getTime() > new Date(decidido_em).getTime(),
      `revalidar_ate (${revalidar_ate}) tem que ser posterior a decidido_em (${decidido_em})`,
    )
    // O prazo cobre a janela de pedidos de registro do TSE, que fecha em 15/08.
    assert.ok(new Date(revalidar_ate).getTime() >= new Date("2026-08-15").getTime())
  })
})

// ---------------------------------------------------------------------------
// A porta de materialização e o consumidor de CI
// ---------------------------------------------------------------------------

describe("porta de materialização das etapas 5 e 9", () => {
  const indice = carregarIdentidadeEtapa2(RAIZ)

  it("match_fresco devolve a chave", () => {
    const chave = exigirMaterializacaoTse2026("daniel-vilela", indice)
    assert.equal(chave?.type, "SQ_CANDIDATO")
    assert.match(chave?.value ?? "", /^\d+$/)
  })

  it("classe bloqueada lança, nomeando a classe", () => {
    assert.throws(() => exigirMaterializacaoTse2026("witer-naves", indice), /revisao_identidade/)
    // Era `juliana-brizola`. Ela foi PROMOVIDA na regeneracao de 17/08, porque o registro
    // dela entrou no TSE depois da medicao antiga, entao deixou de servir de exemplo desta
    // classe. Hoje o unico nao localizado e ricardo-cappelli.
    assert.throws(
      () => exigirMaterializacaoTse2026("ricardo-cappelli", indice),
      /nao_localizado_pelos_matchers/,
    )
    assert.throws(() => exigirMaterializacaoTse2026("eduardo-girao", indice), /conflito_cargo_uf/)
  })

  it("slug fora do universo passa sem chave, e isso é deliberado", () => {
    // O registro decidiu sobre 71 dos 271 slugs do seed. Se a porta lançasse
    // para os outros 200, o primeiro autor a esbarrar nela apagaria a chamada.
    const veredito = avaliarMaterializacaoTse2026("acm-neto", indice)
    assert.deepEqual(veredito, { permitido: true, motivo: "fora_do_universo_etapa2", chave: null })
    assert.equal(exigirMaterializacaoTse2026("acm-neto", indice), null)
  })

  it("registro vencido derruba a promoção de chave, e SÓ ela", () => {
    // O prazo protege contra tratar "não localizado em 08/08" como "não existe",
    // e esse risco só se materializa quando alguém USA o registro para autorizar
    // escrita. Por isso a validade morde aqui, na porta, e não na suíte inteira:
    // um refactor de componente não tem por que ficar vermelho por causa da
    // janela de registro do TSE.
    const limite = new Date(`${indice.registro.renovacao.revalidar_ate}T23:59:59Z`).getTime()
    const depois = limite + 1
    const antes = limite - 1

    assert.equal(registroVencido(indice, antes), false)
    assert.equal(registroVencido(indice, depois), true)

    // Dentro do prazo, promove.
    assert.ok(exigirMaterializacaoTse2026("daniel-vilela", indice, antes))
    // Vencido, não promove, e a mensagem traz responsável e procedimento.
    assert.throws(
      () => exigirMaterializacaoTse2026("daniel-vilela", indice, depois),
      (erro: Error) =>
        /venceu em/.test(erro.message) &&
        /Responsável:/.test(erro.message) &&
        /data:identidade-etapa2:gerar/.test(erro.message),
    )
    // Slug bloqueado continua bloqueado pelo motivo certo, não pela validade.
    assert.throws(
      () => exigirMaterializacaoTse2026("witer-naves", indice, depois),
      /revisao_identidade/,
    )
    // Slug fora do universo não é afetado pela validade.
    assert.equal(exigirMaterializacaoTse2026("acm-neto", indice, depois), null)
  })

  it("prazo ilegível ou adulterado conta como VENCIDO, não como válido", () => {
    // A versão anterior fazia `Number.isFinite(limite) && agora > limite`, então
    // trocar `revalidar_ate` por lixo devolvia `false`, ou seja, "não vencido":
    // bastava adulterar o campo para o prazo sumir. Prazo que não se consegue
    // ler é prazo que não se consegue verificar, e prazo não verificável vence.
    const agora = new Date("2026-08-10T12:00:00Z").getTime()
    for (const ruim of ["", "nunca", "2026-13-45", "2026-02-30", "10/08/2026", "2026-8-16"]) {
      const forjado = criarIndiceIdentidadeEtapa2({
        ...indice.registro,
        renovacao: { ...indice.registro.renovacao, revalidar_ate: ruim },
      })
      assert.equal(registroVencido(forjado, agora), true, `"${ruim}" passou como prazo válido`)
      assert.throws(
        () => exigirMaterializacaoTse2026("daniel-vilela", forjado, agora),
        /venceu em/,
        `"${ruim}" deixou a chave ser promovida`,
      )
    }
    // E o prazo real, bem formado e no futuro, continua permitindo.
    assert.ok(exigirMaterializacaoTse2026("daniel-vilela", indice, agora))
  })
})

describe("consumidor de CI: conferência do seed", () => {
  const indice = carregarIdentidadeEtapa2(RAIZ)
  const seed = JSON.parse(readFileSync(join(RAIZ, "data/candidatos.json"), "utf8")) as CandidatoDoSeed[]

  it("o seed real está limpo, e o laço visitou os 71", () => {
    assert.deepEqual(conferirSeedContraEtapa2(seed, indice), [])
    const slugsDoRegistro = new Set(indice.todos.map((e) => e.slug))
    assert.equal(seed.filter((c) => slugsDoRegistro.has(c.slug)).length, 71)
  })

  it("classe bloqueada com SQ 2026 no seed é acusada", () => {
    // O SQ usado é o do próprio `hits[]` da entrada, que é o caminho realista
    // pelo qual a etapa 9 erraria: copiar a evidência como se fosse chave. As
    // duas regras disparam, e ambas devem, porque descrevem defeitos diferentes.
    const violacoes = conferirSeedContraEtapa2(
      [{ slug: "witer-naves", ids: { tse_sq_candidato: { "2026": "270002539187" } } }],
      indice,
    )
    assert.deepEqual(violacoes.map((v) => v.tipo).sort(), [
      "classe_bloqueada",
      "evidencia_promovida",
    ])
  })

  it("classe bloqueada com SQ 2026 alheio também é acusada, só por classe", () => {
    const violacoes = conferirSeedContraEtapa2(
      [{ slug: "witer-naves", ids: { tse_sq_candidato: { "2026": "70000000001" } } }],
      indice,
    )
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].tipo, "classe_bloqueada")
  })

  it("chave divergente em match_fresco é acusada", () => {
    const correta = indice.entrada("daniel-vilela")!.chave!.value
    const violacoes = conferirSeedContraEtapa2(
      [{ slug: "daniel-vilela", ids: { tse_sq_candidato: { "2026": "99999" } } }],
      indice,
    )
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].tipo, "chave_divergente")
    assert.match(violacoes[0].detalhe, new RegExp(correta))
  })

  it("match_fresco com a chave certa passa", () => {
    const correta = indice.entrada("daniel-vilela")!.chave!.value
    assert.deepEqual(
      conferirSeedContraEtapa2(
        [{ slug: "daniel-vilela", ids: { tse_sq_candidato: { "2026": correta } } }],
        indice,
      ),
      [],
    )
  })

  it("evidência de hits[] promovida a chave, em qualquer ano, é acusada", () => {
    const evidencia = indice.entrada("adailton-furia")!.hits[0].sq
    const violacoes = conferirSeedContraEtapa2(
      [{ slug: "adailton-furia", ids: { tse_sq_candidato: { "2022": evidencia } } }],
      indice,
    )
    assert.equal(violacoes.length, 1)
    assert.equal(violacoes[0].tipo, "evidencia_promovida")
    assert.equal(violacoes[0].ano, "2022")
  })

  it("slug fora do registro não é julgado", () => {
    assert.deepEqual(
      conferirSeedContraEtapa2(
        [{ slug: "acm-neto", ids: { tse_sq_candidato: { "2026": "50002533190" } } }],
        indice,
      ),
      [],
    )
  })
})
