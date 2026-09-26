import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cnjsPublicaveisDoTexto,
  confirmacoesEditoriaisDoDetalhe,
  criarPlanos,
  filtrarMudancas,
  preservarConfirmacaoEditorial,
  validarEvidencia,
  type LinhaExistentePreflight,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"
import { entradaDaRevisao, validarRevisaoManual } from "../scripts/registrar-revisao-curadoria"

const DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso="
const CNJ_PROVADO = "5210894-85.2022.8.13.0024"
const CNJ_EDITORIAL_A = "1937434-41.2023.8.13.0000"
const CNJ_EDITORIAL_B = "0002338-27.2022.8.16.0204"
const AMBIGUO_OUTRO = "0204235-59.2015.8.06.0001"

type Candidato = Record<string, unknown>

function candidatoBase(slug: string, nome: string, uf: string): Candidato {
  return {
    slug,
    nome_completo: nome,
    nome_urna: nome,
    cargo: "Governador",
    uf,
    identidade: {
      status: "confirmada", metodo: "tse-sq-candidato", sq_candidato: "100002536212",
      nome, url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip",
    },
    busca: {
      url: `https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=${encodeURIComponent(nome)}&pagina=1`,
      consultado_em: "2026-09-26T20:00:00Z",
      periodo: "acervo publico consultado em 2026-09-26T20:00:00Z",
      termos: "nome completo exato",
      tribunais_consultados: ["TJMG", "TJPR"],
      total_api: 40,
      teto_publico_atingido: false,
      completo: true,
    },
    ocorrencias_ambiguas: [],
    homonimos_descartados: [],
    classificacao: "bloqueado",
    motivo: "ocorrencias por nome exato sem segundo identificador",
    processos: [],
  }
}

function processo(numeroCnj: string, contexto: string): Record<string, unknown> {
  return {
    numero_cnj: numeroCnj, tribunal: "TJMG", classe: null, orgao: null, polo: "P",
    url: `${DJEN}${numeroCnj.replace(/\D/g, "")}`,
    contexto_identidade: contexto,
    datajud: { status: "pendente_conferencia_lote" },
  }
}

function ambiguo(numeroCnj: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { numero_cnj: numeroCnj, tribunal: "TJMG", motivo: "nome exato sem segundo identificador oficial adjacente; identidade ambigua", ...extra }
}

/** Zema: coleta prova um CNJ, o confirmado editorialmente volta ambíguo. */
function zema(extraAmbiguo: Record<string, unknown> = {}): Candidato {
  return {
    ...candidatoBase("governador-teste", "Governador Teste Neto", "MG"),
    classificacao: "encontrado",
    motivo: "1 processo(s) com numero CNJ e contexto oficial de identidade",
    processos: [processo(CNJ_PROVADO, "GOVERNADOR TESTE NETO GOVERNADOR DO ESTADO DE MINAS GERAIS")],
    ocorrencias_ambiguas: [ambiguo(AMBIGUO_OUTRO), ambiguo(CNJ_EDITORIAL_A, extraAmbiguo)],
  }
}

/** Moro: a coleta não prova nada; o confirmado volta ambíguo e o alvo, bloqueado. */
function moro(): Candidato {
  return {
    ...candidatoBase("senador-teste", "Senador Fernando Teste", "PR"),
    ocorrencias_ambiguas: [ambiguo(CNJ_EDITORIAL_B)],
  }
}

function evidencia(candidatos: Candidato[]): ReturnType<typeof validarEvidencia> {
  const contagem = (c: string) => candidatos.filter((x) => x.classificacao === c).length
  return validarEvidencia({
    schema_version: 1,
    total_inicial: candidatos.length,
    candidatos_iniciais: candidatos.map((c) => c.slug),
    fontes: { modo: "dry-run-coorte-atual-renovacao", snapshot_sha256: "abc" },
    lotes: [{ numero: 1, concluido_em: "2026-09-26T20:05:00Z", slugs: candidatos.map((c) => c.slug), candidatos }],
    resumo: {
      classificados: candidatos.length, encontrado: contagem("encontrado"), vazio_confirmado: contagem("vazio_confirmado"),
      bloqueado: contagem("bloqueado"), erro: contagem("erro"),
    },
  })
}

