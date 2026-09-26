import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  criarPlanos,
  exigirVazioSemLinhasPublicadas,
  cnjsPublicaveisDoTexto,
  filtrarMudancas,
  validarEvidencia,
  validarEvidenciaCoorteAtual,
  validarPreflightRenovacao,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"
import {
  cargoSolicitado,
  classificarFalhaColeta,
  Disjuntor,
  DISJUNTOR_ABERTO,
  esperaRetry,
  contextoPorCpfNoTexto,
  cpfCompativelNoTexto,
  cpfDaCandidaturaNoTexto,
  cpfDivergenteNoTexto,
  cpfsRotuladosDoNome,
  csvsDoConsultaCand,
  exigirCaminhoPersistente,
  margemDiasSolicitada,
  mencionaNomeNoTexto,
  modoAlvosSolicitado,
  montarSnapshotCoorteAtual,
  nomeDestinatario,
  pesquisarCandidato,
  selecionarAlvosIndeterminados,
  selecionarAlvosVencendo,
  type Comunicacao,
} from "../scripts/curadoria-processos-lote"
import { entradaDaRevisao, validarRevisaoManual } from "../scripts/registrar-revisao-curadoria"

const AGORA = Date.parse("2026-09-25T22:00:00Z")
const DIA = 86_400_000

function recibo(id: string, slug: string, resultado: string, diasAtras: number) {
  return {
    candidato_id: id,
    alvo: slug,
    fonte: "processos-curadoria",
    escopo: "candidato",
    executado_em: new Date(AGORA - diasAtras * DIA).toISOString(),
    resultado,
  }
}

describe("renovação de recibos judiciais antes do SLA", () => {
  const candidatos = [
    { id: "a", slug: "alpha" },
    { id: "b", slug: "beta" },
    { id: "c", slug: "charlie" },
    { id: "d", slug: "delta" },
    { id: "e", slug: "echo" },
    { id: "f", slug: "foxtrot" },
  ]

  it("reabre recibos conclusivos dentro da margem e todo erro, nunca indeterminado ou sem recibo", () => {
    const recibos = [
      recibo("a", "alpha", "vazio_confirmado", 10),
      recibo("b", "beta", "encontrado", 50),
      recibo("c", "charlie", "vazio_confirmado", 3),
      recibo("d", "delta", "indeterminado", 40),
      recibo("e", "echo", "erro", 40),
    ]
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 5, AGORA), ["alpha", "beta", "echo"])
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 0, AGORA), ["beta", "echo"])
    // erro recente também volta: falha de fonte nunca vira estado final.
    assert.deepEqual(selecionarAlvosVencendo(candidatos, [recibo("f", "foxtrot", "erro", 0.1)], 5, AGORA), ["foxtrot"])
  })

  it("usa o recibo mais recente do candidato e ignora slug trocado ou data futura", () => {
    const recibos = [
      recibo("a", "alpha", "vazio_confirmado", 30),
      recibo("a", "alpha", "indeterminado", 1),
      { ...recibo("b", "outro", "vazio_confirmado", 30) },
      { ...recibo("c", "charlie", "vazio_confirmado", -2) },
    ]
    assert.deepEqual(selecionarAlvosVencendo(candidatos, recibos, 4, AGORA), [])
  })

  it("reexame de indeterminados seleciona indeterminado, erro e bloqueado", () => {
    const recibos = [
      recibo("a", "alpha", "indeterminado", 40),
      recibo("b", "beta", "erro", 2),
      recibo("c", "charlie", "vazio_confirmado", 2),
      recibo("d", "delta", "bloqueado", 5),
    ]
    assert.deepEqual(selecionarAlvosIndeterminados(candidatos, recibos, AGORA), ["alpha", "beta", "delta"])
    assert.equal(modoAlvosSolicitado(["--alvos=indeterminados"]), "indeterminados")
  })

  it("valida flags de alvos, margem e cargo", () => {
    assert.equal(modoAlvosSolicitado([]), "sem-recibo")
    assert.equal(modoAlvosSolicitado(["--alvos=vencendo"]), "vencendo")
    assert.throws(() => modoAlvosSolicitado(["--alvos=todos"]), /--alvos=indeterminados ou --alvos=encontrados/)
    assert.equal(margemDiasSolicitada([]), 4)
    assert.equal(margemDiasSolicitada(["--margem-dias=13"]), 13)
    assert.throws(() => margemDiasSolicitada(["--margem-dias=14"]), /entre 0 e 13/)
    assert.equal(cargoSolicitado(["--cargo=Senador"]), "Senador")
    assert.equal(cargoSolicitado([]), null)
    assert.throws(() => cargoSolicitado(["--cargo=Deputado"]), /Presidente, Governador ou Senador/)
  })

  it("recusa evidência e snapshot em /tmp, que não sobrevivem a reboot", () => {
    const anterior = process.env.PF_PERMITIR_TMP
    delete process.env.PF_PERMITIR_TMP
    try {
      assert.throws(() => exigirCaminhoPersistente("/tmp/x.json", "--evidence"), /nao sobrevive a reboot/)
      assert.throws(() => exigirCaminhoPersistente("/private/tmp/x.json", "--evidence"), /nao sobrevive a reboot/)
      assert.doesNotThrow(() => exigirCaminhoPersistente("/home/runner/work/_temp/x.json", "--evidence"))
    } finally {
      if (anterior !== undefined) process.env.PF_PERMITIR_TMP = anterior
    }
  })

  it("snapshot registra alvo, cargo e último recibo sem CPF", () => {
    const base = {
      nome_completo: "Nome", nome_urna: "Nome", cargo_atual: null, partido_sigla: null,
      biografia: null, cpf: "12345678901",
    }
    const snapshot = montarSnapshotCoorteAtual(
      [{ ...base, id: "a", slug: "alpha", cargo_disputado: "Senador", estado: "MA" }],
      [recibo("a", "alpha", "vazio_confirmado", 10)],
      ["alpha"],
      { modo: "dry-run-coorte-atual-renovacao", filtro_cargo: "Senador", margem_dias: 5, coorte_publica_total: 513 },
      AGORA,
    )
    assert.equal(snapshot.alvos.length, 1)
    assert.equal(snapshot.alvos[0].ultimo_recibo?.resultado, "vazio_confirmado")
    assert.doesNotMatch(JSON.stringify(snapshot), /12345678901/)
  })
})

