import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Recorte do job "Rotas e acessibilidade (build local)": ele sobe o app num
// navegador, então só precisa rodar quando o diff toca algo que o app carrega.
// Falha fechada: caminho que o classificador não conhece RODA o job.

const RAIZ_PADRAO = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

// Pastas que o app serve ou que o próprio job executa.
const PREFIXOS_DO_APP = ["src/", "public/", "tests/visual/", ".github/actions/"]

// Arquivos de raiz que mudam o build, o runtime ou o próprio job.
const ARQUIVOS_DO_APP = new Set([
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "middleware.ts",
  "instrumentation-client.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
  "tsconfig.json",
  "tsconfig.playwright.json",
  "postcss.config.mjs",
  "components.json",
  "vercel.json",
  ".github/workflows/ci.yml",
  "scripts/ci/browser-smoke-paths.mjs",
])

// Fora do app: só entram no job se o app os importa (calculado abaixo).
const PREFIXOS_FORA_DO_APP = [
  "scripts/",
  "data/",
  "tests/",
  "docs/",
  "supabase/",
  "QA/",
  "evals/",
  "gates/",
  "entregas/",
  "graft/",
  "Settings/",
  ".github/",
]

const ARQUIVOS_FORA_DO_APP = new Set([
  "cspell.json",
  "knip.json",
  "c8.config.json",
  "eslint.config.mjs",
  "tsconfig.scripts.json",
])

const ENTRADAS_DE_RAIZ = [
  "next.config.ts",
  "middleware.ts",
  "instrumentation-client.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
]

const EXTENSOES = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", ".json", "/index.ts", "/index.tsx", "/index.js"]
const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm

function normalizar(caminho) {
  return caminho.trim().replaceAll("\\", "/").replace(/^\.\//, "")
}

function listar(dir) {
  const saida = []
  if (!existsSync(dir)) return saida
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho))
    else if (/\.(?:ts|tsx|mts|mjs|js|jsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

function resolverImport(raiz, deArquivo, especificador) {
  let base
  if (especificador.startsWith("@/")) base = join(raiz, "src", especificador.slice(2))
  else if (especificador.startsWith(".")) base = resolve(dirname(deArquivo), especificador)
  else return null
  for (const ext of EXTENSOES) {
    const candidato = base + ext
    if (existsSync(candidato) && statSync(candidato).isFile()) return candidato
  }
  return null
}

/** Arquivos do repositório que o app alcança pelos imports, a partir de src/ e das entradas de raiz. */
export function arquivosAlcancadosPeloApp(raiz = RAIZ_PADRAO) {
  const fila = [...listar(join(raiz, "src")), ...ENTRADAS_DE_RAIZ.map((f) => join(raiz, f)).filter((f) => existsSync(f))]
  const vistos = new Set()
  while (fila.length > 0) {
    const arquivo = fila.pop()
    if (vistos.has(arquivo)) continue
    vistos.add(arquivo)
    if (arquivo.endsWith(".json")) continue
    const fonte = readFileSync(arquivo, "utf8")
    for (const casamento of fonte.matchAll(ESPECIFICADOR)) {
      const alvo = resolverImport(raiz, arquivo, casamento[1])
      if (alvo && !alvo.includes("/node_modules/") && !vistos.has(alvo)) fila.push(alvo)
    }
  }
  return new Set([...vistos].map((f) => normalizar(relative(raiz, f))))
}

export function caminhoAcionaSmoke(caminho, alcancados) {
  const normalizado = normalizar(caminho)
  if (!normalizado) return false
  if (PREFIXOS_DO_APP.some((p) => normalizado.startsWith(p))) return true
  if (ARQUIVOS_DO_APP.has(normalizado)) return true
  if (/^playwright[^/]*\.config\.ts$/.test(normalizado)) return true
  if (alcancados.has(normalizado)) return true
  if (PREFIXOS_FORA_DO_APP.some((p) => normalizado.startsWith(p))) return false
  if (ARQUIVOS_FORA_DO_APP.has(normalizado)) return false
  if (!normalizado.includes("/") && normalizado.endsWith(".md")) return false
  // Desconhecido: roda.
  return true
}

export function diffAcionaSmoke(caminhos, alcancados) {
  return caminhos.some((caminho) => caminhoAcionaSmoke(caminho, alcancados))
}

async function lerStdin() {
  let entrada = ""
  for await (const trecho of process.stdin) entrada += trecho
  return entrada
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const caminhos = (await lerStdin()).split(/\r?\n/)
  process.stdout.write(diffAcionaSmoke(caminhos, arquivosAlcancadosPeloApp()) ? "true\n" : "false\n")
}
