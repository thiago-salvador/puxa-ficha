import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CARD_SIZES,
  extractCardData,
  buildSocialCardJsx,
  cardSourceLabelFromUrl,
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

// ── cardSourceLabelFromUrl ──────────────────────────────────

describe("cardSourceLabelFromUrl", () => {
  const cases: Array<[string | null, string | null]> = [
    ["https://www.tcm.ba.gov.br/tcm-aprova/", "TCM-BA"],
    ["https://tce.sp.gov.br/x", "TCE-SP"],
    ["https://cdn.tse.jus.br/estatistica/x.zip", "TSE"],
    ["https://www.camara.leg.br/votacao/1", "Câmara"],
    ["https://comunicaapi.pje.jus.br/api/v1", "CNJ"],
    ["https://www.tjsp.jus.br/x", "TJSP"],
    ["https://www.tre-ba.jus.br/x", "TRE-BA"],
    ["https://g1.globo.com/politica/x", "g1.globo.com"],
    ["nao-e-url", null],
    [null, null],
  ]
  for (const [url, expected] of cases) {
    test(`${url} → ${expected}`, () => {
      assert.equal(cardSourceLabelFromUrl(url), expected)
    })
  }
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
    const fullData = extractCardData(makeFicha(), null)
    const feedHtml = renderToStaticMarkup(buildSocialCardJsx(fullData, "feed"))
    const storyHtml = renderToStaticMarkup(buildSocialCardJsx(fullData, "story"))

    assert.match(feedHtml, /Votações Chave/)
    assert.doesNotMatch(feedHtml, /Votações-chave/)
    for (const html of [feedHtml, storyHtml]) {
      assert.match(html, /Confira os dados na fonte original antes de publicar\./)
      assert.match(html, /Condenação relevante/)
    }
  })

  test("never prints internal design-spec copy", () => {
    for (const data of [minimalData, extractCardData(makeFicha(), null)]) {
      for (const fmt of ["feed", "story"] as CardFormat[]) {
        const html = renderToStaticMarkup(buildSocialCardJsx(data, fmt))
        assert.doesNotMatch(html, /repertório visual/)
        assert.doesNotMatch(html, /Mesmo tom editorial/)
        assert.doesNotMatch(html, /Mesmo recorte público/)
        assert.doesNotMatch(html, /Visão geral da ficha pública/)
        assert.doesNotMatch(html, /Em expansão/)
      }
    }
  })
  for (const fmt of ["feed", "story"] as CardFormat[]) {
    test(`${fmt}: missing party switches and key votes are hidden, never shown as zero`, () => {
      const data = extractCardData(
        makeFicha({ total_mudancas_partido: 0, mudancas_partido: [], votos: [] }),
        null,
      )
      const html = renderToStaticMarkup(buildSocialCardJsx(data, fmt))
      assert.doesNotMatch(html, /Trocas de partido/)
      assert.doesNotMatch(html, /Votações Chave/)
      assert.doesNotMatch(html, /Sem votos/)
    })

    test(`${fmt}: positive party switches and key votes are shown`, () => {
      const html = renderToStaticMarkup(buildSocialCardJsx(extractCardData(makeFicha(), null), fmt))
      assert.match(html, /Trocas de partido/)
      assert.match(html, /Votações Chave/)
    })

    test(`${fmt}: process count carries the "not a conviction" caveat`, () => {
      const html = renderToStaticMarkup(buildSocialCardJsx(extractCardData(makeFicha(), null), fmt))
      assert.match(html, /Processo não é condenação/)
      assert.match(html, /Confira os dados na fonte original antes de publicar\./)
    })

    test(`${fmt}: unverified zero processes render the neutral state, not 0`, () => {
      const data = extractCardData(
        makeFicha({ total_processos: 0, processos_criminais: 0, processos: [], processos_verificacao: null }),
        null,
      )
      assert.equal(data.processosResumo.valor, "—")
      assert.equal(data.processosResumo.comContagem, false)
      const html = renderToStaticMarkup(buildSocialCardJsx(data, fmt))
      assert.match(html, /não verificado/)
      assert.doesNotMatch(html, /Processo não é condenação/)
    })

    test(`${fmt}: prints the update date and the sources of the blocks shown`, () => {
      const data = extractCardData(
        makeFicha({
          ultima_atualizacao: "2026-09-27T01:47:59.908+00:00",
          processos: [{ id: "p1", tribunal: "TJBA" }],
          pontos_atencao: [
            {
              ...makeFicha().pontos_atencao[0],
              fontes: [{ titulo: "TCM aprova contas", url: "https://www.tcm.ba.gov.br/tcm-aprova/", data: "2014-01-01" }],
            },
          ],
        } as unknown as Partial<FichaCandidato>),
        null,
      )
      const html = renderToStaticMarkup(buildSocialCardJsx(data, fmt))
      assert.match(html, /Dados atualizados em 26\/09\/2026/)
      assert.match(html, /Fontes: TSE · TJBA · TCM-BA/)
    })

    test(`${fmt}: missing update date is stated, not invented`, () => {
      const data = extractCardData(makeFicha({ ultima_atualizacao: undefined } as unknown as Partial<FichaCandidato>), null)
      const html = renderToStaticMarkup(buildSocialCardJsx(data, fmt))
      assert.match(html, /Data de atualização indisponível/)
    })
  }

  test("story type is phone-legible: no text under 22px and a larger name than feed", () => {
    const data = extractCardData(makeFicha(), null)
    const fontSizes = (html: string) => [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
    const story = fontSizes(renderToStaticMarkup(buildSocialCardJsx(data, "story")))
    const feed = fontSizes(renderToStaticMarkup(buildSocialCardJsx(data, "feed")))
    assert.ok(Math.min(...story) >= 22, `min story font ${Math.min(...story)}`)
    assert.ok(Math.min(...feed) >= 14, `min feed font ${Math.min(...feed)}`)
    assert.ok(Math.max(...story) > Math.max(...feed))
  })

  test("story shows a single list panel", () => {
    const html = renderToStaticMarkup(buildSocialCardJsx(extractCardData(makeFicha(), null), "story"))
    assert.match(html, /Destaques/)
    assert.doesNotMatch(html, /votos mapeados/)
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