describe("nome exato fora dos destinatários não permite vazio", () => {
  const nome = "CARLOS DA SILVA TESTE"
  const item = (texto: string, destinatarios: string[]): Comunicacao => ({
    id: 1, texto, destinatarios: destinatarios.map((n) => ({ nome: n })),
  })

  it("remove apelido entre parênteses do destinatário", () => {
    assert.equal(nomeDestinatario("Carlos da Silva Teste (Carlinhos)"), nome)
  })

  it("conta menção no texto quando a intimação vai ao advogado", () => {
    assert.equal(mencionaNomeNoTexto(item("Autor: Carlos da Silva Teste. Adv.: Fulano", ["Fulano de Tal"]), nome), true)
  })

  it("conta destinatário com sobrenome a mais (possível nome civil alterado)", () => {
    assert.equal(mencionaNomeNoTexto(item("sem o nome", ["Carlos da Silva Teste Souza"]), nome), true)
  })

  it("não conta nome contido em outro com prenome diferente", () => {
    assert.equal(
      mencionaNomeNoTexto(item("Parte: Maria Carlos da Silva Teste", ["Maria Carlos da Silva Teste"]), nome),
      false,
    )
  })

  it("rebaixa para bloqueado o vazio que o protocolo antigo afirmaria", async () => {
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste" }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=Carlos%20da%20Silva%20Teste&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 7,
            siglaTribunal: "TJMG",
            numeroprocessocommascara: "0000001-00.2026.8.13.0001",
            texto: "Autor: CARLOS DA SILVA TESTE (apelido)",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE (apelido)" }],
          }],
          paginas: 1,
          completo: true,
        }),
      },
    )
    // Com o apelido removido, vira destinatário exato; sem cargo no texto, fica ambíguo.
    assert.equal(resultado.classificacao, "bloqueado")
    assert.equal(resultado.busca.ocorrencias_nome_exato, 1)
    assert.equal(resultado.busca.completo, true)
  })
})

function evidenciaCoorte(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const candidato = {
    slug: "senadora-teste",
    nome_completo: "Senadora Teste",
    nome_urna: "Senadora Teste",
    cargo: "Senador",
    uf: "MA",
    identidade: {
      status: "confirmada", metodo: "tse-sq-candidato", sq_candidato: "100002536212",
      nome: "Senadora Teste", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
    },
    busca: {
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=Senadora%20Teste&pagina=1",
      consultado_em: "2026-09-25T22:13:00Z",
      periodo: "acervo publico consultado em 2026-09-25T22:13:00Z",
      termos: "nome completo exato",
      tribunais_consultados: ["TJMA"],
      total_api: 0,
      teto_publico_atingido: false,
      completo: true,
    },
    ocorrencias_ambiguas: [],
    homonimos_descartados: [],
    classificacao: "vazio_confirmado",
    motivo: "nenhum processo atribuivel",
    processos: [],
  }
  return {
    schema_version: 1,
    total_inicial: 1,
    candidatos_iniciais: ["senadora-teste"],
    fontes: { modo: "dry-run-coorte-atual-renovacao", snapshot_sha256: "abc" },
    lotes: [{ numero: 1, concluido_em: "2026-09-25T22:14:00Z", slugs: ["senadora-teste"], candidatos: [candidato] }],
    resumo: { classificados: 1, encontrado: 0, vazio_confirmado: 1, bloqueado: 0, erro: 0 },
    ...overrides,
  }
}

