import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import { escritasSemAnotacao, violacoesDeAllowlist } from "../scripts/audit/check-migrations-allowlist"

/**
 * Migration do re-run de patrimonio 2026: aplica o que o TSE publicou depois do
 * snapshot de 04/08 que a 20260807183000 congelou.
 *
 * ## O que este arquivo NAO prova, e onde a prova mora
 *
 * Asserção sobre TEXTO de SQL nao julga comportamento de guard: guard que nunca
 * dispara passa em qualquer regex. A prova de comportamento e
 * `scripts/audit/provar-migration-patrimonio-rerun.sh`, que roda os nove ramos
 * da forward e do rollback contra Postgres 17 de verdade, com contagem antes e
 * depois. O que sobra aqui e o que nao precisa de banco: a cardinalidade das 21
 * operacoes, a anotacao `@write` em cada uma, o casamento com a allowlist, os
 * invariantes de conteudo (as linhas fora do delta intactas, o total
 * da priscila-voigt inalterado), e a existencia do harness.
 */

const ARQUIVO = "20260810093000_rerun_patrimonio_2026_tse_publicou.sql"
const REPO = join(import.meta.dirname, "..")
const SQL = readFileSync(join(REPO, "supabase/migrations", ARQUIVO), "utf8")
const ROLLBACK = readFileSync(
  join(REPO, "supabase/rollback", ARQUIVO.replace(/\.sql$/, ".rollback.sql")),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(join(REPO, "scripts/audit/allowlist-patrimonio-rerun-20260810.json"), "utf8"),
)
const HARNESS = readFileSync(join(REPO, "scripts/audit/provar-migration-patrimonio-rerun.sh"), "utf8")
const READBACK = readFileSync(join(REPO, "scripts/audit/readback-patrimonio-rerun.ts"), "utf8")
const READBACK_GLOBAL = readFileSync(
  join(REPO, "scripts/audit/readback-patrimonio-eleicoes.ts"),
  "utf8",
)
const DELTA = JSON.parse(
  readFileSync(
    join(
      REPO,
      "QA/evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json",
    ),
    "utf8",
  ),
)
const CANDIDATOS = JSON.parse(readFileSync(join(REPO, "data/candidatos.json"), "utf8")) as Array<{
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string> }
}>

/** As 10 fichas com bens no pacote atual. */
const PUBLICOU = [
  "andre-marinho",
  "cleber-rabelo",
  "efraim-filho",
  "geraldo-carvalho",
  "ivan-moraes",
  "joao-campos",
  "joel-rodrigues",
  "raquel-lyra",
  "jose-estevao",
  "samara-mineiro",
] as const

const SEM_EVIDENCIA = ["dr-luisinho", "preta-lu"] as const
const AUSENCIA_REMOVIDA_EM = new Map([
  ["dr-luisinho", "20260831215407"],
  ["preta-lu", "20260810093000"],
] as const)

