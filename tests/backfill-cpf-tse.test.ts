import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ANOS_VARRIDOS,
  baixarArquivo,
  carregarPaginado,
  chaveNomeNascimento,
  converterDataBR,
  decidirCpfDoCandidato,
  montarMapaNomeNascimento,
  montarMapaSq,
  montarMapaSqDosAlvos,
  type AlvoBackfill,
  type HitCpf,
} from "../scripts/backfill-cpf-tse"

function hit(overrides: Partial<HitCpf>): HitCpf {
  return {
    cpf: "52998224725",
    metodo: "sq",
    ano: 2022,
    uf: "SP",
    cargo: "DEPUTADO FEDERAL",
    sq: "250001234567",
    nomeCsv: "FULANO DE TAL",
    ...overrides,
  }
}

describe("converterDataBR", () => {
  it("converte DD/MM/YYYY para ISO", () => {
    assert.equal(converterDataBR("07/09/1959"), "1959-09-07")
    assert.equal(converterDataBR("1/2/1980"), "1980-02-01")
  })

  it("rejeita formato inválido, vazio e valores fora de faixa", () => {
    assert.equal(converterDataBR(""), "")
    assert.equal(converterDataBR("#NULO#"), "")
    assert.equal(converterDataBR("1959-09-07"), "")
    assert.equal(converterDataBR("32/01/1980"), "")
    assert.equal(converterDataBR("01/13/1980"), "")
  })
})

describe("chaveNomeNascimento", () => {
  it("normaliza acento e caixa, e exige as duas partes", () => {
    assert.equal(chaveNomeNascimento("José da Silva", "1960-01-02"), "JOSE DA SILVA|1960-01-02")
    assert.equal(chaveNomeNascimento("", "1960-01-02"), "")
    assert.equal(chaveNomeNascimento("José", ""), "")
  })
})

describe("decidirCpfDoCandidato", () => {
  it("sem hits: nenhum", () => {
    assert.deepEqual(decidirCpfDoCandidato([]), { decisao: "nenhum" })
  })

  it("rota sq única persiste, mesmo com vários anos concordando", () => {
    const decisao = decidirCpfDoCandidato([
      hit({ ano: 2022 }),
      hit({ ano: 2018, sq: "250009999999" }),
    ])
    assert.equal(decisao.decisao, "persistir")
    if (decisao.decisao === "persistir") {
      assert.equal(decisao.cpf, "52998224725")
      assert.equal(decisao.metodo, "sq")
      assert.equal(decisao.evidencias.length, 2)
    }
  })

  it("rota sq com CPFs distintos entre anos é conflito", () => {
    const decisao = decidirCpfDoCandidato([
      hit({ ano: 2022, cpf: "52998224725" }),
      hit({ ano: 2018, cpf: "15350946056" }),
    ])
    assert.equal(decisao.decisao, "conflito")
  })

  it("sq e nome-nascimento divergindo é conflito, não escolha", () => {
    const decisao = decidirCpfDoCandidato([
      hit({ metodo: "sq", cpf: "52998224725" }),
      hit({ metodo: "nome-nascimento", cpf: "15350946056" }),
    ])
    assert.equal(decisao.decisao, "conflito")
  })

  it("sq com nome-nascimento concordando persiste via sq", () => {
    const decisao = decidirCpfDoCandidato([
      hit({ metodo: "sq", cpf: "52998224725" }),
      hit({ metodo: "nome-nascimento", cpf: "52998224725", ano: 2014 }),
    ])
    assert.equal(decisao.decisao, "persistir")
    if (decisao.decisao === "persistir") assert.equal(decisao.metodo, "sq")
  })

  it("só nome-nascimento NUNCA persiste: vira revisão humana (caso jarbas-soares)", () => {
    // Regressão do incidente de 2026-08-05: a data de nascimento do banco pode
    // ter vindo do mesmo casamento por nome que a rota estaria confirmando
    // (validação circular). Sem SQ, o CPF é sugestão para humano, não escrita.
    const decisao = decidirCpfDoCandidato([
      hit({ metodo: "nome-nascimento", cpf: "15350946056", ano: 2014 }),
      hit({ metodo: "nome-nascimento", cpf: "15350946056", ano: 2010 }),
    ])
    assert.equal(decisao.decisao, "revisao")
    if (decisao.decisao === "revisao") {
      assert.equal(decisao.evidencias.length, 2)
    }
  })

  it("homônimo com mesma data de nascimento (CPFs distintos) é conflito", () => {
    const decisao = decidirCpfDoCandidato([
      hit({ metodo: "nome-nascimento", cpf: "52998224725" }),
      hit({ metodo: "nome-nascimento", cpf: "15350946056" }),
    ])
    assert.equal(decisao.decisao, "conflito")
  })
})

