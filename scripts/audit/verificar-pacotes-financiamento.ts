import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

type PackageReceipt = { ano: number; url: string; sha256: string }

const receipts = JSON.parse(
  readFileSync(
    "QA/evidencias/2026-08-10-financiamento-universo/fontes/pacotes-oficiais.json",
    "utf8",
  ),
) as PackageReceipt[]

async function verify(receipt: PackageReceipt): Promise<void> {
  const response = await fetch(receipt.url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok || !response.body) throw new Error(`${receipt.ano}: HTTP ${response.status}`)
  const hash = createHash("sha256")
  for await (const chunk of response.body) hash.update(chunk)
  const actual = hash.digest("hex")
  if (actual !== receipt.sha256) {
    throw new Error(`${receipt.ano}: SHA-256 divergente, esperado ${receipt.sha256}, obtido ${actual}`)
  }
  console.log(`${receipt.ano}: ${actual}`)
}

async function main(): Promise<void> {
  for (let index = 0; index < receipts.length; index += 2) {
    await Promise.all(receipts.slice(index, index + 2).map(verify))
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
