import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  adquirirLockAplicacao,
  criarPlanos,
  validarPreflight,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"

type Evidencia = Parameters<typeof criarPlanos>[0]

function evidenciaCom(overrides: Record<string, unknown> = {}): Evidencia {
  const candidato = {
    slug: "candidato-teste",
    nome_completo: "Candidato Teste",
    nome_urna: "Candidato Teste",
    cargo: "Governador",
    uf: "BA",
    identidade: {
      status: "confirmada",
      metodo: "tse-nome-cargo-uf",
      nome: "Candidato Teste",
      cargo: "GOVERNADOR",
      uf: "BA",
      url: "https://www.tse.jus.br/eleicoes/candidatos",
    },
    busca: {
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Candidato%20Teste",
      periodo: "acervo disponível até 2026-08-05",
      termos: "nome completo exato + cargo + UF",
      tribunais_consultados: ["TJBA"],
    },
    ocorrencias_ambiguas: [],
    homonimos_descartados: [],
    classificacao: "vazio_confirmado",
    motivo: "nenhum processo atribuível no escopo declarado",
    processos: [],
    ...overrides,
  }
  return {
    schema_version: 1,
    total_inicial: 1,
    candidatos_iniciais: [candidato.slug],
    lotes: [{
      numero: 1,
      concluido_em: "2026-08-05T20:00:00.000Z",
      slugs: [candidato.slug],
      candidatos: [candidato],
    }],
    resumo: { classificados: 1, encontrado: 0, vazio_confirmado: 1, bloqueado: 0 },
  } as Evidencia
}

function plano(overrides: Partial<PlanoRegistro> = {}): PlanoRegistro {
  return {
    lote: 1,
    slug: "candidato-teste",
    data: "2026-08-05",
    classificacao: "vazio_confirmado",
    resultado: "vazio_confirmado",
    homonimosDescartados: 0,
    args: [
      "--identidade=cargo-e-uf",
      "--identidade-url=https://www.tse.jus.br/eleicoes/candidatos",
      "--url=https://www.tse.jus.br/eleicoes/candidatos",
      "--detalhe=teste de preflight",
    ],
    ...overrides,
  }
}

function processo(numeroCnj: string, url: string): Record<string, unknown> {
  return {
    numero_cnj: numeroCnj,
    url,
    contexto_identidade: "O documento oficial registra Candidato Teste governador da Bahia.",
  }
}

function valorArgumento(planoAtual: PlanoRegistro, nome: string): string {
  const prefixo = `--${nome}=`
  const argumento = planoAtual.args.find((item) => item.startsWith(prefixo))
  assert.ok(argumento, `argumento ${nome} ausente`)
  return argumento.slice(prefixo.length)
}

function detalhePersistido(planoAtual: PlanoRegistro): string {
  const urls = planoAtual.args
    .filter((item) => item.startsWith("--url="))
    .map((item) => item.slice("--url=".length))
  const identidadeUrls = planoAtual.args
    .filter((item) => item.startsWith("--identidade-url="))
    .map((item) => item.slice("--identidade-url=".length))
  return [
    `revisao_em=${planoAtual.data}`,
    `identidade=${valorArgumento(planoAtual, "identidade")}`,
    `identidade_urls=${identidadeUrls.join(",")}`,
    `urls_consultadas=${urls.join(",")}`,
    `detalhe=${valorArgumento(planoAtual, "detalhe")}`,
  ].join("; ")
}