describe("montarMapaNomeNascimento", () => {
  const alvo = (slug: string, nome: string, nasc: string | null): AlvoBackfill => ({
    slug,
    nome_completo: nome,
    data_nascimento: nasc,
    estado: null,
  })

  it("indexa quem tem nome e nascimento, ignora quem não tem", () => {
    const { mapa, colididos } = montarMapaNomeNascimento([
      alvo("a", "Ana Souza", "1980-01-01"),
      alvo("b", "Beto Lima", null),
    ])
    assert.equal(mapa.size, 1)
    assert.equal(mapa.get("ANA SOUZA|1980-01-01"), "a")
    assert.deepEqual(colididos, [])
  })

  it("colisão interna derruba os dois lados da chave", () => {
    const { mapa, colididos } = montarMapaNomeNascimento([
      alvo("a", "Ana Souza", "1980-01-01"),
      alvo("b", "ANA SOUZA", "1980-01-01"),
      alvo("c", "Caio Melo", "1990-05-05"),
    ])
    assert.equal(mapa.size, 1)
    assert.equal(mapa.get("CAIO MELO|1990-05-05"), "c")
    assert.deepEqual(colididos, ["a", "b"])
  })
})

describe("montarMapaSq: a rota que escreve no banco também derruba colisão", () => {
  function seed(slug: string, porAno: Record<string, string>) {
    return { slug, ids: { tse_sq_candidato: porAno } }
  }

  it("indexa por ano e ignora pleito fora de ANOS_VARRIDOS", () => {
    const { mapa, colididos } = montarMapaSq([
      seed("a", { "2022": "250001234567", "2008": "999" }),
      seed("b", { "2026": "260009999999" }),
    ])
    assert.equal(mapa.get("2022|250001234567"), "a")
    assert.equal(mapa.get("2026|260009999999"), "b")
    // 2008 não entra: até lá o SQ é sequencial por UF.
    assert.equal(mapa.has("2008|999"), false)
    assert.deepEqual(colididos, [])
  })

  it("mesmo SQ no mesmo ano para dois alvos derruba os dois lados", () => {
    // Antes do guard, o segundo `set` sobrescrevia o primeiro: "a" perdia a
    // única rota que persiste e "b" herdava um CPF resolvido por um SQ que o
    // seed atribui a outra pessoa.
    const { mapa, colididos } = montarMapaSq([
      seed("a", { "2022": "250001234567" }),
      seed("b", { "2022": "250001234567" }),
      seed("c", { "2022": "250007654321" }),
    ])
    assert.equal(mapa.has("2022|250001234567"), false)
    assert.equal(mapa.get("2022|250007654321"), "c")
    assert.deepEqual(colididos, ["a", "b"])
  })

  it("SQ igual em anos diferentes não é colisão", () => {
    const { mapa, colididos } = montarMapaSq([
      seed("a", { "2022": "250001234567" }),
      seed("b", { "2018": "250001234567" }),
    ])
    assert.equal(mapa.get("2022|250001234567"), "a")
    assert.equal(mapa.get("2018|250001234567"), "b")
    assert.deepEqual(colididos, [])
  })

  it("o mesmo alvo repetindo o próprio SQ não se auto-derruba", () => {
    const { mapa, colididos } = montarMapaSq([
      seed("a", { "2022": "250001234567" }),
      seed("a", { "2022": " 250001234567 " }),
    ])
    assert.equal(mapa.get("2022|250001234567"), "a")
    assert.deepEqual(colididos, [])
  })

  it("SQ vazio é ignorado, não vira chave", () => {
    const { mapa } = montarMapaSq([seed("a", { "2022": "" })])
    assert.equal(mapa.size, 0)
  })
})

