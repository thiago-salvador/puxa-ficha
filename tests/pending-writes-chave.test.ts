import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"

/**
 * Escrita endereçada por chave (`-- @write ... chave=<literal>`).
 *
 * O gate `@write` existe para que nenhuma migration escreva em produção sem
 * declarar o que escreve. A regra original conferia a declaração exigindo que o
 * slug do candidato aparecesse LITERAL no statement, o que reprovava para
 * sempre uma classe inteira de escrita correta: a que endereça a linha pela
 * chave (`WHERE id = '<uuid>'`), onde o slug é conhecido só pela curadoria e
 * nunca aparece no SQL.
 *
 * Estes testes fixam os dois lados do contrato da forma nova. Ela ACEITA a
 * escrita por chave, e continua REPROVANDO anotação que não se prova contra o
 * SQL, que é a única coisa que o gate sabe verificar sem tocar banco.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")

describe("pending-writes: escrita endereçada por chave", () => {
  it("(a) aceita chave= cujo literal aparece no statement", () => {
    const sql = [
      "-- @write tabela=posicoes_declaradas chave=ecb064e3-176e-404b-8182-430a62964df9 slug=flavio-bolsonaro campos=id",
      "DELETE FROM public.posicoes_declaradas",
      "WHERE id = 'ecb064e3-176e-404b-8182-430a62964df9';",
    ].join("\n")

    const writes = parsePendingWrites(sql, "teste.sql")

    assert.equal(writes.length, 1)
    assert.equal(writes[0].chave, "ecb064e3-176e-404b-8182-430a62964df9")
    // O slug segue declarado: a allowlist continua respondendo por ele.
    assert.equal(writes[0].slug, "flavio-bolsonaro")
  })

  it("(b) reprova quando o identificador declarado não aparece no statement", () => {
    // Chave declarada que não está no SQL: a anotação não se prova sozinha.
    const chaveInventada = [
      "-- @write tabela=posicoes_declaradas chave=00000000-0000-0000-0000-000000000000 slug=flavio-bolsonaro campos=id",
      "DELETE FROM public.posicoes_declaradas",
      "WHERE id = 'ecb064e3-176e-404b-8182-430a62964df9';",
    ].join("\n")
    assert.throws(
      () => parsePendingWrites(chaveInventada, "teste.sql"),
      /não menciona essa chave literal/
    )

    // Sem `chave=`, a regra antiga continua valendo inteira: slug tem que aparecer.
    const slugAusente = [
      "-- @write tabela=posicoes_declaradas slug=flavio-bolsonaro campos=id",
      "DELETE FROM public.posicoes_declaradas",
      "WHERE id = 'ecb064e3-176e-404b-8182-430a62964df9';",
    ].join("\n")
    assert.throws(() => parsePendingWrites(slugAusente, "teste.sql"), /não menciona esse slug/)

    // `chave=` não dispensa tabela nem slug/ref: acrescenta prova, não substitui.
    const semSlug = [
      "-- @write tabela=posicoes_declaradas chave=ecb064e3-176e-404b-8182-430a62964df9 campos=id",
      "DELETE FROM public.posicoes_declaradas",
      "WHERE id = 'ecb064e3-176e-404b-8182-430a62964df9';",
    ].join("\n")
    assert.throws(() => parsePendingWrites(semSlug, "teste.sql"), /sem tabela ou sem slug\/ref/)
  })

  it("(c) parseia a migration real 20260805123929 sem lançar", () => {
    const arquivo = "20260805123929_aplicar_decisoes_editoriais_20260805.sql"
    const sql = readFileSync(join(MIGRATIONS, arquivo), "utf8")

    const writes = parsePendingWrites(sql, arquivo)

    assert.ok(writes.length > 0, "a migration declara escritas")
    const porChave = writes.filter((w) => w.chave !== undefined)
    assert.ok(
      porChave.length > 0,
      "as escritas desta migration são endereçadas por chave e precisam sair na seção separada"
    )
    // A anotação que derrubava o comando inteiro, agora declarada e conferida.
    const flavio = writes.find((w) => w.chave === "ecb064e3-176e-404b-8182-430a62964df9")
    assert.ok(flavio, "a anotação legada de flavio-bolsonaro parseia")
    assert.equal(flavio.tabela, "posicoes_declaradas")
  })

  it("(d) a chave tem que estar ancorada no literal, não solta no meio dele", () => {
    const ancorada = [
      '-- @write tabela=historico_politico chave="Candidatura a " ref=prefixo campos=cargo_canonico',
      "UPDATE public.historico_politico",
      "SET cargo_canonico = regexp_replace(cargo_canonico, '^Candidatura a ', '')",
      "WHERE cargo_canonico LIKE 'Candidatura a %';",
    ].join("\n")
    assert.equal(parsePendingWrites(ancorada, "teste.sql").length, 1)

    // "andidatura" está DENTRO do literal, mas não é começo nem fim dele.
    // Substring solta passaria a casar com qualquer texto grande da migration.
    const solta = [
      "-- @write tabela=historico_politico chave=andidatura ref=prefixo campos=cargo_canonico",
      "UPDATE public.historico_politico",
      "SET cargo_canonico = regexp_replace(cargo_canonico, '^Candidatura a ', '')",
      "WHERE cargo_canonico LIKE 'Candidatura a %';",
    ].join("\n")
    assert.throws(() => parsePendingWrites(solta, "teste.sql"), /não menciona essa chave literal/)
  })

  it("(e) statement em bloco dollar-quoted não é lido pela metade", () => {
    // O `;` de `DECLARE linhas integer;` fechava o statement cedo demais, e o
    // gate acusava que o SQL não mencionava a tabela anotada. Caso real de
    // 20260805137000: SQL correto, parser lendo só o cabeçalho do bloco.
    const sql = [
      "-- @write tabela=coleta_log slug=renato-gomes campos=detalhe",
      "DO $$",
      "DECLARE",
      "  linhas integer;",
      "BEGIN",
      "  UPDATE public.coleta_log",
      "  SET detalhe = 'corrigido'",
      "  WHERE alvo = 'renato-gomes';",
      "END $$;",
    ].join("\n")

    const writes = parsePendingWrites(sql, "teste.sql")

    assert.equal(writes.length, 1)
    assert.equal(writes[0].chave, undefined)
    assert.match(writes[0].statement, /END \$\$;$/)
  })

  it("(f) literal escrito dentro de comentário não vale como prova de menção", () => {
    // Prosa do autor não endereça linha nenhuma. Se comentário contasse, bastava
    // citar a chave num `--` para que o gate carimbasse um statement que escreve
    // em outra linha, que é o inverso do que ele existe para fazer.
    const chaveSoNoComentario = [
      "-- @write tabela=posicoes_declaradas chave=ecb064e3-176e-404b-8182-430a62964df9 slug=flavio-bolsonaro campos=id",
      "DELETE FROM public.posicoes_declaradas",
      "-- na curadoria isto veio de 'ecb064e3-176e-404b-8182-430a62964df9'",
      "WHERE id = '11111111-2222-3333-4444-555555555555';",
    ].join("\n")
    assert.throws(
      () => parsePendingWrites(chaveSoNoComentario, "teste.sql"),
      /não menciona essa chave literal/
    )

    // Mesma regra para o slug, que é a forma antiga e mais usada da anotação.
    const slugSoNoComentario = [
      "-- @write tabela=coleta_log slug=renato-gomes campos=detalhe",
      "UPDATE public.coleta_log",
      "/* origem: curadoria de 'renato-gomes' em 05/08 */",
      "SET detalhe = 'corrigido' WHERE alvo = 'jarbas-soares';",
    ].join("\n")
    assert.throws(() => parsePendingWrites(slugSoNoComentario, "teste.sql"), /não menciona esse slug/)

    // E para a tabela: `-- mexe em patrimonio` não é mexer em patrimonio.
    const tabelaSoNoComentario = [
      "-- @write tabela=patrimonio slug=renato-gomes campos=valor_total",
      "UPDATE public.historico_politico -- espelha o que foi feito em patrimonio",
      "SET observacoes = 'x' WHERE alvo = 'renato-gomes';",
    ].join("\n")
    assert.throws(
      () => parsePendingWrites(tabelaSoNoComentario, "teste.sql"),
      /não menciona essa tabela/
    )
  })

  it("(g) `;` e `$$` dentro de comentário não terminam nem abrem statement", () => {
    // O scanner lia comentário como código executável. Um `;` em prosa truncava
    // o statement antes da linha que importa, e o gate reprovava SQL correto com
    // diagnóstico errado, que foi o modo de falha que matou o comando inteiro.
    const pontoEVirgulaEmComentario = [
      "-- @write tabela=historico_politico slug=renato-gomes campos=observacoes",
      "UPDATE public.historico_politico",
      "-- cuidado: rodar isto antes do backfill quebra a ordem; ver QA de 07/08",
      "SET observacoes = 'revisado'",
      "WHERE alvo = 'renato-gomes';",
    ].join("\n")

    const writes = parsePendingWrites(pontoEVirgulaEmComentario, "teste.sql")

    assert.equal(writes.length, 1)
    assert.match(writes[0].statement, /WHERE alvo = 'renato-gomes';$/)

    // `$$` citado em prosa não pode abrir um corpo dollar-quoted e engolir o
    // resto do arquivo.
    const dollarEmComentario = [
      "-- @write tabela=historico_politico slug=renato-gomes campos=observacoes",
      "UPDATE public.historico_politico",
      "-- a versão anterior fazia isto num DO $$ ... $$, ver 20260805137000",
      "SET observacoes = 'revisado'",
      "WHERE alvo = 'renato-gomes';",
    ].join("\n")

    const writesDollar = parsePendingWrites(dollarEmComentario, "teste.sql")

    assert.equal(writesDollar.length, 1)
    assert.match(writesDollar[0].statement, /WHERE alvo = 'renato-gomes';$/)
  })

  it("(h) identificador entre aspas duplas não é string literal", () => {
    // `"alvo"` é nome de coluna. Se o scanner o lesse como literal, um nome de
    // coluna igual ao slug viraria prova de menção sem nenhum dado envolvido.
    const sql = [
      "-- @write tabela=coleta_log slug=renato-gomes campos=detalhe",
      'UPDATE public.coleta_log SET "detalhe" = \'x\' WHERE "renato-gomes" IS NULL;',
    ].join("\n")

    assert.throws(() => parsePendingWrites(sql, "teste.sql"), /não menciona esse slug/)
  })
})