/** Recibo gravado em 26/09 com a confirmação editorial, no formato do registrador. */
function reciboEditorial(slug: string, cnjs: string[]): LinhaExistentePreflight {
  const confirmacao = cnjs.map((numero_cnj) => ({
    numero_cnj, confirmacao: "editorial", decidido_por: "Thiago Salvador", decidido_em: "2026-09-26",
    motivo: "nome completo unico, sem numero de documento divergente colado ao nome",
  }))
  const urls = cnjs.map((c) => `${DJEN}${c.replace(/\D/g, "")}`)
  const args = [
    `--slug=${slug}`, "--frente=processos", "--data=2026-09-26", "--resultado=encontrado",
    `--detalhe=orgaos: TJMG, TJPR; motivo: confirmacao editorial; ocorrencias_ambiguas: []; homonimos_descartados: []; confirmacao_editorial: ${JSON.stringify(confirmacao)}`,
    "--identidade=id-oficial",
    "--url=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip",
    "--identidade-url=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip",
    ...urls.map((u) => `--url=${u}`),
    ...urls.map((u) => `--evidencia-publicavel=${u}`),
    "--dry-run",
  ]
  const entrada = entradaDaRevisao(validarRevisaoManual(args))
  return { alvo: slug, resultado: entrada.resultado, detalhe: entrada.detalhe ?? null, executado_em: "2026-09-26T18:28:08Z" }
}

function candidatosPorSlug(ev: ReturnType<typeof validarEvidencia>) {
  return new Map(ev.lotes.flatMap((l) => l.candidatos).map((c) => [c.slug, c]))
}

function publicaveis(plano: PlanoRegistro): string[] {
  return cnjsPublicaveisDoTexto(plano.args.filter((a) => a.startsWith("--evidencia-publicavel=")).join(" "))
}

function detalhe(plano: PlanoRegistro): string {
  return plano.args.find((a) => a.startsWith("--detalhe="))!.slice("--detalhe=".length)
}

const digitos = (cnj: string) => cnj.replace(/\D/g, "")

