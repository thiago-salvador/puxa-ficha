import { fileURLToPath } from "node:url"

const CAMINHOS_ESTRUTURAIS = [
  "package.json",
  ".github/workflows/",
  "scripts/audit/",
]

const MARCADORES_DE_DOMINIO = [
  /(^|[/_-])programas?(?:-governo)?(?=$|[/_.-])/,
  /(^|[/_-])pesquisas?(?:-eleitorais?)?(?=$|[/_.-])/,
]

export function caminhoAcionaAuditoriasDeDominio(caminho) {
  const normalizado = caminho.trim().replaceAll("\\", "/").toLowerCase()

  if (!normalizado) return false

  if (
    CAMINHOS_ESTRUTURAIS.some((alvo) =>
      alvo.endsWith("/") ? normalizado.startsWith(alvo) : normalizado === alvo,
    )
  ) {
    return true
  }

  return MARCADORES_DE_DOMINIO.some((marcador) => marcador.test(normalizado))
}

export function diffAcionaAuditoriasDeDominio(caminhos) {
  return caminhos.some(caminhoAcionaAuditoriasDeDominio)
}

async function lerStdin() {
  let entrada = ""
  for await (const trecho of process.stdin) entrada += trecho
  return entrada
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entrada = await lerStdin()
  const caminhos = entrada.split(/\r?\n/)
  process.stdout.write(diffAcionaAuditoriasDeDominio(caminhos) ? "true\n" : "false\n")
}
