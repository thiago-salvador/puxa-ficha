import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cnjsPublicaveisDoTexto,
  confirmacoesEditoriaisDoDetalhe,
  criarPlanos,
  entradaFechamentoRevisaoHumana,
  entradasRevisaoHumana,
  main as aplicar,
  filtrarMudancas,
  preservarConfirmacaoEditorial,
  validarEvidencia,
  type LinhaExistentePreflight,
  type PlanoRegistro,
} from "../scripts/aplicar-evidencia-processos-curadoria"
import { entradaDaRevisao, validarRevisaoManual } from "../scripts/registrar-revisao-curadoria"
import { lerFechamento } from "../scripts/fechar-revisao-humana-processos"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
    assert.equal(r.revisaoHumana[0].motivo, "busca nova sem conclusao sobre o acervo")

    const ev2 = evidencia([moro()])
    const ilegivel = { ...reciboEditorial("senador-teste", [CNJ_EDITORIAL_B]) }
    ilegivel.detalhe = String(ilegivel.detalhe).replace("\"confirmacao\":\"editorial\"", "\"confirmacao\":\"outra\"")
    const r2 = preservarConfirmacaoEditorial(criarPlanos(ev2), candidatosPorSlug(ev2), [ilegivel])
    assert.deepEqual(r2.planos, [])
    assert.match(r2.revisaoHumana[0].motivo, /invalida/)
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
    assert.deepEqual(r.revisaoHumana, [])
    const [igual] = r.planos
    assert.equal(igual.resultado, planos[0].resultado)
    assert.deepEqual(publicaveis(igual), publicaveis(planos[0]))
    // Só o detalhe muda: a confirmação é regravada para a próxima rodada.
    assert.deepEqual(igual.args.filter((a) => !a.startsWith("--detalhe=")), planos[0].args.filter((a) => !a.startsWith("--detalhe=")))
    assert.ok(detalhe(igual).startsWith(`${detalhe(planos[0])}; confirmacao_editorial: `))
    // Mesmos CNJ e resultado do recibo anterior: a revalidação não grava nada.
    assert.equal(filtrarMudancas(r.planos, [reciboEditorial("governador-teste", [CNJ_EDITORIAL_A, CNJ_PROVADO].sort())]).length, 0)

    // Provado pela coleta, a confirmação nunca manda o alvo a revisão, nem com a busca no teto público.
    const noTeto = { ...provado, busca: { ...((provado as Candidato).busca as Record<string, unknown>), teto_publico_atingido: true, total_api: 10_000 } }
    const evTeto = evidencia([noTeto])
    const rTeto = preservarConfirmacaoEditorial(criarPlanos(evTeto), candidatosPorSlug(evTeto), [reciboEditorial("governador-teste", [CNJ_EDITORIAL_A])])
    assert.deepEqual(rTeto.revisaoHumana, [])
    assert.equal(rTeto.planos[0].resultado, "encontrado")

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

function gravar(planos: PlanoRegistro[], quando: string): LinhaExistentePreflight[] {
  return planos.map((p) => {
    const entrada = entradaDaRevisao(validarRevisaoManual([...p.args, "--dry-run"]))
    return { alvo: p.slug, resultado: entrada.resultado, detalhe: entrada.detalhe ?? null, executado_em: quando }
  })
}

