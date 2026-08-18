import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CARD_SIZES,
  extractCardData,
  buildSocialCardJsx,
  type CardFormat,
} from "../src/lib/social-card"
import type { FichaCandidato } from "../src/lib/types"

// ── Helpers ─────────────────────────────────────────────────

function makeFicha(overrides: Partial<FichaCandidato> = {}): FichaCandidato {
  return {
    id: "test-id",
    slug: "maria-silva",
    nome_urna: "MARIA SILVA",
    nome_completo: "Maria da Silva Santos",
    partido_sigla: "PSD",
    cargo_disputado: "Deputada Federal",
    estado: "SP",
    foto_url: "https://example.com/photo.jpg",
    patrimonio: [
      { ano_eleicao: 2022, valor_total: 1_500_000 },
      { ano_eleicao: 2018, valor_total: 800_000 },
    ],
    processos: [{ id: "p1" }],
    total_processos: 3,
    processos_criminais: 1,
    total_mudancas_partido: 2,
    votos: [
      { voto: "sim", votacao: { titulo: "PEC do Teto de Gastos" } },
      { voto: "não", votacao: { titulo: "Reforma Tributária" } },
      { voto: "sim", votacao: { titulo: "Marco Legal das Startups" } },
      { voto: "abstenção", votacao: { titulo: "Fundeb Permanente" } },
    ],
    pontos_atencao: [
      {
        id: "pa1",
        candidato_id: "test-id",
        categoria: "processo_grave",
        titulo: "Condenacao relevante",
        descricao: "Desc",
        fontes: [],
        gravidade: "critica",
        verificado: true,
        gerado_por: "curadoria",
      },
    ],
    ...overrides,
  } as unknown as FichaCandidato
}

// ── CARD_SIZES ──────────────────────────────────────────────

describe("CARD_SIZES", () => {
  test("feed is 1080×1080", () => {
    assert.deepStrictEqual(CARD_SIZES.feed, { width: 1080, height: 1080 })
  })

  test("story is 1080×1920", () => {
    assert.deepStrictEqual(CARD_SIZES.story, { width: 1080, height: 1920 })
  })
})

// ── extractCardData ─────────────────────────────────────────

describe("extractCardData", () => {
  test("extracts basic candidate info", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.nome, "MARIA SILVA")
    assert.equal(data.partido, "PSD")
    assert.equal(data.cargo, "Deputada Federal")
    assert.equal(data.estado, "SP")
    assert.equal(data.slug, "maria-silva")
  })

  test("picks latest patrimonio year", () => {
    const data = extractCardData(makeFicha(), null)
    assert.match(data.patrimonio, /1,5[\s\u00a0]mi/)
    assert.equal(data.patrimonioAno, "2022")
  })

  test("handles empty patrimonio", () => {
    const data = extractCardData(makeFicha({ patrimonio: [] }), null)
    assert.equal(data.patrimonio, "N/D")
    assert.equal(data.patrimonioAno, null)
  })

  test("handles null patrimonio", () => {
    const data = extractCardData(makeFicha({ patrimonio: null as unknown as undefined }), null)
    assert.equal(data.patrimonio, "N/D")
    assert.equal(data.patrimonioAno, null)
  })

  test("counts processos and criminal processos", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.processos, 3)
    assert.equal(data.processosCriminais, 1)
  })

  test("handles zero processos", () => {
    const data = extractCardData(
      makeFicha({ total_processos: 0, processos_criminais: 0, processos: [] }),
      null,
    )
    assert.equal(data.processos, 0)
    assert.equal(data.processosCriminais, 0)
  })

  test("counts trocas de partido", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.trocasPartido, 2)
  })

  test("counts votações from votos array", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.votacoes, 4)
  })

  test("slices top 3 votos with titulo and voto", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.topVotos.length, 3)
    assert.equal(data.topVotos[0].titulo, "PEC do Teto de Gastos")
    assert.equal(data.topVotos[0].voto, "sim")
    assert.equal(data.topVotos[2].titulo, "Marco Legal das Startups")
  })

  test("handles empty votos", () => {
    const data = extractCardData(makeFicha({ votos: [] }), null)
    assert.equal(data.votacoes, 0)
    assert.deepStrictEqual(data.topVotos, [])
  })

  test("counts all destaques from pontos_atencao", () => {
    const data = extractCardData(makeFicha({
      pontos_atencao: [
        ...makeFicha().pontos_atencao!,
        {
          id: "pa2",
          candidato_id: "test-id",
          categoria: "feito_positivo",
          titulo: "Atuação relevante",
          descricao: "Desc",
          fontes: [],
          gravidade: "baixa",
          verificado: true,
          gerado_por: "curadoria",
        },
      ],
    }), null)
    assert.equal(data.destaques, 2)
    assert.equal(data.alertasGraves, 1)
  })

  test("sanitizes public attention highlights before rendering", () => {
    const data = extractCardData(makeFicha(), null)
    assert.deepStrictEqual(data.attentionHighlights, ["Condenação relevante"])
  })

  test("handles empty pontos_atencao", () => {
    const data = extractCardData(makeFicha({ pontos_atencao: [] }), null)
    assert.equal(data.destaques, 0)
    assert.equal(data.alertasGraves, 0)
  })

  test("preserves photo data URI when provided", () => {
    const uri = "data:image/jpeg;base64,abc123"
    const data = extractCardData(makeFicha(), uri)
    assert.equal(data.photoDataUri, uri)
  })

  test("photoDataUri is null when not provided", () => {
    const data = extractCardData(makeFicha(), null)
    assert.equal(data.photoDataUri, null)
  })
})

