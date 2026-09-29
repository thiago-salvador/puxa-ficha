import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  DESPESAS_ESTADOS_COLETA,
  FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS,
  FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS,
} from "../src/lib/financiamento-despesas-contrato"

const FORWARD = new URL("../supabase/migrations/20260929100000_financiamento_despesas.sql", import.meta.url)
const raw = readFileSync(FORWARD, "utf8")
// Comentários de linha fora: as asserções olham só o SQL executável.
const sql = raw
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n")

const TABELA = "public.financiamento_despesas"
const VIEW = "public.financiamento_despesas_publico"
const PUBLICAS = [...FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS]
const SEM_GRANT_ANON = FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS.filter((coluna) => coluna !== "despublicado_em")

function listaDeColunas(bloco: string): string[] {
  return bloco
    .split(",")
    .map((coluna) => coluna.trim().replace(/^d\./, ""))
    .filter(Boolean)
}

test("migration é uma transação só, sem DML, e idempotente", () => {
  assert.equal((raw.match(/^\s*BEGIN;\s*$/gim) ?? []).length, 1)
  assert.equal((raw.match(/^\s*COMMIT;\s*$/gim) ?? []).length, 1)
  assert.ok(raw.trimStart().startsWith("BEGIN;"))
  assert.ok(raw.trimEnd().endsWith("COMMIT;"))
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\b/i)
  assert.doesNotMatch(sql, /\bUPDATE\s+[\w."]+\s+SET\b/i)
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i)
  assert.doesNotMatch(sql, /\bTRUNCATE\s+(TABLE\s+)?[\w."]+/i)
  assert.doesNotMatch(sql, /\bCOPY\s+[\w."]+/i)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.financiamento_despesas \(/)
  assert.match(sql, /CREATE OR REPLACE VIEW public\.financiamento_despesas_publico/)
  assert.ok(
    sql.indexOf('DROP POLICY IF EXISTS "Leitura pública" ON public.financiamento_despesas') <
      sql.indexOf('CREATE POLICY "Leitura pública"'),
    "policy recriada depois de DROP IF EXISTS",
  )
  assert.doesNotMatch(sql, /CREATE (TABLE|INDEX|VIEW) (?!IF NOT EXISTS|OR REPLACE)/)
})

test("tabela tem exatamente as colunas públicas e privadas do contrato, com chave e checks", () => {
  const corpo = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS"), sql.indexOf("\n);", sql.indexOf("CREATE TABLE IF NOT EXISTS")))
  const colunas = corpo
    .split("\n")
    .slice(1)
    .map((linha) => linha.match(/^\s{2}([a-z_]+)\s+(uuid|integer|text|numeric|jsonb|boolean|timestamptz)\b/)?.[1])
    .filter((coluna): coluna is string => Boolean(coluna))
  assert.deepEqual(
    [...colunas].sort(),
    [...PUBLICAS, ...FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS].sort(),
  )
  assert.match(corpo, /candidato_id uuid NOT NULL REFERENCES public\.candidatos\(id\)/)
  assert.match(corpo, /UNIQUE \(candidato_id, ano_eleicao, sq_candidato\)/)
  for (const total of [
    "total_despesas_contratadas",
    "total_despesas_pagas",
    "total_doacoes_a_terceiros",
    "recursos_financeiros",
    "recursos_estimaveis",
    "divida_campanha",
    "sobra_financeira",
  ]) {
    assert.match(corpo, new RegExp(`^\\s{2}${total} numeric\\(14,2\\),$`, "m"), `${total} numeric(14,2) nullable`)
    assert.match(corpo, new RegExp(`\\(${total} IS NULL OR ${total} >= 0\\)`), `${total} >= 0`)
  }
  const estados = corpo.match(/CHECK \(estado_coleta IN \(([^)]*)\)\)/)?.[1]
  assert.deepEqual(
    estados?.split(",").map((valor) => valor.trim().replace(/'/g, "")),
    [...DESPESAS_ESTADOS_COLETA],
  )
  for (const coluna of ["concentracao_despesas", "maiores_fornecedores", "doacoes_a_terceiros"]) {
    assert.match(corpo, new RegExp(`^\\s{2}${coluna} jsonb NOT NULL DEFAULT '\\[\\]'::jsonb,$`, "m"))
    assert.match(corpo, new RegExp(`jsonb_typeof\\(${coluna}\\) = 'array'`))
  }
})

test("CHECK de documento cobre as três colunas JSONB: chaves proibidas e 11 dígitos", () => {
  const check = sql.match(/CONSTRAINT financiamento_despesas_jsonb_sem_documento_check\s+CHECK \(([\s\S]*?)\n\s{4}\),/)?.[1]
  assert.ok(check, "CHECK de documento ausente")
  for (const coluna of ["concentracao_despesas", "maiores_fornecedores", "doacoes_a_terceiros"]) {
    const chave = new RegExp(`${coluna}::text !~\\* '"\\[\\^"\\]\\*\\(cpf\\|cnpj\\|documento\\)`)
    assert.match(check, chave, `${coluna}: chaves cpf/cnpj/documento (cpf_hash incluso)`)
    assert.match(check, new RegExp(`${coluna}::text !~ '\\[0-9\\]\\{11\\}`), `${coluna}: sequência de 11+ dígitos`)
  }
  // O padrão da migration pega o que o contrato considera documento em texto.
  const padrao = new RegExp(check.match(/!~ '([^']+)'/)![1]!)
  assert.ok(padrao.test('[{"nome":"JOAO DA SILVA 12345678909"}]'))
  assert.ok(padrao.test('[{"nome":"MEI 123.456.789-09"}]'))
  assert.ok(padrao.test('[{"nome":"EMPRESA 12.345.678/0001-90"}]'))
  assert.ok(!padrao.test('[{"nome":"GRAFICA LTDA","valor":1234567.89}]'))
})

test("REVOKE antes de GRANT na tabela e na view, e service_role explícito nas duas", () => {
  for (const relacao of [TABELA, VIEW]) {
    const escapada = relacao.replace(".", "\\.")
    const revokeAnon = sql.search(new RegExp(`REVOKE ALL ON TABLE ${escapada} FROM anon, authenticated;`))
    const revokePublic = sql.search(new RegExp(`REVOKE ALL ON TABLE ${escapada} FROM PUBLIC;`))
    const primeiroGrant = sql.search(new RegExp(`GRANT [^;]*ON TABLE ${escapada} TO`))
    assert.ok(revokeAnon > 0 && revokePublic > 0 && primeiroGrant > 0, relacao)
    assert.ok(revokeAnon < primeiroGrant && revokePublic < primeiroGrant, `${relacao}: REVOKE antes do GRANT`)
    assert.match(sql, new RegExp(`GRANT [^;]*ON TABLE ${escapada} TO service_role;`), `${relacao}: grant service_role`)
  }
  assert.match(sql, /GRANT SELECT ON TABLE public\.financiamento_despesas_publico TO anon, authenticated;/)
  assert.match(sql, /ALTER TABLE public\.financiamento_despesas ENABLE ROW LEVEL SECURITY;/)
})

test("GRANT ao anon na tabela é por coluna, uma por linha, igual ao contrato mais despublicado_em", () => {
  const grant = sql.match(/GRANT SELECT \(\n([\s\S]*?)\n\) ON TABLE public\.financiamento_despesas TO anon, authenticated;/)
  assert.ok(grant, "grant por coluna ausente")
  const linhas = grant[1]!.split("\n").map((linha) => linha.trim())
  for (const linha of linhas) assert.match(linha, /^[a-z_]+,?$/, `uma coluna por linha: ${linha}`)
  assert.deepEqual(listaDeColunas(grant[1]!), [...PUBLICAS, "despublicado_em"])
  for (const privada of SEM_GRANT_ANON) {
    assert.ok(!linhas.some((linha) => linha.replace(",", "") === privada), `${privada} sem grant ao anon`)
  }
  // Nenhum outro grant alcança anon/authenticated na tabela base.
  const grantsAnon = Array.from(sql.matchAll(/GRANT ([^;]*?) ON TABLE public\.financiamento_despesas TO ([^;]*);/g)).filter(
    ([, , papeis]) => /\b(anon|authenticated|PUBLIC)\b/.test(papeis!),
  )
  assert.equal(grantsAnon.length, 1)
  assert.doesNotMatch(sql, /GRANT (ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*TO [^;]*\b(anon|authenticated|PUBLIC)\b/)
})

test("view security_invoker expõe exatamente as colunas públicas, com o mesmo filtro da policy", () => {
  const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"), sql.indexOf(";", sql.indexOf("CREATE OR REPLACE VIEW")))
  assert.match(view, /WITH \(security_invoker = true\) AS/)
  const select = view.match(/SELECT\n([\s\S]*?)\nFROM public\.financiamento_despesas AS d/)?.[1]
  assert.ok(select)
  assert.deepEqual(listaDeColunas(select!), PUBLICAS)
  assert.match(view, /WHERE public\.is_public_candidate\(d\.candidato_id\)\s+AND d\.despublicado_em IS NULL/)
  assert.match(
    sql,
    /CREATE POLICY "Leitura pública"\s+ON public\.financiamento_despesas\s+FOR SELECT\s+TO anon, authenticated\s+USING \(public\.is_public_candidate\(candidato_id\) AND despublicado_em IS NULL\);/,
  )
})

test("pós-condição confere colunas, grants por coluna e DML negado na tabela e na view", () => {
  const pos = sql.match(/DO \$postcondition\$([\s\S]*?)\$postcondition\$;/)?.[1]
  assert.ok(pos, "bloco $postcondition$ ausente")
  assert.ok(sql.indexOf("DO $postcondition$") > sql.lastIndexOf("GRANT "), "pós-condição depois dos grants")
  for (const trecho of [
    "has_column_privilege(v_papel, 'public.financiamento_despesas', v_coluna, 'SELECT')",
    "has_table_privilege(v_papel, 'public.financiamento_despesas', 'SELECT')",
    "has_table_privilege(v_papel, 'public.financiamento_despesas_publico', 'SELECT')",
    "has_any_column_privilege(v_papel, v_relacao, v_privilegio)",
    "ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']",
    "ARRAY['public.financiamento_despesas', 'public.financiamento_despesas_publico']",
    "ARRAY['anon', 'authenticated']",
    "security_invoker=true",
    "relrowsecurity",
  ]) {
    assert.ok(pos.includes(trecho), trecho)
  }
  const publicas = pos.match(/v_publicas text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1]
  assert.deepEqual(publicas?.split(",").map((coluna) => coluna.trim().replace(/'/g, "")), PUBLICAS)
  const privadas = pos.match(/v_privadas text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1]
  assert.deepEqual(
    privadas?.split(",").map((coluna) => coluna.trim().replace(/'/g, "")).sort(),
    [...SEM_GRANT_ANON].sort(),
  )
})
