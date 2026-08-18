import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import { violacoesDeAllowlist } from "../scripts/audit/check-migrations-allowlist"
import { estadoDoCampo } from "../scripts/lib/verificacao-campos-ledger-b2"
import {
  CHAVES_TSE_PERFIL,
  ESTADOS_QUE_AVANCAM_FRESCOR,
  resolverFrescorTsePerfil,
} from "../src/lib/verificacao-campos"

/**
 * Migration de curadoria que materializa as tres frentes TSE de
 * `verificacao_campos` em `cleber-rabelo` e `gilberto-vasconcelos`.
 *
 * ## O que este arquivo NAO prova, e onde a prova mora
 *
 * Asserção sobre TEXTO de SQL nao julga comportamento de guard. A primeira
 * versao destes testes ficou VERDE com dois defeitos reais dentro da migration,
 * achados na revisao de 09/08/2026: presenca parcial da coorte virava no-op
 * bem-sucedido (a versao entraria no ledger deixando a outra ficha sem
 * correcao), e o `jsonb ||` rebaixava uma verificacao mais nova para
 * `2026-08-06`. Nove testes verdes, dois bugs de pe.
 *
 * A prova de comportamento e `scripts/audit/provar-migration-b2.sh`
 * (`npm run audit:b2:provar`), que roda os oito ramos da forward e do rollback
 * contra Postgres 17 de verdade e foi verificado VERMELHO contra cada um dos
 * dois defeitos. O que sobra aqui, e continua valendo, e o que nao precisa de
 * banco: forma do jsonb emitido, o efeito no contrato do leitor, a classificacao
 * da migration, e a existencia do harness com o gate de CI que o executa. O
 * ultimo teste deste arquivo e o que impede o harness de sumir em silencio e
 * levar a prova junto.
 */

const ARQUIVO = "20260809070000_verificacao_campos_b2_cleber_gilberto.sql"
const REPO = join(import.meta.dirname, "..")
const SQL = readFileSync(join(REPO, "supabase/migrations", ARQUIVO), "utf8")
const ROLLBACK = readFileSync(
  join(REPO, "supabase/rollback", ARQUIVO.replace(/\.sql$/, ".rollback.sql")),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(join(REPO, "scripts/audit/allowlist-verificacao-campos-b2-20260809.json"), "utf8"),
)

const SLUGS = ["cleber-rabelo", "gilberto-vasconcelos"] as const
const DATA_TSE = "2026-08-06"