describe("aplicador aceita evidência da coorte atual", () => {
  it("valida evidência de qualquer tamanho sem o snapshot de 185", () => {
    const evidencia = validarEvidencia(evidenciaCoorte())
    assert.equal(evidencia.total_inicial, 1)
    assert.equal(evidencia.coorte_atual?.modo, "dry-run-coorte-atual-renovacao")
    const [plano] = criarPlanos(evidencia)
    assert.equal(plano.resultado, "vazio_confirmado")
  })

  it("recusa evidência cujo total diverge dos alvos classificados", () => {
    assert.throws(() => validarEvidenciaCoorteAtual(evidenciaCoorte({ total_inicial: 2 })), /total_inicial/)
    assert.throws(() => validarEvidenciaCoorteAtual(evidenciaCoorte({ fontes: { modo: "dry-run-coorte-atual-somente-cnj" } })), /modo nao aplicavel/)
  })

  it("evidência de reexame de indeterminados nunca vira recibo pelo aplicador", () => {
    assert.throws(
      () => validarEvidencia(evidenciaCoorte({ fontes: { modo: "dry-run-coorte-atual-reexame-indeterminados" } })),
      /modo nao aplicavel/,
    )
  })

  it("mantém a evidência de agosto no validador de 185", () => {
    const semFontes = evidenciaCoorte()
    delete semFontes.fontes
    assert.throws(() => validarEvidencia(semFontes), /esperado 185/)
  })

  it("renovação trata recibo antigo como renovável, recusa recibo mais novo e pula o idêntico", () => {
    const [plano] = criarPlanos(validarEvidencia(evidenciaCoorte())) as PlanoRegistro[]
    const lotes = new Map([[1, "2026-09-25T22:14:00Z"]])
    const antigo = { alvo: plano.slug, resultado: "vazio_confirmado", detalhe: "revisao_em=2026-09-15; ...", executado_em: "2026-09-15T18:36:00Z" }
    assert.equal(validarPreflightRenovacao([plano], [plano.slug], [antigo], lotes).pendentes.length, 1)
    const novo = { ...antigo, executado_em: "2026-09-26T00:00:00Z" }
    assert.throws(() => validarPreflightRenovacao([plano], [plano.slug], [antigo, novo], lotes), /mais novo que a evidencia/)
    assert.throws(() => validarPreflightRenovacao([plano], [], [], lotes), /fora de candidatos_publico/)
  })

  it("falha de fonte antes da identidade vira recibo erro, não silêncio", () => {
    const evidencia = evidenciaCoorte()
    const lote = (evidencia.lotes as Array<{ candidatos: Array<Record<string, unknown>> }>)[0]
    lote.candidatos[0] = {
      ...lote.candidatos[0],
      classificacao: "erro",
      identidade: { status: "bloqueada", motivo: "consulta TSE 2026 falhou antes da identidade", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip" },
      motivo: "HTTP 503 no DJEN",
    }
    evidencia.resumo = { classificados: 1, encontrado: 0, vazio_confirmado: 0, bloqueado: 0, erro: 1 }
    const [plano] = criarPlanos(validarEvidencia(evidencia))
    assert.equal(plano.resultado, "erro")
    assert.ok(plano.args.includes("--identidade=nao-confirmada"))
  })

  it("registrador aceita nao-confirmada com erro, mas nunca com vazio", () => {
    const base = [
      "--slug=x", "--frente=processos", "--data=2026-09-25", "--identidade=nao-confirmada",
      "--detalhe=orgaos: TJMA; jurisdicao: MA; periodo: 2026; termos: nome; motivo: fonte oficial fora do ar antes da identidade; fontes consultadas: TSE; anos consultados: 2026",
    ]
    assert.equal(validarRevisaoManual([...base, "--resultado=erro"]).resultado, "erro")
    assert.throws(() => validarRevisaoManual([...base, "--resultado=vazio_confirmado"]), /indeterminado ou erro/)
  })
})

describe("conferência de CPF usa o texto bruto em memória", () => {
  it("atribui pelo CPF rotulado quando a resposta veio da rede, sem persistir o bruto", async () => {
    const cpf = "52998224725"
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste", cpf }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 9, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441",
            texto: "Réu: CARLOS DA SILVA TESTE, CPF [cpf omitido]",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }],
          }],
          paginas: 1,
          completo: true,
          textosBrutos: new Map([[9, `Réu: CARLOS DA SILVA TESTE, CPF ${cpf}`]]),
        }),
      },
    )
    assert.equal(resultado.classificacao, "encontrado")
    assert.equal(resultado.busca.conferencia_cpf, "texto_bruto_em_memoria")
  })
})

