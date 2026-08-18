/**
 * Denylist editorial por candidato (auditoria de homônimo de 17/08/2026).
 *
 * Todas as notícias usadas aqui são LINHAS REAIS de `noticias_candidato` no
 * Supabase de produção, lidas por select na ficha `orleans-brandao` em
 * 17/08/2026 (28 linhas). Título, `fonte` e `url` estão exatamente como o banco
 * os guarda, inclusive o zero-width space que o Estadão manda na frente do
 * título e o redirect opaco do Google News, que é o que a coluna `url` contém
 * de verdade (o domínio do veículo não aparece nela em lugar nenhum).
 *
 * Há UMA ficha construída no arquivo, a de Weverton Rocha, marcada como tal:
 * ela existe só para provar que a denylist é por candidato. Select em
 * `candidatos` no mesmo dia mostra que ele não está na coorte publicada, então
 * a ficha é hipotética e nenhum dado dela foi inventado como se fosse real.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MATERIA_TRECHO_MIN,
  NEWS_DENYLIST,
  noticiaBloqueadaPorDenylist,
  splitNewsByDenylist,
  type NewsDenylist,
} from "@/lib/news/denylist"
import {
  refreshCandidatosNews,
  type NewsCandidato,
  type NewsRefreshDeps,
  type NoticiaRow,
} from "@/lib/news/refresh"

const SLUG = "orleans-brandao"

/** Redirect canônico da matéria do Estadão sobre o tio (linha 9cb82a07). */
const URL_ESTADAO_CANONICA =
  "https://news.google.com/rss/articles/CBMi6wFBVV95cUxQUXJ6YkJUM0hOZjlyQU9HYWg5RVZhQnVsVW9oM25jQVl0YUJXRDZJb2czSG85akpOUm1TaVFPMU4teHFGMWgwdENxakgyM2VvNE1aQThjeV9NSWs3YlJqV29CQlZrU1RnRDR5T1ZDTC0wd1g4ZGZOX2tMMUFRYVlXdU0ydllPaExpM3NIY2xQNklGcFRTX3Zsa0ZJN0RRYkwzSG5TSDlBdExJeGpSMldlOG1mb29uUE1GOGNGalQtazZxd185ek5PclhHN3dpLTZSYnA5eEZuUm5ZQXI0X3JWVXlGX0VxbjZ5dDI40gHrAUFVX3lxTFBRcnpiQlQzSE5mOXJBT0dhaDlFVmFCdWxVb2gzbmNBWXRhQldENklvZzNIbzlqSk5SbVNpUU8xTi14cUYxaDB0Q3FqSDIzZW80TVpBOGN5X01JazdiUmpXb0JCVmtTVGdENHlPVkNMLTB3WDhkZk5fa0wxQVFhWVd1TTJ2WU9oTGkzc0hjbFA2SUZwVFNfdmxrRkk3RFFiTDNIblNIOUF0TEl4alIyV2U4bWZvb25QTUY4Y0ZqVC1rNnF3Xzl6Tk9yWEc3d2ktNlJicDl4Rm5SbllBcjRfclZVeUZfRXFuNnl0Mjg?oc=5"

/** Redirect AMP da MESMA matéria (linha 2050582c). Caminho CBMi diferente. */
const URL_ESTADAO_AMP =
  "https://news.google.com/rss/articles/CBMi5gFBVV95cUxOUmNPNmVwMlZycURFaHZKdjE4UWxiWTZ2ZG4tQ3RIc0ZKTEJtM3pDZzloZG1sWEV6WXZucFFUMV8wTzc3emZXMUtCbFRJc1BIRXBjUS0yTExHeVM0SjhnRjBHRDhiX0VTSncyalU5cDBRV2ZDcFhwc0V6RW5ocHlXVkRVdUUxSU9ZUUxscnpLZUdWMXlwbEJjYXVNUW1tTVROU0gtY05ieFpSbVQwWDhlN3dFY0JQSWFCT00ySGFOdVpfcDBSUHF6ay1xNDVaYlNMN1A5X216LV9xaUk4ZlZlTFdFcGR1UdIB6wFBVV95cUxQUXJ6YkJUM0hOZjlyQU9HYWg5RVZhQnVsVW9oM25jQVl0YUJXRDZJb2czSG85akpOUm1TaVFPMU4teHFGMWgwdENxakgyM2VvNE1aQThjeV9NSWs3YlJqV29CQlZrU1RnRDR5T1ZDTC0wd1g4ZGZOX2tMMUFRYVlXdU0ydllPaExpM3NIY2xQNklGcFRTX3Zsa0ZJN0RRYkwzSG5TSDlBdExJeGpSMldlOG1mb29uUE1GOGNGalQtazZxd185ek5PclhHN3dpLTZSYnA5eEZuUm5ZQXI0X3JWVXlGX0VxbjZ5dDI4?oc=5"