function escaparRegExp(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
const REMOVER_AUSENCIA = [...PUBLICOU.slice(0, 8), ...SEM_EVIDENCIA]

/** Linhas legadas fora deste delta. */
const INTACTAS = [
  "gilberto-vasconcelos",
  "luciana-gurgel",
  "vera-lucia",
] as const

const writes = parsePendingWrites(SQL, ARQUIVO)

describe("re-run de patrimonio 2026 (21 operacoes)", () => {
  test("declara exatamente 10 INSERT, 1 UPDATE e 10 DELETE, e nada mais", () => {
    assert.equal(writes.length, 21)

    const inserts = writes.filter(
      (w) => w.tabela === "patrimonio" && /^INSERT INTO/i.test(w.statement),
    )
    const updates = writes.filter((w) => w.tabela === "patrimonio" && /^UPDATE/i.test(w.statement))
    const deletes = writes.filter(
      (w) => w.tabela === "patrimonio_ausencia_oficial" && /^DELETE FROM/i.test(w.statement),
    )

    assert.equal(inserts.length, 10, "10 fichas com bens publicados no pacote atual")
    assert.equal(updates.length, 1, "so priscila-voigt muda de composicao")
    assert.equal(deletes.length, 10, "8 ausencias contraditas e 2 ausencias sem evidencia")
    assert.deepEqual(
      inserts.map((w) => w.slug).sort(),
      [...PUBLICOU].sort(),
    )
    assert.deepEqual(
      deletes.map((w) => w.slug).sort(),
      [...REMOVER_AUSENCIA].sort(),
    )
    assert.equal(updates[0].slug, "priscila-voigt")
    assert.ok(
      writes.every((w) => w.ano === 2026),
      "escrita de outro ciclo nao pertence a este ato",
    )
  })

  test("nenhum statement de escrita fica sem anotacao @write", () => {
    // Escrita sem anotacao e invisivel para o gate: entraria em producao sem
    // passar por allowlist nenhuma.
    assert.deepEqual(escritasSemAnotacao(SQL), [])
  })

  test("as 21 escritas passam na allowlist do proprio recorte", () => {
    assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), [])
    assert.equal(ALLOWLIST.entries.length, 21, "uma entrada por operacao, sem folga")
    assert.ok(
      ALLOWLIST.entries.every((e: { max_registros?: number }) => e.max_registros === 1),
      "sem teto por entrada, a allowlist autorizaria lote em vez de linha",
    )
  })

  test("as 3 linhas legadas fora do delta nao entram no ato", () => {
    for (const slug of INTACTAS) {
      assert.ok(
        !writes.some((w) => w.slug === slug),
        `${slug} nao pode ser escrita por esta migration`,
      )
      assert.ok(
        !ALLOWLIST.coorte.includes(slug),
        `${slug} nao pode estar na coorte da allowlist`,
      )
      assert.ok(
        ALLOWLIST.fora_por_construcao.slugs.includes(slug),
        `${slug} precisa estar declarada como fora por construcao`,
      )
    }
  })

  test("delta congela identidade, fonte e os dois estados nao coletados sem ausencia persistida", () => {
    assert.match(DELTA.fontes.consulta_cand_2026.sha256, /^[a-f0-9]{64}$/)
    assert.match(DELTA.fontes.bem_candidato_2026.sha256, /^[a-f0-9]{64}$/)
    const porSlug = new Map(DELTA.linhas.map((linha: { slug: string }) => [linha.slug, linha]))
    for (const [slug, sq] of [
      ["jose-estevao", "50002536579"],
      ["samara-mineiro", "70002537111"],
      ["dr-luisinho", "10002533539"],
      ["preta-lu", "100002534191"],
    ] as const) {
      const linha = porSlug.get(slug) as {
        sq: string
        estado: string
        identidade: { arquivo_sha256: string; st_declarar_bens?: null }
      }
      assert.equal(linha.sq, sq)
      assert.equal(linha.estado, "nao_coletado")
      assert.match(linha.identidade.arquivo_sha256, /^[a-f0-9]{64}$/)
      const seed = CANDIDATOS.find((c) => c.slug === slug)
      assert.equal(seed?.ids?.tse_sq_candidato?.["2026"], sq, `${slug} sem SQ exato no seed`)
    }
    for (const slug of SEM_EVIDENCIA) {
      const linha = porSlug.get(slug) as {
        ausencia_persistida_sem_evidencia: boolean
        ausencia_removida_em_migration: string
        identidade: { st_declarar_bens: null }
      }
      assert.equal(linha.ausencia_persistida_sem_evidencia, false)
      assert.equal(linha.ausencia_removida_em_migration, AUSENCIA_REMOVIDA_EM.get(slug))
      assert.equal(linha.identidade.st_declarar_bens, null)
    }
  })

  test("priscila-voigt e UPDATE de composicao, com total e contagem preservados", () => {
    // O agregado nao mudou (R$ 1000 em 1 bem); mudou o TIPO declarado. Um INSERT
    // aqui criaria segunda linha de 2026 para a mesma ficha, e um UPDATE que
    // mexesse no total afirmaria variacao patrimonial que o TSE nao publicou.
    const update = writes.find((w) => w.slug === "priscila-voigt")
    assert.ok(update)
    assert.deepEqual(update.campos, ["valor_total", "bens", "fonte"])
    assert.match(update.statement, /SET valor_total = 1000\.00/)
    assert.match(update.statement, /"tipo":"Depósito bancário em conta corrente no País"/)
    assert.doesNotMatch(update.statement, /"tipo":"Dinheiro em espécie - moeda nacional"/)
    assert.equal(
      (update.statement.match(/"valor":/g) ?? []).length,
      1,
      "a retificacao mantem 1 bem",
    )
    // A composicao de 07/08 aparece no guard, e so la: e a pre-condicao, nao o
    // valor a gravar.
    assert.match(
      SQL,
      /AND p\.bens = '\[\{"tipo":"Dinheiro em espécie - moeda nacional".*?\]'::jsonb;/,
    )
  })

  test("os guards abortam em vez de virar no-op bem-sucedido", () => {
    // No-op BEM-SUCEDIDO e o modo de falha caro: grava a versao no ledger e
    // deixa fichas com bens omitidos ou ausencia sem evidencia. O unico
    // caminho silencioso permitido e o da coorte inteiramente ausente.
    assert.match(SQL, /IF nullif\(v_coorte, 0\) IS NULL THEN[\s\S]{0,200}RETURN;/)
    for (const [variavel, mensagem] of [
      ["v_coorte <> 13", "coorte parcial"],
      ["v_ausencias <> 10", "de 10 linhas de ausencia"],
      ["v_ja_com_patrimonio <> 0", "ja tem patrimonio de 2026"],
      ["v_priscila <> 1", "nao esta na composicao aplicada em 07/08"],
    ] as const) {
      const bloco = new RegExp(`IF ${escaparRegExp(variavel)} THEN[\\s\\S]{0,400}RAISE EXCEPTION`)
      assert.match(SQL, bloco, `guard ${variavel} nao aborta`)
      assert.ok(SQL.includes(mensagem), `guard ${variavel} sem mensagem nomeada`)
    }
    // Pos-condicoes: as 21 operacoes vistas do outro lado.
    assert.match(SQL, /IF v_inseridos <> 10 THEN[\s\S]{0,300}RAISE EXCEPTION/)
    assert.match(SQL, /IF v_ausencias_restantes <> 0 THEN[\s\S]{0,300}RAISE EXCEPTION/)
    assert.match(SQL, /IF v_nao_coletados <> 2 THEN[\s\S]{0,300}RAISE EXCEPTION/)
    assert.match(SQL, /IF v_priscila_pos <> 1 THEN[\s\S]{0,300}RAISE EXCEPTION/)
  })

  test("o rollback desfaz as publicacoes, preserva nao_coletado e recusa curadoria posterior", () => {
    for (const slug of PUBLICOU) {
      assert.ok(
        ROLLBACK.includes(`c.slug = '${slug}'`),
        `rollback nao trata ${slug}`,
      )
    }
    assert.match(ROLLBACK, /RAISE EXCEPTION[\s\S]{0,160}rollback abortado/)
    assert.match(ROLLBACK, /ha curadoria posterior a preservar/)
    // Restaura o conteudo da ausencia, nao um placeholder: SQ, fonte, data e
    // detalhe sao os mesmos que a 20260807183000 escreveu.
    assert.match(ROLLBACK, /'2026-08-07T18:27:03\.374Z'::timestamptz/)
    assert.match(ROLLBACK, /SQ ausente no pacote oficial bem_candidato_2026/)
    assert.match(ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations/)
    assert.match(ROLLBACK, /dr-luisinho e preta-lu NAO voltam/)
    assert.match(ROLLBACK, /IF v_nao_coletados <> 2/)
    assert.ok(
      ROLLBACK.includes("NAO restaura os identificadores de linha"),
      "o limite do rollback precisa estar dito no arquivo, nao descoberto depois",
    )
  })

  test("e migration de curadoria pura, sem DDL", () => {
    // Migration MISTA (schema + dado no mesmo arquivo) e proibida pela issue
    // #136: pular pelo dado remove a tabela, rodar inteira esbarra na
    // pos-condicao de dado.
    const classe = classificarMigration(ARQUIVO, SQL)
    assert.equal(classe.classe, "curadoria")
    assert.equal(classe.mista, false)
    assert.equal(classe.replay, "replicavel", "o guard de ausencia precisa ser reconhecido")
  })

  test("a prova executavel existe e cobre os nove ramos", () => {
    // Este e o teste que impede a prova de sumir. Todos os outros deste arquivo
    // continuariam verdes com um guard que nunca dispara.
    for (const ramo of ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "R1", "R2"]) {
      assert.match(HARNESS, new RegExp(`\\b${ramo}\\b`), `harness sem o ramo ${ramo}`)
    }
    assert.match(HARNESS, /exit 1/, "harness precisa ser fail-closed")
    assert.match(HARNESS, /nao_coletados/, "harness sem o readback dos dois estados nao_coletados")
    assert.match(HARNESS, /postgres:17@sha256:/, "a prova precisa rodar contra Postgres pinado")
  })

  test("readback residual e somente leitura e exige os 13 estados finais exatos", () => {
    for (const slug of [...PUBLICOU, "priscila-voigt", ...SEM_EVIDENCIA]) {
      assert.match(READBACK, new RegExp(`"${slug}"`), `readback sem ${slug}`)
    }
    assert.match(READBACK, /buildPatrimonioEleicoes/)
    assert.match(READBACK, /normalizarComposicao/)
    assert.match(READBACK, /fonte diverge do literal oficial congelado/)
    assert.match(READBACK, /fonte congelada nao preserva o SQ_CANDIDATO esperado/)
    assert.match(READBACK, /estado: "nao_coletado" as const/)
    assert.doesNotMatch(READBACK, /\.(?:insert|update|upsert|delete)\s*\(/)
  })

  test("readback global falha se a tabela de ausencias nao puder ser lida", () => {
    assert.match(READBACK_GLOBAL, /const ausencias = await todas<PatrimonioAusenciaOficial/)
    assert.doesNotMatch(
      READBACK_GLOBAL,
      /catch\s*\{\s*ausencias = \[\]\s*\}/,
      "erro de schema, permissao ou rede nao pode virar lista vazia",
    )
  })

  test("o replay linear registra a falha deliberada deste guard", () => {
    // No replay em banco vazio so uma das 13 fichas chega ate aqui, e o guard
    // aborta. Isso e o guard funcionando, e o manifesto tem que dizer isso: se
    // a linha sumir, a proxima medicao le a falha como regressao nova.
    const manifesto = JSON.parse(
      readFileSync(join(REPO, "scripts/audit/falhas-replay-linear.json"), "utf8"),
    ) as { falhas: string[]; _comentario_20260810093000?: string }
    assert.ok(manifesto.falhas.includes(ARQUIVO))
    assert.match(manifesto._comentario_20260810093000 ?? "", /coorte parcial \(1 de 13 fichas\)/)
  })
})
