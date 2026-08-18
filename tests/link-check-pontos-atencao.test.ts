/**
 * Regras de decisão do link-check de fontes (scripts/link-check-pontos-atencao.ts).
 *
 * O que estes testes protegem: a única escrita que o script faz é despublicar
 * uma claim. Se a classificação errar para o lado permissivo, o site volta a
 * publicar afirmação grave com fonte morta (achado V1 da auditoria de
 * 2026-07-24). Se errar para o lado agressivo, tira do ar claim boa porque um
 * servidor bloqueou robô ou porque a fonte oficial está suspensa por vedação
 * eleitoral. Os dois lados estão cobertos aqui.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  classificarHttp,
  erroDeRedeEhMorte,
  estadoDesligado,
  hostDaUrl,
  mapPorHost,
  runLinkCheck,
  type EstadoDeFontes,
  type LinkCheckDeps,
  type ObservacaoDeDefeito,
  type PontoAtencaoLinkRow,
  type UrlProbe,
} from "../scripts/link-check-pontos-atencao"

const EXECUCAO_ATUAL = "exec-atual"
const EXECUCAO_ANTERIOR = "exec-anterior"
const SEIS_HORAS_MS = 6 * 3600_000

/**
 * Memória fake do link-check.
 *
 * Por padrão finge que TODO defeito desta execução já tinha sido visto numa
 * execução anterior, ou seja, tudo entra confirmado. É de propósito: os testes
 * antigos exercitam a decisão por claim (todas mortas, alguma viva, domínio de
 * verificação manual) e não a confirmação, que tem suíte própria mais abaixo.
 * Quem quiser exercitar morte não confirmada passa `confirmar: []`.
 */
function estadoFake(
  probes: Record<string, UrlProbe["status"]>,
  opcoes: { confirmar?: true | string[]; primeiraVezEm?: string } = {},
): { estado: EstadoDeFontes; registrados: string[]; esquecidos: string[] } {
  const confirmar = opcoes.confirmar ?? true
  const registrados: string[] = []
  const esquecidos: string[] = []

  const estado: EstadoDeFontes = {
    disponivel: true,
    ler: async (urls) => {
      const achados = new Map<string, ObservacaoDeDefeito>()
      for (const url of urls) {
        if (confirmar !== true && !confirmar.includes(url)) continue
        const status = probes[url]
        if (status !== "morta" && status !== "sem_substancia") continue
        const em = opcoes.primeiraVezEm ?? "2026-07-01T00:00:00.000Z"
        achados.set(url, {
          url,
          veredito: status,
          execucoes: 1,
          primeiraVezEm: em,
          ultimaVezEm: em,
          primeiraExecucao: EXECUCAO_ANTERIOR,
          ultimaExecucao: EXECUCAO_ANTERIOR,
        })
      }
      return achados
    },
    registrar: async (defeitos) => {
      registrados.push(...defeitos.map((d) => d.url))
    },
    esquecer: async (urls) => {
      esquecidos.push(...urls)
    },
  }

  return { estado, registrados, esquecidos }
}

function ponto(over: Partial<PontoAtencaoLinkRow> & { id: string }): PontoAtencaoLinkRow {
  return {
    candidato_id: "cand-1",
    titulo: "claim",
    gravidade: "critica",
    visivel: true,
    fontes: [],
    dados_relacionados: null,
    ...over,
  }
}

function deps(
  rows: PontoAtencaoLinkRow[],
  probes: Record<string, UrlProbe["status"]>,
  over: Partial<LinkCheckDeps> = {},
): LinkCheckDeps & { despublicados: string[]; avisos: string[] } {
  const despublicados: string[] = []
  const avisos: string[] = []
  return {
    apply: false,
    onlyVisible: false,
    limit: null,
    execucaoId: EXECUCAO_ATUAL,
    estado: estadoFake(probes).estado,
    intervaloConfirmacaoMs: SEIS_HORAS_MS,
    fetchRows: async () => rows,
    probeUrls: async (urls) =>
      urls.map((url) => ({
        url,
        status: probes[url] ?? "indisponivel",
        httpStatus: null,
        detalhe: "teste",
      })),
    despublicar: async (row) => {
      despublicados.push(row.id)
    },
    log: () => {},
    warn: (m) => {
      avisos.push(m)
    },
    error: () => {},
    agora: () => new Date("2026-07-25T12:00:00Z"),
    despublicados,
    avisos,
    ...over,
  }
}