/** Site pessoal do tio, publicado sob a `fonte` "carlosbrandao.com.br". */
const URL_SITE_DO_TIO =
  "https://news.google.com/rss/articles/CBMiuwFBVV95cUxQMzhvWUtLdFVEVUdxQ2R0UXhjOWVHd2tOa2ZDOWxBakpzNEUtc0xJcWh2WkFjekJDQllrZjZ1NWt6Z3Z2Q2xRT0RXNmFTWU9WdmZMbWNJNlRXUHRkSWFWeFNrbUhzSFdUdXZTc2tTWEVXY05fbnF2QXlwbE9iOF92cW5DT0JoTFdUTWdKVGh4RDF2QTZoQi1lRGpQVnU2dUdac25zMzh0QWMtYkFwYnBfUVlLNGoxckhORTIw?oc=5"

/** Notícia legítima do candidato, para a regressão. */
const URL_PODER360 =
  "https://news.google.com/rss/articles/CBMipAFBVV95cUxOYk8tb3gtMVpqYmUtQXVGOGNXMVJBT3hfb24xYjVwVVhfbjRTWHJyMHFNOXp1STgwYzl3TkpINEIyZHBScDNBZTZNUk1wRzhCa0JIUTR1SHFRSDlXNVpfX01xNnhvOFo2aGFkQW1heGhUYkdXRWs2aGJtT2owaEdHQl9JX0t1SHNUQmNvd3dsNTVlNkx6Wjd1MXJmQUtYN1JFS2dLOA?oc=5"

const URL_ITATIAIA =
  "https://news.google.com/rss/articles/CBMiygFBVV95cUxNQVVkSllvV2hmVEJSbUZwR2hVUTktT1BuUEh1QmJRa0Njd20wV0dhSldJUVc5Z3hHZzBqTHhTdjJoblVRWWtHVWhoQWVkR1Z1elN5ZFdlaTVTeXlETzlNekNSQnBlQkdocHgwQlhoVjh2OUlDUWJrZzVTQkpsNEJYSWJRN1JkcTdZQU5kMXh0R3dGbEdtdFlxQVdGZzBTU1JTQTZFSkpGVzFPLUlhU204eVNRMXhBdkg4RWpScDR4czloREhOXzkwRzJ3?oc=5"

const TITULO_ESTADAO =
  "​Alvo da PF, Weverton vê candidatura ao Senado em xeque, e Brandão avalia chapa sem contrariar Lula - Estadão"
const TITULO_SITE_DO_TIO =
  "Na convenção que oficializa candidatura de Orleans, Brandão destaca o legado da sua gestão - carlosbrandao.com.br"
const TITULO_PODER360 = "MDB oficializa Orleans Brandão ao governo do Maranhão - Poder360"
const TITULO_ITATIAIA =
  "Conheça a carreira política de Orleans Brandão, pré-candidato ao Governo do Maranhão - Rádio Itatiaia"

interface ItemFixture {
  titulo: string
  fonte: string
  url: string
}

const ESTADAO_CANONICA: ItemFixture = {
  titulo: TITULO_ESTADAO,
  fonte: "Estadão",
  url: URL_ESTADAO_CANONICA,
}
const ESTADAO_AMP: ItemFixture = {
  titulo: TITULO_ESTADAO,
  fonte: "Estadão",
  url: URL_ESTADAO_AMP,
}
const SITE_DO_TIO: ItemFixture = {
  titulo: TITULO_SITE_DO_TIO,
  fonte: "carlosbrandao.com.br",
  url: URL_SITE_DO_TIO,
}
const PODER360: ItemFixture = {
  titulo: TITULO_PODER360,
  fonte: "Poder360",
  url: URL_PODER360,
}
const ITATIAIA: ItemFixture = {
  titulo: TITULO_ITATIAIA,
  fonte: "Rádio Itatiaia",
  url: URL_ITATIAIA,
}

