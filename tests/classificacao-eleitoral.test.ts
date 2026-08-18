import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  anoCobertoPeloCalendario,
  cargoCoerenteComOAno,
  ehAnoDeEleicao,
  tipoDePleitoDoCargo,
  tiposDePleitoDoAno,
} from "@/lib/calendario-eleitoral"
import { ehCargoNaoEletivo } from "@/lib/cargo-nao-eletivo"
import {
  ehVitoria,
  formatDesfechoEleitoralPublico,
  resolveResultadoEleitoral,
} from "@/lib/resultado-eleitoral"

/**
 * Regras de classificação eleitoral (itens 5, 10, 12, 13 e 15 da nota
 * "PF Ajustes"). Cada caso aqui é uma linha REAL da base, com a observação
 * copiada do banco, porque o defeito original passava justamente por parecer
 * razoável em exemplo inventado.
 */

function desfecho(item: { eleito_por?: string | null; observacoes?: string | null }): string | null {
  return formatDesfechoEleitoralPublico(resolveResultadoEleitoral(item))
}

describe("resultado eleitoral: campo estruturado é a autoridade", () => {
  it("le `eleito_por` antes de `observacoes`", () => {
    const r = resolveResultadoEleitoral({
      eleito_por: "voto direto",
      observacoes: "Mandato na 55a Legislatura; Camara Dados Abertos id 178938.",
    })
    assert.equal(r.resultado, "eleito")
    assert.equal(r.fonte, "eleito_por")
  })

  it("cai em `observacoes` só quando o estruturado está mudo", () => {
    // "cargo atual consolidado" existe em 35 linhas e não diz resultado nenhum.
    const r = resolveResultadoEleitoral({
      eleito_por: "cargo atual consolidado",
      observacoes: "ELEITO (TSE 2022)",
    })
    assert.equal(r.resultado, "eleito")
    assert.equal(r.fonte, "observacoes")
  })

  it("NÃO infere eleito a partir de mandato sem resultado com lastro", () => {
    const r = resolveResultadoEleitoral({
      eleito_por: null,
      observacoes: "Importado automaticamente de Wikidata P39 em 2026-08-05",
    })
    assert.equal(r.resultado, "desconhecido")
    assert.equal(desfecho(r as never), null, "sem lastro, a ficha não pode afirmar desfecho")
  })

  it("cala quando estruturado e raw se contradizem", () => {
    const r = resolveResultadoEleitoral({
      eleito_por: "voto direto",
      observacoes: "Candidatura: NÃO ELEITO (TSE 2016)",
    })
    assert.equal(r.resultado, "desconhecido")
    assert.equal(r.fonte, "conflito")
  })

  it("cala também quando o estruturado nega e a observação afirma vitória", () => {
    for (const eleitoPor of ["nao eleito", "suplente", "nomeacao"]) {
      const r = resolveResultadoEleitoral({
        eleito_por: eleitoPor,
        observacoes: "Candidatura: ELEITO (TSE 2022)",
      })
      assert.equal(r.resultado, "desconhecido")
      assert.equal(r.fonte, "conflito")
    }
  })
})

describe("resultado eleitoral: vitória não vira derrota", () => {
  it("item 5, Daciolo 2014: ELEITO POR QP não é Não Eleito", () => {
    assert.equal(desfecho({ eleito_por: "voto direto", observacoes: "ELEITO POR QP (TSE 2014)" }), "Eleito")
    assert.equal(desfecho({ eleito_por: null, observacoes: "ELEITO POR QP (TSE 2014)" }), "Eleito por quociente partidário")
  })

  it("eleito por média também é eleito", () => {
    assert.equal(desfecho({ eleito_por: null, observacoes: "ELEITO POR MÉDIA (TSE 2016)" }), "Eleito por média")
  })

  it("item 10, Flávio 2018: ELEITO no raw", () => {
    assert.equal(desfecho({ eleito_por: "voto direto", observacoes: "ELEITO (TSE 2018)" }), "Eleito")
  })

  it("`NÃO ELEITO` é testado antes de `ELEITO`, que é seu sufixo", () => {
    assert.equal(desfecho({ eleito_por: null, observacoes: "Candidatura: NÃO ELEITO (TSE 1994)" }), "Não Eleito")
    assert.equal(desfecho({ eleito_por: null, observacoes: "Candidatura: NAO ELEITO (TSE 1994)" }), "Não Eleito")
  })

  it("suplente não é derrota nem vitória", () => {
    assert.equal(desfecho({ eleito_por: null, observacoes: "Candidatura: SUPLENTE (TSE 2008)" }), "Suplente")
  })

  it("ehVitoria cobre as três formas de vencer", () => {
    assert.ok(ehVitoria("eleito") && ehVitoria("eleito_por_qp") && ehVitoria("eleito_por_media"))
    assert.ok(!ehVitoria("suplente") && !ehVitoria("nao_eleito") && !ehVitoria("desconhecido"))
  })
})