describe("classificarHttp", () => {
  it("2xx e 3xx passam pelo filtro de status", () => {
    assert.equal(classificarHttp(200), "viva")
    assert.equal(classificarHttp(204), "viva")
    assert.equal(classificarHttp(301), "viva")
  })

  it("só 404 e 410 são mortas", () => {
    assert.equal(classificarHttp(404), "morta")
    assert.equal(classificarHttp(410), "morta")
  })

  it("bloqueio e instabilidade são indisponíveis, nunca mortos", () => {
    for (const status of [401, 403, 405, 429, 500, 502, 503]) {
      assert.equal(classificarHttp(status), "indisponivel", `status ${status}`)
    }
  })
})

describe("erroDeRedeEhMorte", () => {
  it("só DNS inexistente conta como morte", () => {
    assert.equal(erroDeRedeEhMorte("getaddrinfo ENOTFOUND dominio-que-nao-existe.com"), true)
    assert.equal(erroDeRedeEhMorte("fetch failed"), false)
    assert.equal(erroDeRedeEhMorte("The operation was aborted"), false)
    assert.equal(erroDeRedeEhMorte("ECONNRESET"), false)
  })
})

describe("hostDaUrl", () => {
  it("normaliza para minúscula e devolve a string crua quando não é URL", () => {
    assert.equal(hostDaUrl("https://Noticias.STF.jus.br/a/b"), "noticias.stf.jus.br")
    assert.equal(hostDaUrl("nao e url"), "nao e url")
  })
})

describe("mapPorHost", () => {
  it("preserva a ordem de entrada mesmo agrupando por host", async () => {
    const urls = [
      "https://a.com/1",
      "https://b.com/1",
      "https://a.com/2",
      "https://c.com/1",
      "https://b.com/2",
    ]
    const out = await mapPorHost(urls, 4, 0, async (url) => url.toUpperCase())
    assert.deepEqual(out, urls.map((u) => u.toUpperCase()))
  })

  it("nunca dispara duas requisições simultâneas ao mesmo host", async () => {
    // É esta serialização que evita o 202 com corpo vazio que
    // noticias.stf.jus.br devolve sob rajada, ou seja, evita que o próprio
    // robô fabrique o falso negativo que depois despublicaria claim boa.
    const emVoo = new Map<string, number>()
    let pico = 0
    await mapPorHost(
      ["https://a.com/1", "https://a.com/2", "https://a.com/3", "https://b.com/1"],
      4,
      0,
      async (url) => {
        const host = hostDaUrl(url)
        const atual = (emVoo.get(host) ?? 0) + 1
        emVoo.set(host, atual)
        pico = Math.max(pico, atual)
        await new Promise((r) => setTimeout(r, 5))
        emVoo.set(host, atual - 1)
        return url
      },
    )
    assert.equal(pico, 1)
  })
})

