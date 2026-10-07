import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Recorte do job "Rotas e acessibilidade (build local)": ele sobe o app num
// navegador, então só precisa rodar quando o diff toca algo que o app carrega.
// Falha fechada: caminho que o classificador não conhece RODA o job.

const RAIZ_PADRAO = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

// Pastas que o app serve ou que o próprio job executa.
// tests/fixtures/visual/ substitui módulos do app no build E2E (PF_VISUAL_FIXTURE_BUILD).
const PREFIXOS_DO_APP = ["src/", "public/", "tests/visual/", "tests/fixtures/visual/", ".github/actions/"]

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

const EXTENSOES = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm
// Arquivo lido em runtime por caminho literal relativo à raiz, sem import
// (ex.: readFileSync(resolve(process.cwd(), "scripts/data/pesquisas-governadores-2026.json"))).
// Só arquivo de dado: comentário que cita um script não pode puxar o grafo dele.
const CAMINHO_LITERAL = /["'`](?:\.\/)?((?:scripts|data|tests)\/[^"'`\s$]+\.(?:json|jsonl|csv|tsv|ya?ml|txt|geojson))["'`]/g
// O mesmo caminho montado em partes: join(process.cwd(), "scripts", "data", "x.json").
const CAMINHO_EM_PARTES = /\b(?:join|resolve)\(\s*process\.cwd\(\)\s*,\s*((?:["'][^"'`$]+["']\s*,?\s*)+)\)/g
const PARTE = /["']([^"']+)["']/g
const DADO = /^(?:scripts|data|tests)\/[^\s]+\.(?:json|jsonl|csv|tsv|ya?ml|txt|geojson)$/

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

/**
 * Arquivo do repositório que o import aponta. Sem arquivo no disco (apagado ou
 * renomeado no diff), devolve os candidatos: o import continua apontando para
 * lá, e o caminho tem de seguir no conjunto para o diff que o apaga rodar o job.
 */
function resolverImport(raiz, deArquivo, especificador) {
  let base
  if (especificador.startsWith("@/")) base = join(raiz, "src", especificador.slice(2))
  else if (especificador.startsWith(".")) base = resolve(dirname(deArquivo), especificador)
  else return { arquivo: null, candidatos: [] }
  const candidatos = EXTENSOES.map((ext) => base + ext)
  const arquivo = candidatos.find((candidato) => existsSync(candidato) && statSync(candidato).isFile()) ?? null
  return { arquivo, candidatos: arquivo ? [] : candidatos }
}

/** Arquivos do repositório que o app alcança pelos imports, a partir de src/ e das entradas de raiz. */
export function arquivosAlcancadosPeloApp(raiz = RAIZ_PADRAO) {
  // Além do app, o que o próprio job executa: configs do Playwright e specs de tests/visual.
  const configsPlaywright = existsSync(raiz)
    ? readdirSync(raiz).filter((nome) => /^playwright[^/]*\.config\.ts$/.test(nome)).map((nome) => join(raiz, nome))
    : []
  const fila = [
    ...listar(join(raiz, "src")),
    ...listar(join(raiz, "tests", "visual")),
    ...configsPlaywright,
    ...ENTRADAS_DE_RAIZ.map((f) => join(raiz, f)).filter((f) => existsSync(f)),
  ]
  const vistos = new Set()
  while (fila.length > 0) {
    const arquivo = fila.pop()
    if (vistos.has(arquivo)) continue
    vistos.add(arquivo)
    if (arquivo.endsWith(".json")) continue
    const fonte = readFileSync(arquivo, "utf8")
    for (const casamento of fonte.matchAll(ESPECIFICADOR)) {
      const { arquivo: alvo, candidatos } = resolverImport(raiz, arquivo, casamento[1])
      if (alvo && !alvo.includes("/node_modules/") && !vistos.has(alvo)) fila.push(alvo)
      // Import sem arquivo: os caminhos possíveis entram sem ser lidos.
      for (const candidato of candidatos) if (candidato.startsWith(raiz)) vistos.add(candidato)
    }
    for (const casamento of fonte.matchAll(CAMINHO_LITERAL)) {
      const alvo = join(raiz, casamento[1])
      // Entra no conjunto sem ser lido (dado não importa nada) e mesmo que o
      // diff o tenha apagado: o app continua tentando lê-lo.
      vistos.add(alvo)
    }
    for (const casamento of fonte.matchAll(CAMINHO_EM_PARTES)) {
      const caminho = [...casamento[1].matchAll(PARTE)].map((parte) => parte[1].replace(/^\.?\/+|\/+$/g, "")).join("/")
      if (DADO.test(caminho)) vistos.add(join(raiz, caminho))
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