describe("denylist: bloqueio por URL exata", () => {
  it("o redirect canônico do Estadão está bloqueado na ficha do sobrinho", () => {
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, SLUG), true)
  })

  it("a MESMA url não está bloqueada em outra ficha: a lista é por candidato", () => {
    // Ficha hipotética (Weverton Rocha não está na coorte publicada em
    // 17/08/2026). A matéria do Estadão é sobre a candidatura DELE ao Senado:
    // na ficha dele seria cobertura legítima, e é justamente isso que uma
    // denylist global destruiria.
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, "weverton-rocha"), false)
    assert.equal(noticiaBloqueadaPorDenylist(SITE_DO_TIO, "weverton-rocha"), false)
  })

  it("slug ausente ou ficha sem entrada nunca é filtrada", () => {
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, null), false)
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, ""), false)
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, "candidato-sem-regra"), false)
  })

  it("normalização casa http/https, barra final e o parâmetro oc do Google", () => {
    const semParametro = URL_ESTADAO_CANONICA.replace("?oc=5", "")
    assert.equal(noticiaBloqueadaPorDenylist({ url: semParametro }, SLUG), true)
    assert.equal(noticiaBloqueadaPorDenylist({ url: `${semParametro}/` }, SLUG), true)
    assert.equal(
      noticiaBloqueadaPorDenylist({ url: semParametro.replace("https://", "http://") }, SLUG),
      true,
    )
    assert.equal(
      noticiaBloqueadaPorDenylist({ url: `${semParametro}?oc=5&utm_source=cron` }, SLUG),
      true,
    )
  })

  it("caminho do redirect é comparado com a caixa original, porque é base64url", () => {
    // Baixar a caixa do caminho casaria redirects diferentes como se fossem o
    // mesmo artigo: em base64url "A" e "a" são bytes distintos.
    assert.equal(
      noticiaBloqueadaPorDenylist({ url: URL_ESTADAO_CANONICA.toLowerCase() }, SLUG),
      false,
    )
  })
})

describe("denylist: bloqueio por fonte, a regra durável", () => {
  it("qualquer matéria da fonte carlosbrandao.com.br cai, não só a que foi auditada", () => {
    assert.equal(noticiaBloqueadaPorDenylist(SITE_DO_TIO, SLUG), true)

    // Matéria futura do mesmo site, outro redirect e outro título: continua
    // bloqueada. É isto que a regra de fonte compra e a de URL não.
    assert.equal(
      noticiaBloqueadaPorDenylist(
        {
          titulo: "Brandão entrega hospital em Imperatriz - carlosbrandao.com.br",
          fonte: "carlosbrandao.com.br",
          url: "https://news.google.com/rss/articles/CBMiOUTRAENTRADAQUEAINDANAOEXISTE?oc=5",
        },
        SLUG,
      ),
      true,
    )
  })

  it("fonte casa sem depender de caixa, acento ou espaço em volta", () => {
    assert.equal(
      noticiaBloqueadaPorDenylist({ fonte: "  CarlosBrandao.com.br ", url: "" }, SLUG),
      true,
    )

    // `fonte` é texto livre que vem do <source> do RSS, não um identificador.
    // A comparação roda sobre o texto normalizado para que acento e caixa não
    // decidam se a matéria do tio entra ou não na ficha.
    assert.equal(
      noticiaBloqueadaPorDenylist({ ...ESTADAO_CANONICA, fonte: "ESTADAO", url: "" }, SLUG),
      true,
    )
  })

  it("fonte vazia não casa com nada", () => {
    assert.equal(noticiaBloqueadaPorDenylist({ fonte: "", titulo: TITULO_ESTADAO }, SLUG), false)
  })
})

