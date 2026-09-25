/**
 * Quando a coleta judicial agendada cai antes de produzir evidência, grava um
 * recibo `erro` para cada alvo do snapshot da execução. A ficha passa a dizer
 * que a última busca falhou, em vez de manter silêncio até o SLA vencer.
 *
 * Padrão dry-run. `--apply` grava pelo registrador canônico, um alvo por vez.
 *
 *   tsx scripts/registrar-erro-coleta-processos.ts \
 *     --snapshot=<evidence>.snapshot.json --motivo="DJEN HTTP 503" [--apply]
 */
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { main as registrarRevisao, validarRevisaoManual } from "./registrar-revisao-curadoria"

const URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"

export function slugsDoSnapshot(valor: unknown): string[] {
  if (!valor || typeof valor !== "object") throw new Error("snapshot invalido: objeto esperado")
  const registro = valor as Record<string, unknown>
  if (registro.schema_version !== 1) throw new Error("snapshot invalido: schema_version 1 esperado")
  if (!Array.isArray(registro.alvos)) throw new Error("snapshot invalido: alvos[] esperado")
  const slugs = registro.alvos.map((alvo, indice) => {
    const slug = alvo && typeof alvo === "object" ? (alvo as Record<string, unknown>).slug : undefined
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`snapshot invalido: alvos[${indice}].slug`)
    }
    return slug
  })
  if (new Set(slugs).size !== slugs.length) throw new Error("snapshot invalido: slug repetido")
  return slugs
}

export function argumentosErro(slug: string, motivo: string, agora: Date = new Date()): string[] {
  const limpo = motivo.replace(/[;\r\n]+/g, ", ").replace(/\s+/g, " ").trim().slice(0, 300)
  if (limpo.length < 12) throw new Error("--motivo precisa descrever a falha (12+ caracteres)")
  const data = agora.toISOString().slice(0, 10)
  const args = [
    `--slug=${slug}`,
    "--frente=processos",
    `--data=${data}`,
    "--resultado=erro",
    `--detalhe=motivo: coleta judicial agendada interrompida antes do resultado: ${limpo}; fontes consultadas: DJEN, DataJud; anos consultados: ${data.slice(0, 4)}`,
    "--identidade=nao-confirmada",
    `--url=${URL_DJEN}`,
  ]
  validarRevisaoManual([...args, "--dry-run"])
  return args
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const snapshot = argv.find((arg) => arg.startsWith("--snapshot="))?.slice("--snapshot=".length)
  const motivo = argv.find((arg) => arg.startsWith("--motivo="))?.slice("--motivo=".length)
  if (!snapshot || !motivo) throw new Error("uso: --snapshot=<arquivo> --motivo=<texto> [--apply]")
  const apply = argv.includes("--apply")
  const slugs = slugsDoSnapshot(JSON.parse(readFileSync(snapshot, "utf8")))
  const planos = slugs.map((slug) => argumentosErro(slug, motivo))
  if (apply) {
    for (const args of planos) await registrarRevisao([...args, "--apply"])
  }
  // Só contagem: o log do Actions é público.
  console.log(JSON.stringify({ modo: apply ? "apply" : "dry-run", recibos_erro: planos.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
