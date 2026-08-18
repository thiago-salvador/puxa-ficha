import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  COLUNAS_DA_TRILHA,
  MIGRATION_DA_TRILHA,
  MOTIVO_MINIMO,
  PREFIXO_FONTE,
  __escreverAuditadoComSumidouro,
  desfechoDaEscrita,
  escreverAuditado,
  identificarExecucao,
  memoizarPreflight,
  montarLinhaEscrita,
  validarContexto,
  verificarTrilhaGravavel,
  type ContextoEscrita,
  type LinhaEscritaAuditada,
  type RespostaDeEscrita,
  type SondaDeTrilha,
} from "../scripts/lib/escrita-auditada"

/**
 * A regra que este arquivo protege: uma escrita de operador nunca acontece sem
 * deixar as cinco informações, e FALHA deixa rastro igual. Trilha que só existe
 * no caminho feliz mente por omissão, e a omissão é pior que o silêncio: um
 * `--apply` que quebrou na metade fica indistinguível de um que nunca rodou.
 */

const ctx: ContextoEscrita = {
  script: "normalizar-marcadores-publicos",
  tabela: "candidatos",
  motivo: "normaliza marcador TSE residual, issue #131 caso 1",
  recorte: "18 candidatos publicáveis",
}

function sumidouro() {
  const linhas: LinhaEscritaAuditada[] = []
  return {
    linhas,
    gravar: async (linha: LinhaEscritaAuditada) => {
      linhas.push(linha)
    },
  }
}

/** Reprodução em TS da constraint `coleta_log_volume_coerente`. */
function respeitaConstraintDeVolume(linha: LinhaEscritaAuditada): boolean {
  switch (linha.resultado) {
    case "encontrado":
      return linha.volume > 0
    case "vazio_confirmado":
    case "sem_achado_no_escopo":
    case "nao_aplicavel":
    case "indeterminado":
      return linha.volume === 0
    default:
      return true
  }
}

describe("motivo ruim bloqueia a escrita, não vira linha ruim", () => {
  it("rejeita campo vazio", () => {
    assert.throws(() => validarContexto({ ...ctx, tabela: "  " }), /campo obrigatório vazio: tabela/)
  })

  it(`rejeita motivo com menos de ${MOTIVO_MINIMO} caracteres`, () => {
    assert.throws(() => validarContexto({ ...ctx, motivo: "fix" }), /mínimo 12/)
  })

  it("a porta pública valida ANTES de escrever", async () => {
    let chamou = false
    await assert.rejects(
      escreverAuditado({ ...ctx, motivo: "fix" }, async () => {
        chamou = true
        return { data: [], error: null }
      }),
      /motivo com 3 caracteres/,
    )
    assert.equal(chamou, false, "contexto inválido não pode chegar a tocar o banco")
  })
})

describe("desfechoDaEscrita fica dentro do vocabulário que a tabela aceita", () => {
  it("mapeia os quatro desfechos", () => {
    assert.deepEqual(desfechoDaEscrita(12, false), { resultado: "encontrado", volume: 12 })
    assert.deepEqual(desfechoDaEscrita(0, false), { resultado: "sem_achado_no_escopo", volume: 0 })
    assert.deepEqual(desfechoDaEscrita(null, false), { resultado: "indeterminado", volume: 0 })
    assert.deepEqual(desfechoDaEscrita(3, true), { resultado: "erro", volume: 3 })
  })

  it("nenhum deles viola coleta_log_volume_coerente", () => {
    for (const [n, falhou] of [
      [12, false],
      [0, false],
      [null, false],
      [3, true],
      [0, true],
    ] as const) {
      const linha = montarLinhaEscrita(ctx, desfechoDaEscrita(n, falhou), 10)
      assert.ok(
        respeitaConstraintDeVolume(linha),
        `${linha.resultado}/${linha.volume} seria rejeitado pelo banco, e a trilha sumiria`,
      )
    }
  })
})

