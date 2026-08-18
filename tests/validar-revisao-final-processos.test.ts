import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  gerarHtml,
  validarRevisaoFinal,
  type EvidenciaFinal,
  type ItemFinal,
} from "../scripts/validar-revisao-final-processos"
import { exigirItemFinal } from "../scripts/montar-revisao-final-processos"

const fonte = {
  url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=1",
  titulo: "Comunicação processual oficial",
  consultado_em: "2026-08-05T21:00:00.000Z",
}

function item(indice: number, decisao: string, origem_revisao: string): ItemFinal {
  return {
    numero_cnj: `${String(indice).padStart(7, "0")}-00.2026.8.00.0000`,
    slug: `candidato-${indice}`,
    decisao,
    motivo: "Decisão sustentada pela comunicação processual oficial.",
    familia_processual: "família de teste",
    fontes_oficiais: [fonte],
    bloqueio: decisao === "bloqueado_concreto" ? "Portal oficial exige captcha." : null,
    origem_revisao,
    identidade_confirmada: true,
    contexto_identidade: "Nome completo, CPF e cargo conferidos na comunicação oficial.",
    papel_processual: "Papel processual conferido na comunicação oficial.",
    estado_oficial: "Estado atual conferido na comunicação oficial.",
    observacoes: "Não extrapolar o conteúdo da decisão oficial.",
    categoria_descarte: decisao === "nao_publicar" ? "associacao_incorreta" : null,
  }
}

function cenario(): { evidencia: EvidenciaFinal; base: { itens: Array<{ numero_cnj: string; recomendacao: string }> } } {
  const pesquisas = Array.from({ length: 47 }, (_, indice) => item(indice + 1, "nao_publicar", "pesquisa_complementar"))
  const publicaveis = Array.from({ length: 6 }, (_, indice) => item(indice + 48, "publicar", "revalidacao_publicavel"))
  const pontos = Array.from({ length: 65 }, (_, indice) => item(indice + 54, "ponto_atencao", "ponto_atencao_agregado"))
  const descartes = Array.from({ length: 86 }, (_, indice) => item(indice + 119, "nao_publicar", "auditoria_adversarial_descarte"))
  const itens = [...pesquisas, ...publicaveis, ...pontos, ...descartes]
  const base = {
    itens: itens.map((atual, indice) => ({
      numero_cnj: atual.numero_cnj,
      slug: atual.slug,
      recomendacao: indice < 47 ? "pesquisar_mais" : indice < 53 ? "publicar" : indice < 118 ? "ponto_atencao" : "nao_publicar",
    })),
  }
  const grupos = Array.from({ length: 6 }, (_, indice) => ({
    id: `grupo-${indice + 1}`,
    titulo: `Grupo ${indice + 1}`,
    status: "aprovado" as const,
    texto: "Texto neutro, datado e limitado à fonte oficial.",
    cnjs: pontos.filter((_, pontoIndice) => pontoIndice % 6 === indice).map((atual) => atual.numero_cnj),
    fontes_oficiais: [fonte],
  }))
  const evidencia: EvidenciaFinal = {
    schema_version: 1,
    supabase_ref: "wskpzsobvqwhnbsdsmok",
    base_commit: "2906b187709c0ba949214992ef00fcb9cb7886df",
    gerado_em: "2026-08-05T21:00:00.000Z",
    inputs: { evidence: "a".repeat(64), review: "b".repeat(64) },
    lotes_pesquisa: [
      { numero: 1, itens: pesquisas.slice(0, 20) },
      { numero: 2, itens: pesquisas.slice(20, 40) },
      { numero: 3, itens: pesquisas.slice(40) },
    ],
    processos_revalidados: publicaveis.map((atual) => ({
      numero_cnj: atual.numero_cnj,
      decisao: "publicar",
      texto_publicavel: "O processo e o desfecho oficial são apresentados com o mesmo destaque.",
      fontes_oficiais: [fonte],
    })),
    pontos_atencao: grupos,
    descartes_revalidados: descartes,
    itens,
    resumo: { publicar: 6, ponto_atencao: 65, nao_publicar: 133, bloqueado_concreto: 0 },
    supabase_readback: {
      consultado_em: "2026-08-05T20:55:00.000Z",
      modo: "select_read_only",
      processos_total: 30,
      cnjs_204_ja_em_processos: 0,
      cnjs_sobrepostos: [],
      escritas_realizadas: false,
    },
    decisoes_thiago: [],
    chat7: {
      metricas_finais: "nao_liberado",
      deploy: "nao_liberado",
      motivo: "A classificação editorial ainda não foi aplicada no banco.",
      requisitos_pendentes: ["Aplicar somente após aprovação explícita."],
    },
  }
  return { evidencia, base }
}

describe("revisão final de processos", () => {
  it("falha com contexto quando um CNJ não existe na decisão final", () => {
    const mapa = new Map<string, ItemFinal>()
    assert.throws(
      () => exigirItemFinal(mapa, "0000000-00.2026.8.00.0000", "lote-2"),
      /ausente na decisao final \(lote-2\)/,
    )
  })

  it("reconcilia 204 CNJs e os lotes 20, 20 e 7", () => {
    const { evidencia, base } = cenario()
    assert.deepEqual(validarRevisaoFinal(evidencia, base), evidencia.resumo)
  })

  it("rejeita CNJ ausente na reconciliação", () => {
    const { evidencia, base } = cenario()
    evidencia.itens.pop()
    assert.throws(() => validarRevisaoFinal(evidencia, base), /esperados 204 itens/)
  })

  it("rejeita ponto de atenção fora dos grupos aprovados", () => {
    const { evidencia, base } = cenario()
    evidencia.pontos_atencao[0].cnjs.pop()
    assert.throws(() => validarRevisaoFinal(evidencia, base), /cobertura de CNJs divergente/)
  })

  it("rejeita bloqueio sem motivo concreto", () => {
    const { evidencia, base } = cenario()
    evidencia.itens[0].decisao = "bloqueado_concreto"
    evidencia.itens[0].bloqueio = null
    assert.throws(() => validarRevisaoFinal(evidencia, base), /bloqueio: texto obrigatorio/)
  })

  it("rejeita descarte sem categoria terminal", () => {
    const { evidencia, base } = cenario()
    const descarte = evidencia.itens.find((atual) => atual.decisao === "nao_publicar")!
    descarte.categoria_descarte = null
    assert.throws(() => validarRevisaoFinal(evidencia, base), /categoria terminal obrigatoria/)
  })

  it("rejeita readback que não seja somente leitura", () => {
    const { evidencia, base } = cenario()
    evidencia.supabase_readback.escritas_realizadas = true
    assert.throws(() => validarRevisaoFinal(evidencia, base), /escritas_realizadas: deve ser false/)
  })

  it("gera HTML claro com decisão recomendada e POST para Aplicar", () => {
    const { evidencia } = cenario()
    const html = gerarHtml(evidencia)
    assert.match(html, /meta name="color-scheme" content="light"/)
    assert.match(html, /value="aprovar" checked/)
    assert.match(html, /Recomendado/)
    assert.match(html, /fetch\('\/aplicar'/)
    assert.match(html, /textarea id="instructions"/)
    assert.match(html, /Pronto para publicação após aprovação/)
    assert.match(html, /Descartados com motivo/)
    assert.match(html, /Decisões que ainda dependem do Thiago/)
    assert.match(html, /Chat 7: não liberado/)
    assert.match(html, /Não autoriza migrations nem publicação/)
  })
})
