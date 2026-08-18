import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  refreshCandidatosNews,
  type NewsCandidato,
  type NewsRefreshDeps,
  type NoticiaRow,
} from "../src/lib/news/refresh"

/**
 * Cobre o rastro de coleta que `refreshCandidatosNews` passou a montar
 * (incidente de 2026-08-04: o cron de noticias cobria 5 de 194 candidatos por
 * dia e nenhuma linha de `coleta_log` denunciava; `google-news` aparecia como
 * "nunca verificado" para os 194). Cada candidato processado tem que sair com
 * exatamente uma tentativa, com o desfecho certo:
 *
 *   - RSS respondeu e algum titulo cita o candidato  -> encontrado (volume > 0)
 *   - RSS respondeu e nenhum titulo cita o candidato -> vazio_confirmado
 *   - HTTP != 2xx, timeout ou upsert com erro        -> erro (nunca vira zero)
 */

const CAND_A: NewsCandidato = {
  id: "id-a",
  slug: "cand-a",
  nome_urna: "Fulana Alves",
  nome_completo: "Fulana Alves de Teste",
  cargo_disputado: "Governador",
}

const CAND_B: NewsCandidato = {
  id: "id-b",
  slug: "cand-b",
  nome_urna: "Beltrano Borges",
  nome_completo: null,
  cargo_disputado: "Governador",
}

function rssComItens(titulos: string[]): string {
  const items = titulos
    .map(
      (t) =>
        `<item><title><![CDATA[${t}]]></title><link>https://example.com/${encodeURIComponent(t)}</link><pubDate>Tue, 04 Aug 2026 12:00:00 GMT</pubDate><source url="https://example.com">Fonte Teste</source></item>`,
    )
    .join("")
  return `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`
}

interface DepsOverrides {
  fetchImpl?: NewsRefreshDeps["fetchImpl"]
  upsertNoticias?: NewsRefreshDeps["upsertNoticias"]
}

function makeDeps(overrides: DepsOverrides = {}) {
  const upserted: NoticiaRow[][] = []
  const deps: NewsRefreshDeps = {
    upsertNoticias:
      overrides.upsertNoticias ??
      (async (rows) => {
        upserted.push(rows)
        return { error: null }
      }),
    fetchImpl:
      overrides.fetchImpl ??
      ((async () => new Response(rssComItens([]), { status: 200 })) as unknown as typeof fetch),
    sleep: async () => {},
    now: () => new Date("2026-08-05T00:00:00Z"),
    sleepMs: 0,
    timeoutMs: 1000,
    newsLimit: 20,
  }
  return { deps, upserted }
}