describe("a linha carrega as cinco informações exigidas", () => {
  const linha = montarLinhaEscrita(ctx, desfechoDaEscrita(18, false), 1234, {
    execucao: "gh:42@thiago-salvador",
  })

  it("quem executou: script na fonte, rodada e ator na execucao", () => {
    assert.equal(linha.fonte, `${PREFIXO_FONTE}normalizar-marcadores-publicos`)
    assert.equal(linha.execucao, "gh:42@thiago-salvador")
  })

  it("por que: o motivo abre o detalhe, e o recorte vai junto", () => {
    assert.match(linha.detalhe, /^normaliza marcador TSE residual, issue #131 caso 1/)
    assert.match(linha.detalhe, /recorte: 18 candidatos publicáveis/)
  })

  it("qual alvo: a tabela escrita", () => {
    assert.equal(linha.alvo, "candidatos")
    assert.equal(linha.escopo, "global")
  })

  it("quantas linhas: o volume contado", () => {
    assert.equal(linha.volume, 18)
    assert.equal(linha.resultado, "encontrado")
  })

  it("quando: duração medida, e executado_em fica com o default now() da tabela", () => {
    assert.equal(linha.duracao_ms, 1234)
    assert.ok(!("executado_em" in linha), "o instante é do banco, não do relógio do script")
  })

  it("natureza escrita, que é o que mantém a linha fora de coleta_log_ultima", () => {
    assert.equal(linha.natureza, "escrita")
  })

  it("identificarExecucao distingue CI de máquina local", () => {
    assert.equal(identificarExecucao({ GITHUB_RUN_ID: "9", GITHUB_ACTOR: "ci" }, 1), "gh:9@ci")
    assert.equal(identificarExecucao({ USER: "thiago" }, 4321), "local:4321@thiago")
    assert.equal(identificarExecucao({}, 7), "local:7@desconhecido")
  })

  it("detalhe é truncado, para texto de erro enorme não derrubar o insert", () => {
    const gigante = montarLinhaEscrita(ctx, desfechoDaEscrita(1, true), 0, {
      erro: "x".repeat(5000),
    })
    assert.equal(gigante.detalhe.length, 500)
  })
})

describe("a contagem é pós-escrita, não estimativa", () => {
  it("300 linhas enviadas e 12 confirmadas gravam 12", async () => {
    const trilha = sumidouro()
    const enviadas = Array.from({ length: 300 }, (_, i) => ({ id: `id-${i}` }))

    const devolvidas = await __escreverAuditadoComSumidouro(
      ctx,
      async () => ({ data: enviadas.slice(0, 12), error: null }),
      trilha.gravar,
    )

    assert.equal(devolvidas.length, 12)
    assert.equal(trilha.linhas.length, 1)
    assert.equal(
      trilha.linhas[0].volume,
      12,
      "payload de 300 com WHERE que casa 12 é o caso que torna estimativa mentira",
    )
  })

  it("zero linhas afetadas não vira erro nem some da trilha", async () => {
    const trilha = sumidouro()
    await __escreverAuditadoComSumidouro(ctx, async () => ({ data: [], error: null }), trilha.gravar)

    assert.equal(trilha.linhas[0].resultado, "sem_achado_no_escopo")
    assert.equal(trilha.linhas[0].volume, 0)
  })

  it("escrita aceita sem .select() vira indeterminado, não zero", async () => {
    const trilha = sumidouro()
    await __escreverAuditadoComSumidouro(
      ctx,
      async () => ({ data: null, error: null }) as RespostaDeEscrita<{ id: string }>,
      trilha.gravar,
    )

    assert.equal(
      trilha.linhas[0].resultado,
      "indeterminado",
      "houve escrita e não há contagem; dizer zero seria inventar",
    )
  })
})

describe("falha deixa rastro", () => {
  it("erro do PostgREST grava trilha de erro e propaga", async () => {
    const trilha = sumidouro()

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: null, error: { message: "violates check constraint" } }),
        trilha.gravar,
      ),
      /falha ao escrever em candidatos/,
    )

    assert.equal(trilha.linhas.length, 1, "a trilha existe mesmo com a escrita abortada")
    assert.equal(trilha.linhas[0].resultado, "erro")
    assert.match(trilha.linhas[0].detalhe, /erro: violates check constraint/)
    assert.match(trilha.linhas[0].detalhe, /^normaliza marcador TSE residual/)
  })

  it("exceção lançada pelo callback grava trilha e sobe intacta", async () => {
    const trilha = sumidouro()
    const original = new Error("socket hang up")

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => {
          throw original
        },
        trilha.gravar,
      ),
      (err: unknown) => err === original,
    )

    assert.equal(trilha.linhas[0].resultado, "erro")
    assert.match(trilha.linhas[0].detalhe, /erro: socket hang up/)
  })

  it("escrita parcial antes do erro registra o volume que já foi tocado", async () => {
    const trilha = sumidouro()
    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: [{ id: "a" }, { id: "b" }], error: { message: "timeout" } }),
        trilha.gravar,
      ),
    )
    assert.equal(trilha.linhas[0].volume, 2)
    assert.equal(trilha.linhas[0].resultado, "erro")
  })

  it("trilha que não pôde ser gravada derruba o processo, ao contrário de coleta-log", async () => {
    await assert.rejects(
      __escreverAuditadoComSumidouro(ctx, async () => ({ data: [{ id: "a" }], error: null }), async () => {
        throw new Error("insert em coleta_log recusado")
      }),
      /insert em coleta_log recusado/,
    )
  })

  it("trilha que falha EM CIMA de escrita falha não apaga o erro de domínio", async () => {
    // Se a rejeição da trilha substituísse a original, o operador perderia a
    // única informação que importa ali: por que a escrita de produção falhou. A
    // mensagem da trilha carrega alvo, resultado e volume, e nenhum motivo.
    const trilhaQuebrada = async () => {
      throw new Error("coleta_log fora do ar")
    }

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: null, error: { message: "violates check constraint" } }),
        trilhaQuebrada,
      ),
      (err: unknown) => {
        const erro = err as Error
        assert.match(erro.message, /violates check constraint/, "o erro de domínio tem de sobreviver")
        // A falha da trilha não some: vem junto, como causa.
        assert.match((erro.cause as Error).message, /coleta_log fora do ar/)
        return true
      },
    )
  })

  it("exceção de domínio sobe intacta mesmo com a trilha do fracasso quebrada", async () => {
    const original = new Error("socket hang up")

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => {
          throw original
        },
        async () => {
          throw new Error("coleta_log fora do ar")
        },
      ),
      (err: unknown) => err === original,
    )
  })
})

