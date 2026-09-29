/**
 * Retira vínculos promessa x evidência por decisão editorial, por id.
 *
 *   node --import tsx scripts/promessa-evidencia-decidir.ts --retirar --ids <uuid>,<uuid> \
 *     --revisor "<quem decidiu>" --motivo "<por que sai da ficha>"            # dry-run
 *   ... --ids-arquivo ids.txt ... --apply                                      # grava
 *
 * `--ids-arquivo` aceita um id por linha ou um array JSON. A linha recebe
 * `verificado = false` e `revisado_por`/`revisado_em`/`motivo` da decisão. Como
 * `revisado_por` deixa de ser da cascata, a decisão fica marcada (ver
 * `scripts/lib/compromisso-evidencia-decisao.ts`) e a publicação automática
 * não a desfaz. Vale também para linha já retirada pela cascata: a retirada
 * passa a ser editorial e para de ser candidata a republicação.
 *
 * Depois do `--apply`, revalidar a ficha: `revalidate-cache.yml` com
 * `tags=public-candidato-ficha`.
 */
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { PREFIXO_REVISOR_CASCATA } from "./lib/compromisso-evidencia-decisao"
import { escreverAuditado, MOTIVO_MINIMO } from "./lib/escrita-auditada"
import { ensureSupabaseClient } from "./lib/supabase"

const SCRIPT = "scripts/promessa-evidencia-decidir.ts"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const LIMITE_IDS = 500

type PedidoRetirada = { ids: string[]; revisor: string; motivo: string }

type AtualizacaoRetirada = {
  verificado: false
  revisado_por: string
  revisado_em: string
  motivo: string
  updated_at: string
}

/** Valida o pedido e monta a atualização. Puro; lança com a lista de problemas. */
export function planejarRetirada(pedido: PedidoRetirada, agora: string): { ids: string[]; atualizacao: AtualizacaoRetirada } {
  const problemas: string[] = []
  const ids = [...new Set(pedido.ids.map((id) => id.trim().toLowerCase()).filter(Boolean))].sort()
  const invalidos = ids.filter((id) => !UUID.test(id))
  if (ids.length === 0) problemas.push("nenhum id informado")
  if (invalidos.length > 0) problemas.push(`id(s) invalido(s): ${invalidos.join(", ")}`)
  if (ids.length > LIMITE_IDS) problemas.push(`mais de ${LIMITE_IDS} ids numa decisao`)
  const revisor = pedido.revisor.trim()
  if (!revisor) problemas.push("revisor ausente")
  if (revisor.startsWith(PREFIXO_REVISOR_CASCATA)) problemas.push(`revisor nao pode comecar com "${PREFIXO_REVISOR_CASCATA}": a decisao seria lida como da cascata`)
  const motivo = pedido.motivo.trim()
  if (motivo.length < MOTIVO_MINIMO) problemas.push(`motivo com menos de ${MOTIVO_MINIMO} caracteres`)
  if (problemas.length > 0) throw new Error(`pedido de retirada invalido: ${problemas.join("; ")}`)
  return { ids, atualizacao: { verificado: false, revisado_por: revisor, revisado_em: agora, motivo, updated_at: agora } }
}

export function lerIds(argv: string[], ler: (caminho: string) => string = (c) => readFileSync(c, "utf8")): string[] {
  const valor = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const ids = (valor("--ids") ?? "").split(",")
  const arquivo = valor("--ids-arquivo")
  if (arquivo) {
    const texto = ler(arquivo).trim()
    ids.push(...(texto.startsWith("[") ? (JSON.parse(texto) as unknown[]).map(String) : texto.split(/\s+/u)))
  }
  return ids.filter((id) => id.trim())
}

function argumento(argv: string[], flag: string): string {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] ?? "" : ""
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (!argv.includes("--retirar")) throw new Error("uso: --retirar --ids <uuid,...> | --ids-arquivo <arquivo> --revisor <nome> --motivo <texto> [--apply]")
  const apply = argv.includes("--apply")
  const agora = new Date().toISOString()
  const { ids, atualizacao } = planejarRetirada({ ids: lerIds(argv), revisor: argumento(argv, "--revisor"), motivo: argumento(argv, "--motivo") }, agora)

  const db = ensureSupabaseClient()
  const { data, error } = await db.from("compromisso_evidencia").select("id,verificado,revisado_por").in("id", ids)
  if (error) throw new Error(error.message)
  const achadas = (data ?? []) as Array<{ id: string; verificado: boolean; revisado_por: string | null }>
  const ausentes = ids.filter((id) => !achadas.some((l) => l.id === id))
  if (ausentes.length > 0) throw new Error(`id(s) inexistente(s) em compromisso_evidencia: ${ausentes.join(", ")}`)
  const resumo = {
    modo: apply ? "apply" : "dry-run",
    ids: ids.length,
    publicadas_hoje: achadas.filter((l) => l.verificado).length,
    ja_retiradas: achadas.filter((l) => !l.verificado).length,
    revisado_por: atualizacao.revisado_por,
  }
  if (!apply) {
    console.log(JSON.stringify(resumo, null, 2))
    return
  }
  const gravadas = await escreverAuditado(
    { script: SCRIPT, tabela: "compromisso_evidencia", motivo: `retirada por decisao editorial: ${atualizacao.motivo}`, recorte: `${ids.length} id(s)` },
    () => db.from("compromisso_evidencia").update(atualizacao).in("id", ids).select("id"),
  )
  if (gravadas.length !== ids.length) throw new Error(`update devolveu ${gravadas.length} de ${ids.length} linhas`)
  console.log(JSON.stringify({ ...resumo, gravadas: gravadas.length }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