// ── buildSocialCardJsx ──────────────────────────────────────

describe("buildSocialCardJsx", () => {
  const minimalData = extractCardData(
    makeFicha({ patrimonio: [], processos: [], votos: [], pontos_atencao: [] }),
    null,
  )

  test("returns a JSX element for feed format", () => {
    const jsx = buildSocialCardJsx(minimalData, "feed")
    assert.ok(jsx, "Expected JSX element to be truthy")
    assert.equal(typeof jsx, "object")
    assert.ok("props" in (jsx as unknown as Record<string, unknown>), "Expected JSX to have props")
  })

  test("returns a JSX element for story format", () => {
    const jsx = buildSocialCardJsx(minimalData, "story")
    assert.ok(jsx, "Expected JSX element to be truthy")
  })

  test("does not throw with full data", () => {
    const fullData = extractCardData(makeFicha(), "data:image/jpeg;base64,abc")
    assert.doesNotThrow(() => buildSocialCardJsx(fullData, "feed"))
    assert.doesNotThrow(() => buildSocialCardJsx(fullData, "story"))
  })

  test("does not throw with null photo (initials fallback)", () => {
    const data = extractCardData(makeFicha({ foto_url: null }), null)
    assert.doesNotThrow(() => buildSocialCardJsx(data, "feed"))
    assert.doesNotThrow(() => buildSocialCardJsx(data, "story"))
  })

  test("renders normalized PT-BR copy in feed and story cards", () => {
    const feedHtml = renderToStaticMarkup(buildSocialCardJsx(minimalData, "feed"))
    const storyHtml = renderToStaticMarkup(buildSocialCardJsx(minimalData, "story"))

    assert.match(feedHtml, /Visão geral da ficha pública/)
    assert.match(feedHtml, /Votações Chave/)
    assert.match(feedHtml, /Sem votos públicos/)
    assert.doesNotMatch(feedHtml, /Visao geral da ficha publica/)
    assert.doesNotMatch(feedHtml, /Votações-chave/)

    assert.match(storyHtml, /Visão geral da ficha pública/)
    assert.match(storyHtml, /Mesmo recorte público exibido na ficha do Puxa Ficha/)
    assert.doesNotMatch(storyHtml, /Mesmo recorte publico exibido na ficha do Puxa Ficha/)
  })

  for (const fmt of ["feed", "story"] as CardFormat[]) {
    test(`${fmt}: root element uses correct dimensions`, () => {
      const jsx = buildSocialCardJsx(minimalData, fmt) as { props: { style: Record<string, unknown> } }
      assert.equal(jsx.props.style.width, "100%")
      assert.equal(jsx.props.style.height, "100%")
    })

    test(`${fmt}: root element uses editorial light surface`, () => {
      const jsx = buildSocialCardJsx(minimalData, fmt) as { props: { style: Record<string, unknown> } }
      assert.equal(jsx.props.style.background, "#ffffff")
      assert.equal(jsx.props.style.color, "#0a0a0a")
    })
  }
})