describe("montarMapaSqDosAlvos: colisões são globais e invalidam a rota inteira", () => {
  function seed(slug: string, porAno: Record<string, string>) {
    return { slug, ids: { tse_sq_candidato: porAno } }
  }

  it("detecta colisão do alvo com candidato fora do backfill", () => {
    const { mapa, colididos } = montarMapaSqDosAlvos(
      [
        seed("alvo-sem-cpf", { "2022": "250001234567" }),
        seed("fora-do-alvo-com-cpf", { "2022": "250001234567" }),
      ],
      new Set(["alvo-sem-cpf"]),
    )

    assert.equal(mapa.size, 0)
    assert.deepEqual(colididos, ["alvo-sem-cpf"])
  })

  it("remove também outro SQ único de um alvo que colidiu", () => {
    const { mapa, colididos } = montarMapaSqDosAlvos(
      [
        seed("alvo", { "2022": "250001234567", "2018": "250009999999" }),
        seed("outro", { "2022": "250001234567" }),
      ],
      new Set(["alvo"]),
    )

    assert.equal(mapa.has("2018|250009999999"), false)
    assert.equal(mapa.size, 0)
    assert.deepEqual(colididos, ["alvo"])
  })
})

describe("carregarPaginado: o PostgREST corta em 1000 e o script não pode acreditar", () => {
  it("segue paginando enquanto a página vier cheia", async () => {
    const universo = Array.from({ length: 2350 }, (_, i) => ({ slug: `cand-${i}` }))
    const faixas: Array<[number, number]> = []
    const linhas = await carregarPaginado<{ slug: string }>(async (de, ate) => {
      faixas.push([de, ate])
      return { data: universo.slice(de, ate + 1), error: null }
    }, "candidatos")

    assert.equal(linhas.length, 2350)
    assert.equal(linhas[2349].slug, "cand-2349")
    // Três chamadas: 1000, 1000 e a página curta que encerra o laço.
    assert.deepEqual(faixas, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it("página exatamente cheia pede a seguinte antes de parar", async () => {
    const universo = Array.from({ length: 1000 }, (_, i) => ({ slug: `cand-${i}` }))
    let chamadas = 0
    const linhas = await carregarPaginado<{ slug: string }>(async (de, ate) => {
      chamadas++
      return { data: universo.slice(de, ate + 1), error: null }
    }, "candidatos")

    assert.equal(linhas.length, 1000)
    assert.equal(chamadas, 2)
  })

  it("erro do banco sobe com o rótulo da consulta", async () => {
    await assert.rejects(
      () => carregarPaginado(async () => ({ data: null, error: { message: "permission denied" } }), "candidatos"),
      /candidatos: permission denied/,
    )
  })
})

describe("baixarArquivo: nada de descritor aberto nem cache envenenado", () => {
  function comDiretorioTemporario(fn: (dir: string) => Promise<void>) {
    return async () => {
      const dir = mkdtempSync(join(tmpdir(), "backfill-cpf-"))
      try {
        await fn(dir)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }

  it(
    "resposta sem corpo não deixa arquivo de zero byte para trás",
    comDiretorioTemporario(async (dir) => {
      const destino = join(dir, "consulta_cand_2026.zip")
      const fetchFake = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch

      const ok = await baixarArquivo("https://exemplo/consulta.zip", destino, fetchFake)

      assert.equal(ok, false)
      // O arquivo vazio sobrevivente virava cache hit e quebrava extrairZip.
      assert.equal(existsSync(destino), false)
    }),
  )

  it(
    "corpo que estoura no meio não deixa parcial cacheado",
    comDiretorioTemporario(async (dir) => {
      const destino = join(dir, "consulta_cand_2024.zip")
      const corpo = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.error(new Error("conexão caiu"))
        },
      })
      const fetchFake = (async () => new Response(corpo, { status: 200 })) as unknown as typeof fetch

      const ok = await baixarArquivo("https://exemplo/consulta.zip", destino, fetchFake)

      assert.equal(ok, false)
      assert.equal(existsSync(destino), false)
    }),
  )

  it(
    "download completo grava o arquivo e passa signal com prazo",
    comDiretorioTemporario(async (dir) => {
      const destino = join(dir, "consulta_cand_2022.zip")
      let signalRecebido: AbortSignal | null | undefined
      const fetchFake = (async (_url: string, init?: RequestInit) => {
        signalRecebido = init?.signal
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
      }) as unknown as typeof fetch

      const ok = await baixarArquivo("https://exemplo/consulta.zip", destino, fetchFake)

      assert.equal(ok, true)
      assert.equal(existsSync(destino), true)
      // Sem prazo, uma conexão parada segurava a varredura inteira.
      assert.ok(signalRecebido instanceof AbortSignal)
    }),
  )

  it(
    "HTTP de erro não cria arquivo nenhum",
    comDiretorioTemporario(async (dir) => {
      const destino = join(dir, "consulta_cand_2020.zip")
      const fetchFake = (async () => new Response("nao encontrado", { status: 404 })) as unknown as typeof fetch

      assert.equal(await baixarArquivo("https://exemplo/consulta.zip", destino, fetchFake), false)
      assert.equal(existsSync(destino), false)
    }),
  )
})

describe("ANOS_VARRIDOS", () => {
  it("não desce de 2010: até 2008 o SQ é sequencial por UF e colide", () => {
    assert.ok(Math.min(...ANOS_VARRIDOS) >= 2010)
    assert.ok(ANOS_VARRIDOS.includes(2026))
  })
})

describe("identidades invalidadas por homônimo", () => {
  const candidatos = JSON.parse(readFileSync("data/candidatos.json", "utf-8")) as Array<{
    slug: string
    ids?: { tse_sq_candidato?: Record<string, string> }
  }>

  for (const slug of ["cadu-xavier", "jarbas-soares", "renato-gomes"]) {
    it(`${slug} não expõe SQ ao backfill automático`, () => {
      const candidato = candidatos.find((item) => item.slug === slug)
      assert.ok(candidato, `candidato ausente no seed: ${slug}`)
      assert.deepEqual(candidato.ids?.tse_sq_candidato ?? {}, {})
    })
  }
})

describe("backfill-cpf-tse: garantias que só se leem na fonte", () => {
  const fonte = readFileSync("scripts/backfill-cpf-tse.ts", "utf-8")

  it("a auditoria com CPF nasce 0600 e reaplica o modo em arquivo existente", () => {
    // O `mode` do writeFileSync só vale na criação; sem o chmod, a permissão
    // antiga sobrevive em toda re-execução.
    assert.match(fonte, /writeFileSync\(AUDIT_PATH,[\s\S]{0,80}\{ mode: 0o600 \}\)/)
    assert.match(fonte, /chmodSync\(AUDIT_PATH, 0o600\)/)
  })

  it("o entrypoint usa pathToFileURL, não template file://", () => {
    // Caminho com espaço ou acento quebra a comparação do template e o script
    // sai sem rodar main, sem imprimir nada.
    assert.match(fonte, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/)
    assert.doesNotMatch(fonte, /`file:\/\/\$\{process\.argv\[1\]\}`/)
  })

  it("o zip que extrai sem consulta_cand não fica de cache", () => {
    const trecho = fonte.slice(fonte.indexOf("Nenhum CSV em"), fonte.indexOf("Nenhum CSV em") + 400)
    assert.match(trecho, /rmSync\(zipPath, \{ force: true \}\)/)
  })

  it("as duas consultas de alvos paginam e filtram cpf nulo no banco", () => {
    assert.match(fonte, /carregarPaginado[\s\S]{0,200}candidatos_publico/)
    assert.match(fonte, /\.is\("cpf", null\)/)
  })
})