describe("confirmação editorial: rodadas seguidas e travas da revisão", () => {
  it("duas renovações seguidas: CNJ confirmado e provado na primeira não some quando a segunda deixa de provar", () => {
    const existentes = [reciboEditorial("governador-teste", [CNJ_PROVADO, CNJ_EDITORIAL_A].sort())]
    // Rodada 1: a coleta prova PROVADO, A volta ambíguo.
    const ev1 = evidencia([zema()])
    const r1 = preservarConfirmacaoEditorial(criarPlanos(ev1), candidatosPorSlug(ev1), existentes)
    const gravadas1 = gravar(r1.planos, "2026-09-26T20:10:00Z")
    assert.deepEqual(confirmacoesEditoriaisDoDetalhe(gravadas1[0].detalhe)!.map((c) => c.numero_cnj).sort(), [CNJ_PROVADO, CNJ_EDITORIAL_A].sort())
    // Rodada 2: PROVADO volta ambíguo, a coleta não prova nada.
    const ev2 = evidencia([{ ...zema(), classificacao: "bloqueado", processos: [], ocorrencias_ambiguas: [ambiguo(CNJ_PROVADO), ambiguo(CNJ_EDITORIAL_A)] }])
    const r2 = preservarConfirmacaoEditorial(criarPlanos(ev2), candidatosPorSlug(ev2), [...existentes, ...gravadas1])
    assert.deepEqual(r2.revisaoHumana, [])
    assert.equal(r2.planos[0].resultado, "encontrado")
    assert.deepEqual(publicaveis(r2.planos[0]), [digitos(CNJ_EDITORIAL_A), digitos(CNJ_PROVADO)].sort())
    const gravadas2 = gravar(r2.planos, "2026-09-26T20:20:00Z")
    assert.deepEqual(confirmacoesEditoriaisDoDetalhe(gravadas2[0].detalhe)!.length, 2)
  })

  it("busca que bate no teto público ou não fecha o acervo não carrega a confirmação", () => {
    for (const [nome, busca] of [
      ["teto declarado", { teto_publico_atingido: true }],
      ["total da API no teto", { total_api: 10_000 }],
    ] as Array<[string, Record<string, unknown>]>) {
      const m = moro()
      const ev = evidencia([{ ...m, busca: { ...(m.busca as Record<string, unknown>), ...busca } }])
      const r = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [reciboEditorial("senador-teste", [CNJ_EDITORIAL_B])])
      assert.deepEqual(r.planos, [], nome)
      assert.equal(r.revisaoHumana[0]?.motivo, "busca nova sem conclusao sobre o acervo", nome)
    }
  })

  it("coleta que não acha o nome (vazio_confirmado) manda o alvo a revisão humana", () => {
    const m = moro()
    const vazio = { ...m, classificacao: "vazio_confirmado", motivo: "nenhum processo atribuivel", ocorrencias_ambiguas: [], busca: { ...(m.busca as Record<string, unknown>), total_api: 0 } }
    const ev = evidencia([vazio])
    const r = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [reciboEditorial("senador-teste", [CNJ_EDITORIAL_B])])
    assert.deepEqual(r.planos, [])
    assert.equal(r.revisaoHumana[0].motivo, "coleta nova nao achou o nome no acervo")
  })

  it("decisor fora da lista e data irreal, futura ou posterior à revisão invalidam a confirmação", () => {
    const base = String(reciboEditorial("senador-teste", [CNJ_EDITORIAL_B]).detalhe)
    assert.equal(confirmacoesEditoriaisDoDetalhe(base, "2026-09-26")!.length, 1)
    assert.equal(confirmacoesEditoriaisDoDetalhe(base.replace("Thiago Salvador", "Outra Pessoa"), "2026-09-26"), null)
    assert.equal(confirmacoesEditoriaisDoDetalhe(base.replace("\"decidido_em\":\"2026-09-26\"", "\"decidido_em\":\"2026-02-30\""), "2026-09-26"), null)
    assert.equal(confirmacoesEditoriaisDoDetalhe(base, "2026-09-25"), null, "futura em relação a hoje")
    assert.equal(confirmacoesEditoriaisDoDetalhe(base.replace("\"decidido_em\":\"2026-09-26\"", "\"decidido_em\":\"2026-09-27\""), "2026-09-30"), null, "depois da revisão do recibo")
  })

  it("empate de executado_em fica com a última linha lida (id ascendente)", () => {
    const ev = evidencia([moro()])
    const comEditorial = reciboEditorial("senador-teste", [CNJ_EDITORIAL_B])
    const semEditorial = { alvo: "senador-teste", resultado: "indeterminado", detalhe: "revisao_em=2026-09-26; detalhe=motivo: revisado", executado_em: comEditorial.executado_em }
    const depoisSem = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [comEditorial, semEditorial])
    assert.equal(depoisSem.planos[0].resultado, "indeterminado")
    const depoisCom = preservarConfirmacaoEditorial(criarPlanos(ev), candidatosPorSlug(ev), [semEditorial, comEditorial])
    assert.equal(depoisCom.planos[0].resultado, "encontrado")
    assert.equal(filtrarMudancas(criarPlanos(ev), [comEditorial, semEditorial]).length, 0, "filtrarMudancas usa o mesmo desempate")
  })

  it("recibo de controle: um por alvo, fonte própria, sem documento pessoal", () => {
    const entradas = entradasRevisaoHumana([
      { slug: "a", numero_cnj: CNJ_EDITORIAL_A, motivo: "coleta nova traz documento divergente colado ao nome" },
      { slug: "a", numero_cnj: CNJ_PROVADO, motivo: "busca nova sem conclusao sobre o acervo" },
      { slug: "b", numero_cnj: CNJ_EDITORIAL_B, motivo: "coleta nova nao achou o nome no acervo" },
    ])
    assert.deepEqual(entradas.map((e) => [e.fonte, e.alvo, e.resultado, e.volume]), [
      ["processos-revisao-humana", "a", "indeterminado", 0],
      ["processos-revisao-humana", "b", "indeterminado", 0],
    ])
    for (const e of entradas) assert.doesNotMatch(String(e.detalhe), /\bcpf\b/i)
    assert.match(String(entradas[0].detalhe), new RegExp(CNJ_PROVADO.replace(/\./g, "\\.")))
  })
})