// ---------------------------------------------------------------------------
// Preflight: a ordem entre verificar a trilha e escrever o domínio
// ---------------------------------------------------------------------------

/**
 * O bug que este bloco existe para impedir.
 *
 * A primeira versão do helper aplicava a escrita de domínio e SÓ DEPOIS gravava
 * a trilha, lançando se a trilha falhasse. Lançar depois não desfaz nada: as
 * duas escritas são requisições PostgREST independentes, sem transação em
 * volta, então a de domínio já commitou quando a segunda quebra. Dado dentro,
 * rastro fora: a issue #131 reproduzida pela correção da issue #131.
 *
 * Em 2026-08-08 isso não era hipótese. A migration que cria `coleta_log.natureza`
 * estava escrita e não aplicada, e a produção respondia, à leitura da coluna,
 * o `42703` reproduzido abaixo. Um script já migrado rodando com `--apply`
 * naquele estado teria mudado a tabela de domínio antes de descobrir que a
 * trilha era impossível.
 *
 * O teste que segura a regra é "preflight reprovado não deixa a escrita de
 * domínio ser tentada": ele observa a função `aplicar`, e se alguém devolver a
 * ordem antiga (`aplicar` antes do preflight) a flag vira `true` e o teste
 * quebra. Um teste que só conferisse a mensagem de erro passaria nos dois
 * mundos e não protegeria nada.
 */

