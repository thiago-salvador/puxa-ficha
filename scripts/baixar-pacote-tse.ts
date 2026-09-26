/**
 * Baixa um pacote do CDN do TSE com a mesma política dos ingests
 * (scripts/lib/download-to-file.ts): retentativa com recuo exponencial dentro
 * de PF_TSE_DOWNLOAD_RETRY_WINDOW_MS, timeout por tentativa em
 * PF_TSE_DOWNLOAD_TIMEOUT_MS e retomada por Range amarrada ao ETag.
 *
 * Uso: node --import tsx scripts/baixar-pacote-tse.ts --url=<https://cdn.tse.jus.br/...> --out=<arquivo>
 *
 * Sai 1 sem arquivo publicado quando a janela acaba: quem chama falha fechado.
 */
import { pathToFileURL } from "node:url"

import { downloadToFile } from "./lib/download-to-file"

const ORIGEM_PERMITIDA = "https://cdn.tse.jus.br"

export function lerArgumentos(argv: string[]): { url: string; out: string } {
  const valor = (nome: string) => argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const url = valor("url")
  const out = valor("out")
  if (!url || !out) throw new Error("uso: --url=<https://cdn.tse.jus.br/...> --out=<arquivo>")
  if (new URL(url).origin !== ORIGEM_PERMITIDA) throw new Error(`origem fora do CDN do TSE: ${url}`)
  return { url, out }
}

async function main(): Promise<void> {
  const { url, out } = lerArgumentos(process.argv.slice(2))
  const inicio = Date.now()
  const ok = await downloadToFile(url, out, {
    onStart: (fonte) => console.error(`[tse] baixando ${fonte}`),
    onHttpError: (status) => console.error(`[tse] HTTP ${status}`),
    onError: (erro) => console.error(`[tse] falha na tentativa: ${erro}`),
    onRetry: ({ attempt, delayMs, reason, resumeFrom }) =>
      console.error(
        `[tse] tentativa ${attempt} falhou (${reason}); nova tentativa em ${Math.round(delayMs / 1000)} s, retomando de ${resumeFrom} bytes`,
      ),
  })
  if (!ok) {
    console.error(`[tse] desisti depois de ${Math.round((Date.now() - inicio) / 1000)} s: ${url}`)
    process.exitCode = 1
    return
  }
  console.error(`[tse] ok em ${Math.round((Date.now() - inicio) / 1000)} s: ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