describe("revogação, fechamento da revisão e dry-run simples", () => {
  it("confirmacao_editorial: [] é revogação explícita: o alvo segue a coleta, sem revisão", () => {
    const base = String(reciboEditorial("senador-teste", [CNJ_EDITORIAL_B]).detalhe)
    const revogado = base.replace(/confirmacao_editorial: \[.*\]$/, "confirmacao_editorial: []")
    assert.deepEqual(confirmacoesEditoriaisDoDetalhe(revogado, "2026-09-26"), [])
    const ev = evidencia([moro()])
    const planos = criarPlanos(ev)
    const r = preservarConfirmacaoEditorial(planos, candidatosPorSlug(ev), [{ alvo: "senador-teste", resultado: "encontrado", detalhe: revogado, executado_em: "2026-09-26T19:00:00Z" }])
    assert.deepEqual(r.revisaoHumana, [])
    assert.deepEqual(r.planos, planos)
    assert.equal(r.planos[0].resultado, "indeterminado")
  })

  it("fechamento: recibo final nao_aplicavel com o CNJ decidido; valida decisor, data, CNJ e decisão", () => {
    const e = entradaFechamentoRevisaoHumana("senador-teste", [{ numero_cnj: CNJ_EDITORIAL_B, decisao: "mantido" }], "Thiago Salvador", "2026-09-26", "2026-09-26")
    assert.equal(e.fonte, "processos-revisao-humana")
    assert.equal(e.resultado, "nao_aplicavel")
    assert.equal(e.volume, 0)
    assert.match(String(e.detalhe), /revisao humana fechada; decidido_por: Thiago Salvador; decidido_em: 2026-09-26; itens: \[\{"numero_cnj":"0002338-27\.2022\.8\.16\.0204","decisao":"mantido"\}\]/)
    const ok = [{ numero_cnj: CNJ_EDITORIAL_B, decisao: "retirado" as const }]
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", ok, "Outra Pessoa", "2026-09-26", "2026-09-26"), /decisor/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", ok, "Thiago Salvador", "2026-09-27", "2026-09-26"), /futura/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", ok, "Thiago Salvador", "2026-02-30", "2026-09-26"), /invalida/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", [{ numero_cnj: "123", decisao: "mantido" }], "Thiago Salvador", "2026-09-26", "2026-09-26"), /CNJ invalido/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", [{ numero_cnj: CNJ_EDITORIAL_B, decisao: "talvez" as never }], "Thiago Salvador", "2026-09-26", "2026-09-26"), /decisao/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", [], "Thiago Salvador", "2026-09-26", "2026-09-26"), /ao menos uma/)
    assert.throws(() => entradaFechamentoRevisaoHumana("senador-teste", [...ok, ...ok], "Thiago Salvador", "2026-09-26", "2026-09-26"), /repetido/)
  })

  it("CLI de fechamento: dry-run por padrão, CNJ:decisão repetível, recusa flag desconhecida", () => {
    const f = lerFechamento(["--slug=senador-teste", `--cnj=${CNJ_EDITORIAL_B}:mantido`, `--cnj=${CNJ_EDITORIAL_A}:retirado`, "--decidido-por=Thiago Salvador", "--decidido-em=2026-09-26"])
    assert.equal(f.apply, false)
    assert.deepEqual(f.decisoes, [{ numero_cnj: CNJ_EDITORIAL_B, decisao: "mantido" }, { numero_cnj: CNJ_EDITORIAL_A, decisao: "retirado" }])
    assert.throws(() => lerFechamento(["--slug=a", "--force"]), /flag desconhecida/)
    assert.throws(() => lerFechamento(["--slug=a", "--apply", "--dry-run"]), /nunca os dois/)
  })

  it("dry-run simples da coorte atual avisa que não avalia a confirmação editorial", async () => {
    const dir = mkdtempSync(join(tmpdir(), "editorial-"))
    const arquivo = join(dir, "evidence.json")
    const bruto = {
      schema_version: 1, total_inicial: 1, candidatos_iniciais: ["senador-teste"],
      fontes: { modo: "dry-run-coorte-atual-renovacao", snapshot_sha256: "abc" },
      lotes: [{ numero: 1, concluido_em: "2026-09-26T20:05:00Z", slugs: ["senador-teste"], candidatos: [moro()] }],
      resumo: { classificados: 1, encontrado: 0, vazio_confirmado: 0, bloqueado: 1, erro: 0 },
    }
    writeFileSync(arquivo, JSON.stringify(bruto))
    const saidas: string[] = []
    const original = console.log
    console.log = (texto: unknown) => { saidas.push(String(texto)) }
    try {
      await aplicar([`--evidence=${arquivo}`, "--dry-run"])
    } finally {
      console.log = original
      rmSync(dir, { recursive: true, force: true })
    }
    assert.match(JSON.parse(saidas[0]).aviso, /confirmacao editorial nao avaliada neste modo/)
  })
})