describe("identidade TSE nunca falha em silêncio", () => {
  it("segue diretório de cache ligado por symlink e recusa extração sem CSV", () => {
    const raiz = mkdtempSync(join(tmpdir(), "pf-consulta-cand-"))
    try {
      const real = join(raiz, "real")
      mkdirSync(real)
      writeFileSync(join(real, "consulta_cand_2022_MG.csv"), "SQ_CANDIDATO;NM_CANDIDATO\n")
      symlinkSync(real, join(raiz, "link"))
      assert.equal(csvsDoConsultaCand(join(raiz, "link"), "2022").length, 1)
      mkdirSync(join(raiz, "vazio"))
      assert.throws(() => csvsDoConsultaCand(join(raiz, "vazio"), "2022"), /nenhum CSV/)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})

describe("CPF rotulado divergente descarta o homônimo", () => {
  const cpf = "52998224725"
  const outro = "11144477735"
  it("detecta divergência só com CPF completo junto ao nome", () => {
    assert.equal(cpfDivergenteNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${outro}`, "Carlos da Silva Teste", cpf), true)
    assert.equal(cpfDivergenteNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${cpf}`, "Carlos da Silva Teste", cpf), false)
    assert.equal(cpfDivergenteNoTexto("Réu: CARLOS DA SILVA TESTE, CPF ***.444.777-**", "Carlos da Silva Teste", cpf), false)
    assert.equal(cpfDaCandidaturaNoTexto(`consta 529 982 247 25 no rodapé`, cpf), true)
    assert.equal(cpfDivergenteNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${outro}`, "Carlos da Silva Teste", ""), false)
  })

  it("pesquisa registra homonimo_descartado e não deixa a ocorrência ambígua", async () => {
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste", cpf }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 11, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441",
            texto: "Réu: CARLOS DA SILVA TESTE, CPF [cpf omitido]",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }],
          }],
          paginas: 1,
          completo: true,
          textosBrutos: new Map([[11, `Réu: CARLOS DA SILVA TESTE, CPF ${outro}`]]),
        }),
      },
    )
    assert.equal(resultado.processos.length, 0)
    assert.equal(resultado.ocorrencias_ambiguas.length, 0)
    assert.equal(resultado.homonimos_descartados.length, 1)
    assert.match(String(resultado.homonimos_descartados[0].motivo), /diverge do CPF da candidatura/)
    assert.equal(resultado.classificacao, "vazio_confirmado")
  })
})

describe("vazio_confirmado nunca contradiz linha publicada", () => {
  it("recusa vazio para candidato com linha em processos e aceita os demais", () => {
    const [plano] = criarPlanos(validarEvidencia(evidenciaCoorte()))
    assert.equal(plano.resultado, "vazio_confirmado")
    assert.throws(() => exigirVazioSemLinhasPublicadas([plano], new Set([plano.slug])), /linhas em processos: senadora-teste/)
    assert.doesNotThrow(() => exigirVazioSemLinhasPublicadas([plano], new Set(["outra-ficha"])))
    assert.doesNotThrow(() => exigirVazioSemLinhasPublicadas([{ ...plano, resultado: "indeterminado" }], new Set([plano.slug])))
  })
})

describe("limite de taxa das fontes oficiais", () => {
  it("respeita Retry-After e cai para backoff exponencial com teto", () => {
    assert.equal(esperaRetry(0, "12"), 12_000)
    assert.equal(esperaRetry(0, "9999"), 300_000)
    assert.equal(esperaRetry(0, "Fri, 26 Sep 2026 00:00:30 GMT", Date.parse("2026-09-26T00:00:00Z")), 30_000)
    assert.deepEqual([0, 1, 2, 5].map((i) => esperaRetry(i, null)), [30_000, 60_000, 120_000, 300_000])
  })

  it("disjuntor abre depois de N falhas seguidas e fecha com sucesso", () => {
    const d = new Disjuntor(3)
    d.registrarFalha(); d.registrarFalha()
    assert.equal(d.aberto, false)
    d.registrarSucesso(); d.registrarFalha(); d.registrarFalha()
    assert.equal(d.aberto, false)
    d.registrarFalha()
    assert.equal(d.aberto, true)
  })

  it("classifica a falha fatal por enum fechado", () => {
    assert.equal(classificarFalhaColeta(new Error(DISJUNTOR_ABERTO)), "limite_de_taxa")
    assert.equal(classificarFalhaColeta(new Error("HTTP 429 em https://x")), "limite_de_taxa")
    assert.equal(classificarFalhaColeta(new Error("HTTP 503 em https://comunicaapi.pje.jus.br")), "fonte_indisponivel")
    assert.equal(classificarFalhaColeta(new Error("preflight candidatos: timeout")), "preflight_banco")
    assert.equal(classificarFalhaColeta(new Error("preflight: candidatos_publico vazio")), "preflight_banco")
    assert.equal(classificarFalhaColeta(new Error("consulta_cand_2022: nenhum CSV em /x")), "identidade_tse")
    assert.equal(classificarFalhaColeta("qualquer"), "outro")
  })
})

describe("revalidação grava só mudança de estado", () => {
  it("filtra por resultado e por conjunto de CNJ publicáveis", () => {
    const base = { lote: 1, slug: "a", data: "2026-09-25", classificacao: "encontrado" as const, resultado: "encontrado" as const, homonimosDescartados: 0 }
    const url = (d: string) => `https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${d}`
    const cnj1 = "50017545020248130441", cnj2 = "70124986220248220007"
    const plano = { ...base, args: [`--evidencia-publicavel=${url(cnj1)}`] }
    const linha = (resultado: string, cnjs: string[], em: string) => ({
      alvo: "a", resultado, executado_em: em,
      detalhe: `revisao_em=2026-09-25; identidade=id-oficial; identidade_urls=x; urls_consultadas=${cnjs.map(url).join(",")}; detalhe=numeroProcesso=${cnj2}`,
    })
    assert.equal(filtrarMudancas([plano], [linha("encontrado", [cnj1], "2026-09-25T23:00:00Z")]).length, 0)
    assert.equal(filtrarMudancas([plano], [linha("encontrado", [cnj1, cnj2], "2026-09-25T23:00:00Z")]).length, 1)
    assert.equal(filtrarMudancas([{ ...plano, resultado: "indeterminado" }], [linha("encontrado", [cnj1], "2026-09-25T23:00:00Z")]).length, 1)
    assert.equal(filtrarMudancas([plano], [linha("encontrado", [cnj1], "2026-09-25T23:00:00Z"), linha("vazio_confirmado", [], "2026-09-24T00:00:00Z")]).length, 0)
  })
})

describe("CPF só vale colado ao nome (conferência do #504)", () => {
  const cpf = "52998224725"
  const outro = "11144477735"
  const nome = "Carlos da Silva Teste"
  it("CPF de outra parte na janela não é divergência nem compatibilidade", () => {
    const autorAntes = `AUTOR: JOAO PEREIRA, CPF ${outro.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}. REU: CARLOS DA SILVA TESTE`
    assert.equal(cpfDivergenteNoTexto(autorAntes, nome, cpf), false)
    const reuAntes = `REU: CARLOS DA SILVA TESTE. AUTOR: JOAO PEREIRA, CPF ${outro}`
    assert.equal(cpfDivergenteNoTexto(reuAntes, nome, cpf), false)
    // Mesmo com o CPF da candidatura, se ele é rótulo de outra parte, não identifica.
    assert.equal(cpfCompativelNoTexto(`REU: CARLOS DA SILVA TESTE. AUTOR: JOAO PEREIRA, CPF ${cpf}`, nome, cpf), false)
    assert.equal(cpfCompativelNoTexto(`AUTOR: JOAO PEREIRA, CPF ${cpf}. REU: CARLOS DA SILVA TESTE`, nome, cpf), false)
  })

  it("aceita só rótulo colado depois do nome, com N ou MF", () => {
    assert.deepEqual(cpfsRotuladosDoNome(`Réu: CARLOS DA SILVA TESTE, CPF nº 111.444.777-35`, nome), [{ tipo: "completo", digitos: outro }])
    assert.deepEqual(cpfsRotuladosDoNome(`Parte: CARLOS DA SILVA TESTE (CPF/MF ${outro})`, nome), [{ tipo: "completo", digitos: outro }])
    // CPF ANTES do nome é rótulo de quem vem antes.
    assert.deepEqual(cpfsRotuladosDoNome(`CPF ${outro} - CARLOS DA SILVA TESTE`, nome), [])
    assert.equal(cpfCompativelNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${cpf}`, nome, cpf), true)
    // Qualificação entre nome e CPF: falha fechada, nem confirma nem descarta.
    assert.deepEqual(cpfsRotuladosDoNome(`Réu: CARLOS DA SILVA TESTE, brasileiro, portador do CPF ${outro}`, nome), [])
    assert.equal(cpfCompativelNoTexto(`Réu: CARLOS DA SILVA TESTE, brasileiro, casado, CPF nº ${cpf}`, nome, cpf), false)
  })
})

describe("re-revisão do #504: descarte só com prova completa", () => {
  const cpf = "52998224725"
  const outro = "11144477735"
  const nome = "Carlos da Silva Teste"
  it("CPF de outra parte antes do nome e CPF mascarado colado ao nome: indecidível, nunca descarta", () => {
    const texto = "JOAO PEREIRA - CPF: 111.444.777-35; CARLOS DA SILVA TESTE - CPF: ***.982.247-**"
    assert.equal(cpfDivergenteNoTexto(texto, nome, cpf), false)
    assert.deepEqual(cpfsRotuladosDoNome(texto, nome), [{ tipo: "mascarado", digitos: "982247" }])
  })

  it("os 11 dígitos da candidatura em qualquer ponto do texto impedem o descarte", () => {
    const texto = `Réu: CARLOS DA SILVA TESTE, brasileiro, CPF nº ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}. Advogado: CARLOS DA SILVA TESTE, CPF ${outro}`
    assert.equal(cpfDivergenteNoTexto(texto, nome, cpf), false)
  })

  it("nome dentro de nome mais longo não descarta (guarda à esquerda e destinatário)", () => {
    assert.equal(cpfDivergenteNoTexto(`MARIA CARLOS DA SILVA TESTE CPF ${outro}`, nome, cpf), false)
    assert.equal(cpfDivergenteNoTexto(`Parte: MARIA CARLOS DA SILVA TESTE, CPF ${outro}`, nome, cpf, ["MARIA CARLOS DA SILVA TESTE"]), false)
    assert.equal(cpfDivergenteNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${outro}`, nome, cpf), true)
  })
})

describe("revalidação compara só CNJ de URL publicável", () => {
  it("ignora numeroProcesso fora da URL oficial do DJEN", () => {
    const d = "50017545020248130441"
    assert.deepEqual(cnjsPublicaveisDoTexto(`https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=${d}`), [d])
    assert.deepEqual(cnjsPublicaveisDoTexto(`https://comunica.pje.jus.br/consulta?numeroProcesso=${d}`), [d])
    assert.deepEqual(cnjsPublicaveisDoTexto(`https://api-publica.datajud.cnj.jus.br/x?numeroProcesso=${d}`), [])
    assert.deepEqual(cnjsPublicaveisDoTexto(`motivo: numeroProcesso=${d}`), [])
  })
})

describe("volume do recibo encontrado", () => {
  it("conta as fontes publicáveis, não vale 1 fixo", () => {
    const u1 = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=50352510220234036100"
    const u2 = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=00284895720064013400"
    const revisao = validarRevisaoManual([
      "--slug=x", "--frente=processos", "--data=2026-09-26", "--resultado=encontrado",
      "--detalhe=orgaos: TRF1; jurisdicao: nacional; periodo: 2026; termos: nome", "--identidade=id-oficial",
      "--identidade-url=https://cdn.tse.jus.br/x.zip", "--url=https://cdn.tse.jus.br/x.zip",
      `--url=${u1}`, `--url=${u2}`, `--evidencia-publicavel=${u1}`, `--evidencia-publicavel=${u2}`, "--dry-run",
    ])
    assert.equal(entradaDaRevisao(revisao).volume, 2)
  })
})

describe("cache sanitizado nunca atribui processo", () => {
  it("sem texto bruto, homônimo com CPF divergente e contexto político fica ambíguo", async () => {
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: "Senador", estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste", cpf: "52998224725" }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-25T22:00:00Z",
          total: 1,
          itens: [{
            id: 9, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441",
            texto: "Réu: CARLOS DA SILVA TESTE, Senador, CPF [cpf omitido]",
            destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }],
          }],
          paginas: 1,
          completo: true,
        }),
      },
    )
    assert.equal(resultado.busca.conferencia_cpf, "indisponivel_cache_sanitizado")
    assert.notEqual(resultado.classificacao, "encontrado")
    assert.equal(resultado.processos.length, 0)
    assert.equal(resultado.ocorrencias_ambiguas.length, 1)
  })

  it("aplicador recusa encontrado cuja busca veio do cache sanitizado", () => {
    const evidencia = evidenciaCoorte()
    const lote = (evidencia.lotes as Array<{ candidatos: Array<Record<string, unknown>> }>)[0]
    lote.candidatos[0] = {
      ...lote.candidatos[0],
      classificacao: "encontrado",
      busca: { ...(lote.candidatos[0].busca as Record<string, unknown>), conferencia_cpf: "indisponivel_cache_sanitizado" },
    }
    evidencia.resumo = { classificados: 1, encontrado: 1, vazio_confirmado: 0, bloqueado: 0, erro: 0 }
    assert.throws(() => criarPlanos(validarEvidencia(evidencia)), /conferência de CPF no texto bruto/)
  })
})