describe("materializacao TSE de verificacao_campos (B2, 2 perfis)", () => {
  test("escreve as tres frentes TSE, com a data do snapshot, nas duas fichas", () => {
    for (const slug of SLUGS) {
      const marcador = `WHERE slug = '${slug}'`
      assert.ok(SQL.includes(marcador), `${slug}: predicado de escrita ausente`)
      const update = SQL.split(marcador)[0].split("-- @write").pop() ?? ""
      for (const chave of CHAVES_TSE_PERFIL) {
        assert.match(
          update,
          new RegExp(`'${chave}',\\s*'${DATA_TSE}'`),
          `${slug}: frente ${chave} sem a data do snapshot do TSE`,
        )
      }
    }
  })

  test("nenhuma chave sai como null, que sobrescreveria data boa no merge", () => {
    assert.doesNotMatch(SQL, /'(candidate_registration|candidate_complement|social_networks)',\s*NULL/i)
    assert.match(SQL, /COALESCE\(verificacao_campos, '\{\}'::jsonb\) \|\|/)
  })

  test("as tres frentes juntas fazem o leitor sair de ausente para completa", () => {
    // O efeito que a migration existe para produzir, medido pelo contrato que o
    // frontend usa, e nao afirmado no comentario.
    assert.equal(resolverFrescorTsePerfil({}).tipo, "ausente")

    const materializado = Object.fromEntries(CHAVES_TSE_PERFIL.map((c) => [c, DATA_TSE]))
    const resolucao = resolverFrescorTsePerfil(materializado)
    assert.equal(resolucao.tipo, "completa")
    assert.equal(resolucao.tipo === "completa" && resolucao.verificadoEm.bruto, DATA_TSE)

    // Duas de tres nao promovem: e por isso que corrigir so `social_networks`
    // teria sido uma aplicacao sem efeito no selo.
    assert.equal(resolverFrescorTsePerfil({ social_networks: DATA_TSE }).tipo, "parcial")
  })

  test("a data de social_networks vem de um estado que pode carimbar data", () => {
    // `no_row_for_safe_sq` e fonte consultada por SQ seguro que respondeu sem
    // registros: `vazio_confirmado`, estado que MERECE data. Se essa traducao
    // mudar, esta migration deixa de ter fundamento e o teste avisa.
    const estado = estadoDoCampo("social_networks", "no_row_for_safe_sq")
    assert.equal(estado, "vazio_confirmado")
    assert.ok((ESTADOS_QUE_AVANCAM_FRESCOR as readonly string[]).includes(estado))
  })

  test("nao toca ultima_atualizacao, que esconderia o proprio selo", () => {
    // Bumpar para `now()` poria "Perfil factual curado" na frente da data TSE em
    // `resolverUltimaVerificacaoDoPerfil`, que escolhe a candidata mais recente.
    assert.doesNotMatch(SQL, /ultima_atualizacao\s*=/)
  })

  test("e curadoria pura, e a previsao estatica de replay diverge do replay real", () => {
    const c = classificarMigration(ARQUIVO, SQL)
    assert.equal(c.classe, "curadoria")
    assert.equal(c.mista, false)
    assert.equal(c.temDdlPersistente, false)
    assert.equal(c.temGuard, true)

    // A previsao estatica diz `replicavel` porque enxerga o guard de ausencia.
    // O replay REAL falha, e a divergencia e conhecida e deliberada: as tres
    // migrations que inserem `cleber-rabelo` falham no replay linear e a que
    // insere `gilberto-vasconcelos` aplica, entao o banco fica com UMA das duas
    // fichas e o guard de presenca parcial aborta, como deve.
    //
    // Registrar a divergencia aqui e o ponto: previsao estatica nao executa SQL,
    // e quem responde pelo replay e o manifesto medido, nunca esta linha.
    assert.equal(c.replay, "replicavel")
    const manifesto = JSON.parse(
      readFileSync(join(REPO, "scripts/audit/falhas-replay-linear.json"), "utf8"),
    ) as { falhas: string[] }
    assert.ok(
      manifesto.falhas.includes(ARQUIVO),
      "a falha real de replay tem que estar declarada no manifesto, nao inferida da previsao",
    )
  })

  test("sem fronteira de transacao propria, nos dois arquivos", () => {
    // Regra de 09/08/2026: quem aplica envolve o arquivo mais a linha do ledger
    // numa transacao externa, e um COMMIT interno a encerraria antes disso.
    for (const [nome, texto] of [["forward", SQL], ["rollback", ROLLBACK]] as const) {
      assert.doesNotMatch(texto, /^\s*BEGIN\s*;/im, `${nome} com BEGIN proprio`)
      assert.doesNotMatch(texto, /^\s*COMMIT\s*;/im, `${nome} com COMMIT proprio`)
    }
  })

  test("toda escrita e declarada e cabe na allowlist do recorte", () => {
    const writes = parsePendingWrites(SQL, ARQUIVO)
    assert.equal(writes.length, 2, "uma anotacao @write por ficha")
    assert.deepEqual(
      writes.map((w) => w.slug).sort(),
      [...SLUGS].sort(),
    )
    for (const w of writes) {
      assert.equal(w.tabela, "candidatos")
      assert.deepEqual(w.campos, ["verificacao_campos"])
    }
    assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), [])
  })

  test("presenca parcial da coorte aborta, e so a ausencia total e no-op", () => {
    // Defeito da revisao de 09/08/2026. O guard usava `HAVING count(*) = 2`,
    // entao UMA ficha presente devolvia NULL e virava no-op BEM-SUCEDIDO: a
    // transacao externa gravaria a linha do ledger e a unica ficha existente
    // ficaria sem correcao para sempre. O comportamento e provado em Postgres
    // pelo ramo F2 do harness; aqui trava-se a forma que o permitia.
    assert.doesNotMatch(
      SQL,
      /HAVING\s+count\(\*\)\s*=\s*2\)\s*IS NULL THEN/i,
      "HAVING no guard faz presenca parcial virar no-op",
    )
    assert.match(SQL, /IF v_presentes <> 2 THEN[\s\S]{0,400}RAISE EXCEPTION/)
    assert.match(SQL, /presenca parcial da coorte/)
  })

  test("frente TSE ja datada com valor divergente aborta, porque `||` nao e monotonico", () => {
    // Reproduzido em Postgres 17: `'{"social_networks":"2026-09-01"}'::jsonb ||
    // '{"social_networks":"2026-08-06"}'::jsonb` da `2026-08-06`. Sem esta
    // guarda a migration REBAIXA verificacao mais nova, que e o defeito que
    // src/lib/verificacao-campos.ts existe para impedir. Ramo F6 do harness.
    assert.match(SQL, /IF v_divergentes > 0 THEN[\s\S]{0,400}RAISE EXCEPTION/)
    assert.match(SQL, /rebaixaria verificacao existente/)
    for (const chave of CHAVES_TSE_PERFIL) {
      assert.match(
        SQL,
        new RegExp(`COALESCE\\(verificacao_campos ->> '${chave}', '${DATA_TSE}'\\) <> '${DATA_TSE}'`),
        `${chave} fora da guarda de divergencia`,
      )
    }
  })

  test("a prova executavel existe, e o CI a executa", () => {
    // Este e o teste que impede a prova de sumir. Os outros deste arquivo
    // ficaram VERDES com os dois defeitos acima dentro da migration: quem os
    // pegou foi o Postgres, e uma suite que perdesse o harness voltaria a
    // afirmar seguranca com asserção sobre texto.
    const harness = readFileSync(join(REPO, "scripts/audit/provar-migration-b2.sh"), "utf8")
    for (const ramo of ["F1", "F2", "F3", "F4", "F5", "F6", "R1", "R2"]) {
      assert.match(harness, new RegExp(`\\b${ramo}\\b`), `harness sem o ramo ${ramo}`)
    }
    assert.match(harness, /presenca parcial/, "harness sem o ramo de presenca parcial")
    assert.match(harness, /2026-09-01/, "harness sem o ramo de verificacao mais nova")
    assert.match(harness, /exit 1/, "harness precisa ser fail-closed")

    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    assert.match(pkg.scripts["audit:b2:provar"] ?? "", /provar-migration-b2\.sh/)

    const workflow = readFileSync(join(REPO, ".github/workflows/replay-migrations.yml"), "utf8")
    const gateRelease = readFileSync(join(REPO, "scripts/audit/provar-release-pf-ajustes-pg17.sh"), "utf8")
    assert.match(
      workflow,
      /provar-release-pf-ajustes-pg17\.sh/,
      "o gate agregado precisa rodar em CI, nao so na maquina de quem escreveu",
    )
    assert.match(gateRelease, /provar-migration-b2\.sh/, "o gate agregado precisa incluir a prova B2")
  })

  test("o rollback remove a chave em vez de gravar null, e recusa data mais nova", () => {
    for (const chave of CHAVES_TSE_PERFIL) {
      assert.match(ROLLBACK, new RegExp(`- '${chave}'`), `rollback nao remove ${chave}`)
    }
    assert.doesNotMatch(ROLLBACK, /=\s*NULL/i)
    assert.match(ROLLBACK, /RAISE EXCEPTION[\s\S]{0,120}rollback abortado/)
    assert.match(ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations/)
  })
})