describe("runLinkCheck", () => {
  const url404 = "https://g1.globo.com/politica/mensalao/noticia/2012/12/stf.ghtml"
  const url200 = "https://portal.stf.jus.br/processos/detalhe.asp?incidente=1"

  it("dry-run não escreve nada mesmo com todas as fontes mortas", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 1)
    assert.equal(r.despublicadas, 0)
    assert.deepEqual(d.despublicados, [])
  })

  it("apply despublica a claim cujas fontes estão todas mortas", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" }, { apply: true })
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 1)
    assert.deepEqual(d.despublicados, ["a"])
  })

  it("não despublica quando ainda existe fonte viva", async () => {
    const d = deps(
      [ponto({ id: "a", fontes: [{ url: url404 }, { url: url200 }] })],
      { [url404]: "morta", [url200]: "viva" },
      { apply: true },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 0)
    assert.equal(r.claimsParcialmenteMortas.length, 1)
    assert.deepEqual(d.despublicados, [])
  })

  it("não despublica quando a outra fonte apenas bloqueou o robô", async () => {
    const bloqueada = "https://www1.folha.uol.com.br/poder/materia.shtml"
    const d = deps(
      [ponto({ id: "a", fontes: [{ url: url404 }, { url: bloqueada }] })],
      { [url404]: "morta", [bloqueada]: "indisponivel" },
      { apply: true },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 0)
    assert.deepEqual(d.despublicados, [])
  })

  it("não despublica quando a outra fonte está sob vedação eleitoral", async () => {
    // agenciaminas.mg.gov.br em 2026-07-25: HTTP 503 com aviso de legislação
    // eleitoral. Fonte legítima que volta sozinha ao fim da vedação.
    const vedada = "https://agenciaminas.mg.gov.br/noticia/acordo-homologado"
    const d = deps(
      [ponto({ id: "a", fontes: [{ url: url404 }, { url: vedada }] })],
      { [url404]: "morta", [vedada]: "indisponivel" },
      { apply: true },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 0)
    assert.equal(r.urlsIndisponiveis, 1)
  })

  it("não despublica quando a fonte morta é de domínio que exige verificação humana", async () => {
    // noticias.stf.jus.br responde 200 na primeira requisição e 202 vazio nas
    // seguintes. Nenhum veredito automático pode tirar claim do ar por ele.
    const stf = "https://noticias.stf.jus.br/postsnoticias/stf-recebe-denuncia-contra-sergio-moro-pelo-crime-de-calunia/"
    const d = deps([ponto({ id: "a", fontes: [{ url: stf }] })], { [stf]: "morta" }, { apply: true })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 1)
    assert.equal(r.despublicadas, 0)
    assert.equal(r.bloqueadasPorVerificacaoManual, 1)
    assert.deepEqual(d.despublicados, [])
    assert.ok(d.avisos.some((m) => m.includes("verificacao humana")))
  })

  it("claim já fora do ar não é reescrita", async () => {
    const d = deps(
      [ponto({ id: "a", visivel: false, fontes: [{ url: url404 }] })],
      { [url404]: "morta" },
      { apply: true },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 1)
    assert.equal(r.despublicadas, 0)
    assert.deepEqual(d.despublicados, [])
  })

  it("claim sem nenhuma fonte não entra no veredito do link-check", async () => {
    const d = deps([ponto({ id: "a", fontes: [] })], {}, { apply: true })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 0)
    assert.equal(r.claimsSemFonteComConteudo.length, 0)
    assert.deepEqual(d.despublicados, [])
  })

  it("erro de escrita é contado e não derruba a execução", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" }, {
      apply: true,
      despublicar: async () => {
        throw new Error("permission denied")
      },
    })
    const r = await runLinkCheck(d)

    assert.equal(r.erros, 1)
    assert.equal(r.despublicadas, 0)
  })

  it("URL de domínio nu é reportada como sem caminho, não como morta", async () => {
    const nu = "https://g1.globo.com/"
    const d = deps([ponto({ id: "a", fontes: [{ url: nu }] })], { [nu]: "sem_caminho" }, { apply: true })
    const r = await runLinkCheck(d)

    assert.equal(r.urlsSemCaminho, 1)
    assert.equal(r.urlsMortas, 0)
    assert.deepEqual(d.despublicados, [])
  })

  it("fonte que responde 200 sem substância vira alerta, nunca despublicação", async () => {
    // O caso do ronaldo-caiado: única fonte devolvia a casca do SPA do TSE.
    const spa = "https://divulgacandcontas.tse.jus.br/divulga/inicio"
    const d = deps([ponto({ id: "a", gravidade: "alta", fontes: [{ url: spa }] })], { [spa]: "sem_substancia" }, {
      apply: true,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.urlsSemSubstancia, 1)
    assert.equal(r.claimsSemFonteComConteudo.length, 1)
    assert.equal(r.claimsTotalmenteMortas.length, 0)
    assert.equal(r.despublicadas, 0)
    assert.ok(d.avisos.some((m) => m.includes("sem nenhuma fonte com conteudo")))
  })

  it("claim invisível sem fonte com conteúdo não vira alerta", async () => {
    const spa = "https://divulgacandcontas.tse.jus.br/divulga/inicio"
    const d = deps([ponto({ id: "a", visivel: false, fontes: [{ url: spa }] })], { [spa]: "sem_substancia" })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteComConteudo.length, 0)
  })

  it("claim com uma fonte viva e outra sem substância não vira alerta", async () => {
    const spa = "https://divulgacandcontas.tse.jus.br/divulga/inicio"
    const d = deps([ponto({ id: "a", fontes: [{ url: spa }, { url: url200 }] })], {
      [spa]: "sem_substancia",
      [url200]: "viva",
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteComConteudo.length, 0)
  })

  it("só claims visíveis são analisadas quando onlyVisible está ligado", async () => {
    const d = deps(
      [ponto({ id: "a", fontes: [{ url: url404 }] }), ponto({ id: "b", visivel: false, fontes: [{ url: url200 }] })],
      { [url404]: "morta", [url200]: "viva" },
      { onlyVisible: true },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.claims, 1)
    assert.equal(r.urlsUnicas, 1)
  })
})