describe("aplicador da evidência de processos", () => {
  it("registra bloqueio de identidade sem exigir busca processual ou fabricar prova", () => {
    const [planoAtual] = criarPlanos(evidenciaCom({
      classificacao: "bloqueado",
      identidade: {
        status: "bloqueada",
        motivo: "sem identificador oficial verificável após TSE 2016, 2018, 2020, 2022, 2024 e 2026",
      },
      busca: {},
      motivo: "identidade não confirmada, coleta processual não iniciada",
    }))

    assert.equal(planoAtual.resultado, "indeterminado")
    assert.equal(valorArgumento(planoAtual, "identidade"), "nao-confirmada")
    assert.equal(planoAtual.args.some((arg) => arg.startsWith("--url=")), false)
    assert.match(valorArgumento(planoAtual, "detalhe"), /fontes consultadas: TSE/)
    assert.match(valorArgumento(planoAtual, "detalhe"), /anos consultados: 2016, 2018, 2020, 2022, 2024, 2026/)
  })

  it("preserva tentativa oficial em bloqueio sem promovê-la a identidade confirmada", () => {
    const url = "https://www.tse.jus.br/eleicoes/candidatos"
    const [planoAtual] = criarPlanos(evidenciaCom({
      classificacao: "bloqueado",
      identidade: {
        status: "bloqueada",
        motivo: "registro TSE localizado em UF divergente da ficha atual",
        url,
      },
      busca: {},
      motivo: "falta ponte oficial entre as identidades",
    }))

    assert.equal(valorArgumento(planoAtual, "identidade"), "nao-confirmada")
    assert.ok(planoAtual.args.includes(`--url=${url}`))
    assert.ok(planoAtual.args.includes(`--identidade-url=${url}`))
  })

  it("falha fechado em bloqueio sem URL nem fontes e anos verificáveis", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      classificacao: "bloqueado",
      identidade: {
        status: "bloqueada",
        motivo: "nenhum perfil compatível foi localizado nas fontes tentadas",
      },
      motivo: "identidade não confirmada",
    })), /sem URL de identidade exige fontes consultadas e anos consultados/)
  })

  it("não permite identidade nao-confirmada em vazio confirmado", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      identidade: {
        status: "bloqueada",
        motivo: "registro TSE localizado em UF divergente",
        url: "https://www.tse.jus.br/eleicoes/candidatos",
      },
    })), /identidade precisa estar confirmada/)
  })

  it("bloqueio com identidade confirmada continua exigindo busca processual", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      classificacao: "bloqueado",
      busca: {},
      motivo: "busca processual bloqueada após identidade confirmada",
    })), /ao menos uma URL obrigatoria/)
  })

  it("preserva erro de transporte como erro no plano de persistência", () => {
    const evidencia = evidenciaCom({
      classificacao: "erro",
      busca: {
        url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Candidato%20Teste",
        periodo: "acervo disponível até 2026-08-10",
        termos: "nome completo exato",
        tribunais_consultados: ["TJBA"],
        erro: "HTTP 503 no DJEN",
      },
      motivo: "HTTP 503 no DJEN",
    }) as Evidencia
    evidencia.resumo = { classificados: 1, encontrado: 0, vazio_confirmado: 0, bloqueado: 0, erro: 1 }

    const [planoAtual] = criarPlanos(evidencia)
    assert.equal(planoAtual.classificacao, "erro")
    assert.equal(planoAtual.resultado, "erro")
    assert.match(valorArgumento(planoAtual, "detalhe"), /HTTP 503/)
  })

  it("aceita novos métodos oficiais somente com cargo e UF comprovados", () => {
    const metodos = ["assembleia-oficial", "oab-oficial", "tse-2026-oficial"]
    for (const metodo of metodos) {
      const evidencia = evidenciaCom({
        identidade: {
          status: "confirmada",
          metodo,
          detalhe: "Fonte oficial identifica Candidato Teste como governador da Bahia.",
          url: "https://fonte-oficial.ba.gov.br/perfil/candidato-teste",
        },
      })
      const [planoAtual] = criarPlanos(evidencia)
      assert.equal(valorArgumento(planoAtual, "identidade"), "cargo-e-uf")

      assert.throws(() => criarPlanos(evidenciaCom({
        identidade: {
          status: "confirmada",
          metodo,
          detalhe: "Fonte oficial apenas menciona o nome informado.",
          url: "https://fonte-oficial.example/perfil/candidato-teste",
        },
      })), /precisa identificar cargo ou candidatura/)

      assert.throws(() => criarPlanos(evidenciaCom({
        identidade: {
          status: "confirmada",
          metodo,
          detalhe: "Fonte oficial identifica Candidato Teste como governador de Sergipe.",
          url: "https://fonte-oficial.se.gov.br/perfil/candidato-teste",
        },
      })), /nao comprova a UF BA/)
    }
  })

  it("aceita candidatura explicitamente identificada por fonte oficial", () => {
    const [planoAtual] = criarPlanos(evidenciaCom({
      identidade: {
        status: "confirmada",
        metodo: "assembleia-oficial",
        detalhe: "Site oficial confirma Candidato Teste como pre-candidato ao governo da Bahia.",
        url: "https://fonte-oficial.ba.gov.br/pre-candidatura",
      },
    }))
    assert.equal(valorArgumento(planoAtual, "identidade"), "cargo-e-uf")
  })

  it("rejeita identidade TSE cuja UF diverge da ficha", () => {
    const evidencia = evidenciaCom({
      identidade: {
        status: "confirmada",
        metodo: "tse-nome-cargo-uf",
        nome: "Candidato Teste",
        cargo: "GOVERNADOR",
        uf: "SE",
        url: "https://www.tse.jus.br/eleicoes/candidatos",
      },
    })

    assert.throws(() => criarPlanos(evidencia), /UF da identidade diverge da UF do candidato/)
  })

  it("falha fechado quando encontrado não possui processo", () => {
    const evidencia = evidenciaCom({ classificacao: "encontrado" })
    assert.throws(() => criarPlanos(evidencia), /classificacao encontrado exige ao menos um achado/)
  })

  it("rejeita vazio confirmado quando a busca atingiu o teto público", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      busca: {
        url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Candidato%20Teste",
        periodo: "acervo disponível até 2026-08-05",
        termos: "nome completo exato + cargo + UF",
        tribunais_consultados: ["TJBA"],
        total_api: 10_000,
        teto_publico_atingido: true,
      },
    })), /vazio_confirmado proibido quando a busca atinge o teto publico/)
  })

  it("falha fechado para URL genérica usada como evidência publicável", () => {
    const urlBusca = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?nomeParte=Candidato%20Teste"
    const evidencia = evidenciaCom({
      classificacao: "encontrado",
      processos: [{
        numero_cnj: "4004910-65.2025.8.26.0506",
        url: urlBusca,
        contexto_identidade: "Nome completo e cargo aparecem próximos no documento oficial.",
      }],
    })

    assert.throws(() => criarPlanos(evidencia), /URL generica de busca nao e evidencia publicavel/)
  })

  it("rejeita número CNJ cujo dígito verificador é inválido", () => {
    const evidencia = evidenciaCom({
      classificacao: "encontrado",
      processos: [processo(
        "4004910-66.2025.8.26.0506",
        "https://example.com/processos/4004910-66.2025.8.26.0506",
      )],
    })

    assert.throws(() => criarPlanos(evidencia), /exige CNJ valido/)
  })

  it("exige simultaneamente CNJ válido e URL oficial específica", () => {
    const cnjValido = "4004910-65.2025.8.26.0506"
    const urlOficial = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${cnjValido.replace(/\D/g, "")}`

    assert.throws(
      () => criarPlanos(evidenciaCom({
        classificacao: "encontrado",
        processos: [processo(cnjValido, `https://example.com/processos/${cnjValido}`)],
      })),
      /fonte oficial especifica/,
    )
    assert.throws(
      () => criarPlanos(evidenciaCom({
        classificacao: "encontrado",
        processos: [processo("4004910-66.2025.8.26.0506", urlOficial)],
      })),
      /CNJ valido/,
    )
    assert.doesNotThrow(() => criarPlanos(evidenciaCom({
      classificacao: "encontrado",
      processos: [processo(cnjValido, urlOficial)],
    })))
  })

  it("aceita o CNJ apenas no parâmetro numeroProcesso com valor exato", () => {
    const numero = "4004910-65.2025.8.26.0506"
    const digitos = numero.replace(/\D/g, "")
    const base = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"

    for (const url of [
      `${base}?foo=${digitos}`,
      `${base}?numeroProcesso=9${digitos}`,
      `${base}?numeroProcesso=${digitos}9`,
    ]) {
      assert.throws(
        () => criarPlanos(evidenciaCom({
          classificacao: "encontrado",
          processos: [processo(numero, url)],
        })),
        /fonte oficial especifica vinculada ao processo/,
      )
    }

    assert.doesNotThrow(() => criarPlanos(evidenciaCom({
      classificacao: "encontrado",
      processos: [processo(numero, `${base}?numeroProcesso=${digitos}`)],
    })))
  })

  it("inclui ocorrências ambíguas no detalhe auditável", () => {
    const [planoAtual] = criarPlanos(evidenciaCom({
      ocorrencias_ambiguas: [{
        numero_cnj: "comunicacao-99",
        tribunal: "TJBA",
        motivo: "nome exato sem segundo identificador",
      }],
    }))

    assert.match(valorArgumento(planoAtual, "detalhe"), /ocorrencias_ambiguas:/)
    assert.match(valorArgumento(planoAtual, "detalhe"), /comunicacao-99/)
  })

  it("preflight trata registro divergente como conflito", () => {
    const [base] = criarPlanos(evidenciaCom())
    const detalheBase = valorArgumento(base, "detalhe")
    const comAmbiguas: PlanoRegistro = {
      ...base,
      args: base.args.map((item) => item.startsWith("--detalhe=")
        ? `--detalhe=${detalheBase}; ocorrencias_ambiguas: [{\"numero_cnj\":\"comunicacao-99\"}]`
        : item),
    }
    const existenteSemAmbiguas = {
      alvo: base.slug,
      resultado: base.resultado,
      detalhe: detalhePersistido(base),
    }

    assert.throws(
      () => validarPreflight([comAmbiguas], [comAmbiguas.slug], [existenteSemAmbiguas]),
      /registro\(s\) conflitante\(s\)/,
    )
  })

  it("preflight rejeita coorte pública incompleta", () => {
    assert.throws(
      () => validarPreflight([plano()], [], []),
      /coorte publica divergente/,
    )
  })

  it("preflight pula registro equivalente já aplicado", () => {
    const [atual] = criarPlanos(evidenciaCom())
    const resultado = validarPreflight([atual], [atual.slug], [{
      alvo: atual.slug,
      resultado: atual.resultado,
      detalhe: detalhePersistido(atual),
    }])
    assert.deepEqual(resultado.pendentes, [])
    assert.deepEqual(resultado.equivalentes, [atual])
  })

  it("preflight separa coorte parcial entre equivalentes e pendentes", () => {
    const primeiro = plano({ slug: "candidato-a" })
    const segundo = plano({ slug: "candidato-b" })
    const existente = {
      alvo: primeiro.slug,
      resultado: primeiro.resultado,
      detalhe: detalhePersistido(primeiro),
    }
    const resultado = validarPreflight(
      [primeiro, segundo],
      [primeiro.slug, segundo.slug],
      [existente],
    )
    assert.deepEqual(resultado.equivalentes, [primeiro])
    assert.deepEqual(resultado.pendentes, [segundo])
  })

  it("preflight mantém toda a coorte pendente quando o banco está vazio", () => {
    const atual = plano()
    const resultado = validarPreflight([atual], [atual.slug], [])
    assert.deepEqual(resultado.pendentes, [atual])
    assert.deepEqual(resultado.equivalentes, [])
  })

  it("rejeita processo de terceiro mesmo com CNJ e URL oficial válidos", () => {
    const numero = "4004910-65.2025.8.26.0506"
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${numero.replace(/\D/g, "")}`
    assert.throws(() => criarPlanos(evidenciaCom({
      classificacao: "encontrado",
      processos: [{
        numero_cnj: numero,
        url,
        contexto_identidade: "Candidato Teste e Terceiro da Silva governador da Bahia no documento oficial.",
      }],
    })), /nao vincula nome do candidato/)
  })

  it("rejeita nome do candidato sem CPF ou cargo político na mesma janela", () => {
    const numero = "4004910-65.2025.8.26.0506"
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${numero.replace(/\D/g, "")}`
    assert.throws(() => criarPlanos(evidenciaCom({
      classificacao: "encontrado",
      processos: [{
        numero_cnj: numero,
        url,
        contexto_identidade: `Candidato Teste ${"texto neutro ".repeat(30)} governador Fulano de Tal`,
      }],
    })), /nao vincula nome do candidato/)
  })

  it("rejeita identidade oficial cujo nome diverge da ficha", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      identidade: {
        status: "confirmada",
        metodo: "tse-nome-cargo-uf",
        nome: "Terceiro da Silva",
        cargo: "GOVERNADOR",
        uf: "BA",
        url: "https://www.tse.jus.br/eleicoes/candidatos",
      },
    })), /nome oficial diverge do candidato/)
  })

  it("rejeita identidade que menciona o candidato e atribui o cargo a terceiro", () => {
    assert.throws(() => criarPlanos(evidenciaCom({
      identidade: {
        status: "confirmada",
        metodo: "assembleia-oficial",
        detalhe: "A fonte menciona Candidato Teste e informa que Terceiro da Silva e governador da Bahia.",
        url: "https://fonte-oficial.ba.gov.br/perfil/candidato-teste",
      },
    })), /nao vincula o nome do candidato ao cargo/)
  })

  it("lock exclusivo impede duas aplicações locais e libera nova tentativa", () => {
    const diretorio = mkdtempSync(join(tmpdir(), "processos-apply-lock-"))
    const evidencia = join(diretorio, "evidence.json")
    const liberar = adquirirLockAplicacao(evidencia)
    try {
      assert.throws(() => adquirirLockAplicacao(evidencia), /apply ja esta em execucao/)
    } finally {
      liberar()
    }
    const liberarNovamente = adquirirLockAplicacao(evidencia)
    liberarNovamente()
    rmSync(diretorio, { recursive: true, force: true })
  })
})
