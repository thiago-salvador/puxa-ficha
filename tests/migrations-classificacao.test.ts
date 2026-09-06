import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BLOQUEADORES_REPLAY_DDL,
  MEDICAO_REPLAY,
  MISTAS_CONHECIDAS,
  TABELAS_DE_CONTEUDO,
  TABELAS_DE_ESTADO,
  alvosDeEscrita,
  classificarMigration,
  preverReplay,
  resumir,
  stripComentarios,
  temGuardDeAusencia,
} from "../scripts/audit/lib/migrations-classificacao"
import {
  carregarManifestoSchema,
  DIR_MIGRATIONS,
  classificarTodas,
  classificarTodasComReplaySchema,
  listarArquivosDeMigration,
  validarManifestoSchema,
} from "../scripts/audit/classificar-migrations"
import { RETIDAS_PADRAO } from "../scripts/audit/lib/ledger-guard"

const TODAS = classificarTodas()
const TODAS_COM_REPLAY_SCHEMA = classificarTodasComReplaySchema()

describe("classificador puro (#136)", () => {
  test("barreira de publicação integra o replay de schema", () => {
    const migration = TODAS_COM_REPLAY_SCHEMA.find((item) => item.arquivo.startsWith("20260905220000"))
    assert.equal(migration?.replaySchema, true)
  })
  test("freshness closeout separa curadoria guardada da view de schema", () => {
    const dados = TODAS_COM_REPLAY_SCHEMA.find((item) => item.arquivo.startsWith("20260905230738"))
    const schema = TODAS_COM_REPLAY_SCHEMA.find((item) => item.arquivo.startsWith("20260905230739"))
    assert.equal(dados?.classe, "curadoria")
    assert.equal(dados?.temGuard, true)
    assert.equal(dados?.replay, "replicavel")
    assert.equal(dados?.replaySchema, false)
    assert.equal(schema?.classe, "schema")
    assert.equal(schema?.replaySchema, true)
    assert.equal(schema?.mista, false)
  })
  test("FOR UPDATE SKIP LOCKED não inventa DML, mas tabela skip continua visível", () => {
    assert.deepEqual(alvosDeEscrita("SELECT * FROM request_ip_quotas FOR UPDATE SKIP LOCKED"), [])
    assert.deepEqual(alvosDeEscrita("UPDATE public.skip SET value = 1"), ["skip"])
  })
  test("comentário não vira SQL", () => {
    const sql = "-- INSERT INTO candidatos (slug) VALUES ('x');\nselect 1;"
    assert.equal(stripComentarios(sql).includes("INSERT"), false)
    assert.deepEqual(alvosDeEscrita(sql), [])
  })

  test("temp table declarada no próprio arquivo não conta como persistência", () => {
    const sql = `
      CREATE TEMP TABLE _seed_x ON COMMIT DROP AS SELECT 1;
      INSERT INTO _seed_x VALUES (1);
      INSERT INTO public.candidatos (slug) VALUES ('y');
    `
    assert.deepEqual(alvosDeEscrita(sql), ["candidatos"])
  })

  test("DDL puro é schema", () => {
    const c = classificarMigration("x.sql", "CREATE TABLE public.foo (id int);")
    assert.equal(c.classe, "schema")
    assert.equal(c.replay, "replicavel")
    assert.equal(c.mista, false)
  })

  test("precedência de dados: um INSERT de conteúdo faz virar curadoria", () => {
    const c = classificarMigration(
      "x.sql",
      "CREATE TABLE public.foo (id int);\nINSERT INTO public.projetos_lei (id) VALUES (1);"
    )
    assert.equal(c.classe, "curadoria")
    assert.equal(c.mista, true, "DDL mais dado de ficha é o caso difícil")
  })

  test("tabela de estado de ferramenta não faz virar curadoria", () => {
    const c = classificarMigration(
      "x.sql",
      "ALTER TABLE public.coleta_log ADD COLUMN n text;\nUPDATE public.coleta_log SET n = 'a';"
    )
    assert.equal(c.classe, "schema", "coleta_log é estado de ferramenta, não dado de ficha")
  })

  /**
   * O retrato da `20260511112000`: lê `candidatos`, não tem guard, e trata a
   * ausência como violação de invariante. É a que derruba o replay na 179ª.
   */
  test("preverReplay: curadoria sem guard que lê candidatos e estoura, quebra", () => {
    assert.equal(
      preverReplay({ classe: "curadoria", temGuard: false, temRaiseException: true, leCandidatos: true }),
      "quebra_sem_guard"
    )
  })

  test("preverReplay: o guard da 20260507130000 salva o replay", () => {
    assert.equal(
      preverReplay({ classe: "curadoria", temGuard: true, temRaiseException: true, leCandidatos: true }),
      "replicavel"
    )
  })

  test("preverReplay: schema nunca depende de linha", () => {
    assert.equal(
      preverReplay({ classe: "schema", temGuard: false, temRaiseException: true, leCandidatos: true }),
      "replicavel"
    )
  })

  /**
   * Bypasses que a vistoria do PR #142 provou no parser anterior. Cada caso
   * abaixo passava despercebido e agora é reconhecido.
   */
  test("CREATE UNIQUE INDEX é DDL persistente (bypass da vistoria)", () => {
    const c = classificarMigration(
      "x.sql",
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_x ON public.patrimonio (candidato_id, ano);"
    )
    assert.equal(c.temDdlPersistente, true)
  })

  test("GRANT, REVOKE e COMMENT ON são estrutura persistente", () => {
    assert.equal(
      classificarMigration("x.sql", "GRANT SELECT ON public.foo TO anon;").temDdlPersistente,
      true
    )
    assert.equal(
      classificarMigration("x.sql", "COMMENT ON TABLE public.foo IS '';").temDdlPersistente,
      true
    )
    // Prosa com "integrantes" não vira GRANT: literais são apagados antes.
    assert.equal(
      classificarMigration(
        "x.sql",
        "SELECT 'RECONHECE OS INTEGRANTES DO SISTEMA';"
      ).temDdlPersistente,
      false
    )
  })

  test("MERGE INTO conta como escrita (bypass da vistoria)", () => {
    const c = classificarMigration(
      "x.sql",
      "MERGE INTO public.projetos_lei t USING (SELECT 1) s ON false WHEN NOT MATCHED THEN DO NOTHING;"
    )
    assert.deepEqual(c.tabelasDeConteudo, ["projetos_lei"])
    assert.equal(c.classe, "curadoria")
  })

  test("CREATE DOMAIN é DDL persistente", () => {
    assert.equal(
      classificarMigration("x.sql", "CREATE DOMAIN public.cpf AS text;").temDdlPersistente,
      true
    )
  })

  test("comentário no fim da linha não vira alvo de escrita (bypass da vistoria)", () => {
    assert.deepEqual(alvosDeEscrita("SELECT 1; -- INSERT INTO public.candidatos"), [])
    // E um `--` DENTRO de literal não corta a linha.
    assert.deepEqual(
      alvosDeEscrita("INSERT INTO public.projetos_lei (ementa) VALUES ('texto -- observacao');"),
      ["projetos_lei"]
    )
  })

  test("RETURN depois do END IF não conta como guard (bypass da vistoria)", () => {
    const semGuard = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          RAISE EXCEPTION 'candidato ausente';
        END IF;
        RETURN;
      END $$;`
    assert.equal(temGuardDeAusencia(semGuard), false)

    const comGuard = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          RAISE NOTICE 'pulando';
          RETURN;
        END IF;
      END $$;`
    assert.equal(temGuardDeAusencia(comGuard), true)

    // RAISE EXCEPTION antes do RETURN dentro do bloco: quem estoura antes de
    // retornar está reprovando o banco vazio, não tratando ele.
    const estouraAntes = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          RAISE EXCEPTION 'ausente';
          RETURN;
        END IF;
      END $$;`
    assert.equal(temGuardDeAusencia(estouraAntes), false)
  })

  test("coorte vazia conta como guard somente quando retorna antes de qualquer exceção", () => {
    assert.equal(
      temGuardDeAusencia(`DO $$ BEGIN
        IF coorte_presente = 0 THEN
          RAISE NOTICE 'banco vazio';
          RETURN;
        END IF;
      END $$;`),
      true,
    )
    assert.equal(
      temGuardDeAusencia(`DO $$ BEGIN
        IF coorte_presente = 0 THEN
          RAISE EXCEPTION 'banco vazio';
          RETURN;
        END IF;
      END $$;`),
      false,
    )
  })

  /**
   * Rodada 2 da vistoria: os dois casos que ela reproduziu no head anterior.
   */
  test("IF aninhado com RETURN próprio não protege o IF externo (rodada 2)", () => {
    const aninhado = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          IF skip THEN RETURN; END IF;
          RAISE EXCEPTION 'ausente';
        END IF;
      END $$;`
    assert.equal(
      temGuardDeAusencia(aninhado),
      false,
      "o RETURN é condicional dentro do IF interno; o caminho restante estoura"
    )

    // Guard legítimo com IF aninhado ANTES do RETURN de nível zero continua valendo.
    const legitimoComAninhado = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          IF debug THEN RAISE NOTICE 'x'; END IF;
          RETURN;
        END IF;
      END $$;`
    assert.equal(temGuardDeAusencia(legitimoComAninhado), true)
  })

  /**
   * Rodada 3 da vistoria: depois de reprovar o bloco externo, o scanner
   * reencontrava o `IF ... IS NULL THEN RETURN` ANINHADO e o tratava como
   * guard independente, "protegendo" uma migration que ainda estoura.
   */
  test("IF interno reprovado não vira guard independente (rodada 3)", () => {
    const reescaneado = `
      DO $$ BEGIN
        IF cand_id IS NULL THEN
          IF outro_id IS NULL THEN RETURN; END IF;
          RAISE EXCEPTION 'candidato ausente';
        END IF;
      END $$;`
    assert.equal(temGuardDeAusencia(reescaneado), false)

    // Guard legítimo em bloco IRMÃO (fora do bloco reprovado) continua valendo.
    const irmao = `
      DO $$ BEGIN
        IF x IS NULL THEN
          RAISE EXCEPTION 'x';
        END IF;
        IF cand_id IS NULL THEN
          RETURN;
        END IF;
      END $$;`
    assert.equal(temGuardDeAusencia(irmao), true)
  })

  test("o gate de replay real existe e compara conjunto, não só posição (rodada 3)", () => {
    const manifesto = JSON.parse(
      readFileSync(join("scripts", "audit", "falhas-replay-linear.json"), "utf8")
    ) as { aplicadas_esperadas: number; falhas: string[] }
    // 290 desde 09/08/2026, medido por `replay-migrations.sh --gate`, e o valor
    // andou nos dois sentidos no mesmo dia: 289 -> 290 com a 20260809060000
    // (schema, aplica limpo) e 290 -> 290 com a 20260809070000, que ENTRA na
    // lista de falhas de propósito. No replay linear as três migrations que
    // inserem `cleber-rabelo` falham e a que insere `gilberto-vasconcelos`
    // aplica, então o banco fica com UMA das duas fichas da coorte e o guard de
    // presença parcial aborta, como deve: no-op bem-sucedido ali gravaria a
    // versão no ledger deixando a outra ficha sem correção. Produção tem as
    // duas. O `--gate` só reprova `aplicadas < esperadas`, ou seja, ele não
    // cobraria esta linha; ela é atualizada à mão porque manifesto que diz um
    // número quando a medição dá outro é uma baseline que começou a mentir.
    // 298 -> 301 em 13/08/2026: schema e carga de chapas mais o hardening RLS de
    // histórico são migrations separadas e aplicam limpo no replay vazio.
    // 301 -> 302 em 13/08/2026: correção das seis biografias de chapa aplica
    // limpo quando o predecessor 040200 existe e é no-op no replay anterior.
    // Medido, não estimado: `npm run audit:migrations:replay -- --gate` deu
    // "302 aplicadas, 103 falhas reais" e "conservacao OK: 302 + 103 = 405",
    // com o conjunto de falhas inalterado.
    // 302 -> 303 em 15/08/2026: hardening RLS de patrimonio_ausencia_oficial
    // (20260815061000) aplica limpo. Medido pelo gate do CI: "303 aplicadas,
    // 103 falhas reais" e "conservacao OK: 303 + 103 = 406", conjunto de
    // falhas inalterado.
    // 303 -> 305 em 15/08/2026: schema e backfill de foto_credito foram
    // separados para manter o gate DDL/DML puro. Ambos aplicaram limpo no
    // replay linear medido, com as mesmas 103 falhas históricas.
    // 305 -> 306 em 15/08/2026: higiene de advisors fixa search_path em duas
    // funções e cria os dois índices de FK de chapas_2026. Replay linear medido:
    // "306 aplicadas, 103 falhas reais", conjunto histórico inalterado.
    // 306 -> 307 em 15/08/2026: P-PATRIMONIO-2026 reconhece o replay sem
    // ledger e não grava a coorte parcial. Gate medido: "307 aplicadas,
    // 103 falhas reais" e conservação de 410 migrations.
    // 309 -> 310 em 16/08/2026 (merge pós-#210): patrimônio AC + snapshot de
    // chapas (DML) e o schema de gastos_executivo aplicam limpos. Número
    // re-medido no gate local deste merge, não somado de cabeça.
    // 311 -> 312 em 17/08/2026: a 20260817053000 da coluna à âncora de
    // identidade da candidatura (sq_candidato_2026) e aplica limpa no replay.
    // Gate re-medido no CI: "312 aplicadas, 103 falhas reais", conservação 415.
    // 310 -> 311 em 16/08/2026 (merge pós-#212): patrimônio do AC, snapshot
    // pós-registro, gastos_executivo e o backfill nacional de patrimônio
    // aplicam limpos. Gate re-medido neste merge: "311 aplicadas, 103 falhas
    // reais" e conservação de 414 migrations.
    // 312 -> 313 em 18/08/2026: a 20260818172010 tira a extensao unaccent do
    // schema public. Medido no gate do CI (run 32165874941):
    // "conservacao OK: 313 + 103 = 416 migrations", conjunto de falhas intacto.
    // 313 -> 314 em 18/08/2026: a 20260818193909 alinha a policy de leitura de
    // financiamento com o filtro da view publica. Medido no gate (run 32178043147):
    // "conservacao OK: 314 + 103 = 417 migrations", conjunto de falhas intacto.
    // 314 -> 318 em 19/08/2026: schema de formacao_instituicao, backfill do portal
    // DJEN, higiene de formação e curadoria judicial do Renan. As quatro aplicam
    // limpo em universo vazio (sem RAISE). Conservação: 318 + 103 = 421.
    // 318 -> 319 em 19/08/2026: curadoria Cury/Marçal (dois UPDATE). Conservação:
    // 319 + 103 = 422.
    // 319 -> 320 em 20/08/2026: schema de gastos_executivo_ug aplica limpo
    // (ALTER TABLE, sem RAISE). Conservação: 320 + 103 = 423.
    // 320 -> 321 em 20/08/2026: hardening server-only/trgm da RPC de doadores
    // aplica limpo (schema + tabela derivada, sem RAISE). Conservação: 321 + 103 = 424.
    // 322 -> 323 em 21/08/2026: UPDATE de categorias CEAPS UTF-8 aplica limpo
    // (DML, sem RAISE). Conservação: 323 + 103 = 426.
    // 323 -> 324 em 23/08/2026: a limpeza de encoding retorna cedo com coorte
    // vazia e foi provada com fixtures em Postgres 17. Conservação: 324 + 103 = 427.
    // 324 -> 325 em 25/08/2026: a curadoria da issue #96 aceita coorte vazia
    // no replay e preserva guards exatos para as 15 linhas de produção.
    // Conservação medida: 325 + 103 = 428.
    // 327 -> 329 em 29/08/2026: curadoria do roster retorna cedo no replay
    // vazio e o schema puro separado aplica constraint e view. 329 -> 330:
    // a 20260829100000 de identidade por fonte aplica como schema puro. A
    // 30002 retorna cedo sem Pablo no replay vazio e aplica limpa. O backfill
    // 100100 tambem retorna cedo sem Caiado e aplica limpo no replay vazio.
    // 332 -> 333 em 30/08/2026: o backfill 20260830120000 resolve os 63
    // profissao_declarada gravados como QID cru do Wikidata. Ele le `candidatos`
    // e tem RAISE EXCEPTION, entao so fica fora do conjunto de quebras por ter
    // guard de ausencia PRIMEIRO: no replay vazio nenhum dos 63 slugs existe,
    // ele avisa e retorna. Medido, nao somado de cabeca:
    // `bash scripts/audit/replay-migrations.sh --gate` deu "333 aplicadas, 103
    // falhas reais" e "conservacao OK: 333 + 103 = 436 migrations", conjunto de
    // falhas inalterado. O ramo de banco vazio tem prova propria em
    // scripts/audit/provar-migration-profissao-qid.sh (F5 e F6).
    // 333 -> 334 em 30/08/2026: a correção do voto Artigo 17 de JHC retorna
    // cedo sem o alvo. As provas individuais mantiveram as 103 falhas e a
    // integração conserva 334 + 103 = 437 migrations.
    // 334 -> 335 em 30/08/2026: a reconciliação de freshness retorna cedo
    // somente no replay vazio. A integração conserva 335 + 103 = 438.
    // 335 -> 336 em 31/08/2026: a curadoria de Elizeu retorna cedo quando a
    // ficha alvo não existe. Gate real: 336 + 103 = 439, falhas intactas.
    // 336 -> 337 em 01/09/2026: a reancoragem das fontes do TCU da issue #202
    // retorna cedo quando as duas claims não existem, que é o caso do banco
    // vazio. A integração conserva 337 + 103 = 440.
    // 337 -> 338 em 02/09/2026: a revogação de DML das views públicas é schema
    // puro e aplica limpo em banco vazio. Gate local: 338 + 103 = 441.
    // 338 -> 339 em 03/09/2026: a remoção dos 11 índices sem uso (20260903120000)
    // é schema puro e `DROP INDEX IF EXISTS` não depende de linha nem de tabela
    // existente, então aplica limpo.
    // 339 -> 340 em 03/09/2026: a correção do nome de urna do vice de RN
    // (20260903130000) retorna cedo quando a linha de chapas_2026 não existe,
    // que é o caso do banco sintético, e aplica limpo. MEDIDO no gate local
    // PostgreSQL 17: "340 aplicadas, 105 falhas reais" e "conservação OK:
    // 340 + 105 = 445 migrations", conjunto de falhas intacto.
    // 340 -> 341 em 03/09/2026: a troca do vice substituto da chapa do MA
    // (20260903140000) tem o mesmo guard de ausência: no banco sintético a
    // linha `2026:MA:reginaldo-lima-brauno` não existe, a migration avisa e
    // retorna. MEDIDO no gate local PostgreSQL 17: "341 aplicadas, 105 falhas
    // reais" e "conservação OK: 341 + 105 = 446 migrations", conjunto de
    // falhas intacto.
    // 341 -> 344 em 03/09/2026: as tres migrations propostas pela revisao de
    // informacao das fichas (20260903200000 backfill de sq_candidato,
    // 20260903210000 alargamento do vocabulario de situacao e 20260903220000
    // despublicacao do homonimo de alvaro-dias-rn) aplicam limpo. As tres
    // carregam guard de ausencia, entao o replay em banco vazio passa por elas
    // como no-op em vez de quebrar. MEDIDO no gate local PostgreSQL 17:
    // "344 aplicadas, 105 falhas reais" e "conservacao OK: 344 + 105 = 449
    // migrations", conjunto de falhas inalterado.
    // 344 -> 345: correção de profissão 20260904220000 aplica como no-op sem
    // ficha. MEDIDO no replay local PG17: 345 + 105 = 450, falhas inalteradas.
    // 345 -> 346: textos 20260905150000 sem IDs do lote não escrevem no replay.
    // Medição local PG17: 346 + 105 = 451, conjunto de falhas preservado.
    // 05/09: três migrations MR01/MR07/MR08 medidas localmente em PG17;
    // 349 aplicadas + 105 falhas preservadas = 454 arquivos.
    // Freshness closeout medido no PG17: 351 + mesmas 105 = 456 arquivos.
    // Completude residual medida no PG17: 352 + mesmas 105 = 457 arquivos.
    // Master review integral medido no PG17: 358 + mesmas 105 = 463 arquivos.
    // Fechamento residual medido no PG17: 360 + mesmas 105 = 465 arquivos.
    assert.equal(manifesto.aplicadas_esperadas, 360)
    assert.ok(manifesto.falhas.length >= 86, "manifesto de falhas reais esvaziou sem re-medição")

    // Invariante de conservação, a mesma que o harness passou a conferir em
    // tempo de execução: toda migration do diretório ou aplicou ou falhou, uma
    // vez só. Antes disso os dois números eram conferidos SEPARADAMENTE e
    // nenhum enxergava migration PULADA: um filtro que deixasse arquivos de fora
    // sairia como "290 aplicadas, 87 falhas" com o diretório em 400, e o gate
    // aprovaria.
    const totalMigrations = listarArquivosDeMigration().length
    assert.equal(
      manifesto.aplicadas_esperadas + new Set(manifesto.falhas).size,
      totalMigrations,
      "aplicadas + falhas únicas tem que fechar com o total de migrations do diretório"
    )
    assert.equal(
      new Set(manifesto.falhas).size,
      manifesto.falhas.length,
      "falha repetida no manifesto infla o placar sem quebrar a soma"
    )

    // E o harness precisa carregar a conferência, não só o teste: manifesto
    // conferido só aqui volta a divergir do que a execução real mede.
    const harnessConservacao = readFileSync(
      join("scripts", "audit", "replay-migrations.sh"),
      "utf8"
    )
    assert.match(
      harnessConservacao,
      /conservacao quebrada/,
      "o --gate precisa conferir a conservação em tempo de execução"
    )
    assert.equal(
      manifesto.falhas[0],
      MEDICAO_REPLAY.linearPrimeiraQuebra,
      "a primeira falha real tem que continuar sendo a que a issue mediu"
    )

    const harness = readFileSync(join("scripts", "audit", "replay-migrations.sh"), "utf8")
    assert.match(harness, /--gate\)/, "o harness precisa do modo --gate para o CI")
    const workflow = readFileSync(
      join(".github", "workflows", "replay-migrations.yml"),
      "utf8"
    )
    assert.match(
      workflow,
      /replay-migrations\.sh --gate/,
      "o CI precisa executar o replay real, não só a previsão estática"
    )
    assert.match(
      workflow,
      /replay-migrations\.sh --schema-gate/,
      "o CI precisa executar o conjunto inteiro de schema separado"
    )
    assert.match(
      harness,
      /postgres:17@sha256:[a-f0-9]{64}/,
      "o hash do pg_dump exige imagem Postgres presa a digest"
    )
    assert.match(workflow, /pull_request/, "o gate tem que rodar em PR")
  })

  test("o delta do comparar é canônico: lado e conteúdo exatos (rodada 3)", () => {
    const comparador = readFileSync(
      join("scripts", "audit", "lib", "comparar-dumps.py"),
      "utf8"
    )
    assert.match(
      comparador,
      /DELTAS_ESPERADOS = \{/,
      "o delta esperado é congelado por conteúdo, não por substring"
    )
    assert.match(
      comparador,
      /status = ANY\s*"\s*\n\s*"\(ARRAY\['pre-candidato'/,
      "a definição canônica da constraint está congelada"
    )
    assert.match(comparador, /faltantes/, "delta esperado ausente também reprova")
  })

  test("ONLY não esconde a escrita (rodada 2)", () => {
    for (const sql of [
      "UPDATE ONLY projetos_lei SET tipo = 'PL';",
      "INSERT INTO ONLY projetos_lei (id) VALUES (1);",
      "DELETE FROM ONLY projetos_lei WHERE id = 1;",
    ]) {
      const c = classificarMigration("x.sql", sql)
      assert.deepEqual(c.tabelasDeConteudo, ["projetos_lei"], sql)
      assert.equal(c.classe, "curadoria", sql)
    }
  })

  test("resumir aponta a primeira quebra na ordem recebida", () => {
    const r = resumir([
      classificarMigration("a.sql", "CREATE TABLE t (id int);"),
      classificarMigration(
        "b.sql",
        "DO $$ BEGIN INSERT INTO public.projetos_lei SELECT 1 FROM candidatos; RAISE EXCEPTION 'x'; END $$;"
      ),
    ])
    assert.equal(r.primeiraQuebra, "b.sql")
    assert.equal(r.limpasAteAPrimeiraQuebra, 1)
  })
})

describe("gate do repositório (#136)", () => {
  test("toda migration em disco foi classificada", () => {
    assert.equal(TODAS.length, listarArquivosDeMigration().length)
    assert.ok(TODAS.length > 0, "não encontrou migration nenhuma")
  })

  /**
   * O gate que impede o problema de crescer. O passado fica como está; o que
   * não pode é migration NOVA voltar a acoplar estrutura e dado de ficha, que é
   * exatamente o que hoje impede o replay de estrutura de rodar limpo.
   */
  test("nenhuma migration nova mistura DDL persistente com dado de ficha", () => {
    const mistasAgora = TODAS.filter((m) => m.mista).map((m) => m.arquivo)
    const novas = mistasAgora.filter((a) => !MISTAS_CONHECIDAS.includes(a))
    assert.deepEqual(
      novas,
      [],
      "migration nova não pode criar tabela e carregar dado de ficha no mesmo arquivo: " +
        "separe em duas, uma de schema e uma de curadoria"
    )
  })

  test("a lista de mistas conhecidas não tem entrada morta", () => {
    const emDisco = new Set(TODAS.map((m) => m.arquivo))
    const fantasmas = MISTAS_CONHECIDAS.filter((a) => !emDisco.has(a))
    assert.deepEqual(fantasmas, [], "entrada da lista que não existe mais em disco")
  })

  /**
   * A vistoria do PR #142 provou que o gate anterior não impedia regressão
   * antes da posição 178: ele só conferia que a quebra CONHECIDA continuava
   * depois dela. Este congela o CONJUNTO inteiro de quebras previstas: entrada
   * nova é regressão de replay em qualquer posição, inclusive na 10ª; saída
   * sem atualizar o manifesto também reprova, porque medição desatualizada
   * mente igual.
   */
  test("o conjunto de quebras previstas está congelado, em qualquer posição", () => {
    const manifesto = JSON.parse(
      readFileSync(join("scripts", "audit", "quebras-previstas.json"), "utf8")
    ) as { quebras: string[] }
    const congeladas = new Set(manifesto.quebras)
    const agora = new Set(
      TODAS.filter((m) => m.replay === "quebra_sem_guard").map((m) => m.arquivo)
    )

    const novas = [...agora].filter((a) => !congeladas.has(a))
    const sumiram = [...congeladas].filter((a) => !agora.has(a))

    assert.deepEqual(
      novas,
      [],
      "migration NOVA prevista como quebra de replay (lê candidatos, estoura sem guard). " +
        "Adicione o guard de ausência ou separe schema de dado; não regenere o manifesto para calar o gate"
    )
    assert.deepEqual(
      sumiram,
      [],
      "migration saiu do conjunto de quebras: se foi conserto deliberado, refaça a medição " +
        "com scripts/audit/replay-migrations.sh e regenere scripts/audit/quebras-previstas.json no mesmo PR"
    )
  })

  test("os bloqueadores do replay de estrutura continuam sendo os 7 medidos", () => {
    const emDisco = new Set(TODAS.map((m) => m.arquivo))
    for (const bloqueador of BLOQUEADORES_REPLAY_DDL) {
      assert.ok(emDisco.has(bloqueador), `bloqueador sumiu do disco: ${bloqueador}`)
      assert.ok(
        MISTAS_CONHECIDAS.includes(bloqueador),
        `bloqueador precisa estar entre as mistas: ${bloqueador}`
      )
    }
  })

  test("todo alvo de escrita é conhecido, como conteúdo ou como estado", () => {
    const conhecidas = new Set([...TABELAS_DE_CONTEUDO, ...TABELAS_DE_ESTADO])
    const desconhecidas = new Map<string, string>()

    for (const arquivo of listarArquivosDeMigration()) {
      const sql = readFileSync(join(DIR_MIGRATIONS, arquivo), "utf8")
      for (const alvo of alvosDeEscrita(sql)) {
        if (!conhecidas.has(alvo) && !desconhecidas.has(alvo)) desconhecidas.set(alvo, arquivo)
      }
    }

    assert.deepEqual(
      [...desconhecidas.entries()],
      [],
      "tabela nova recebendo carga: classifique em TABELAS_DE_CONTEUDO ou TABELAS_DE_ESTADO"
    )
  })

  /**
   * Guarda o número 178 da issue. Ele não é recalculável sem Docker, então o
   * que o teste protege é a CAUSA: enquanto a `20260511112000` continuar lendo
   * candidatos e estourando sem guard, 178 continua sendo o número. Se alguém
   * consertar essa migration, este teste avisa que a medição precisa ser refeita
   * com `scripts/audit/replay-migrations.sh`.
   */
  test("a causa medida da parada em 178 continua insegura no classificador", () => {
    // A primeira previsão estática não coincide necessariamente com a primeira
    // falha real: dependências e guards só se resolvem executando SQL. A ordem
    // real é protegida pelo --gate e pelo manifesto falhas-replay-linear.json.
    const alvo = TODAS.find((m) => m.arquivo === MEDICAO_REPLAY.linearPrimeiraQuebra)
    assert.ok(alvo, `a migration medida sumiu: ${MEDICAO_REPLAY.linearPrimeiraQuebra}`)
    assert.equal(alvo.temGuard, false, "ganhou guard: refaça a medição do replay")
    assert.equal(alvo.temRaiseException, true, "perdeu a pós-condição: refaça a medição")
    assert.equal(alvo.replay, "quebra_sem_guard")
  })

  test("o conjunto com DDL persistente continua do tamanho medido", () => {
    const comDdl = TODAS.filter((m) => m.temDdlPersistente).length
    assert.ok(
      comDdl >= MEDICAO_REPLAY.ddlSetTamanho,
      `conjunto de estrutura encolheu de ${MEDICAO_REPLAY.ddlSetTamanho} para ${comDdl}: ` +
        "migration de schema não pode sumir sem decisão registrada"
    )
  })

  test("as cinco mistas aplicadas saem do replay só por substituição aditiva", () => {
    const manifesto = carregarManifestoSchema()
    assert.equal(manifesto.origens.length, 5, "a decisão do dono nomeia cinco mistas aplicadas")
    assert.match(manifesto.schema_dump_sha256, /^[a-f0-9]{64}$/)
    assert.doesNotThrow(() => validarManifestoSchema(TODAS))

    const selecionadas = TODAS_COM_REPLAY_SCHEMA.filter((m) => m.replaySchema).map(
      (m) => m.arquivo
    )
    assert.equal(selecionadas.length, MEDICAO_REPLAY.schemaReplayTamanho)
    assert.ok(selecionadas.includes(manifesto.substituto), "o substituto puro ficou fora do replay")
    for (const origem of manifesto.origens) {
      assert.ok(!selecionadas.includes(origem.arquivo), `a mista ${origem.arquivo} ainda entra no replay`)
    }
    for (const versao of RETIDAS_PADRAO) {
      assert.ok(
        !selecionadas.some((arquivo) => arquivo.startsWith(`${versao}_`)),
        `migration retida ${versao} não pertence ao schema aplicado de produção`
      )
    }
  })

  test("hash divergente de origem aplicada falha fechado", () => {
    const manifesto = carregarManifestoSchema()
    const adulterado = {
      ...manifesto,
      origens: manifesto.origens.map((origem, i) =>
        i === 0 ? { ...origem, sha256: "0".repeat(64) } : origem
      ),
    }
    assert.throws(
      () => validarManifestoSchema(TODAS, DIR_MIGRATIONS, adulterado),
      /origem aplicada foi reescrita/
    )
  })

  test("o replay linear não pode regredir abaixo de 178", () => {
    assert.equal(MEDICAO_REPLAY.linearLimpas, 178)
    assert.ok(
      TODAS.length >= MEDICAO_REPLAY.linearLimpas,
      "há menos migrations em disco do que o replay já aplicou limpo"
    )
    const replicaveisAntesDaQuebra = TODAS.findIndex(
      (m) => m.arquivo === MEDICAO_REPLAY.linearPrimeiraQuebra
    )
    assert.equal(
      replicaveisAntesDaQuebra,
      MEDICAO_REPLAY.linearLimpas,
      `a primeira quebra medida saiu da posição ${MEDICAO_REPLAY.linearLimpas} para ` +
        `${replicaveisAntesDaQuebra}: alguém inseriu migration antes dela, refaça a medição`
    )
  })

  test("a prova estrutural registrada é a do diff, não a da contagem", () => {
    // A vistoria derrubou a prova por contagem de objetos (33 tabelas/26
    // funções): dois schemas diferentes podem ter a mesma contagem. O que a
    // medição registra agora é o diff de pg_dump com deltas exatos conhecidos.
    assert.equal(MEDICAO_REPLAY.compararDeltasConhecidos, 4)
    assert.match(MEDICAO_REPLAY.compararDeltaCausa, /^20260805120633/)
    const causa = TODAS.find((m) => m.arquivo === MEDICAO_REPLAY.compararDeltaCausa)
    assert.ok(causa, "a mista causadora do delta sumiu do disco: refaça o --comparar")
    assert.equal(causa.mista, true, "20260805120633 deixou de ser mista: refaça o --comparar")
  })
})
