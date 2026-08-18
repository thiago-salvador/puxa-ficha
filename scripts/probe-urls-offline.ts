/**
 * Sonda uma lista de URLs usando `probeUrlReal` do link-check, sem tocar no
 * banco. Existe porque o inventário nominal do backlog de integridade (2026-08-02)
 * precisa dos vereditos por URL, e a credencial de service role do
 * `data:link-check-fontes` não está disponível fora do CI.
 *
 * Reusar `probeUrlReal` em vez de reimplementar o critério é deliberado: o
 * veredito tem cinco valores com regras sutis (vedação eleitoral, desafio
 * anti-robô, casca de SPA) e uma segunda implementação divergiria em silêncio.
 *
 * Uso: npx tsx scripts/probe-urls-offline.ts <urls.json> <saida.json>
 */

import { readFileSync, writeFileSync } from "node:fs"
import {
  probeUrlReal,
  hostDaUrl,
  esperar,
  type ProbeOpcoes,
  type UrlProbe,
} from "./link-check-pontos-atencao"

// Mesmos defaults do `main()` do link-check, para o veredito ser comparável.
const OPCOES: ProbeOpcoes = {
  timeoutMs: 20000,
  maxBytes: 512 * 1024,
  retryDelayMs: 5000,
}
const HOST_DELAY_MS = 1500
const CONCURRENCY = 6

async function main() {
  const [entrada, saida] = process.argv.slice(2)
  if (!entrada || !saida) throw new Error("uso: tsx probe-urls-offline.ts <urls.json> <saida.json>")

  const mapa = JSON.parse(readFileSync(entrada, "utf8")) as Record<string, string[]>
  const urls = Object.keys(mapa)

  // Agrupa por host: o link-check serializa por host porque rajada contra o
  // mesmo servidor gera 202 com corpo vazio e falso negativo.
  const porHost = new Map<string, string[]>()
  for (const u of urls) {
    const h = hostDaUrl(u)
    porHost.set(h, [...(porHost.get(h) ?? []), u])
  }

  const hosts = [...porHost.keys()]
  const resultados: UrlProbe[] = []
  let feitos = 0

  async function trabalhador(fila: string[]) {
    for (const host of fila) {
      for (const url of porHost.get(host) ?? []) {
        try {
          resultados.push(await probeUrlReal(url, OPCOES))
        } catch (e) {
          resultados.push({
            url,
            status: "indisponivel",
            httpStatus: null,
            detalhe: `harness: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
        feitos += 1
        if (feitos % 10 === 0) process.stderr.write(`  ${feitos}/${urls.length}\n`)
        await esperar(HOST_DELAY_MS)
      }
    }
  }

  const faixas: string[][] = Array.from({ length: CONCURRENCY }, () => [])
  hosts.forEach((h, i) => faixas[i % CONCURRENCY].push(h))
  await Promise.all(faixas.map(trabalhador))

  writeFileSync(saida, JSON.stringify(resultados, null, 1), "utf8")
  const cont: Record<string, number> = {}
  for (const r of resultados) cont[r.status] = (cont[r.status] ?? 0) + 1
  process.stderr.write(`\n${resultados.length} URLs sondadas: ${JSON.stringify(cont)}\n`)
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