describe("situação do registro é eixo separado da totalização", () => {
  it("item 12, Lula 2018: registro indeferido, não derrota", () => {
    const item = {
      eleito_por: "nao eleito",
      observacoes:
        "Candidatura: registro INDEFERIDO pelo TSE (divulgacandcontas 2018, SQ_CANDIDATO 280000625869, nome de urna LULA, número 13). Não participou da votação.",
    }
    const r = resolveResultadoEleitoral(item)
    assert.equal(r.situacao, "indeferido")
    assert.equal(desfecho(item), "Registro indeferido")
  })

  it("Rui 2006: indeferido vence 'Não eleito' na mesma observação", () => {
    const item = {
      eleito_por: "nao eleito",
      observacoes:
        "candidatura: pleito à Presidência em 2006 (TSE); registro Indeferido pelo TSE (descricaoSituacao='Indeferido', descricaoTotalizacao='Não eleito').",
    }
    assert.equal(resolveResultadoEleitoral(item).situacao, "indeferido")
    assert.equal(desfecho(item), "Registro indeferido")
  })

  it("Cíntia 2012: indeferido sem `eleito_por`", () => {
    assert.equal(desfecho({ eleito_por: null, observacoes: "Candidatura: INDEFERIDO (TSE 2012). SQ 90000012450." }), "Registro indeferido")
  })

  it("situação INAPTO do TSE também não é derrota", () => {
    assert.equal(desfecho({ eleito_por: "inapto", observacoes: "TSE consulta_cand_2014: situacao INAPTO." }), "Registro inapto")
  })
})

describe("cargo obtido fora da urna não recebe desfecho eleitoral", () => {
  it("nomeação e sucessão não viram Eleito nem Não Eleito", () => {
    assert.equal(desfecho({ eleito_por: "nomeacao", observacoes: "Ministro" }), null)
    assert.equal(desfecho({ eleito_por: "sucessao constitucional", observacoes: "Assumiu apos renuncia" }), null)
  })

  it("presidência de casa legislativa é eleição interna, não pleito", () => {
    assert.equal(desfecho({ eleito_por: "eleição interna", observacoes: "Mesa diretora" }), null)
    assert.equal(desfecho({ eleito_por: "voto legislativo", observacoes: "Eleito presidente da Alerj em março de 2026." }), null)
  })
})

describe("item 13: direção de partido e de sindicato", () => {
  it("reconhece as linhas reais da base", () => {
    for (const cargo of [
      "Presidente Nacional do Partido Missão",
      "Presidente estadual do Partido Missão em Mato Grosso",
      "Presidente estadual do Missão Espírito Santo",
      "Presidente estadual do PT-AC",
      "Dirigente do Sindimed-SE",
    ]) {
      assert.ok(ehCargoNaoEletivo(cargo), `deveria marcar como não eletivo: ${cargo}`)
    }
  })

  it("não engole cargo obtido em urna", () => {
    for (const cargo of [
      "Presidente",
      "Presidente da República",
      "Prefeito",
      "Senador",
      "Deputado Federal",
      "Governador",
      "Ministro da Fazenda",
    ]) {
      assert.ok(!ehCargoNaoEletivo(cargo), `não deveria marcar: ${cargo}`)
    }
  })

  it("mesa diretora de casa legislativa também não vem de urna", () => {
    // Revisão de 10/08: "Presidente do Senado Federal" do Rodrigo Pacheco era
    // lido como pleito presidencial e conflitava com o mandato de senador dele.
    for (const cargo of [
      "Presidente do Senado Federal",
      "Presidente da Câmara dos Deputados",
      "Presidente da Assembleia Legislativa do Ceará",
      "Presidente da Alerj",
    ]) {
      assert.ok(ehCargoNaoEletivo(cargo), `deveria marcar como não eletivo: ${cargo}`)
    }
  })
})

describe("item 15: calendário eleitoral é dado, não aritmética", () => {
  it("1989 é eleição presidencial, mesmo sendo ano ímpar", () => {
    assert.ok(ehAnoDeEleicao(1989))
    assert.deepEqual([...tiposDePleitoDoAno(1989)], ["presidencial"])
  })

  it("2023 não teve eleição, e é a origem do defeito do Zema", () => {
    assert.ok(!ehAnoDeEleicao(2023))
    assert.deepEqual([...tiposDePleitoDoAno(2023)], [])
  })

  it("ano par sem eleição também é rejeitado", () => {
    assert.ok(!ehAnoDeEleicao(1980), "1980 não teve pleito; regra 'ano par' seria falsa")
  })

  it("1982 acumulou geral e municipal no mesmo ano", () => {
    const tipos = tiposDePleitoDoAno(1982)
    assert.ok(tipos.includes("federal_estadual") && tipos.includes("municipal"))
  })

  it("classifica o tipo de pleito pelo cargo", () => {
    assert.equal(tipoDePleitoDoCargo("Vereador"), "municipal")
    assert.equal(tipoDePleitoDoCargo("Prefeito"), "municipal")
    assert.equal(tipoDePleitoDoCargo("Senador"), "federal_estadual")
    assert.equal(tipoDePleitoDoCargo("Presidente da República"), "presidencial")
    assert.equal(tipoDePleitoDoCargo("Presidente Nacional do Partido Missão"), null)
    assert.equal(tipoDePleitoDoCargo("Dirigente do Sindimed-SE"), null)
  })

  it("cargo x ano: vereador não é eleito em ano de eleição geral", () => {
    assert.ok(cargoCoerenteComOAno("Vereador", 2020))
    assert.ok(!cargoCoerenteComOAno("Vereador", 2018))
    assert.ok(cargoCoerenteComOAno("Deputado Federal", 2018))
    assert.ok(!cargoCoerenteComOAno("Deputado Federal", 2003), "posse de 2003 não é pleito de 2003")
    assert.ok(
      !cargoCoerenteComOAno("Presidente Nacional do Partido Missão", 2022),
      "direção partidária não vira pleito presidencial em ano eleitoral",
    )
  })

  it("fora do intervalo coberto, o calendário não opina", () => {
    assert.ok(!anoCobertoPeloCalendario(1969))
    assert.ok(cargoCoerenteComOAno("Vereador", 1969), "sem cobertura, não se nega o pleito")
  })
})
