import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "fs"
import { renderToStaticMarkup } from "react-dom/server"

import { SancoesSection } from "../src/components/SancoesSection"
import { resolverEstadoSancoes } from "../src/lib/sancoes-verificacao"
import { METHODOLOGY_SOURCES } from "../src/data/methodology-sources"
import type { SancaoAdministrativa, SancoesVerificacao } from "../src/lib/types"

const VERIFICACAO_VAZIA: SancoesVerificacao = {
  resultado: "vazio_confirmado",
  executado_em: "2026-08-04T23:50:00.000Z",
}

function buildSancao(overrides: Partial<SancaoAdministrativa> = {}): SancaoAdministrativa {
  return {
    id: "sancao-1",
    candidato_id: "cand-1",
    tipo: "CEIS",
    descricao: "Impedimento de licitar com a administração federal",
    orgao_sancionador: "Controladoria-Geral da União",
    data_inicio: "2024-02-01",
    data_fim: null,
    fundamentacao: "Lei 8.666/1993, art. 87",
    vinculo: "direto",
    cnpj_empresa: null,
    ...overrides,
  }
}

describe("resolverEstadoSancoes: zero provado nunca tem a mesma cara do zero presumido", () => {
  it("vazio_confirmado com data vira vazio-confirmado", () => {
    assert.equal(resolverEstadoSancoes(0, VERIFICACAO_VAZIA), "vazio-confirmado")
  })

  it("sem registro de coleta vira nao-verificado", () => {
    assert.equal(resolverEstadoSancoes(0, null), "nao-verificado")
    assert.equal(resolverEstadoSancoes(0, undefined), "nao-verificado")
  })

  it("erro e indeterminado NUNCA autorizam selo de verificado", () => {
    assert.equal(
      resolverEstadoSancoes(0, { resultado: "erro", executado_em: "2026-08-04T23:50:00.000Z" }),
      "nao-verificado"
    )
    assert.equal(
      resolverEstadoSancoes(0, {
        resultado: "indeterminado",
        executado_em: "2026-08-04T23:50:00.000Z",
      }),
      "nao-verificado"
    )
  })

  it("encontrado com tabela vazia é inconsistência e degrada para nao-verificado", () => {
    assert.equal(
      resolverEstadoSancoes(0, { resultado: "encontrado", executado_em: "2026-08-04T23:50:00.000Z" }),
      "nao-verificado"
    )
  })

  it("vazio_confirmado sem data não vira selo", () => {
    assert.equal(
      resolverEstadoSancoes(0, { resultado: "vazio_confirmado", executado_em: "" }),
      "nao-verificado"
    )
  })

  it("sanção gravada vence qualquer verificação", () => {
    assert.equal(resolverEstadoSancoes(2, VERIFICACAO_VAZIA), "com-registros")
    assert.equal(resolverEstadoSancoes(1, null), "com-registros")
  })
})

