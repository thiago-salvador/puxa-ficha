import assert from "node:assert/strict"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import test from "node:test"
import {
  exigirCoortePublicaMinima,
  loadCandidatosPublicosMinimos,
  type CoortePublicaMinima,
} from "../scripts/lib/candidatos-publicos-minimos"
import { ingestTransparenciaSanctions } from "../scripts/lib/ingest-transparencia-sanctions"

const publicos = [
  { slug: "fora-do-seed", nome_completo: "Pessoa Pública Fora do Seed" },
  { slug: "publico-no-seed", nome_completo: "Pessoa Pública no Seed" },
]

async function bancoFake(
  linhas = publicos,
  opcoes: { limite?: number; erroOffset?: number; repetir?: boolean; nulo?: boolean } = {},
) {
  const chamadas: { method: string; path: string; select: string | null; offset: number }[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost")
    const offset = Number(url.searchParams.get("offset") ?? 0)
    chamadas.push({ method: req.method!, path: url.pathname, select: url.searchParams.get("select"), offset })
    res.setHeader("content-type", "application/json")
    if (url.pathname !== "/rest/v1/candidatos_publico") {
      res.statusCode = 500
      res.end(JSON.stringify({ message: "rota inesperada" }))
      return
    }
    if (offset === opcoes.erroOffset) {
      res.statusCode = 400
      res.end(JSON.stringify({ message: "falha de banco simulada" }))
      return
    }
    const limite = Math.min(Number(url.searchParams.get("limit")), opcoes.limite ?? 200)
    res.end(JSON.stringify(opcoes.nulo ? null : opcoes.repetir ? linhas : linhas.slice(offset, offset + limite)))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return {
    client: createClient(url, "chave-falsa"), url, chamadas,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((erro) => erro ? reject(erro) : resolve())
      server.closeAllConnections()
    }),
  }
}

test("carrega públicos fora do seed, pagina além de 1000 e não vaza outros campos", async () => {
  const linhas = Array.from({ length: 1001 }, (_, i) => ({
    slug: `publico-${String(i).padStart(4, "0")}`, nome_completo: `Pessoa ${i}`, extra: "não retornar",
  }))
  const db = await bancoFake(linhas, { limite: 75 })
  try {
    const coorte = await loadCandidatosPublicosMinimos({ client: db.client, escopo: null })
    assert.equal(coorte.length, 1001)
    assert.deepEqual(coorte[1000], { slug: "publico-1000", nome_completo: "Pessoa 1000" })
    assert.equal(db.chamadas.at(-1)?.offset, 1001)
    assert.ok(db.chamadas.every((c) => c.select === "slug,nome_completo" && c.method === "GET"))
    assert.doesNotThrow(() => exigirCoortePublicaMinima(coorte))
    assert.ok(Object.isFrozen(coorte) && Object.isFrozen(coorte[0]))
  } finally { await db.close() }
})

test("recorte público fora do seed funciona; não público, desconhecido e lista malformada abortam", async () => {
  const db = await bancoFake()
  try {
    assert.deepEqual(await loadCandidatosPublicosMinimos({ client: db.client, escopo: " fora-do-seed,fora-do-seed " }), [publicos[0]])
    for (const escopo of ["nao-publico", "fora-do-seed,inexistente", ",", "fora-do-seed,"]) {
      await assert.rejects(loadCandidatosPublicosMinimos({ client: db.client, escopo }), /PF_INGEST_SLUGS/)
    }
  } finally { await db.close() }
})

test("erro de página posterior, resposta nula, slug repetido e nome ausente não viram coorte parcial", async () => {
  for (const opcoes of [
    { limite: 1, erroOffset: 1 }, { nulo: true }, { repetir: true },
  ]) {
    const db = await bancoFake(publicos, opcoes)
    try {
      await assert.rejects(loadCandidatosPublicosMinimos({ client: db.client, escopo: null }), /candidatos_publico:/)
    } finally { await db.close() }
  }
  const db = await bancoFake([{ slug: "sem-nome", nome_completo: "" }])
  try {
    await assert.rejects(loadCandidatosPublicosMinimos({ client: db.client, escopo: null }), /nome_completo inválido/)
  } finally { await db.close() }
})

test("AbortSignal abortado impede a primeira leitura", async () => {
  const db = await bancoFake()
  try {
    await assert.rejects(loadCandidatosPublicosMinimos({ client: db.client, signal: AbortSignal.abort(), escopo: null }), { name: "AbortError" })
    assert.equal(db.chamadas.length, 0)
  } finally { await db.close() }
})

test("AbortSignal chega à requisição em andamento", async () => {
  const controller = new AbortController()
  const server = createServer(() => controller.abort())
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  try {
    await assert.rejects(loadCandidatosPublicosMinimos({
      client: createClient(`http://127.0.0.1:${port}`, "chave-falsa"),
      signal: controller.signal, escopo: null,
    }), /abort/i)
  } finally { server.closeAllConnections(); server.close() }
})

test("coletor recusa roster arbitrário antes de qualquer consulta", async () => {
  await assert.rejects(ingestTransparenciaSanctions(publicos as unknown as CoortePublicaMinima), /deve vir de loadCandidatosPublicosMinimos/)
})

test("runner e coletor reutilizam a mesma coorte para PF_INGEST_SLUGS fora do seed, sem escrita", async () => {
  const db = await bancoFake()
  try {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/dry-run-coletas.ts", "--coleta=sancoes"], {
      env: { ...process.env, PF_DRY_RUN: "1", SUPABASE_URL: db.url,
        SUPABASE_SERVICE_ROLE_KEY: "chave-falsa", TRANSPARENCIA_API_KEY: "", PF_INGEST_SLUGS: "fora-do-seed" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let out = ""
    child.stdout.on("data", (chunk) => { out += chunk })
    child.stderr.on("data", (chunk) => { out += chunk })
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve)
    })
    assert.equal(code, 0, out)
    assert.match(out, /"total": 1/)
    assert.match(out, /"alvo": "fora-do-seed"/)
    assert.match(out, /TRANSPARENCIA_API_KEY ausente/)
    assert.equal(db.chamadas.length, 2, "uma leitura paginada, sem recarregar coorte no coletor")
    assert.ok(db.chamadas.every((c) => c.method === "GET"))
  } finally { await db.close() }
})