describe("denylist: AMP e canônica da mesma matéria", () => {
  it("as duas variantes caem na ficha do sobrinho", () => {
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, SLUG), true)
    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_AMP, SLUG), true)
  })

  it("uma única regra de matéria (fonte + trecho de título) cobre as duas", () => {
    // O brief pedia derivar a AMP da canônica por normalização de URL. Medido
    // em 17/08/2026: não dá. O Google emite um redirect por variante, com
    // caminho CBMi diferente, e nada na URL diz que são a mesma matéria. O que
    // é idêntico nas duas linhas é `fonte` e `titulo`, então é esse par que
    // cobre a matéria inteira com uma entrada só.
    const soMateria: NewsDenylist = {
      [SLUG]: [
        {
          tipo: "materia",
          fonte: "Estadão",
          tituloContem: "Weverton vê candidatura ao Senado em xeque",
          motivo: "matéria do tio",
        },
      ],
    }

    const { permitidos, bloqueados } = splitNewsByDenylist(
      [ESTADAO_CANONICA, ESTADAO_AMP, PODER360],
      SLUG,
      soMateria,
    )

    assert.deepEqual(
      bloqueados.map((b) => b.url),
      [URL_ESTADAO_CANONICA, URL_ESTADAO_AMP],
    )
    assert.deepEqual(
      permitidos.map((p) => p.titulo),
      [TITULO_PODER360],
    )
  })

  it("regra de matéria não vaza para outro veículo com título parecido", () => {
    const soMateria: NewsDenylist = {
      [SLUG]: [
        {
          tipo: "materia",
          fonte: "Estadão",
          tituloContem: "Weverton vê candidatura ao Senado em xeque",
          motivo: "matéria do tio",
        },
      ],
    }

    assert.equal(
      noticiaBloqueadaPorDenylist({ ...ESTADAO_CANONICA, fonte: "G1" }, SLUG, soMateria),
      false,
    )
  })

  it("trecho de título curto demais é ignorado, não vira regra frouxa", () => {
    const frouxa: NewsDenylist = {
      [SLUG]: [
        { tipo: "materia", fonte: "Estadão", tituloContem: "Brandão", motivo: "curta demais" },
      ],
    }

    assert.equal(noticiaBloqueadaPorDenylist(ESTADAO_CANONICA, SLUG, frouxa), false)
  })
})

