import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ProgramaGovernoOverview } from "../src/components/ProgramaGovernoSection"
import {
  agruparEvidenciasPorTema,
  teveMandatoNoCongresso,
  urlSeguraDeFonte,
  type CompromissoEvidenciaPublica,
} from "../src/lib/compromisso-evidencia"
import { toProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"
import { compromissoEvidenciaCopy } from "../src/lib/ui-labels"

const manifesto = (arquivo: string) =>
  toProgramaGovernoManifestoPublico(JSON.parse(readFileSync(`src/data/programas-governo/${arquivo}`, "utf8")))
const presidencial = manifesto("presidencia-2026/lula.json")
const governador = manifesto("governadores-2026/acm-neto.json")
const temaLula = presidencial.resumo!.temas[0]

const evidencia = (over: Partial<CompromissoEvidenciaPublica>): CompromissoEvidenciaPublica => ({
  id: "e1", temaId: temaLula.id, tipo: "projeto_lei", relacao: "relacionada",
  referencia: "PL 1/2020", texto: "Ementa da proposição.", data: "2020", url: "https://www.camara.leg.br/x", ...over,
})

const render = (props: Partial<React.ComponentProps<typeof ProgramaGovernoOverview>> & { manifesto: typeof presidencial }) =>
  renderToStaticMarkup(<ProgramaGovernoOverview onOpenTab={() => {}} {...props} />)

describe("evidências relacionadas na seção do programa", () => {
  it("sem a prop, a seção não aparece e o resto do overview não muda", () => {
    const html = render({ manifesto: presidencial })
    assert.doesNotMatch(html, /data-pf-compromisso-evidencias=/u)
    assert.match(html, /data-pf-programa-approved/u)
  })

  it("lista vazia mostra o estado vazio explícito e o aviso fixo", () => {
    const html = render({ manifesto: presidencial, evidencias: [] })
    assert.match(html, /data-pf-compromisso-evidencias-vazio/u)
    assert.ok(html.includes(compromissoEvidenciaCopy.vazio))
    assert.ok(html.includes(compromissoEvidenciaCopy.aviso))
    assert.doesNotMatch(html, /cumpriu|descumpriu/iu)
  })

  it("agrupa por tema com contagem, rótulos fixos e link seguro para a fonte", () => {
    const html = render({
      manifesto: presidencial,
      evidencias: [
        evidencia({ id: "a" }),
        evidencia({ id: "b", tipo: "fala", referencia: "Folha", texto: "Frase dita.", data: "2026-08-10", url: null }),
      ],
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

  it("evidência de tema que não existe no programa não aparece", () => {
    const html = render({ manifesto: presidencial, evidencias: [evidencia({ temaId: "tema-inexistente" })] })
    assert.match(html, /data-pf-compromisso-evidencias-vazio/u)
  })

  it("ponto de atenção (tipo contradicao) recebe rótulo neutro, não a categoria editorial", () => {
    const html = render({
      manifesto: presidencial,
      evidencias: [evidencia({ id: "c", tipo: "contradicao", referencia: "", texto: "Ponto de atenção registrado." })],
    })
    assert.ok(html.includes(compromissoEvidenciaCopy.tipo.contradicao))
    assert.equal(compromissoEvidenciaCopy.tipo.contradicao, "Ponto de atenção")
    assert.doesNotMatch(html, /Contradição registrada/u, "rótulo não pode ler como veredito sobre o compromisso")
  })

  it("governador sem mandato no Congresso recebe a nota fixa; presidencial e governador com mandato não", () => {
    assert.match(render({ manifesto: governador, evidencias: [], teveMandatoNoCongresso: false }), /data-pf-compromisso-evidencias-sem-congresso/u)
    assert.doesNotMatch(render({ manifesto: governador, evidencias: [], teveMandatoNoCongresso: true }), /data-pf-compromisso-evidencias-sem-congresso/u)
    assert.doesNotMatch(render({ manifesto: presidencial, evidencias: [], teveMandatoNoCongresso: false }), /data-pf-compromisso-evidencias-sem-congresso/u)
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

  it("só http e https viram link", () => {
    assert.equal(urlSeguraDeFonte("javascript:alert(1)"), null)
    assert.equal(urlSeguraDeFonte("não é url"), null)
    assert.equal(urlSeguraDeFonte("https://g1.globo.com/a"), "https://g1.globo.com/a")
  })
})

describe("contrato da leitura no servidor", () => {
  const fonte = readFileSync("src/lib/compromisso-evidencia-server.ts", "utf8")
  it("lê só a view pública, nunca a tabela privada", () => {
    assert.match(fonte, /from\("compromisso_evidencia_publica"\)/u)
    assert.doesNotMatch(fonte, /from\("compromisso_evidencia"\)/u)
  })
  it("fixture só vale em desenvolvimento", () => {
    assert.match(fonte, /process\.env\.NODE_ENV !== "development" \|\| !caminho\) return null/u)
  })
  it("posição só aparece com texto de curadoria", () => {
    assert.match(fonte, /gerado_por !== "curadoria"\) continue/u)
  })
})