/** Resposta exata da produção em 2026-08-08 a `select natureza from coleta_log`. */
const ERRO_COLUNA_AUSENTE = { message: "column coleta_log.natureza does not exist" }

const sondaQueReprova: SondaDeTrilha = async () => ({ error: ERRO_COLUNA_AUSENTE })
const sondaQueAprova: SondaDeTrilha = async () => ({ error: null })

describe("preflight reprovado impede qualquer escrita de domínio", () => {
  it("a função aplicar NÃO é chamada, e nenhuma trilha é gravada", async () => {
    const trilha = sumidouro()
    let aplicarFoiChamada = false

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => {
          aplicarFoiChamada = true
          return { data: [{ id: "a" }], error: null }
        },
        trilha.gravar,
        () => verificarTrilhaGravavel(sondaQueReprova),
      ),
      /preflight REPROVOU/,
    )

    assert.equal(
      aplicarFoiChamada,
      false,
      "com a trilha indisponível, a escrita de produção não pode nem ser tentada. " +
        "Esta linha é o teste inteiro: se o helper voltar a aplicar antes de verificar, " +
        "a flag vira true e a escrita já terá commitado quando o erro subir.",
    )
    assert.equal(trilha.linhas.length, 0, "não há trilha a gravar porque não houve escrita")
  })

  it("a mensagem diz o que fazer: aplicar a migration antes de rodar com --apply", async () => {
    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: [], error: null }),
        sumidouro().gravar,
        () => verificarTrilhaGravavel(sondaQueReprova),
      ),
      (err: unknown) => {
        const msg = (err as Error).message
        // Comparação literal, não regex. Montar um padrão a partir do nome do
        // arquivo escapando só `.` deixa `\` e os outros metacaracteres passarem,
        // e a asserção que deveria provar a mensagem passaria a depender de como
        // a constante é escrita. Aqui o que interessa é que o nome da migration
        // apareça, e `includes` responde isso sem intermediário.
        assert.ok(
          msg.includes(MIGRATION_DA_TRILHA),
          `a mensagem precisa nomear ${MIGRATION_DA_TRILHA}, veio: ${msg}`,
        )
        assert.match(msg, /--apply/)
        assert.match(msg, /column coleta_log\.natureza does not exist/)
        return true
      },
    )
  })

  it("não existe modo degradado: reprovar sempre lança, nunca devolve falso", async () => {
    await assert.rejects(verificarTrilhaGravavel(sondaQueReprova), /preflight REPROVOU/)
  })

  it("sonda que explode (rede, credencial) também reprova, em vez de passar batido", async () => {
    await assert.rejects(
      verificarTrilhaGravavel(async () => {
        throw new Error("fetch failed")
      }),
      /fetch failed/,
    )
  })
})

describe("preflight aprovado deixa o fluxo normal seguir", () => {
  it("escreve, conta e grava a trilha como antes", async () => {
    const trilha = sumidouro()
    const devolvidas = await __escreverAuditadoComSumidouro(
      ctx,
      async () => ({ data: [{ id: "a" }, { id: "b" }], error: null }),
      trilha.gravar,
      () => verificarTrilhaGravavel(sondaQueAprova),
    )

    assert.equal(devolvidas.length, 2)
    assert.equal(trilha.linhas.length, 1)
    assert.equal(trilha.linhas[0].resultado, "encontrado")
    assert.equal(trilha.linhas[0].volume, 2)
  })

  it("o preflight roda ANTES de aplicar, não em paralelo nem depois", async () => {
    const ordem: string[] = []
    await __escreverAuditadoComSumidouro(
      ctx,
      async () => {
        ordem.push("aplicar")
        return { data: [{ id: "a" }], error: null }
      },
      async () => {
        ordem.push("gravar")
      },
      async () => {
        ordem.push("preflight")
      },
    )

    assert.deepEqual(ordem, ["preflight", "aplicar", "gravar"])
  })

  it("com o preflight aprovado, escrita que falha continua gravando trilha de erro", async () => {
    const trilha = sumidouro()

    await assert.rejects(
      __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: [{ id: "a" }], error: { message: "deadlock detected" } }),
        trilha.gravar,
        () => verificarTrilhaGravavel(sondaQueAprova),
      ),
      /falha ao escrever em candidatos/,
    )

    assert.equal(trilha.linhas.length, 1, "o preflight não pode ter engolido a trilha de erro")
    assert.equal(trilha.linhas[0].resultado, "erro")
    assert.equal(trilha.linhas[0].volume, 1)
    assert.match(trilha.linhas[0].detalhe, /erro: deadlock detected/)
  })
})