describe("confirmação editorial sobrevive à renovação automática", () => {
  it("lê a confirmação gravada e recusa a ilegível", () => {
    const linha = reciboEditorial("governador-teste", [CNJ_EDITORIAL_A])
    assert.deepEqual(confirmacoesEditoriaisDoDetalhe(linha.detalhe)!.map((c) => c.numero_cnj), [CNJ_EDITORIAL_A])
    assert.deepEqual(confirmacoesEditoriaisDoDetalhe("revisao_em=2026-09-26; detalhe=motivo: x"), [])
    assert.equal(confirmacoesEditoriaisDoDetalhe("revisao_em=2026-09-26; detalhe=motivo: x; confirmacao_editorial: [{\"numero_cnj\":\"123\"}]"), null)
  })

  it("renovação de 05/10: os dois CNJ confirmados seguem publicados e a rodada seguinte não muda nada", () => {
    const ev = evidencia([zema(), moro()])
    const planos = criarPlanos(ev)
    // Sem a preservação, a coleta derrubaria os dois.
    const [zemaCru, moroCru] = planos
    assert.ok(!publicaveis(zemaCru).includes(digitos(CNJ_EDITORIAL_A)))
    assert.equal(moroCru.resultado, "indeterminado")

    const existentes = [
      reciboEditorial("governador-teste", [CNJ_PROVADO, CNJ_EDITORIAL_A].sort()),
      reciboEditorial("senador-teste", [CNJ_EDITORIAL_B]),
    ]
    const { planos: preservados, revisaoHumana } = preservarConfirmacaoEditorial(planos, candidatosPorSlug(ev), existentes)
    assert.deepEqual(revisaoHumana, [])
    const [z, m] = preservados
    assert.equal(z.resultado, "encontrado")
    assert.deepEqual(publicaveis(z), [digitos(CNJ_EDITORIAL_A), digitos(CNJ_PROVADO)].sort())
    assert.equal(m.resultado, "encontrado")
    assert.deepEqual(publicaveis(m), [digitos(CNJ_EDITORIAL_B)])
    for (const [plano, cnj] of [[z, CNJ_EDITORIAL_A], [m, CNJ_EDITORIAL_B]] as const) {
      const d = detalhe(plano)
      const ambiguas = /ocorrencias_ambiguas: (\[.*?\]); homonimos/.exec(d)![1]
      assert.ok(!ambiguas.includes(cnj), "o CNJ confirmado sai das ambíguas")
      assert.match(d, new RegExp(`confirmacao_editorial: \\[\\{"numero_cnj":"${cnj.replace(/\./g, "\\.")}","confirmacao":"editorial","decidido_por":"Thiago Salvador","decidido_em":"2026-09-26"`))
    }
    assert.match(detalhe(z), new RegExp(AMBIGUO_OUTRO.replace(/\./g, "\\.")), "as outras ambíguas ficam")

    // A linha nova carrega a confirmação: a rodada seguinte não vê mudança.
    const gravadas = preservados.map((p) => {
      const entrada = entradaDaRevisao(validarRevisaoManual([...p.args, "--dry-run"]))
      return { alvo: p.slug, resultado: entrada.resultado, detalhe: entrada.detalhe ?? null, executado_em: "2026-09-26T20:10:00Z" }
    })
    const seguinte = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [...existentes, ...gravadas])
    assert.deepEqual(filtrarMudancas(seguinte.planos, [...existentes, ...gravadas]), [])
  })

  it("documento divergente colado ao nome na coleta nova bloqueia o alvo para revisão humana", () => {
    for (const [nome, candidato] of [
      ["ambígua com documento divergente", zema({ cpf_divergente: true })],
      ["homônimo descartado", { ...zema(), ocorrencias_ambiguas: [ambiguo(AMBIGUO_OUTRO)], homonimos_descartados: [ambiguo(CNJ_EDITORIAL_A)] }],
    ] as Array<[string, Candidato]>) {
      const ev = evidencia([candidato, moro()])
      const existentes = [reciboEditorial("governador-teste", [CNJ_EDITORIAL_A]), reciboEditorial("senador-teste", [CNJ_EDITORIAL_B])]
      const { planos, revisaoHumana } = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), existentes)
      assert.deepEqual(revisaoHumana.map((r) => [r.slug, r.numero_cnj]), [["governador-teste", CNJ_EDITORIAL_A]], nome)
      assert.deepEqual(planos.map((p) => p.slug), ["senador-teste"], `${nome}: nenhuma linha nova para o alvo bloqueado`)
    }
  })

  it("coleta sem conclusão de identidade ou confirmação ilegível também vão a revisão humana", () => {
    const erro = {
      ...moro(), classificacao: "erro",
      identidade: { status: "bloqueada", motivo: "consulta TSE 2022 falhou antes da identidade", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip" },
      motivo: "HTTP 503 no DJEN", ocorrencias_ambiguas: [],
    }
    const ev = evidencia([erro])
    const r = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [reciboEditorial("senador-teste", [CNJ_EDITORIAL_B])])
    assert.deepEqual(r.planos, [])
    assert.equal(r.revisaoHumana[0].motivo, "coleta nova sem conclusao de identidade")

    const ev2 = evidencia([moro()])
    const ilegivel = { ...reciboEditorial("senador-teste", [CNJ_EDITORIAL_B]) }
    ilegivel.detalhe = String(ilegivel.detalhe).replace("\"confirmacao\":\"editorial\"", "\"confirmacao\":\"outra\"")
    const r2 = preservarConfirmacaoEditorial(criarPlanos(ev2), candidatosPorSlug(ev2), [ilegivel])
    assert.deepEqual(r2.planos, [])
    assert.match(r2.revisaoHumana[0].motivo, /ilegivel/)
  })

  it("a confirmação editorial nunca rebaixa nem altera um recibo que a coleta prova como encontrado", () => {
    // A coleta prova o próprio CNJ confirmado: o plano sai idêntico ao da coleta.
    const provado = {
      ...zema(),
      processos: [
        processo(CNJ_PROVADO, "GOVERNADOR TESTE NETO GOVERNADOR DO ESTADO DE MINAS GERAIS"),
        processo(CNJ_EDITORIAL_A, "GOVERNADOR TESTE NETO GOVERNADOR DO ESTADO DE MINAS GERAIS"),
      ],
      ocorrencias_ambiguas: [ambiguo(AMBIGUO_OUTRO)],
    }
    const ev = evidencia([provado])
    const planos = criarPlanos(ev)
    const r = preservarConfirmacaoEditorial(planos, candidatosPorSlug(ev), [reciboEditorial("governador-teste", [CNJ_EDITORIAL_A])])
    assert.deepEqual(r.planos, planos)
    assert.deepEqual(r.revisaoHumana, [])

    // Confirmação de outro CNJ só acrescenta: o provado e o resultado ficam.
    const ev2 = evidencia([zema()])
    const [cru] = criarPlanos(ev2)
    const [preservado] = preservarConfirmacaoEditorial([cru], candidatosPorSlug(ev2), [reciboEditorial("governador-teste", [CNJ_EDITORIAL_A])]).planos
    assert.equal(preservado.resultado, "encontrado")
    for (const cnj of publicaveis(cru)) assert.ok(publicaveis(preservado).includes(cnj), `provado ${cnj} fica`)
    assert.ok(publicaveis(preservado).length > publicaveis(cru).length)

    // Recibo anterior sem confirmação editorial: nada muda.
    const semEditorial = { alvo: "governador-teste", resultado: "encontrado", detalhe: "revisao_em=2026-09-26; detalhe=motivo: x", executado_em: "2026-09-26T18:00:00Z" }
    assert.deepEqual(preservarConfirmacaoEditorial([cru], candidatosPorSlug(ev2), [semEditorial]).planos, [cru])
  })
})