describe("denylist: a lista versionada é bem formada", () => {
  for (const [slug, regras] of Object.entries(NEWS_DENYLIST)) {
    it(`${slug}: toda regra explica de quem a matéria é`, () => {
      assert.ok(regras.length > 0, "ficha listada sem nenhuma regra é ruído no diff")
      for (const regra of regras) {
        assert.ok(
          regra.motivo.trim().length >= 30,
          `regra ${regra.tipo} sem motivo legível: bloqueio editorial tem que poder ser contestado`,
        )
        if (regra.tipo === "materia") {
          assert.ok(
            regra.tituloContem.trim().length >= MATERIA_TRECHO_MIN,
            `trecho "${regra.tituloContem}" é curto demais e derrubaria cobertura legítima`,
          )
        }
        if (regra.tipo === "url") {
          assert.match(regra.url, /^https:\/\//)
        }
      }
    })
  }

  it("as três linhas medidas do tio estão cobertas, e as legítimas não", () => {
    for (const item of [ESTADAO_CANONICA, ESTADAO_AMP, SITE_DO_TIO]) {
      assert.equal(noticiaBloqueadaPorDenylist(item, SLUG), true, item.url)
    }
    for (const item of [PODER360, ITATIAIA]) {
      assert.equal(noticiaBloqueadaPorDenylist(item, SLUG), false, item.url)
    }
  })
})

// ── Pipeline: o corte roda antes do upsert e aparece no rastro de coleta ─────

const ORLEANS: NewsCandidato = {
  id: "b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601",
  slug: SLUG,
  nome_urna: "Orleans Brandao",
  nome_completo: "Carlos Orleans Braide Brandão",
  cargo_disputado: "Governador",
}

/** Ficha construída (ver cabeçalho): serve só para o teste de escopo por slug. */
const WEVERTON: NewsCandidato = {
  id: "id-hipotetico-weverton",
  slug: "weverton-rocha",
  nome_urna: "Weverton",
  nome_completo: "Weverton Rocha Marques de Sousa",
  cargo_disputado: "Senador",
}

function rss(items: ItemFixture[]): string {
  const corpo = items
    .map(
      (item) =>
        `<item><title><![CDATA[${item.titulo}]]></title><link>${item.url}</link>` +
        `<pubDate>Tue, 11 Aug 2026 08:30:00 GMT</pubDate>` +
        `<source url="https://example.com">${item.fonte}</source></item>`,
    )
    .join("")
  return `<?xml version="1.0"?><rss><channel>${corpo}</channel></rss>`
}

function makeDeps(items: ItemFixture[]) {
  const upserted: NoticiaRow[][] = []
  const deps: NewsRefreshDeps = {
    upsertNoticias: async (rows) => {
      upserted.push(rows)
      return { error: null }
    },
    fetchImpl: (async () => new Response(rss(items), { status: 200 })) as unknown as typeof fetch,
    sleep: async () => {},
    now: () => new Date("2026-08-17T00:00:00Z"),
    sleepMs: 0,
    timeoutMs: 1000,
    newsLimit: 20,
  }
  return { deps, upserted }
}

describe("refreshCandidatosNews: denylist corta antes do upsert e conta no log", () => {
  it("as três do tio não chegam ao upsert e as legítimas chegam", async () => {
    const { deps, upserted } = makeDeps([
      ESTADAO_CANONICA,
      ESTADAO_AMP,
      SITE_DO_TIO,
      PODER360,
      ITATIAIA,
    ])

    const summary = await refreshCandidatosNews([ORLEANS], deps)

    assert.equal(summary.discardedByDenylist, 3)
    assert.equal(summary.rowsUpserted, 2)
    assert.deepEqual(
      upserted[0].map((row) => row.url),
      [URL_PODER360, URL_ITATIAIA],
    )
  })

  it("o detalhe do coleta_log diz quantas saíram por denylist", async () => {
    const { deps } = makeDeps([ESTADAO_CANONICA, ESTADAO_AMP, SITE_DO_TIO, PODER360])

    const summary = await refreshCandidatosNews([ORLEANS], deps)
    const coleta = summary.coletas[0]

    assert.equal(coleta.resultado, "encontrado")
    assert.equal(coleta.volume, 1)
    assert.match(coleta.detalhe, /3 bloqueados por denylist/)
    assert.match(coleta.detalhe, /1 enviados ao upsert/)
  })

  it("lote em que TUDO foi bloqueado vira vazio_confirmado com volume 0", async () => {
    // `coleta_log_volume_coerente` exige volume > 0 em `encontrado`. Coleta que
    // buscou, achou e teve tudo barrado é zero provado, não achado: sai como
    // vazio_confirmado, e o detalhe conta os bloqueados para o zero não virar
    // "não havia nada".
    const { deps, upserted } = makeDeps([ESTADAO_CANONICA, ESTADAO_AMP, SITE_DO_TIO])

    const summary = await refreshCandidatosNews([ORLEANS], deps)
    const coleta = summary.coletas[0]

    assert.equal(upserted.length, 0)
    assert.equal(summary.rowsUpserted, 0)
    assert.equal(summary.withNews, 0)
    assert.equal(summary.discardedByDenylist, 3)
    assert.equal(coleta.resultado, "vazio_confirmado")
    assert.equal(coleta.volume, 0)
    assert.match(coleta.detalhe, /3 citam o candidato no titulo/)
    assert.match(coleta.detalhe, /3 bloqueados por denylist/)
  })

  it("regressão: notícia legítima do próprio candidato continua passando", async () => {
    const { deps, upserted } = makeDeps([PODER360, ITATIAIA])

    const summary = await refreshCandidatosNews([ORLEANS], deps)

    assert.equal(summary.discardedByDenylist, 0)
    assert.equal(summary.discardedByName, 0)
    assert.equal(summary.rowsUpserted, 2)
    assert.equal(summary.coletas[0].resultado, "encontrado")
    assert.match(summary.coletas[0].detalhe, /0 bloqueados por denylist/)
    assert.deepEqual(
      upserted[0].map((row) => row.titulo),
      [TITULO_PODER360, TITULO_ITATIAIA],
    )
  })

  it("a mesma matéria do Estadão entraria numa ficha que não tem a regra", async () => {
    const { deps, upserted } = makeDeps([ESTADAO_CANONICA])

    const summary = await refreshCandidatosNews([WEVERTON], deps)

    assert.equal(summary.discardedByDenylist, 0)
    assert.equal(summary.rowsUpserted, 1)
    assert.equal(upserted[0][0].url, URL_ESTADAO_CANONICA)
  })
})
