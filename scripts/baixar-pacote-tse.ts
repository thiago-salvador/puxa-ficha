/**
 * Baixa um pacote do CDN do TSE com a mesma política dos ingests
 * (scripts/lib/download-to-file.ts): retentativa com recuo exponencial dentro
 * de PF_TSE_DOWNLOAD_RETRY_WINDOW_MS, timeout por tentativa em
 * PF_TSE_DOWNLOAD_TIMEOUT_MS, prazo único do processo em
 * PF_TSE_DOWNLOAD_DEADLINE_MS, retomada por Range amarrada ao ETag e
 * `unzip -t` antes de publicar cada .zip.
 *
 * Uso: node --import tsx scripts/baixar-pacote-tse.ts --url=<A> --out=<a.zip> [--url=<B> --out=<b.zip> ...]
 * Os pacotes saem em sequência no mesmo processo, sob o mesmo prazo.
 *
 * Sai 1 sem arquivo publicado quando a janela ou o prazo acaba: quem chama falha fechado.
 */
import { pathToFileURL } from "node:url"

import { downloadToFile, verifyZip } from "./lib/download-to-file"

const ORIGEM_PERMITIDA = "https://cdn.tse.jus.br"

export function lerArgumentos(argv: string[]): Array<{ url: string; out: string }> {
  const valores = (nome: string) =>
    argv.filter((arg) => arg.startsWith(`--${nome}=`)).map((arg) => arg.slice(nome.length + 3))
  const urls = valores("url")
  const outs = valores("out")
  if (urls.length === 0 || urls.length !== outs.length || outs.some((out) => out === "")) {
    throw new Error("uso: --url=<https://cdn.tse.jus.br/...> --out=<arquivo>, um --out por --url")
  }
  return urls.map((url, indice) => {
    if (new URL(url).origin !== ORIGEM_PERMITIDA) throw new Error(`origem fora do CDN do TSE: ${url}`)
    return { url, out: outs[indice] }
  })
}

async function main(): Promise<void> {
  for (const { url, out } of lerArgumentos(process.argv.slice(2))) {
    if (!(await baixar(url, out))) {
      process.exitCode = 1
      return
    }
  }
}

async function baixar(url: string, out: string): Promise<boolean> {
  const inicio = Date.now()
  const ok = await downloadToFile(url, out, {
    verify: out.toLowerCase().endsWith(".zip") ? verifyZip : undefined,
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
    return false
  }
  console.error(`[tse] ok em ${Math.round((Date.now() - inicio) / 1000)} s: ${out}`)
  return true
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