/**
 * Dois níveis de alarme (2026-07-29).
 *
 * O que estes testes protegem: a primeira execução real reprovou 71 claims,
 * das quais só 7 estavam em ficha pública, e essas 7 tinham todas as fontes
 * apenas `indisponivel`. Sem a separação, o job semanal nasce vermelho por
 * ruído e alguém silencia justamente a rede que deveria pegar o problema real.
 * O lado oposto também está coberto: nada aqui pode fazer defeito real de
 * fonte em ficha pública deixar de ser defeito.
 */
describe("runLinkCheck: recorte público e defeito real de fonte", () => {
  const url404 = "https://g1.globo.com/politica/mensalao/noticia/2012/12/stf.ghtml"
  const url200 = "https://portal.stf.jus.br/processos/detalhe.asp?incidente=1"

  it("fonte só indisponível não conta como defeito real: é temporária e volta sozinha", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url200 }] })], { [url200]: "indisponivel" })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteComConteudo.length, 1, "segue reportada como sem conteúdo")
    assert.equal(r.claimsSemFonteUtilizavel.length, 0, "mas não é defeito que derrube o gate")
  })

  it("fonte morta, sem caminho ou sem substância conta como defeito real", async () => {
    for (const status of ["morta", "sem_caminho", "sem_substancia"] as const) {
      const d = deps([ponto({ id: "a", fontes: [{ url: url200 }] })], { [url200]: status })
      const r = await runLinkCheck(d)

      assert.equal(r.claimsSemFonteUtilizavel.length, 1, `${status} deve ser defeito real`)
    }
  })

  it("uma fonte viva junto de uma indisponível não gera alarme algum", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url200 }, { url: url404 }] })], {
      [url200]: "viva",
      [url404]: "indisponivel",
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteComConteudo.length, 0)
    assert.equal(r.claimsSemFonteUtilizavel.length, 0)
  })

  it("claim de candidato fora do front é marcada como não pública e fica separável", async () => {
    const d = deps(
      [
        ponto({ id: "publica", fontes: [{ url: url404 }] }),
        ponto({ id: "fila", publico: false, fontes: [{ url: url404 }] }),
      ],
      { [url404]: "morta" },
    )
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteUtilizavel.length, 2, "as duas seguem sendo defeito real")
    assert.deepEqual(
      r.claimsSemFonteUtilizavel.filter((v) => v.publico).map((v) => v.id),
      ["publica"],
      "só a de candidato publicado entra no recorte que derruba o gate",
    )
    assert.deepEqual(
      r.claimsComFonteMorta.filter((v) => !v.publico).map((v) => v.id),
      ["fila"],
      "a outra continua visível no relatório como fila de publicação",
    )
  })

  it("linha sem o campo publico é tratada como pública: na dúvida o alarme fala mais alto", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsComFonteMorta[0]?.publico, true)
  })

  it("claim invisível com fonte morta não entra em claimsComFonteMorta", async () => {
    const d = deps([ponto({ id: "a", visivel: false, fontes: [{ url: url404 }] })], { [url404]: "morta" })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsComFonteMorta.length, 0, "já está fora do ar, não há o que alarmar")
  })
})

