import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"
import { registrarColetaOuFalhar, type EntradaColeta } from "../scripts/lib/coleta-log"

const entry: EntradaColeta = {
  fonte: "destaques-patrimonio", escopo: "candidato", alvo: "candidato-teste",
  resultado: "encontrado", volume: 1, detalhe: "teste de revisão estrita",
}

function database(options: { data?: unknown; readError?: string; insertError?: string } = {}) {
  const writes: unknown[] = []
  let reads = 0
  const db = { from: (table: string) => {
    if (table === "candidatos") return { select: () => ({ eq: (column: string, value: string) => {
      assert.equal(column, "slug")
      assert.equal(value, entry.alvo)
      return { single: async () => {
        reads++
        return { data: options.data ?? null, error: options.readError ? { message: options.readError } : null }
      } }
    } }) }
    assert.equal(table, "coleta_log")
    return { insert: async (payload: unknown) => {
      writes.push(payload)
      return { error: options.insertError ? { message: options.insertError } : null }
    } }
  } } as unknown as NonNullable<Parameters<typeof registrarColetaOuFalhar>[1]>
  return { db, writes, get reads() { return reads } }
}

test("recibo estrito: falha de SELECT impede qualquer INSERT", async () => {
  const state = database({ readError: "SELECT recusado" })
  await assert.rejects(registrarColetaOuFalhar(entry, state.db), /SELECT recusado/)
  assert.equal(state.reads, 1)
  assert.deepEqual(state.writes, [])
})

test("recibo estrito: slug ausente, ID vazio ou slug divergente impedem INSERT", async () => {
  for (const data of [null, { id: "", slug: entry.alvo }, { id: "id-outro", slug: "outro" }]) {
    const state = database({ data })
    await assert.rejects(registrarColetaOuFalhar(entry, state.db), /Candidato não encontrado/)
    assert.deepEqual(state.writes, [])
  }
})

test("recibo estrito: sucesso grava o ID resolvido nesta chamada", async () => {
  const state = database({ data: { id: "id-confirmado", slug: entry.alvo } })
  await registrarColetaOuFalhar(entry, state.db)
  assert.equal(state.reads, 1)
  assert.equal(state.writes.length, 1)
  const [row] = state.writes[0] as Record<string, unknown>[]
  assert.equal(row.candidato_id, "id-confirmado")
  assert.equal(row.alvo, entry.alvo)
  assert.equal(row.resultado, "encontrado")
})

test("recibo estrito: falha de INSERT continua sendo propagada", async () => {
  const state = database({ data: { id: "id-confirmado", slug: entry.alvo }, insertError: "INSERT recusado" })
  await assert.rejects(registrarColetaOuFalhar(entry, state.db), /INSERT recusado/)
  assert.equal(state.writes.length, 1)
})

test("recibo territorial não exige identidade de candidato", async () => {
  const state = database()
  await registrarColetaOuFalhar({ ...entry, fonte: "siconfi", escopo: "territorio", alvo: "SP" }, state.db)
  assert.equal(state.reads, 0)
  const [row] = state.writes[0] as Record<string, unknown>[]
  assert.equal(row.candidato_id, null)
  assert.equal(row.alvo, "SP")
})

test("cache vazio após falha da telemetria não contamina o gravador estrito", () => {
  // Processo isolado para exercitar o cache real do módulo. Toda requisição é
  // interceptada; nenhum cliente, credencial ou banco externo é utilizado.
  const moduleUrl = new URL("../scripts/lib/coleta-log.ts", import.meta.url).href
  const script = `
    import assert from "node:assert/strict";
    let reads = 0;
    const writes = [];
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "mock.invalid", "rede externa proibida no teste");
      if (url.pathname.endsWith("/candidatos")) {
        reads++;
        return reads < 3
          ? Response.json({ message: "SELECT simulado recusado", code: "XX000" }, { status: 400 })
          : Response.json({ id: "id-confirmado", slug: "candidato-teste" });
      }
      assert.ok(url.pathname.endsWith("/coleta_log"));
      assert.equal(options.method, "POST");
      writes.push(...JSON.parse(options.body));
      return new Response(null, { status: 201 });
    };
    const { registrarColetas, registrarColetaOuFalhar } = await import(${JSON.stringify(moduleUrl)});
    const entry = ${JSON.stringify(entry)};
    await registrarColetas([entry]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].candidato_id, null);
    await assert.rejects(registrarColetaOuFalhar(entry), /SELECT simulado recusado/);
    assert.equal(writes.length, 1, "falha estrita deve deixar zero novos INSERTs");
    await registrarColetaOuFalhar(entry);
    assert.equal(reads, 3);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].candidato_id, "id-confirmado");
  `
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, SUPABASE_URL: "https://mock.invalid", SUPABASE_SERVICE_ROLE_KEY: "mock-test-key", PF_DRY_RUN: "0" },
    stdio: "pipe",
    timeout: 10_000,
  })
})
