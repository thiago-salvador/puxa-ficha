/**
 * Issue #130: a ingestão reinseria identidade que a curadoria já tinha
 * rejeitado.
 *
 * O caso fundador está datado: a `20260805134000` removeu as candidaturas
 * 2008/2020 do homônimo de `renato-gomes` às 13:40 de 05/08, e a ingestão das
 * 17:48 do MESMO dia as trouxe de volta, públicas. A `20260807185000` removeu
 * de novo, dois dias depois, e registrou a causa raiz como pendente.
 *
 * A causa é que a decisão vivia só onde nenhuma máquina lê: comentário de
 * migration, texto livre de `coleta_log.detalhe` e a própria remoção. Remoção
 * não deixa marca no lugar de onde a linha saiu.
 *
 * Estes testes fixam o contrato do registro que substitui essa prosa, e os três
 * casos de regressão que a issue nomeia.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  carregarBloqueios,
  criarIndiceDeBloqueio,
  parseIdentidadesBloqueadas,
  type IdentidadeBloqueada,
} from "../scripts/lib/identidade-bloqueada"

const RAIZ = process.cwd()

function indiceDe(entradas: Partial<IdentidadeBloqueada>[]) {
  return criarIndiceDeBloqueio(
    entradas.map((e) => ({
      slug: "x",
      motivo: "motivo de teste",
      decidido_em: "2026-08-08",
      migrations: ["teste.sql"],
      ...e,
    })) as IdentidadeBloqueada[],
  )
}

describe("identidade bloqueada: as duas formas de bloqueio", () => {
  it("bloqueio com SQ atinge só aquele SQ, não o ano inteiro", () => {
    // Este é o caso `juliana-brizola`: no MESMO ano de 2020 ela tem uma
    // candidatura verdadeira (Prefeitura de Porto Alegre, SQ 210001189949) e
    // uma do homônimo (vereadora em Ronda Alta, SQ 210001233500). Bloquear o
    // ano apagaria dado correto de uma pessoa real.
    const indice = indiceDe([{ slug: "juliana", sq_candidato: "210001233500", ano: 2020 }])

    assert.ok(indice.bloqueio({ slug: "juliana", sq: "210001233500", ano: 2020 }))
    assert.equal(indice.bloqueio({ slug: "juliana", sq: "210001189949", ano: 2020 }), null)
    assert.equal(indice.bloqueio({ slug: "juliana", sq: "210001233500", ano: 2016 }), null)
    assert.equal(indice.bloqueio({ slug: "outra", sq: "210001233500", ano: 2020 }), null)
  })

  it("bloqueio sem SQ atinge o par (slug, ano) inteiro", () => {
    // `renato-gomes` em 2008: a pós-condição da migration exige ZERO linha de
    // proveniência TSE, e o SQ de 2008 é sequencial por UF, então registrá-lo
    // daria falsa precisão.
    const indice = indiceDe([{ slug: "renato", ano: 2008 }])

    assert.ok(indice.bloqueio({ slug: "renato", sq: "qualquer", ano: 2008 }))
    assert.ok(indice.bloqueio({ slug: "renato", sq: null, ano: 2008 }))
    assert.equal(indice.bloqueio({ slug: "renato", sq: "qualquer", ano: 2012 }), null)
  })

  it("linha sem SQ escapa do bloqueio por SQ, de propósito", () => {
    // Não é frouxidão: a linha sem SQ pode ser a candidatura verdadeira do mesmo
    // ano. Quem quer bloquear o ano inteiro omite o `sq_candidato`.
    const indice = indiceDe([{ slug: "x", sq_candidato: "999", ano: 2020 }])
    assert.equal(indice.bloqueio({ slug: "x", sq: "", ano: 2020 }), null)
  })
})

describe("identidade bloqueada: fail-closed", () => {
  it("JSON inválido lança em vez de devolver lista vazia", () => {
    assert.throws(() => parseIdentidadesBloqueadas("{ nao json"), /JSON inválido/)
  })

  it("arquivo sem a lista `bloqueios` lança", () => {
    assert.throws(() => parseIdentidadesBloqueadas('{"outra":[]}'), /sem a lista/)
  })

  it("entrada sem motivo, sem migrations ou com data torta lança", () => {
    const base = { slug: "x", ano: 2020, motivo: "m", decidido_em: "2026-08-08", migrations: ["a.sql"] }
    const semCampo = (campo: string) => {
      const copia: Record<string, unknown> = { ...base }
      delete copia[campo]
      return JSON.stringify({ bloqueios: [copia] })
    }

    assert.throws(() => parseIdentidadesBloqueadas(semCampo("motivo")), /sem `motivo`/)
    assert.throws(() => parseIdentidadesBloqueadas(semCampo("migrations")), /sem `migrations`/)
    assert.throws(
      () => parseIdentidadesBloqueadas(JSON.stringify({ bloqueios: [{ ...base, decidido_em: "08/08/2026" }] })),
      /decidido_em fora de YYYY-MM-DD/,
    )
  })

  it("entrada sem SQ e sem ano lança, porque bloquearia o candidato inteiro", () => {
    // O custo do engano aqui é apagar a ficha de uma pessoa real por inteiro,
    // em toda fonte, para sempre. Nenhuma decisão de curadoria diz isso.
    const bruto = JSON.stringify({
      bloqueios: [{ slug: "x", motivo: "m", decidido_em: "2026-08-08", migrations: ["a.sql"] }],
    })
    assert.throws(() => parseIdentidadesBloqueadas(bruto), /bloquearia o candidato inteiro/)
  })

  it("SQ não numérico lança", () => {
    const bruto = JSON.stringify({
      bloqueios: [
        { slug: "x", sq_candidato: "12A45", motivo: "m", decidido_em: "2026-08-08", migrations: ["a.sql"] },
      ],
    })
    assert.throws(() => parseIdentidadesBloqueadas(bruto), /sq_candidato não numérico/)
  })
})

describe("identidade bloqueada: o registro real do repositório", () => {
  const indice = carregarBloqueios(RAIZ)

  it("os três casos de regressão da issue #130 estão cobertos", () => {
    // renato-gomes: candidaturas 2008 e 2020 não podem voltar.
    assert.ok(
      indice.bloqueio({ slug: "renato-gomes", sq: "120000886590", ano: 2020 }),
      "o SQ 120000886590 do homônimo de 2020 precisa estar bloqueado",
    )
    assert.ok(
      indice.bloqueio({ slug: "renato-gomes", sq: "", ano: 2008 }),
      "2008 é bloqueio por ano: a migration exige zero linha TSE para o slug",
    )

    // jarbas-soares: patrimônios 2008 e 2020, removidos por 20260807184000.
    assert.ok(indice.bloqueio({ slug: "jarbas-soares", sq: "47351", ano: 2008 }))
    assert.ok(indice.bloqueio({ slug: "jarbas-soares", sq: "130000743230", ano: 2020 }))

    // cadu-xavier: 2020 segue corretamente fora da ficha.
    assert.ok(indice.bloqueio({ slug: "cadu-xavier", sq: "200000998862", ano: 2020 }))
  })

  it("não bloqueia a candidatura verdadeira de juliana-brizola em 2020", () => {
    // Regressão que este registro poderia introduzir: a prefeitura de Porto
    // Alegre é dela e tem de continuar entrando.
    assert.equal(
      indice.bloqueio({ slug: "juliana-brizola", sq: "210001189949", ano: 2020 }),
      null,
      "SQ 210001189949 é a candidatura correta e não pode ser bloqueada",
    )
    assert.ok(indice.bloqueio({ slug: "juliana-brizola", sq: "210001233500", ano: 2020 }))
  })

  it("toda entrada aponta para migration que existe no repositório", () => {
    // Sem isto, o registro vira afirmação sobre uma decisão que ninguém
    // consegue mais ler, que é o estado de onde a #130 partiu.
    for (const bloqueio of indice.todos) {
      for (const migration of bloqueio.migrations) {
        assert.ok(
          existsSync(join(RAIZ, "supabase", "migrations", migration)),
          `${bloqueio.slug}: a migration ${migration} não existe`,
        )
      }
    }
  })

  it("nenhum SQ bloqueado sobrevive no seed", () => {
    // O degrau de SQ é o de MAIOR prioridade do resolver: se ele ancorar, CPF e
    // nome nem são consultados. Um SQ bloqueado de volta ao seed reabre o
    // caminho exato da reincidência de 05/08, então isto é gate, não conferência.
    const seed = JSON.parse(readFileSync(join(RAIZ, "data", "candidatos.json"), "utf-8")) as {
      slug: string
      ids?: { tse_sq_candidato?: Record<string, string> | null }
    }[]
    assert.ok(Array.isArray(seed) && seed.length > 0, "o seed precisa ser uma lista não vazia")
    const porSlug = new Map(seed.map((c) => [c.slug, c]))

    for (const bloqueio of indice.todos) {
      if (!bloqueio.sq_candidato) continue
      const candidato = porSlug.get(bloqueio.slug)
      if (!candidato) continue
      const sqs: [string, string][] = Object.entries(candidato.ids?.tse_sq_candidato ?? {})
      for (const [ano, sq] of sqs) {
        const colide: boolean =
          sq.trim() === bloqueio.sq_candidato &&
          (bloqueio.ano === undefined || Number(ano) === bloqueio.ano)
        assert.ok(
          !colide,
          `${bloqueio.slug}: o SQ ${bloqueio.sq_candidato} está bloqueado e voltou ao seed em ${ano}`,
        )
      }
    }
  })
})

describe("identidade bloqueada: a ingestão consulta o registro", () => {
  const resolver = readFileSync(join(RAIZ, "scripts/lib/tse-resolver.ts"), "utf-8")
  const ingestTse = readFileSync(join(RAIZ, "scripts/lib/ingest-tse.ts"), "utf-8")

  it("o índice de SQ do resolver não aceita SQ bloqueado, nem vindo do seed", () => {
    const inicio = resolver.indexOf("const sqToCandidato")
    const fim = resolver.indexOf("const { data, error }", inicio)
    const bloco = resolver.slice(inicio, fim)

    assert.match(
      bloco,
      /bloqueios\.bloqueio\(/,
      "o laço que monta o índice de SQ precisa consultar o registro de bloqueio",
    )
  })

  it("resolveRow recusa a linha bloqueada depois dos degraus de CPF e nome", () => {
    const inicio = resolver.indexOf("resolveRow(row) {")
    assert.notEqual(inicio, -1, "resolveRow precisa existir")
    const bloco = resolver.slice(inicio, inicio + 1200)

    assert.match(bloco, /bloqueios\.bloqueio\(/, "o filtro precisa rodar em resolveRow")
    const posFiltro = bloco.indexOf("bloqueios.bloqueio(")
    const posContagem = bloco.indexOf("contabilizar(")
    assert.ok(
      posFiltro < posContagem,
      "o filtro tem de vir antes da contagem, senão a linha recusada aparece também como resolvida",
    )
  })

  it("o laço que lê o seed direto em ingest-tse também filtra", () => {
    // Ele não passa por `resolveRow`, então o filtro do resolver não o alcança.
    // Sem esta checagem, patrimônio e financiamento continuariam sendo colhidos
    // pelo SQ que a curadoria rejeitou, mesmo com o histórico parado.
    const inicio = ingestTse.indexOf("const bloqueios = carregarBloqueios()")
    assert.notEqual(inicio, -1, "buildSQMap precisa carregar o registro")
    const bloco = ingestTse.slice(inicio, inicio + 900)
    assert.match(bloco, /bloqueios\.bloqueio\(\{\s*slug:\s*candidato\.slug/)
  })
})
