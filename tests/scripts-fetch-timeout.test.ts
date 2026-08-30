import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url))

/**
 * Um `fetch` sem prazo não falha: ele espera. Quando a origem aceita a conexão e
 * nunca responde (Cloudflare 522, proxy silencioso, origem sobrecarregada), o
 * processo fica pendurado até o timeout do job, e o run morre sem coletar nada
 * e sem dizer por quê.
 *
 * Os coletores de pipeline abaixo são os que rodam sozinhos, em workflow ou por
 * npm script, e por isso todos precisam de prazo. Os one-off de auditoria ficam
 * fora de propósito: rodam com alguém olhando, e quem está olhando dá Ctrl-C.
 */
const COLETORES_DE_PIPELINE = [
  "lib/ingest-jarbas.ts",
  "lib/ingest-capag.ts",
  "lib/enrich-instagram.ts",
  "lib/programas-governo-extracao.ts",
  "ingest-fotos-oficiais.ts",
  "aquecer-cache-publico.ts",
] as const

function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n")
}

/**
 * Extrai cada expressão `fetch( ... )` equilibrando parênteses. Um grep por
 * linha erra nos dois sentidos: perde o `signal` que está na linha seguinte e
 * acusa `fetch()` citado dentro de comentário.
 */
function chamadasFetch(src: string): string[] {
  const limpo = semComentarios(src)
  const out: string[] = []
  const re = /\bfetch\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpo))) {
    let i = m.index + m[0].length
    let depth = 1
    while (i < limpo.length && depth > 0) {
      if (limpo[i] === "(") depth += 1
      else if (limpo[i] === ")") depth -= 1
      i += 1
    }
    out.push(limpo.slice(m.index, i))
  }
  return out
}

function temPrazo(chamada: string): boolean {
  return /\bsignal\s*:/.test(chamada)
}

function todosOsScripts(dir = SCRIPTS, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const p = path.join(dir, entrada)
    if (statSync(p).isDirectory()) todosOsScripts(p, out)
    else if (/\.(ts|mjs|js)$/.test(entrada)) out.push(p)
  }
  return out
}

describe("prazo nas chamadas de rede dos scripts", () => {
  it("todo coletor de pipeline dá prazo a cada fetch", () => {
    const semPrazo: string[] = []
    for (const rel of COLETORES_DE_PIPELINE) {
      const src = readFileSync(path.join(SCRIPTS, rel), "utf-8")
      const chamadas = chamadasFetch(src)
      assert.ok(chamadas.length > 0, `${rel} não tem fetch nenhum; a lista está velha`)
      for (const chamada of chamadas) {
        if (!temPrazo(chamada)) semPrazo.push(`${rel}: ${chamada.replace(/\s+/g, " ").slice(0, 80)}`)
      }
    }
    assert.deepEqual(semPrazo, [], `fetch sem prazo:\n${semPrazo.join("\n")}`)
  })

  it("o helper canônico continua com prazo e retry", () => {
    const helpers = readFileSync(path.join(SCRIPTS, "lib/helpers.ts"), "utf-8")
    assert.match(helpers, /export const FETCH_TIMEOUT_MS = 15_000/)
    assert.match(helpers, /AbortController/)
    assert.match(helpers, /signal: controller\.signal/)
    assert.match(helpers, /retry-after/i)
  })

  it("mede quantos fetch sem prazo sobraram, e onde", () => {
    // Não é gate: é o inventário do que ficou de fora, para a decisão de
    // ampliar o recorte ser tomada com número na mão em vez de impressão.
    const restantes = new Map<string, number>()
    for (const arquivo of todosOsScripts()) {
      const rel = path.relative(SCRIPTS, arquivo)
      if ((COLETORES_DE_PIPELINE as readonly string[]).includes(rel)) continue
      const n = chamadasFetch(readFileSync(arquivo, "utf-8")).filter((c) => !temPrazo(c)).length
      if (n > 0) restantes.set(rel, n)
    }
    const total = [...restantes.values()].reduce((a, b) => a + b, 0)
    // Todos são one-off de auditoria, curadoria ou infra da fila de merge.
    assert.ok(
      [...restantes.keys()].every(
        (rel) =>
          rel.startsWith("audit/") ||
          rel.startsWith("audit-") ||
          rel.startsWith("merge-queue/") ||
          rel.startsWith("curate-") ||
          rel.startsWith("collect-") ||
          rel.startsWith("gerar-") ||
          rel.startsWith("validar-"),
      ),
      `apareceu fetch sem prazo fora dos one-off conhecidos:\n${[...restantes.keys()].join("\n")}`,
    )
    assert.ok(total <= 22, `subiu para ${total} fetch sem prazo fora do recorte de pipeline (medido: 22 em 18 arquivos, 2026-08-30)`)
  })
})
