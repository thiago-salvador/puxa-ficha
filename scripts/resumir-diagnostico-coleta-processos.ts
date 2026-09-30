/**
 * Publica o diagnóstico da coleta judicial sem dado nominal.
 *
 * Lê o `<evidence>.diagnostico.json` bruto do runner, passa pela allowlist de
 * `sanitizarDiagnostico`, grava a cópia saneada em `--saida` (a única coisa
 * que vira artifact) e imprime uma linha agregada para o resumo do job.
 *
 *   tsx scripts/resumir-diagnostico-coleta-processos.ts \
 *     --entrada=<evidence>.diagnostico.json --modo=vencendo --saida=<dir>/vencendo.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { linhaResumoDiagnostico, sanitizarDiagnostico } from "./lib/diagnostico-coleta-processos"

export function main(argv = process.argv.slice(2)): string {
  const valor = (nome: string) => argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const entrada = valor("entrada")
  const modo = valor("modo")
  const saida = valor("saida")
  if (!entrada || !modo || !saida) throw new Error("uso: --entrada=<arquivo> --modo=<modo> --saida=<arquivo>")
  if (!/^[a-z-]{3,20}$/.test(modo)) throw new Error("--modo invalido")
  const saneado = sanitizarDiagnostico(JSON.parse(readFileSync(resolve(entrada), "utf8")))
  mkdirSync(dirname(resolve(saida)), { recursive: true })
  writeFileSync(resolve(saida), `${JSON.stringify(saneado, null, 2)}\n`)
  return linhaResumoDiagnostico(modo, saneado)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(main())
}
