import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { writeFile, rename } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as cheerio from "cheerio"
import {
  GUIDE_FACTS, TIME_ZONE_EVIDENCE, UFS, getVotingHours,
  TSE_LOOKUP_LINKS, TRE_URLS, TSE_REGIONAL_COURTS_URL,
  TRE_DIRECTORY_EVIDENCE, type SourceEvidence,
} from "../../src/lib/guia-votacao"

type Resource = { finalUrl: string; status: number; body: Buffer }
const normalize = (value: string) => value.replace(/\s+/g, " ").trim()
export const guideDigest = (value: string) => createHash("sha256").update(value).digest("hex")

export async function fetchGuideSource(requestedUrl: string): Promise<Resource> {
  const url = new URL(requestedUrl)
  const candidates = url.hostname === "www.tse.jus.br"
    ? [requestedUrl, requestedUrl.replace("https://www.tse.jus.br/", "https://tse.jus.br/")]
    : [requestedUrl]
  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { redirect: "follow", signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const finalUrl = response.url || candidate
      if (new URL(finalUrl).hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, "")) {
        throw new Error("Redirecionamento para outro domínio")
      }
      return { finalUrl, status: response.status, body: Buffer.from(await response.arrayBuffer()) }
    } catch (error) { lastError = error }
  }
  throw lastError
}

export function extractGuideExcerpt(resource: Resource, evidence: SourceEvidence): string {
  let text: string
  if (evidence.format === "pdf") {
    text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: resource.body, maxBuffer: 16_000_000 }).toString()
  } else {
    const $ = cheerio.load(resource.body.toString("utf8"))
    if (evidence.format === "tre-links") {
      return [...new Set($("a[href]").toArray().map((link) => $(link).attr("href")!)
        .filter((href) => /^https:\/\/www\.tre-[a-z]{2}\.jus\.br\/?$/.test(href))
        .map((href) => new URL(href).href))].sort().join(" ")
    }
    $("script, style, noscript, head").remove()
    $("p, h1, h2, h3, h4, li, div, tr, td, br").before(" ").after(" ")
    text = $("body").text()
  }
  text = normalize(text)
  const start = text.indexOf(normalize(evidence.extractStart))
  if (start < 0) throw new Error("Delimitador inicial ausente")
  const end = text.indexOf(normalize(evidence.extractEnd), start + normalize(evidence.extractStart).length)
  if (end < 0) throw new Error("Delimitador final ausente")
  return normalize(text.slice(start, end + (evidence.endExclusive ? 0 : normalize(evidence.extractEnd).length)))
}

export function guideEvidenceMatches(resource: Resource, evidence: SourceEvidence): boolean {
  return resource.status === 200 && guideDigest(extractGuideExcerpt(resource, evidence)) === evidence.sourceExcerptSha256
}

async function main() {
  const invalidated: string[] = []
  let failed = false
  const cache = new Map<string, Promise<Resource>>()
  const source = (url: string) => {
    if (!cache.has(url)) cache.set(url, fetchGuideSource(url))
    return cache.get(url)!
  }
  const hours = UFS.map(getVotingHours).filter((fact) => fact !== null)
  for (const fact of [...GUIDE_FACTS, ...hours, TIME_ZONE_EVIDENCE, TRE_DIRECTORY_EVIDENCE]) {
    try {
      const resource = await source(fact.sourceUrl)
      const excerpt = extractGuideExcerpt(resource, fact)
      const digest = guideDigest(excerpt)
      const ok = digest === fact.sourceExcerptSha256 && guideDigest(fact.sourceExcerpt) === digest
      if (!ok) invalidated.push(fact.id)
      console.log(`${ok ? "PASS" : "FAIL"} ${fact.id} sha256=${digest} status=${resource.status} url=${resource.finalUrl}`)
    } catch (error) {
      invalidated.push(fact.id)
      console.log(`FAIL ${fact.id} ${String(error)}`)
    }
  }

  const links = [
    ...Object.values(TSE_LOOKUP_LINKS),
    ...Object.entries(TRE_URLS).map(([uf, href]) => ({ label: `TRE-${uf}`, href })),
    { label: "Diretório dos TREs", href: TSE_REGIONAL_COURTS_URL },
    ...[...new Set([...GUIDE_FACTS, ...hours].map((fact) => fact.sourceUrl))].map((href) => ({ label: "Fonte TSE", href })),
  ]
  for (const link of links) {
    try {
      const resource = await source(link.href)
      const host = new URL(resource.finalUrl).hostname
      const title = cheerio.load(resource.body.toString("utf8"))("title").text().trim()
      const allowed = /^(?:www\.)?(?:tse|tre-[a-z]{2})\.jus\.br$/.test(host)
      const correctPage = host.includes("tre-") ? /Tribunal Regional Eleitoral/.test(title) : /Tribunal Superior Eleitoral/.test(title)
      const ok = allowed && correctPage
      if (!ok) failed = true
      console.log(`${ok ? "PASS" : "FAIL"} link ${link.label} status=${resource.status} url=${resource.finalUrl} title=${title}`)
    } catch (error) {
      failed = true
      console.log(`FAIL link ${link.label} ${String(error)}`)
    }
  }

  const path = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/lib/guia-votacao-validation.ts")
  const ids = [...new Set(invalidated)].sort()
  const body = `/** Estado gerado pelo auditor local. Divergências mantêm o conteúdo do guia oculto. */\nexport const INVALIDATED_GUIDE_FACT_IDS: readonly string[] = ${JSON.stringify(ids)}\n`
  await writeFile(`${path}.tmp`, body, "utf8")
  await rename(`${path}.tmp`, path)
  if (failed || ids.length > 0) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
