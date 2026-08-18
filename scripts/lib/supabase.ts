import { existsSync } from "node:fs"
import path from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { blindarAcessoAoCliente } from "./dry-run"

/**
 * Lazy-loaded Supabase client.
 *
 * O client é inicializado apenas no primeiro acesso a qualquer propriedade de
 * `supabase` (ex.: `supabase.from(...)`, `supabase.rpc(...)`). Isso evita que
 * o módulo falhe no carregamento quando consumido por testes que não tocam
 * Supabase em runtime, mesmo que suas dependências sejam importadas pela
 * árvore de módulos.
 *
 * Requer `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) e
 * `SUPABASE_SERVICE_ROLE_KEY` quando `supabase.*` é efetivamente chamado.
 * Carrega `.env.local` / `.env` via `process.loadEnvFile` se presentes.
 */

let cached: SupabaseClient | null = null

function loadEnvFilesOnce(): void {
  const envFiles = [".env.local", ".env"]
  for (const file of envFiles) {
    const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
    const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    if (hasUrl && hasKey) return

    const envPath = path.resolve(process.cwd(), file)
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath)
    }
  }
}

/** Projeto efetivamente usado pelo cliente dos auditores, sem expor a chave. */
export function supabaseProjectRefParaAuditoria(): string {
  loadEnvFilesOnce()
  const raw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("SUPABASE_URL inválida")
  }
  const ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
  if (
    url.protocol !== "https:" ||
    !ref ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("SUPABASE_URL não identifica inequivocamente um projeto Supabase")
  }
  return ref
}

function getClient(): SupabaseClient {
  if (cached) return cached

  loadEnvFilesOnce()

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  cached = createClient(url, key)
  return cached
}

/**
 * O cliente que todo coletor importa, com a blindagem de dry-run no caminho.
 *
 * A blindagem fica AQUI, e não em cada coletor, porque é a única posição em que
 * ela é fail-closed: coletor novo, ou escrita nova em coletor antigo, já nasce
 * coberto sem ninguém lembrar de nada. Ver o cabeçalho de `./dry-run.ts`.
 *
 * Com o modo desligado (o normal), `blindarAcessoAoCliente` devolve `null` e o
 * acesso segue exatamente como antes — mesma preguiça, mesmo bind.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const blindado = blindarAcessoAoCliente(prop, getClient)
    if (blindado) return blindado.valor

    const client = getClient()
    const value = Reflect.get(client as unknown as object, prop)
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value
  },
  has(_target, prop) {
    return prop in (getClient() as unknown as object)
  },
}) as SupabaseClient

/**
 * Helper explícito para quem quiser forçar a inicialização (por exemplo para
 * validar presença de envs num smoke inicial). Equivale ao comportamento
 * anterior de eager-init no import.
 *
 * Devolve o MESMO proxy blindado de `supabase`, nunca o cliente cru. A versão
 * anterior devolvia `getClient()` direto, e isso era um escape da blindagem de
 * dry-run: qualquer script podia trocar `supabase.from(...)` por
 * `ensureSupabaseClient().from(...)` e escrever em produção com o modo ativo.
 * A validação eager continua: `getClient()` roda aqui e lança sem env, que é o
 * smoke que este helper promete.
 */
export function ensureSupabaseClient(): SupabaseClient {
  getClient()
  return supabase
}

/**
 * Zera o cache do cliente. Só para teste: sem isto, um teste que aponta
 * `SUPABASE_URL` para um servidor local herda o cliente que um teste anterior
 * construiu contra outro destino, e o que ele acha que está provando não é o
 * que está acontecendo. Produção nunca precisa disto: o cache por processo é o
 * comportamento correto.
 */
export function __resetSupabaseParaTeste(): void {
  cached = null
}
