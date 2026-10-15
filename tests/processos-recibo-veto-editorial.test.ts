import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bloquearPlanosPorDecisao,
  criarPlanos,
  excluirVetadosDaEvidencia,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"
import { chaveDecisao } from "../scripts/lib/processos-decisao-editorial"

type Evidencia = Parameters<typeof criarPlanos>[0]

const SLUG = "candidato-veto"
const OUTRO_SLUG = "candidato-livre"

/** CNJ com dígito verificador correto (módulo 97 da norma do CNJ), no formato com máscara. */
function cnj(sequencial: string): string {
  const resto = "2025826" + "0506"
  const dv = String(98 - Number(BigInt(`${sequencial}${resto}00`) % BigInt(97))).padStart(2, "0")
  return `${sequencial}-${dv}.2025.8.26.0506`
}

const VETADO = cnj("4004910")
const PERMITIDO = cnj("4004911")
const SEM_MASCARA = (valor: string) => valor.replace(/\D/g, "")

function decisoes(...pares: Array<[string, string]>): ReadonlySet<string> {
  return new Set(pares.map(([slug, numero]) => chaveDecisao(slug, numero)))
}

function ambigua(numero: string, tribunal = "TJSP"): Record<string, unknown> {
  return { numero_cnj: numero, tribunal, motivo: "nome exato sem segundo identificador" }
}

function evidenciaCom(slug: string, overrides: Record<string, unknown> = {}): Evidencia {
  const candidato = {
    slug,
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
      tribunais_consultados: ["TJSP"],
    },
    ocorrencias_ambiguas: [],
    homonimos_descartados: [],
    classificacao: "bloqueado",
    motivo: "ocorrencias por nome exato sem segundo identificador; conclusao bloqueada por identidade ambigua",
    processos: [],
    ...overrides,
  }
  return {
    schema_version: 1,
    total_inicial: 1,
    candidatos_iniciais: [slug],
    lotes: [{ numero: 1, concluido_em: "2026-08-05T20:00:00.000Z", slugs: [slug], candidatos: [candidato] }],
    resumo: { classificados: 1, encontrado: 0, vazio_confirmado: 0, bloqueado: 1 },
  } as Evidencia
}

function detalhe(plano: PlanoRegistro): string {
  const argumento = plano.args.find((item) => item.startsWith("--detalhe="))
  assert.ok(argumento, "argumento detalhe ausente")
  return argumento.slice("--detalhe=".length)
}

function cnjsPorSlug(evidencia: Evidencia): Map<string, string[]> {
  return new Map(evidencia.lotes.flatMap((lote) => lote.candidatos).map((candidato) => [
    candidato.slug,
    [...candidato.processos, ...(candidato.ocorrencias_ambiguas ?? []), ...candidato.homonimos_descartados]
      .map((item) => String(item.numero_cnj ?? "")),
  ]))
}