describe("o preflight vale para a execução inteira", () => {
  it("uma sondagem só, mesmo com muitas escritas", async () => {
    let sondagens = 0
    const preflight = memoizarPreflight(() =>
      verificarTrilhaGravavel(async () => {
        sondagens += 1
        return { error: null }
      }),
    )
    const trilha = sumidouro()

    for (let i = 0; i < 50; i += 1) {
      await __escreverAuditadoComSumidouro(
        ctx,
        async () => ({ data: [{ id: `id-${i}` }], error: null }),
        trilha.gravar,
        preflight,
      )
    }

    assert.equal(trilha.linhas.length, 50)
    assert.equal(
      sondagens,
      1,
      "script que escreve milhares de linhas não paga um round-trip de preflight por linha",
    )
  })

  it("reprovação também fica em cache: fail-closed não vira loteria por tentativa", async () => {
    let sondagens = 0
    const preflight = memoizarPreflight(() =>
      verificarTrilhaGravavel(async () => {
        sondagens += 1
        return { error: ERRO_COLUNA_AUSENTE }
      }),
    )

    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(
        __escreverAuditadoComSumidouro(
          ctx,
          async () => {
            throw new Error("aplicar jamais deveria rodar aqui")
          },
          sumidouro().gravar,
          preflight,
        ),
        /preflight REPROVOU/,
      )
    }

    assert.equal(sondagens, 1, "a segunda tentativa não pode reabrir a porta que a primeira fechou")
  })
})

describe("a sonda cobre as colunas que o insert realmente usa", () => {
  it("COLUNAS_DA_TRILHA é exatamente o payload de montarLinhaEscrita", () => {
    const linha = montarLinhaEscrita(ctx, desfechoDaEscrita(1, false), 0)
    assert.deepEqual(
      [...COLUNAS_DA_TRILHA].sort(),
      Object.keys(linha).sort(),
      "coluna nova no payload sem entrar na sonda é coluna que o preflight não verifica",
    )
  })

  it("inclui natureza, que é a coluna que a migration pendente cria", () => {
    assert.ok(COLUNAS_DA_TRILHA.includes("natureza"))
  })
})

describe("a migration que sustenta o helper", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260808120000_coleta_log_natureza_escrita.sql"),
    "utf8",
  )

  it("cria a coluna natureza com default coleta e CHECK", () => {
    assert.match(sql, /add column if not exists natureza text not null default 'coleta'/)
    assert.match(sql, /check \(natureza in \('coleta', 'escrita'\)\)/)
  })

  it("recria coleta_log_ultima filtrando natureza = coleta", () => {
    assert.match(sql, /create or replace view public\.coleta_log_ultima/)
    assert.match(
      sql,
      /where natureza = 'coleta'/,
      "sem o filtro, uma linha de ESCRITA mais recente venceria o distinct on e viraria procedência servida em src/lib/api.ts",
    )
    assert.match(sql, /security_invoker = true/)
  })

  it("os valores que o helper grava cabem no CHECK da coluna", () => {
    const linha = montarLinhaEscrita(ctx, desfechoDaEscrita(1, false), 0)
    assert.ok(sql.includes(`'${linha.natureza}'`))
  })
})
