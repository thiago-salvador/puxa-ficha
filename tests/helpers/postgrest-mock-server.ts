/**
 * Minimal PostgREST mock server for integration tests.
 * Serves fixture rows on GET and records PATCH writes.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

interface PatchRequest {
  table: string
  filterField: string
  filterValue: string
  body: Record<string, unknown>
}

interface PostRequest {
  table: string
  rows: Record<string, unknown>[]
}

export interface PostgRESTMock {
  url: string
  port: number
  patches: PatchRequest[]
  /** INSERTs recebidos. É por aqui que a trilha de escrita auditada aparece. */
  posts: PostRequest[]
  close: () => Promise<void>
}

export async function startPostgRESTMock(
  fixturesByTable: Record<string, unknown[]>,
  options?: { debug?: boolean }
): Promise<PostgRESTMock> {
  const patches: PatchRequest[] = []
  const posts: PostRequest[] = []
  const debug = options?.debug ?? false

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost`)
    const pathParts = url.pathname.split("/").filter(Boolean)
    // PostgREST paths: /rest/v1/{table}
    const table = pathParts[pathParts.length - 1] ?? ""

    if (debug) console.log(`[postgrest-mock] ${req.method} ${req.url} -> table=${table}`)

    res.setHeader("Content-Type", "application/json")

    if (req.method === "GET") {
      const rows = fixturesByTable[table] ?? []
      // Apply PostgREST-style filters from query params
      let filtered = [...rows] as Record<string, unknown>[]
      for (const [key, value] of url.searchParams.entries()) {
        if (key === "select" || key === "order") continue
        if (value.startsWith("eq.")) {
          const eqVal = value.slice(3)
          filtered = filtered.filter((r) => String(r[key]) === eqVal)
        }
        if (value.startsWith("not.is.null")) {
          filtered = filtered.filter((r) => r[key] !== null && r[key] !== undefined)
        }
      }
      // Apply ordering
      const order = url.searchParams.get("order")
      if (order) {
        const [field, dir] = order.split(".")
        filtered.sort((a, b) => {
          const av = a[field] as number, bv = b[field] as number
          return dir === "desc" ? bv - av : av - bv
        })
      }
      res.writeHead(200)
      res.end(JSON.stringify(filtered))
      return
    }

    // INSERT. Existe desde que os scripts de operador passaram a gravar a
    // trilha de `escreverAuditado()` em coleta_log: sem tratar POST, o mock
    // devolveria 404 e o script falharia por causa do mock, não do código.
    if (req.method === "POST") {
      const bodyChunks: Buffer[] = []
      for await (const chunk of req) bodyChunks.push(chunk as Buffer)
      const parsed = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8"))
      const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]

      posts.push({ table, rows })
      const alvo = fixturesByTable[table] as Record<string, unknown>[] | undefined
      if (alvo) alvo.push(...rows)

      // PostgREST só devolve as linhas com Prefer: return=representation, que é
      // o que o supabase-js manda quando o chamador encadeia .select().
      const querRepresentacao = (req.headers["prefer"] ?? "").toString().includes("return=representation")
      res.writeHead(201)
      res.end(JSON.stringify(querRepresentacao ? rows : []))
      return
    }

    if (req.method === "PATCH") {
      const bodyChunks: Buffer[] = []
      for await (const chunk of req) bodyChunks.push(chunk as Buffer)
      const body = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8"))

      // Extract filter from query params (e.g., id=eq.hp-1)
      let filterField = ""
      let filterValue = ""
      for (const [key, value] of url.searchParams.entries()) {
        if (value.startsWith("eq.")) {
          filterField = key
          filterValue = value.slice(3)
          break
        }
      }

      patches.push({ table, filterField, filterValue, body })

      // Apply to in-memory fixture
      const rows = fixturesByTable[table] as Record<string, unknown>[] | undefined
      const atingidas: Record<string, unknown>[] = []
      if (rows) {
        const target = rows.find((r) => String(r[filterField]) === filterValue)
        if (target) {
          Object.assign(target, body)
          atingidas.push(target)
        }
      }

      // Devolver as linhas atingidas quando o cliente pede representação é o
      // que faz `.select()` encadeado num UPDATE ter contagem de verdade. Sem
      // isso o chamador não distingue "mudou 1 linha" de "não casou nenhuma".
      const querRepresentacao = (req.headers["prefer"] ?? "").toString().includes("return=representation")
      res.writeHead(200)
      res.end(JSON.stringify(querRepresentacao ? atingidas : []))
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ message: "not found" }))
  })

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        patches,
        posts,
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
  })
}