describe("segundo caminho de confirmação: CPF da candidatura no texto (26/09)", () => {
  const cpf = "52998224725"
  const cpfFmt = "529.982.247-25"
  const outro = "11144477735"
  const nome = "Carlos da Silva Teste"

  it("confirma nos três formatos que a regra estrita perdia", () => {
    const lista = `Polo passivo: CARLOS DA SILVA TESTE e outros CARLOS DA SILVA TESTE (CPF: ${cpfFmt}); JOAO PEREIRA (CPF: 111.444.777-35)`
    assert.match(contextoPorCpfNoTexto(lista, nome, cpf) ?? "", /CARLOS DA SILVA TESTE CPF 529 982 247 25/)
    const html = `Réu: Carlos da Silva Teste (CPF/CNPJ n.&ordm;&nbsp;${cpfFmt})`
    assert.equal(cpfCompativelNoTexto(html, nome, cpf), true)
    assert.notEqual(contextoPorCpfNoTexto(html, nome, cpf), null)
    const cnpj = `Executado: CARLOS DA SILVA TESTE - CPF/CNPJ: ${cpfFmt}`
    assert.equal(cpfCompativelNoTexto(cnpj, nome, cpf), true)
    assert.notEqual(contextoPorCpfNoTexto(cnpj, nome, cpf), null)
    // Qualificação com o próprio CPF: o caminho rotulado segue fechado, o segundo confirma.
    const qualificacao = `Réu: CARLOS DA SILVA TESTE, brasileiro, casado, CPF nº ${cpfFmt}`
    assert.equal(cpfCompativelNoTexto(qualificacao, nome, cpf), false)
    assert.notEqual(contextoPorCpfNoTexto(qualificacao, nome, cpf), null)
  })

  it("exemplos do revisor seguem sem atribuição", () => {
    assert.equal(contextoPorCpfNoTexto(`REU: CARLOS DA SILVA TESTE. AUTOR: JOAO PEREIRA, CPF ${cpf}`, nome, cpf), null)
    assert.equal(contextoPorCpfNoTexto(`AUTOR: JOAO PEREIRA, CPF ${cpf}. REU: CARLOS DA SILVA TESTE`, nome, cpf), null)
    assert.equal(contextoPorCpfNoTexto("JOAO PEREIRA - CPF: 111.444.777-35; CARLOS DA SILVA TESTE - CPF: ***.982.247-**", nome, cpf), null)
    assert.equal(contextoPorCpfNoTexto(`Réu: CARLOS DA SILVA TESTE, brasileiro, CPF nº ${cpfFmt}. Advogado: CARLOS DA SILVA TESTE, CPF ${outro}`, nome, cpf), null)
    assert.equal(contextoPorCpfNoTexto(`Parte: MARIA CARLOS DA SILVA TESTE, CPF ${cpfFmt}`, nome, cpf, ["MARIA CARLOS DA SILVA TESTE"]), null)
    assert.equal(contextoPorCpfNoTexto(`Réu: CARLOS DA SILVA TESTE, CPF ${outro}`, nome, cpf), null)
  })

  it("trava de advogado: CPF colado a advogado, OAB ou procurador só vale para parte", () => {
    const advogado = `Advogado: CARLOS DA SILVA TESTE, OAB/DF 12345, CPF ${cpfFmt}`
    assert.equal(contextoPorCpfNoTexto(advogado, nome, cpf), null)
    assert.notEqual(contextoPorCpfNoTexto(advogado, nome, cpf, ["CARLOS DA SILVA TESTE"]), null)
    assert.equal(contextoPorCpfNoTexto(`Procurador: CARLOS DA SILVA TESTE CPF ${cpfFmt}`, nome, cpf), null)
    assert.equal(contextoPorCpfNoTexto(`Representante legal CARLOS DA SILVA TESTE, CPF ${cpfFmt}`, nome, cpf), null)
  })

  it("parte citada fora dos destinatários vira achado pelo CPF no texto bruto", async () => {
    const resultado = await pesquisarCandidato(
      {
        id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
        cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
      },
      { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 },
      undefined,
      new Map(),
      ["TJMG"],
      "/cache-nao-usado",
      {
        confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: "Carlos da Silva Teste", cpf }),
        buscarDjen: async (consulta) => ({
          schema_version: 2,
          url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
          query_nome: consulta,
          consultado_em: "2026-09-26T09:00:00Z",
          total: 1,
          itens: [{
            id: 9, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441",
            texto: "Polo passivo: CARLOS DA SILVA TESTE e outros CARLOS DA SILVA TESTE (CPF: [cpf omitido])",
            destinatarios: [{ nome: "ADVOGADO DE ALGUEM", polo: "P" }],
          }],
          paginas: 1,
          completo: true,
          textosBrutos: new Map([[9, `Polo passivo: CARLOS DA SILVA TESTE e outros CARLOS DA SILVA TESTE (CPF: ${cpfFmt})`]]),
        }),
      },
    )
    assert.equal(resultado.classificacao, "encontrado")
    assert.equal(resultado.processos.length, 1)
    assert.match(String(resultado.processos[0].contexto_identidade), /CPF 529 982 247 25/)
  })
})