/**
 * Confirmação de morte em execuções distintas (2026-08-03).
 *
 * O que estes testes protegem, nas duas direções.
 *
 * Contra o falso negativo: em 03/08 o run 30837180265 marcou uma matéria VIVA
 * da revistaforum como `morta` (404 servido a sonda de datacenter) e uma
 * matéria viva do agorarn como `sem_substancia`. As duas voltaram no run
 * seguinte. O 404 falso era a própria página de erro do site, sem marcador de
 * WAF, medido em 623 caracteres: nenhuma regra que leia só a resposta separa
 * aquilo de um 404 verdadeiro. O que separa é ver o mesmo defeito de outra
 * execução, com outro IP de saída.
 *
 * Contra o afrouxamento: 404 que persiste entre execuções continua matando a
 * claim, `sem_caminho` continua valendo na hora, e memória indisponível NUNCA
 * pode virar despublicação.
 */
describe("runLinkCheck: confirmação de morte entre execuções", () => {
  const url404 = "https://revistaforum.com.br/politica/2024/1/22/renan-santos-152663.html"
  const outra404 = "https://agorarn.com.br/ultimas/justic-inclui-alvaro-dias-abuso-poder/"

  it("morte vista pela primeira vez não derruba o gate nem despublica", async () => {
    const probes = { [url404]: "morta" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], probes, {
      apply: true,
      estado: estadoFake(probes, { confirmar: [] }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsComMorteSuspeita.length, 1, "aparece no relatório")
    assert.equal(r.claimsComFonteMorta.length, 0, "mas não derruba o gate")
    assert.equal(r.claimsSemFonteUtilizavel.length, 0, "nem conta como defeito real")
    assert.equal(r.despublicadas, 0)
    assert.equal(r.bloqueadasPorFaltaDeConfirmacao, 1)
    assert.deepEqual(d.despublicados, [])
    assert.ok(d.avisos.some((m) => m.includes("MORTE SUSPEITA")))
  })

  it("morte confirmada em execução anterior derruba o gate e despublica", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" }, { apply: true })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsComFonteMorta.length, 1)
    assert.equal(r.claimsComMorteSuspeita.length, 0)
    assert.equal(r.despublicadas, 1, "404 estável entre execuções continua matando a claim")
    assert.deepEqual(d.despublicados, ["a"])
  })

  it("uma única morte não confirmada segura a claim inteira", async () => {
    // O caso medido: das duas fontes, uma já era morte conhecida e a outra
    // apareceu morta agora, na execução que estava com a rede comprometida.
    const probes = { [url404]: "morta", [outra404]: "morta" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }, { url: outra404 }] })], probes, {
      apply: true,
      estado: estadoFake(probes, { confirmar: [url404] }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsTotalmenteMortas.length, 1)
    assert.equal(r.despublicadas, 0, "confirmação parcial não basta para despublicar")
    assert.equal(r.bloqueadasPorFaltaDeConfirmacao, 1)
    assert.deepEqual(d.despublicados, [])
  })

  it("observação recente demais não confirma: duas rodadas do mesmo lugar não são independentes", async () => {
    const probes = { [url404]: "morta" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], probes, {
      apply: true,
      // `agora` dos deps é 2026-07-25T12:00:00Z, ou seja, uma hora depois.
      estado: estadoFake(probes, { primeiraVezEm: "2026-07-25T11:00:00.000Z" }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 0)
    assert.equal(r.claimsComMorteSuspeita.length, 1)
  })

  it("observação da MESMA execução não confirma a si mesma", async () => {
    const probes = { [url404]: "morta" } as const
    const base = estadoFake(probes)
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], probes, {
      apply: true,
      estado: {
        ...base.estado,
        ler: async (urls) => {
          const m = await base.estado.ler(urls)
          for (const [url, obs] of m) m.set(url, { ...obs, ultimaExecucao: EXECUCAO_ATUAL })
          return m
        },
      },
    })
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 0)
    assert.equal(r.claimsComMorteSuspeita.length, 1)
  })

  it("veredito diferente do anterior não herda a confirmação", async () => {
    // A URL era `sem_substancia` e agora aparece `morta`. São defeitos
    // distintos: a morte é nova e ainda não foi confirmada por ninguém.
    const probes = { [url404]: "morta" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], probes, {
      apply: true,
      estado: estadoFake({ [url404]: "sem_substancia" }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 0)
    assert.equal(r.claimsComMorteSuspeita.length, 1)
  })

  it("sem memória disponível nada é confirmado, logo nada é despublicado", async () => {
    const d = deps([ponto({ id: "a", fontes: [{ url: url404 }] })], { [url404]: "morta" }, {
      apply: true,
      estado: estadoDesligado(),
    })
    const r = await runLinkCheck(d)

    assert.equal(r.despublicadas, 0)
    assert.equal(r.bloqueadasPorFaltaDeConfirmacao, 1)
    assert.ok(d.avisos.some((m) => m.includes("memoria de execucoes indisponivel")))
  })

  it("sem_substancia também precisa de confirmação para virar defeito real", async () => {
    // A outra metade do incidente de 03/08: agorarn.com.br, matéria viva de
    // 4844 caracteres, lida como casca numa execução só.
    const probes = { [outra404]: "sem_substancia" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: outra404 }] })], probes, {
      estado: estadoFake(probes, { confirmar: [] }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteComConteudo.length, 1, "segue reportada")
    assert.equal(r.claimsSemFonteUtilizavel.length, 0, "mas não derruba o gate na primeira vez")
  })

  it("sem_caminho não precisa de confirmação: é defeito de formato, decidido sem rede", async () => {
    const nu = "https://g1.globo.com/"
    const probes = { [nu]: "sem_caminho" } as const
    const d = deps([ponto({ id: "a", fontes: [{ url: nu }] })], probes, {
      estado: estadoFake(probes, { confirmar: [] }).estado,
    })
    const r = await runLinkCheck(d)

    assert.equal(r.claimsSemFonteUtilizavel.length, 1, "vale na hora, não tem como ser artefato de bloqueio")
  })

  it("URL que voltou a responder é esquecida, e o defeito desta execução é registrado", async () => {
    const viva = "https://portal.stf.jus.br/processos/detalhe.asp?incidente=1"
    const probes = { [url404]: "morta", [viva]: "viva" } as const
    const fake = estadoFake(probes)
    const d = deps(
      [ponto({ id: "a", fontes: [{ url: url404 }] }), ponto({ id: "b", fontes: [{ url: viva }] })],
      probes,
      { estado: fake.estado },
    )
    await runLinkCheck(d)

    assert.deepEqual(fake.esquecidos, [viva], "ressuscitada limpa o histórico")
    assert.deepEqual(fake.registrados, [url404], "defeito desta execução fica gravado para a próxima confirmar")
  })

  it("indisponivel não é gravado nem esquecido: não é prova de vida nem de morte", async () => {
    const bloqueada = "https://www1.folha.uol.com.br/poder/materia.shtml"
    const probes = { [bloqueada]: "indisponivel" } as const
    const fake = estadoFake(probes)
    const d = deps([ponto({ id: "a", fontes: [{ url: bloqueada }] })], probes, { estado: fake.estado })
    await runLinkCheck(d)

    assert.deepEqual(fake.registrados, [])
    assert.deepEqual(fake.esquecidos, [])
  })
})
