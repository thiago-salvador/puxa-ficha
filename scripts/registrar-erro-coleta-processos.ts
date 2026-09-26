/**
 * Quando a coleta judicial agendada cai antes de produzir evidência, grava um
 * recibo `erro` para cada alvo do snapshot da execução. A ficha passa a dizer
 * que a última busca falhou, em vez de manter silêncio até o SLA vencer.
 *
 * Padrão dry-run. `--apply` grava pelo registrador canônico, um alvo por vez.
 *
 *   tsx scripts/registrar-erro-coleta-processos.ts \
 *     --snapshot=<evidence>.snapshot.json --tipo=fonte_indisponivel --modo=vencendo [--apply]
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

export const TIPOS_FALHA: Readonly<Record<string, string>> = Object.freeze({
  limite_de_taxa: "fonte oficial respondeu com limite de taxa (HTTP 429) repetido; disjuntor aberto",
  fonte_indisponivel: "fonte oficial (DJEN ou DataJud) indisponivel, com erro 5xx ou tempo esgotado",
  preflight_banco: "leitura da coorte ou dos recibos no banco falhou antes da busca",
  identidade_tse: "base de candidaturas do TSE indisponivel para confirmar a identidade",
  outro: "falha nao classificada; ver log privado da execucao",
  sem_classificacao: "coleta caiu sem registrar o tipo de falha",
})

export function argumentosErro(slug: string, tipo: string, modo: string, agora: Date = new Date()): string[] {
  const descricao = TIPOS_FALHA[tipo]
  if (!descricao) throw new Error(`--tipo invalido: ${tipo}`)
  if (!/^[a-z-]{3,20}$/.test(modo)) throw new Error("--modo invalido")
  const data = agora.toISOString().slice(0, 10)
  const args = [
    `--slug=${slug}`,
    "--frente=processos",
    `--data=${data}`,
    "--resultado=erro",
    `--detalhe=motivo: coleta judicial agendada (${modo}) interrompida antes do resultado: ${descricao}; tipo_falha: ${tipo}; fontes consultadas: DJEN, DataJud; anos consultados: ${data.slice(0, 4)}`,
    "--identidade=nao-confirmada",
    `--url=${URL_DJEN}`,
  ]
  validarRevisaoManual([...args, "--dry-run"])
  return args
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const snapshot = argv.find((arg) => arg.startsWith("--snapshot="))?.slice("--snapshot=".length)
  const tipo = argv.find((arg) => arg.startsWith("--tipo="))?.slice("--tipo=".length)
  const modo = argv.find((arg) => arg.startsWith("--modo="))?.slice("--modo=".length)
  if (!snapshot || !tipo || !modo) throw new Error("uso: --snapshot=<arquivo> --tipo=<enum> --modo=<modo> [--apply]")
  const apply = argv.includes("--apply")
  const slugs = slugsDoSnapshot(JSON.parse(readFileSync(snapshot, "utf8")))
  const planos = slugs.map((slug) => argumentosErro(slug, tipo, modo))
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
