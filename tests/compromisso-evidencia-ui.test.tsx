import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ProgramaGovernoOverview, ProgramaGovernoPendente } from "../src/components/ProgramaGovernoSection"
import { programaGovernoPendencia } from "../src/lib/programa-governo-pendencia"
import {
  agruparEvidenciasPorTema,
  detalheReciboPromessa,
  estadoDasEvidencias,
  lerReciboPromessa,
  primeiraUrlDeFontes,
  teveMandatoNoCongresso,
  urlSeguraDeFonte,
  type CompromissoEvidenciaPublica,
  type EstadoEvidenciasPrograma,
} from "../src/lib/compromisso-evidencia"
import { toProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"
import { compromissoEvidenciaCopy, programaGovernoPendenteCopy } from "../src/lib/ui-labels"

const manifesto = (arquivo: string) =>
  toProgramaGovernoManifestoPublico(JSON.parse(readFileSync(`src/data/programas-governo/${arquivo}`, "utf8")))
const presidencial = manifesto("presidencia-2026/lula.json")
const governador = manifesto("governadores-2026/acm-neto.json")
const temaLula = presidencial.resumo!.temas[0]

const evidencia = (over: Partial<CompromissoEvidenciaPublica>): CompromissoEvidenciaPublica => ({
  id: "e1", temaId: temaLula.id, tipo: "projeto_lei", relacao: "relacionada",
  referencia: "PL 1/2020", texto: "Ementa da proposição.", data: "2020", url: "https://www.camara.leg.br/x", ...over,
})

const com = (itens: CompromissoEvidenciaPublica[]): EstadoEvidenciasPrograma => ({ estado: "com_vinculos", itens, processadoEm: null })

const render = (props: Partial<React.ComponentProps<typeof ProgramaGovernoOverview>> & { manifesto: typeof presidencial }) =>
  renderToStaticMarkup(<ProgramaGovernoOverview onOpenTab={() => {}} {...props} />)

describe("evidências relacionadas na seção do programa", () => {
  it("sem a prop, a seção não aparece e o resto do overview não muda", () => {
    const html = render({ manifesto: presidencial })
    assert.doesNotMatch(html, /data-pf-compromisso-evidencias=/u)
    assert.match(html, /data-pf-programa-approved/u)
  })

  it("cada estado sem vínculo tem texto e marcador próprios, nenhum diz 'revisada'", () => {
    const casos: Array<[EstadoEvidenciasPrograma, string]> = [
      [{ estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" }, compromissoEvidenciaCopy.estado.nenhum_par],
      [{ estado: "avaliados_nao_publicados", processadoEm: "2026-09-25T08:34:00Z", paresAvaliados: 270 }, compromissoEvidenciaCopy.estado.avaliados_nao_publicados(270)],
      [{ estado: "nao_processado" }, compromissoEvidenciaCopy.estado.nao_processado],
      [{ estado: "erro_leitura" }, compromissoEvidenciaCopy.estado.erro_leitura],
    ]
    const textos = new Set<string>()
    for (const [estado, texto] of casos) {
      const html = render({ manifesto: presidencial, evidencias: estado })
      assert.match(html, new RegExp(`data-pf-compromisso-evidencias-estado="${estado.estado}"`, "u"))
      assert.match(html, /data-pf-compromisso-evidencias-vazio/u)
      assert.ok(html.includes(texto), estado.estado)
      assert.ok(html.includes(compromissoEvidenciaCopy.aviso))
      assert.doesNotMatch(html, /revisad[ao] ligada|cumpriu|descumpriu/iu)
      textos.add(texto)
    }
    assert.equal(textos.size, casos.length, "estados distintos não podem compartilhar texto")
  })

  it("estado processado mostra a data da última comparação; não processado e erro não", () => {
    const processado = render({ manifesto: presidencial, evidencias: { estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" } })
    assert.ok(processado.includes(compromissoEvidenciaCopy.processadoEm("25/09/2026")))
    assert.doesNotMatch(render({ manifesto: presidencial, evidencias: { estado: "nao_processado" } }), /data-pf-compromisso-evidencias-processado/u)
    assert.doesNotMatch(render({ manifesto: presidencial, evidencias: { estado: "erro_leitura" } }), /data-pf-compromisso-evidencias-processado/u)
  })

  it("contagem de pares avaliados desconhecida usa texto sem número", () => {
    const html = render({ manifesto: presidencial, evidencias: { estado: "avaliados_nao_publicados", processadoEm: "2026-09-25T08:34:00Z", paresAvaliados: null } })
    assert.ok(html.includes(compromissoEvidenciaCopy.estado.avaliados_nao_publicados(null)))
    assert.equal(compromissoEvidenciaCopy.estado.avaliados_nao_publicados(1).includes("1 possível vínculo"), true)
  })

  it("programa sem documento oficial mostra o estado explícito junto do aviso do programa", () => {
    const semDocumento = toProgramaGovernoManifestoPublico(JSON.parse(readFileSync("src/data/programas-governo/governadores-2026/garotinho.json", "utf8")))
    const html = render({ manifesto: semDocumento, evidencias: { estado: "sem_documento_oficial" }, teveMandatoNoCongresso: false })
    assert.match(html, /data-pf-programa-state=/u)
    assert.match(html, /data-pf-compromisso-evidencias-estado="sem_documento_oficial"/u)
    assert.ok(html.includes(compromissoEvidenciaCopy.estado.sem_documento_oficial))
    assert.doesNotMatch(html, /data-pf-compromisso-evidencias-sem-congresso/u)
    assert.ok(!html.includes(compromissoEvidenciaCopy.aviso), "sem programa não há vínculo automático a explicar")
    assert.doesNotMatch(render({ manifesto: semDocumento }), /data-pf-compromisso-evidencias=/u)
  })

  it("agrupa por tema com contagem, rótulos fixos e link seguro para a fonte", () => {
    const html = render({
      manifesto: presidencial,
      evidencias: com([
        evidencia({ id: "a" }),
        evidencia({ id: "b", tipo: "fala", referencia: "Folha", texto: "Frase dita.", data: "2026-08-10", url: null }),
      ]),
    })
    assert.ok(html.includes(temaLula.titulo))
    assert.ok(html.includes(compromissoEvidenciaCopy.contagem(2)))
    assert.ok(html.includes(compromissoEvidenciaCopy.tipo.projeto_lei))
    assert.ok(html.includes(compromissoEvidenciaCopy.tipo.fala))
    assert.ok(html.includes(compromissoEvidenciaCopy.relacao.relacionada))
    assert.ok(html.includes("“Frase dita.”"), "fala aparece literal entre aspas")
    assert.match(html, /<a href="https:\/\/www\.camara\.leg\.br\/x" target="_blank" rel="noopener noreferrer"/u)
    assert.equal((html.match(/Ver fonte/gu) ?? []).length, 1, "item sem URL não ganha link")
    assert.match(html, /<details>/u, "lista recolhida, acessível por teclado")
  })

  it("evidência de tema que não existe no programa não aparece e o texto é neutro, não falha de leitura", () => {
    const html = render({ manifesto: presidencial, evidencias: com([evidencia({ temaId: "tema-inexistente" })]) })
    assert.match(html, /data-pf-compromisso-evidencias-vazio/u)
    assert.ok(html.includes(compromissoEvidenciaCopy.estado.fora_dos_temas))
    assert.ok(!html.includes(compromissoEvidenciaCopy.estado.erro_leitura))
    assert.doesNotMatch(html, /role="status"/u)
  })

  it("vínculo registrado sem fonte exibível tem texto próprio, não 'nenhum passou nos critérios'", () => {
    const html = render({ manifesto: presidencial, evidencias: { estado: "vinculos_sem_exibicao", processadoEm: "2026-09-25T08:34:00Z" } })
    assert.match(html, /data-pf-compromisso-evidencias-estado="vinculos_sem_exibicao"/u)
    assert.ok(html.includes(compromissoEvidenciaCopy.estado.vinculos_sem_exibicao))
    assert.doesNotMatch(html, /nenhum passou/iu)
  })

  it("ponto de atenção (tipo contradicao) recebe rótulo neutro, não a categoria editorial", () => {
    const html = render({
      manifesto: presidencial,
      evidencias: com([evidencia({ id: "c", tipo: "contradicao", referencia: "", texto: "Ponto de atenção registrado." })]),
    })
    assert.ok(html.includes(compromissoEvidenciaCopy.tipo.contradicao))
    assert.equal(compromissoEvidenciaCopy.tipo.contradicao, "Ponto de atenção")
    assert.doesNotMatch(html, /Contradição registrada/u, "rótulo não pode ler como veredito sobre o compromisso")
  })

  it("governador sem mandato no Congresso recebe a nota fixa; presidencial e governador com mandato não", () => {
    assert.match(render({ manifesto: governador, evidencias: { estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" }, teveMandatoNoCongresso: false }), /data-pf-compromisso-evidencias-sem-congresso/u)
    assert.doesNotMatch(render({ manifesto: governador, evidencias: { estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" }, teveMandatoNoCongresso: true }), /data-pf-compromisso-evidencias-sem-congresso/u)
    assert.doesNotMatch(render({ manifesto: presidencial, evidencias: { estado: "nenhum_par", processadoEm: "2026-09-25T08:34:00Z" }, teveMandatoNoCongresso: false }), /data-pf-compromisso-evidencias-sem-congresso/u)
  })
})

describe("funções puras do vínculo público", () => {
  it("ordena por data mais recente dentro do tema", () => {
    const grupos = agruparEvidenciasPorTema([evidencia({ id: "velho", data: "2010" }), evidencia({ id: "novo", data: "2024" })])
    assert.deepEqual(grupos.get(temaLula.id)?.map((e) => e.id), ["novo", "velho"])
  })

  it("mandato no Congresso vem do histórico, só deputado federal ou senador", () => {
    assert.equal(teveMandatoNoCongresso([{ tipo_evento: "mandato", cargo_canonico: "Senador" }]), true)
    assert.equal(teveMandatoNoCongresso([{ tipo_evento: "candidatura", cargo_canonico: "Senador" }]), false)
    assert.equal(teveMandatoNoCongresso([{ tipo_evento: "mandato", cargo_canonico: "Deputado Estadual" }]), false)
  })

  it("fonte do ponto de atenção aceita lista de strings (formato de produção) e de objetos", () => {
    assert.equal(primeiraUrlDeFontes(["javascript:x", "https://g1.globo.com/a"]), "https://g1.globo.com/a")
    assert.equal(primeiraUrlDeFontes([{ url: "https://g1.globo.com/b" }]), "https://g1.globo.com/b")
    assert.equal(primeiraUrlDeFontes(null), null)
  })

  it("só http e https viram link", () => {
    assert.equal(urlSeguraDeFonte("javascript:alert(1)"), null)
    assert.equal(urlSeguraDeFonte("não é url"), null)
    assert.equal(urlSeguraDeFonte("https://g1.globo.com/a"), "https://g1.globo.com/a")
  })
})

describe("estado da seção a partir da view e do recibo", () => {
  const chave = "2026:GOVERNADOR:AM:40000000001"
  const recibo = (resultado: string, programa = chave, pares = 270) =>
    lerReciboPromessa({ resultado, executado_em: "2026-09-25T08:34:00.000Z", detalhe: detalheReciboPromessa({ programaChave: programa, paresAvaliados: pares, publicados: 0, versao: "c2" }) })

  it("lê o recibo gravado pelo publicador, com programa e pares", () => {
    assert.deepEqual(recibo("sem_achado_no_escopo"), { resultado: "sem_achado_no_escopo", executadoEm: "2026-09-25T08:34:00.000Z", programaChave: chave, paresAvaliados: 270 })
    assert.equal(lerReciboPromessa({ resultado: "inventado", executado_em: "2026-09-25T08:34:00Z" }), null)
    assert.equal(lerReciboPromessa({ resultado: "vazio_confirmado", executado_em: "ontem" }), null)
    assert.equal(lerReciboPromessa(null), null)
    assert.equal(lerReciboPromessa({ resultado: "vazio_confirmado", executado_em: "2026-09-25T08:34:00Z", detalhe: "pares_avaliados=x" })?.paresAvaliados, null)
  })

  it("falha de leitura da view vira erro_leitura, nunca lista vazia", () => {
    assert.deepEqual(estadoDasEvidencias({ itens: null, recibo: recibo("vazio_confirmado"), reciboFalhou: false, programaChave: chave }), { estado: "erro_leitura" })
  })

  it("sem vínculo e com falha ao ler o recibo também é erro_leitura", () => {
    assert.deepEqual(estadoDasEvidencias({ itens: [], recibo: null, reciboFalhou: true, programaChave: chave }), { estado: "erro_leitura" })
  })

  it("vínculo publicado aparece mesmo se o recibo falhar", () => {
    const itens = [evidencia({})]
    assert.deepEqual(estadoDasEvidencias({ itens, recibo: null, reciboFalhou: true, programaChave: chave }), { estado: "com_vinculos", itens, processadoEm: null })
  })

  it("resultado do recibo decide entre nenhum par e avaliados não publicados", () => {
    assert.equal(estadoDasEvidencias({ itens: [], recibo: recibo("vazio_confirmado", chave, 0), reciboFalhou: false, programaChave: chave }).estado, "nenhum_par")
    assert.deepEqual(estadoDasEvidencias({ itens: [], recibo: recibo("sem_achado_no_escopo"), reciboFalhou: false, programaChave: chave }), { estado: "avaliados_nao_publicados", processadoEm: "2026-09-25T08:34:00.000Z", paresAvaliados: 270 })
  })

  it("sem recibo, recibo de outro programa ou recibo de erro é nao_processado", () => {
    assert.equal(estadoDasEvidencias({ itens: [], recibo: null, reciboFalhou: false, programaChave: chave }).estado, "nao_processado")
    assert.equal(estadoDasEvidencias({ itens: [], recibo: recibo("vazio_confirmado", "2026:GOVERNADOR:AM:1"), reciboFalhou: false, programaChave: chave }).estado, "nao_processado")
    assert.equal(estadoDasEvidencias({ itens: [], recibo: recibo("erro"), reciboFalhou: false, programaChave: chave }).estado, "nao_processado")
  })
})

describe("contrato da leitura no servidor", () => {
  const fonte = readFileSync("src/lib/compromisso-evidencia-server.ts", "utf8")
  it("lê só a view pública, nunca a tabela privada", () => {
    assert.match(fonte, /from\("compromisso_evidencia_publica"\)/u)
    assert.doesNotMatch(fonte, /from\("compromisso_evidencia"\)/u)
  })
  it("fixture só vale em desenvolvimento", () => {
    assert.equal((fonte.match(/process\.env\.NODE_ENV !== "development" \|\| !caminho\) return null/gu) ?? []).length, 2)
  })
  it("recibo vem da view de última coleta, filtrado pela fonte da promessa", () => {
    assert.match(fonte, /from\("coleta_log_ultima"\)/u)
    assert.match(fonte, /\.eq\("fonte", FONTE_RECIBO_PROMESSA\)/u)
    assert.doesNotMatch(fonte, /catch \{\s*return \[\]/u, "erro de leitura não pode virar lista vazia")
  })
  it("posição só aparece com texto de curadoria", () => {
    assert.match(fonte, /gerado_por !== "curadoria"\) continue/u)
  })
})

describe("ficha de Executivo sem registro de programa", () => {
  it("só Presidente e Governador sem registro recebem pendência; duplicidade tem motivo próprio", () => {
    assert.deepEqual(programaGovernoPendencia({ slug: "ruth-reis", cargoDisputado: "Governador", semRegistro: true }), { motivo: "nao_coletado" })
    assert.deepEqual(programaGovernoPendencia({ slug: "leonardo-avalanche", cargoDisputado: "Presidente", semRegistro: true }), { motivo: "nao_coletado" })
    assert.deepEqual(programaGovernoPendencia({ slug: "laudicerio-aguiar", cargoDisputado: "Governador", semRegistro: true }), {
      motivo: "registro_duplicado_tse",
      fonteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_MT.zip",
      consultadoEm: "2026-08-29",
    })
    assert.equal(programaGovernoPendencia({ slug: "x", cargoDisputado: "Senador", semRegistro: true }), null)
    assert.equal(programaGovernoPendencia({ slug: "ruth-reis", cargoDisputado: "Governador", semRegistro: false }), null)
  })

  it("o cartão pendente mostra o motivo sem afirmar ausência no TSE", () => {
    const naoColetado = renderToStaticMarkup(<ProgramaGovernoPendente pendencia={{ motivo: "nao_coletado" }} />)
    assert.match(naoColetado, /data-pf-programa-pendente="nao_coletado"/u)
    assert.ok(naoColetado.includes(programaGovernoPendenteCopy.nao_coletado.title))
    assert.doesNotMatch(naoColetado, /não tem programa|não registrou|href=/iu)
  })

  it("duplicidade cita a fonte pública do TSE e a data da consulta", () => {
    const pendencia = programaGovernoPendencia({ slug: "laudicerio-aguiar", cargoDisputado: "Governador", semRegistro: true })!
    const html = renderToStaticMarkup(<ProgramaGovernoPendente pendencia={pendencia} />)
    assert.match(html, /data-pf-programa-pendente="registro_duplicado_tse"/u)
    assert.ok(html.includes("consultado em 29 de agosto de 2026"))
    assert.match(html, /href="https:\/\/cdn\.tse\.jus\.br\/estatistica\/sead\/odsele\/proposta_governo\/proposta_governo_2026_MT\.zip"/u)
    assert.doesNotMatch(html, /ativos/iu, "não afirma estado do registro além do que o pacote mostra")
  })
})