describe("SancoesSection: as duas caras do zero renderizadas", () => {
  it("zero provado: afirma nada encontrado com a data da verificação", () => {
    const html = renderToStaticMarkup(
      <SancoesSection sancoes={[]} verificacao={VERIFICACAO_VAZIA} />
    )
    assert.match(html, /data-pf-sancoes-estado="vazio-confirmado"/)
    assert.match(html, /Nada encontrado nos cadastros CEIS, CNEP e CEAF \(verificado em \d{2}\/\d{2}\/\d{4}\)/)
    assert.match(html, /data-pf-sancoes-verificado-em="2026-08-04T23:50:00\.000Z"/)
    // A data exibida vem de formatDate no fuso público, DD/MM/AAAA.
    assert.match(html, /verificado em 04\/08\/2026/)
  })

  it("zero presumido: estado neutro, sem nenhuma afirmação de limpeza", () => {
    const html = renderToStaticMarkup(<SancoesSection sancoes={[]} verificacao={null} />)
    assert.match(html, /data-pf-sancoes-estado="nao-verificado"/)
    assert.match(html, /ainda não foram consultados com sucesso/)
    assert.match(html, /não significa ficha limpa/)
    assert.doesNotMatch(html, /Nada encontrado/)
    assert.doesNotMatch(html, /verificado em \d{2}\/\d{2}\/\d{4}/)
  })

  it("erro na coleta rende a mesma cara neutra do nunca verificado", () => {
    const html = renderToStaticMarkup(
      <SancoesSection
        sancoes={[]}
        verificacao={{ resultado: "erro", executado_em: "2026-08-04T23:50:00.000Z" }}
      />
    )
    assert.match(html, /data-pf-sancoes-estado="nao-verificado"/)
    assert.doesNotMatch(html, /Nada encontrado/)
  })

  it("com sanção gravada: lista o registro com cadastro, órgão e data", () => {
    const html = renderToStaticMarkup(
      <SancoesSection sancoes={[buildSancao()]} verificacao={null} />
    )
    assert.match(html, /data-pf-sancoes-estado="com-registros"/)
    assert.match(html, /CEIS \(Cadastro de Empresas Inidôneas e Suspensas\)/)
    assert.match(html, /Controladoria-Geral da União/)
    assert.match(html, /Desde 01\/02\/2024/)
    assert.doesNotMatch(html, /Nada encontrado/)
  })

  it("só data_fim: o card mostra o fim, em vez de engolir a única data que existe", () => {
    // O contrato de SancaoAdministrativa deixa data_inicio e data_fim
    // independentes. Sanção importada só com o término não pode aparecer sem
    // data nenhuma.
    const html = renderToStaticMarkup(
      <SancoesSection
        sancoes={[buildSancao({ data_inicio: null, data_fim: "2025-06-30" })]}
        verificacao={null}
      />
    )
    assert.match(html, /Até 30\/06\/2025/)
    assert.doesNotMatch(html, /Desde/)
  })

  it("as duas datas juntas continuam no formato Desde ... até ...", () => {
    const html = renderToStaticMarkup(
      <SancoesSection
        sancoes={[buildSancao({ data_inicio: "2024-02-01", data_fim: "2025-06-30" })]}
        verificacao={null}
      />
    )
    assert.match(html, /Desde 01\/02\/2024/)
    assert.match(html, /até 30\/06\/2025/)
  })

  it("sanção sem data nenhuma não inventa rótulo de período", () => {
    const html = renderToStaticMarkup(
      <SancoesSection
        sancoes={[buildSancao({ data_inicio: null, data_fim: null })]}
        verificacao={null}
      />
    )
    assert.doesNotMatch(html, /Desde/)
    assert.doesNotMatch(html, /Até/)
  })

  it("rótulo de fonte sempre presente, nas três caras", () => {
    for (const props of [
      { sancoes: [], verificacao: VERIFICACAO_VAZIA },
      { sancoes: [], verificacao: null },
      { sancoes: [buildSancao()], verificacao: null },
    ]) {
      const html = renderToStaticMarkup(
        <SancoesSection sancoes={props.sancoes} verificacao={props.verificacao} />
      )
      assert.match(html, /Fonte: Portal da Transparência \(CGU\), cadastros CEIS, CNEP e CEAF\./)
    }
  })
})

describe("Card de metodologia do Cadastro de Sanções", () => {
  it("a fonte transparencia-sancoes voltou para METHODOLOGY_SOURCES", () => {
    const card = METHODOLOGY_SOURCES.find((s) => s.id === "transparencia-sancoes")
    assert.ok(card, "deve existir card transparencia-sancoes")
    assert.equal(card.name, "Cadastro de Sanções (CGU)")
    // Cadência real verificada em 2026-08-05: workflow_dispatch, sem cron.
    assert.equal(card.updateFrequency, "sob demanda")
    assert.ok(
      card.dataTypes.some((t) => t.includes("CEIS")),
      "dataTypes deve citar os cadastros"
    )
    // CEPIM saiu do pipeline na PR #85: o card não pode prometê-lo.
    assert.ok(
      !card.dataTypes.some((t) => t.includes("CEPIM")) && !card.description.includes("CEPIM"),
      "card não deve prometer CEPIM"
    )
  })

  it("a ficha lê a proveniência em coleta_log_ultima via service role", () => {
    const api = readFileSync("src/lib/api.ts", "utf-8")
    assert.match(api, /from\("coleta_log_ultima"\)/)
    assert.match(api, /"transparencia-sanctions"/)
    const dto = readFileSync("src/lib/public-profile-dto.ts", "utf-8")
    assert.match(dto, /sancoes_verificacao/)
  })
})