describe("re-revisão Opus do #504: descarte por menção e papéis não-parte", () => {
  const cpf = "52998224725"
  const cpfFmt = "529.982.247-25"
  const outro = "111.444.777-35"
  const nome = "Carlos da Silva Teste"
  const candidato = {
    id: "id", slug: "carlos", nome_completo: "Carlos da Silva Teste", nome_urna: "Carlos",
    cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
  }
  const ficha = { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 }
  const djenCom = (itens: Array<{ id: number; texto: string; destinatarios: Array<{ nome: string; polo: string }> }>) =>
    async (consulta: string) => ({
      schema_version: 2 as const,
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
      query_nome: consulta, consultado_em: "2026-09-26T15:00:00Z", total: itens.length,
      itens: itens.map((i) => ({ ...i, siglaTribunal: "TJMG", numeroprocessocommascara: "5001754-50.2024.8.13.0441", texto: i.texto.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[cpf omitido]") })),
      paginas: 1, completo: true as const,
      textosBrutos: new Map(itens.map((i) => [i.id, i.texto])),
    })
  const pesquisar = (itens: Parameters<typeof djenCom>[0]) => pesquisarCandidato(candidato, ficha, undefined, new Map(), ["TJMG"], "/cache-nao-usado", {
    confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome, cpf }),
    buscarDjen: djenCom(itens),
  })

  it("B1: uma menção com CPF divergente e outra sem CPF não descarta nem dá vazio", async () => {
    const texto = `AUTOR: CARLOS DA SILVA TESTE, CPF ${outro}. REU: CARLOS DA SILVA TESTE, brasileiro, casado`
    assert.equal(cpfDivergenteNoTexto(texto, nome, cpf), false)
    const resultado = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }] }])
    assert.notEqual(resultado.classificacao, "vazio_confirmado")
    assert.equal(resultado.ocorrencias_ambiguas.length, 1)
  })

  it("B1: descarte de uma comunicação não apaga outra ambígua do mesmo processo", async () => {
    const resultado = await pesquisar([
      { id: 1, texto: `Réu: CARLOS DA SILVA TESTE, CPF ${outro}`, destinatarios: [{ nome: "CARLOS DA SILVA TESTE", polo: "P" }] },
      { id: 2, texto: "Intime-se o terceiro interessado CARLOS DA SILVA TESTE.", destinatarios: [{ nome: "OUTRA PESSOA", polo: "P" }] },
    ])
    assert.notEqual(resultado.classificacao, "vazio_confirmado")
    assert.deepEqual(resultado.ocorrencias_ambiguas.map((o) => o.numero_cnj), ["5001754-50.2024.8.13.0441"])
    assert.equal(resultado.homonimos_descartados.length, 1)
  })

  it("M3: advogado abreviado, defensor, curador e nome longo depois de 'Advogada Dra.' não atribuem", () => {
    for (const texto of [
      `ADV. CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Adv: CARLOS DA SILVA TESTE CPF ${cpfFmt}`,
      `Defensor dativo CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Curador especial CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Patrono CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Sociedade de Advogados CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
    ]) assert.equal(contextoPorCpfNoTexto(texto, nome, cpf), null, texto)
    const longo = "Maria Aparecida da Conceicao dos Santos Oliveira Pereira da Silva Albuquerque"
    const textoLongo = `Advogada Dra. ${longo.toUpperCase()}, CPF ${cpfFmt}`
    assert.equal(contextoPorCpfNoTexto(textoLongo, longo, cpf), null)
    assert.notEqual(contextoPorCpfNoTexto(textoLongo, longo, cpf, [longo.toUpperCase()]), null)
  })

  it("M4: testemunha, vítima, perito, administrador judicial e juiz não atribuem, salvo destinatária", () => {
    for (const texto of [
      `TESTEMUNHA: CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `VITIMA: CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Nomeio perito CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Nomeio como administrador judicial CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
      `Juiz de Direito CARLOS DA SILVA TESTE, CPF ${cpfFmt}`,
    ]) {
      assert.equal(contextoPorCpfNoTexto(texto, nome, cpf), null, texto)
      assert.notEqual(contextoPorCpfNoTexto(texto, nome, cpf, ["CARLOS DA SILVA TESTE"]), null, texto)
    }
  })

  it("m5: só o formato de CPF conta como CPF da candidatura", () => {
    assert.equal(cpfDaCandidaturaNoTexto(`CPF ${cpfFmt}`, cpf), true)
    assert.equal(cpfDaCandidaturaNoTexto(`CPF ${cpf}`, cpf), true)
    assert.equal(cpfDaCandidaturaNoTexto("protocolo 529/982/247-25", cpf), false)
    assert.equal(cpfDaCandidaturaNoTexto("itens 5-2-9-9-8-2-2-4-7-2-5", cpf), false)
    assert.equal(cpfDaCandidaturaNoTexto("fls. 529, 982, 247 e 25", cpf), false)
    assert.equal(contextoPorCpfNoTexto("Réu: CARLOS DA SILVA TESTE, protocolo 529/982/247-25", nome, cpf), null)
  })
})