describe("refreshCandidatosNews: rastro de coleta por candidato", () => {
  it("marca encontrado quando algum titulo cita o candidato", async () => {
    const { deps } = makeDeps({
      fetchImpl: (async () =>
        new Response(
          rssComItens(["Fulana Alves lanca candidatura", "Eleicao 2026 tem novo debate"]),
          { status: 200 },
        )) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_A], deps)

    assert.equal(summary.coletas.length, 1)
    const coleta = summary.coletas[0]
    assert.equal(coleta.alvo, "cand-a")
    assert.equal(coleta.candidato_id, "id-a")
    assert.equal(coleta.resultado, "encontrado")
    assert.equal(coleta.volume, 1)
    assert.match(coleta.detalhe, /1 citam o candidato/)
    assert.match(coleta.url, /news\.google\.com\/rss\/search/)
    assert.ok(coleta.duracao_ms >= 0)
  })

  it("marca vazio_confirmado quando o RSS responde sem nenhum titulo citando o candidato", async () => {
    const { deps, upserted } = makeDeps({
      fetchImpl: (async () =>
        new Response(rssComItens(["Eleicao 2026 tem novo debate"]), {
          status: 200,
        })) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_B], deps)

    assert.equal(upserted.length, 0)
    assert.equal(summary.coletas.length, 1)
    const coleta = summary.coletas[0]
    assert.equal(coleta.resultado, "vazio_confirmado")
    assert.equal(coleta.volume, 0)
    assert.match(coleta.detalhe, /0 citam o candidato/)
  })

  it("marca erro em HTTP nao-2xx, e nunca vazio", async () => {
    const { deps } = makeDeps({
      fetchImpl: (async () =>
        new Response(null, { status: 503 })) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_A], deps)

    assert.equal(summary.coletas.length, 1)
    assert.equal(summary.coletas[0].resultado, "erro")
    assert.equal(summary.coletas[0].detalhe, "HTTP 503")
  })

  it("marca erro quando o fetch lanca (timeout)", async () => {
    const abortError = new Error("aborted")
    abortError.name = "AbortError"
    const { deps } = makeDeps({
      fetchImpl: (async () => {
        throw abortError
      }) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_A], deps)

    assert.equal(summary.coletas[0].resultado, "erro")
    assert.equal(summary.coletas[0].detalhe, "timeout")
  })

  it("marca erro quando o upsert falha, mesmo com itens citando o candidato", async () => {
    const { deps } = makeDeps({
      fetchImpl: (async () =>
        new Response(rssComItens(["Fulana Alves em novo evento"]), {
          status: 200,
        })) as unknown as typeof fetch,
      upsertNoticias: async () => ({ error: "permission denied" }),
    })

    const summary = await refreshCandidatosNews([CAND_A], deps)

    assert.equal(summary.coletas[0].resultado, "erro")
    assert.match(summary.coletas[0].detalhe, /upsert falhou: permission denied/)
  })

  it("produz exatamente uma tentativa por candidato num lote misto", async () => {
    let call = 0
    const { deps } = makeDeps({
      fetchImpl: (async () => {
        call += 1
        if (call === 1) {
          return new Response(rssComItens(["Fulana Alves vai a debate"]), { status: 200 })
        }
        return new Response(rssComItens(["Nada relacionado ao nome"]), { status: 200 })
      }) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_A, CAND_B], deps)

    assert.equal(summary.processed, 2)
    assert.deepEqual(
      summary.coletas.map((c) => [c.alvo, c.resultado]),
      [
        ["cand-a", "encontrado"],
        ["cand-b", "vazio_confirmado"],
      ],
    )
  })
})

describe("refreshCandidatosNews: o prazo tem que cobrir a leitura do corpo", () => {
  it(
    "fonte que manda cabeçalho e não termina o corpo vira erro de timeout, não invocação pendurada",
    { timeout: 5000 },
    async () => {
      // O clearTimeout rodava logo depois do fetch, então o `await res.text()`
      // ficava sem prazo nenhum: a invocação inteira pendurava até o limite da
      // Vercel, o cursor não avançava e o encadeamento não era agendado.
      // Se este teste voltar a pendurar, é essa regressão.
      const { deps } = makeDeps({
        fetchImpl: (async (_url: string, init?: RequestInit) => {
          const signal = init?.signal
          return {
            ok: true,
            status: 200,
            // Corpo que nunca termina: só rejeita quando o abort chega.
            text: () =>
              new Promise<string>((_resolve, reject) => {
                signal?.addEventListener("abort", () =>
                  reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
                )
              }),
          } as unknown as Response
        }) as unknown as typeof fetch,
      })

      const summary = await refreshCandidatosNews([CAND_A], deps)

      assert.equal(summary.errors.length, 1)
      assert.equal(summary.errors[0].error, "timeout")
      assert.equal(summary.coletas[0].resultado, "erro")
    },
  )

  it("resposta normal segue passando, com o timer cancelado no finally", async () => {
    const { deps } = makeDeps({
      fetchImpl: (async () => new Response(rssComItens([]), { status: 200 })) as unknown as typeof fetch,
    })

    const summary = await refreshCandidatosNews([CAND_A], deps)

    assert.equal(summary.errors.length, 0)
    assert.equal(summary.processed, 1)
  })
})
