import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bloquearPlanosPorDecisao,
  cnjsPorSlugDaEvidencia,
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
    motivo: "3 ocorrencia(s) por nome exato sem segundo identificador; conclusao bloqueada por identidade ambigua",
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
  it("renova o recibo sem o CNJ vetado e sem deixar rastro da retirada no recibo", () => {
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
    // O recibo vira JSON público: nem contador, nem hash, e a contagem do motivo bate com a lista.
    assert.ok(!/exclu|veto|decis/i.test(texto), "recibo não pode sinalizar a retirada")
    assert.match(texto, /motivo: 1 ocorrencia\(s\) por nome exato/)
    assert.equal((texto.match(/"numero_cnj"/g) ?? []).length, 1)
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
    assert.ok(!/exclu|veto|decis/i.test(detalhe(plano)))
    assert.ok(!detalhe(plano).includes(SEM_MASCARA(VETADO)) && !detalhe(plano).includes(SEM_MASCARA(PERMITIDO)))
  })

  it("com todas as ocorrências vetadas o recibo segue indeterminado, nunca vazio confirmado", () => {
    const vetos = decisoes([SLUG, VETADO])
    const { evidencia } = excluirVetadosDaEvidencia(evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(VETADO)] }), vetos)
    const [plano] = criarPlanos(evidencia)

    assert.equal(plano.resultado, "indeterminado")
    assert.equal(plano.classificacao, "bloqueado")
    assert.match(detalhe(plano), /ocorrencias_ambiguas: \[\]/)
    assert.match(detalhe(plano), /motivo: conclusao bloqueada por identidade ambigua/)
    assert.ok(!/\b0 ocorrencia/.test(detalhe(plano)))
    assert.ok(plano.args.some((arg) => arg === "--resultado=indeterminado"))
  })

  it("CNJ fora do arquivo de vetos não é excluído e o recibo fica igual ao de antes", () => {
    const vetos = decisoes([SLUG, VETADO])
    const bruta = evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(PERMITIDO), ambigua("comunicacao-99")] })
    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(bruta, vetos)

    assert.deepEqual(exclusoes, [])
    assert.deepEqual(criarPlanos(evidencia), criarPlanos(bruta))
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

  it("retirada por veto nunca vira ausência confirmada: vazio_confirmado com ocorrência vetada renova como indeterminado", () => {
    const vetos = decisoes([SLUG, VETADO])
    const bruta = evidenciaCom(SLUG, {
      classificacao: "vazio_confirmado",
      motivo: "nenhum processo atribuivel no escopo declarado",
      ocorrencias_ambiguas: [ambigua(VETADO)],
    })
    // Antes da retirada o guarda recusa: ausência não se afirma com ocorrência aberta.
    assert.throws(() => criarPlanos(bruta), /vazio_confirmado exige ausência de ocorrências ambíguas/)

    const { evidencia, exclusoes } = excluirVetadosDaEvidencia(bruta, vetos)
    const [plano] = criarPlanos(evidencia)

    assert.equal(exclusoes.length, 1)
    assert.equal(plano.resultado, "indeterminado")
    assert.equal(plano.classificacao, "bloqueado")
    assert.ok(plano.args.includes("--resultado=indeterminado"))
    assert.ok(!plano.args.some((arg) => arg.includes("vazio_confirmado") && arg.startsWith("--resultado=")))
    assert.ok(plano.args.every((arg) => !arg.includes(SEM_MASCARA(VETADO)) && !arg.includes(VETADO)), "CNJ vetado fora de todos os argumentos")
    assert.ok(!/exclu|veto|decis/i.test(detalhe(plano)))
    assert.equal(bloquearPlanosPorDecisao([plano], cnjsPorSlugDaEvidencia(bruta, evidencia), vetos).bloqueados, 0)
  })

  it("vazio_confirmado sem ocorrência vetada continua recusado se houver ocorrência ambígua", () => {
    const vetos = decisoes([SLUG, VETADO])
    const bruta = evidenciaCom(SLUG, {
      classificacao: "vazio_confirmado",
      motivo: "nenhum processo atribuivel no escopo declarado",
      ocorrencias_ambiguas: [ambigua(PERMITIDO)],
    })
    const { evidencia } = excluirVetadosDaEvidencia(bruta, vetos)

    assert.throws(() => criarPlanos(evidencia), /vazio_confirmado exige ausência de ocorrências ambíguas/)
  })

  it("a barreira da decisão continua vendo CNJ vetado em achado publicável, recibo anterior e argumentos", () => {
    const vetos = decisoes([SLUG, VETADO])
    const original = evidenciaCom(SLUG, { ocorrencias_ambiguas: [ambigua(VETADO), ambigua(PERMITIDO)] })
    const { evidencia } = excluirVetadosDaEvidencia(original, vetos)
    const [plano] = criarPlanos(evidencia)

    // Retirado de propósito: o plano renovado passa.
    assert.equal(bloquearPlanosPorDecisao([plano], cnjsPorSlugDaEvidencia(original, evidencia), vetos).bloqueados, 0)

    // Achado publicável vem da evidência original, mesmo que a filtrada o perdesse.
    const comAchado = evidenciaCom(SLUG, { classificacao: "encontrado", processos: [ambigua(VETADO)] })
    const semAchado = evidenciaCom(SLUG, { classificacao: "encontrado", processos: [] })
    assert.ok(cnjsPorSlugDaEvidencia(comAchado, semAchado).get(SLUG)?.includes(VETADO))
    assert.equal(bloquearPlanosPorDecisao([plano], cnjsPorSlugDaEvidencia(comAchado, semAchado), vetos).planos.length, 0)

    // CNJ do recibo anterior continua barrando.
    const anterior = new Map([[SLUG, [VETADO]]])
    assert.equal(bloquearPlanosPorDecisao([plano], cnjsPorSlugDaEvidencia(original, evidencia, anterior), vetos).planos.length, 0)

    // CNJ vetado nos argumentos do registrador continua barrando.
    const contaminado = { ...plano, args: [...plano.args, `--evidencia-publicavel=https://comunicaapi.pje.jus.br/consulta?numeroProcesso=${SEM_MASCARA(VETADO)}`] }
    assert.equal(bloquearPlanosPorDecisao([contaminado], cnjsPorSlugDaEvidencia(original, evidencia), vetos).planos.length, 0)
  })
})