describe("recibo judicial com CNJ vetado pela decisão editorial", () => {
  it("renova o recibo sem o CNJ vetado, grava só a contagem e mantém o resto igual", () => {
    const vetos = decisoes([SLUG, VETADO])
    const bruta = evidenciaCom(SLUG, {
      // O mesmo processo aparece com máscara e só com dígitos: é um único par.
      ocorrencias_ambiguas: [ambigua(VETADO), ambigua(SEM_MASCARA(VETADO)), ambigua(PERMITIDO)],
    })
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(bruta, vetos)
    const [plano] = criarPlanos(evidencia)

    assert.equal(plano.resultado, "indeterminado")
    assert.equal(plano.classificacao, "bloqueado")
    const texto = detalhe(plano)
    assert.ok(!texto.includes(SEM_MASCARA(VETADO)) && !texto.includes(VETADO), "CNJ vetado não pode ir ao recibo")
    assert.ok(texto.includes(PERMITIDO), "ocorrência não vetada continua auditável")
    assert.match(texto, /excluidos_decisao_editorial: 1(?:;|$)/)
    assert.deepEqual(exclusoes, [{ slug: SLUG, quantidade: 1, hashes: [chaveDecisao(SLUG, VETADO)] }])
    // Nenhum hash ou CNJ do veto vai para os argumentos do registrador.
    assert.ok(plano.args.every((arg) => !arg.includes(chaveDecisao(SLUG, VETADO))))

    // O plano renovado já não carrega CNJ vetado: não vai para revisão humana.
    const bloqueio = bloquearPlanosPorDecisao([plano], cnjsPorSlug(evidencia), vetos)
    assert.deepEqual(bloqueio.planos, [plano])
    assert.equal(bloqueio.bloqueados, 0)
    assert.deepEqual(bloqueio.revisaoHumana, [])

    // A evidência de entrada não é alterada.
    assert.equal(bruta.lotes[0].candidatos[0].ocorrencias_ambiguas?.length, 3)
  })

  it("tira também o homônimo descartado vetado e conta cada par uma vez", () => {
    const vetos = decisoes([SLUG, VETADO], [SLUG, PERMITIDO])
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(evidenciaCom(SLUG, {
      ocorrencias_ambiguas: [ambigua(VETADO)],
      homonimos_descartados: [ambigua(PERMITIDO)],
    }), vetos)
    const [plano] = criarPlanos(evidencia)

    assert.equal(exclusoes[0].quantidade, 2)
    assert.deepEqual(exclusoes[0].hashes, [chaveDecisao(SLUG, VETADO), chaveDecisao(SLUG, PERMITIDO)].sort())
    assert.match(detalhe(plano), /excluidos_decisao_editorial: 2(?:;|$)/)
    assert.ok(!detalhe(plano).includes(SEM_MASCARA(VETADO)) && !detalhe(plano).includes(SEM_MASCARA(PERMITIDO)))
  })

  it("com todas as ocorrências vetadas o recibo segue indeterminado, nunca vazio confirmado", () => {
    const vetos = decisoes([SLUG, VETADO])
    const { evidencia } = excluirVetadosDaEvidencia(evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(VETADO)] }), vetos)
    const [plano] = criarPlanos(evidencia)

    assert.equal(plano.resultado, "indeterminado")
    assert.equal(plano.classificacao, "bloqueado")
    assert.match(detalhe(plano), /ocorrencias_ambiguas: \[\]/)
    assert.ok(plano.args.some((arg) => arg === "--resultado=indeterminado"))
  })

  it("CNJ fora do arquivo de vetos não é excluído e o recibo fica igual ao de antes", () => {
    const vetos = decisoes([SLUG, VETADO])
    const bruta = evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(PERMITIDO), ambigua("comunicacao-99")] })
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(bruta, vetos)

    assert.deepEqual(exclusoes, [])
    assert.deepEqual(criarPlanos(evidencia), criarPlanos(bruta))
    assert.ok(!detalhe(criarPlanos(evidencia)[0]).includes("excluidos_decisao_editorial"))
  })

  it("o veto vale por par candidato e CNJ: o mesmo CNJ em outro candidato não é excluído", () => {
    const vetos = decisoes([SLUG, VETADO])
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(
      evidenciaCom(OUTRO_SLUG, { ocorrencias_ambiguas: [ambigua(VETADO)] }),
      vetos,
    )

    assert.deepEqual(exclusoes, [])
    assert.ok(detalhe(criarPlanos(evidencia)[0]).includes(VETADO))
  })

  it("CNJ inválido nunca é excluído por aproximação", () => {
    const invalido = VETADO.replace(/-\d{2}\./, (dv) => (dv === "-00." ? "-01." : "-00."))
    const vetos = new Set([chaveDecisao(SLUG, invalido)])
    const { exclusoes } = excluirVetadosDaEvidencia(evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(invalido)] }), vetos)

    assert.deepEqual(exclusoes, [])
  })

  it("processo publicável vetado não é excluído: o plano segue para revisão humana e não é gravado", () => {
    const vetos = decisoes([SLUG, VETADO])
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${SEM_MASCARA(VETADO)}`
    const bruta = evidenciaCom(SLUG, {
      classificacao: "encontrado",
      motivo: "processo localizado com identidade oficial",
      processos: [{
        numero_cnj: VETADO,
        url,
        contexto_identidade: "O documento oficial registra Candidato Teste governador da Bahia.",
      }],
    })
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(bruta, vetos)
    const planos = criarPlanos(evidencia)

    assert.deepEqual(exclusoes, [])
    assert.equal(evidencia.lotes[0].candidatos[0].processos.length, 1)
    const bloqueio = bloquearPlanosPorDecisao(planos, cnjsPorSlug(evidencia), vetos)
    assert.deepEqual(bloqueio.planos, [])
    // O mesmo processo entra com máscara (evidência) e sem máscara (URL): ambos contam.
    assert.ok(bloqueio.bloqueados >= 1)
    assert.ok(bloqueio.revisaoHumana.length >= 1)
    assert.ok(bloqueio.revisaoHumana.every((item) => item.slug === SLUG
      && item.motivo === "decisao_editorial_nao_publicar"
      && SEM_MASCARA(item.numero_cnj) === SEM_MASCARA(VETADO)))
  })

  it("CNJ vetado que sobra em outro campo do plano continua bloqueando o recibo inteiro", () => {
    const vetos = decisoes([SLUG, VETADO])
    const { evidencia } = excluirVetadosDaEvidencia(evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(VETADO)] }), vetos)
    const [plano] = criarPlanos(evidencia)
    const contaminado = { ...plano, args: [...plano.args, `--url=https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${SEM_MASCARA(VETADO)}`] }
    const bloqueio = bloquearPlanosPorDecisao([contaminado], cnjsPorSlug(evidencia), vetos)

    assert.deepEqual(bloqueio.planos, [])
    assert.equal(bloqueio.bloqueados, 1)
  })
})
