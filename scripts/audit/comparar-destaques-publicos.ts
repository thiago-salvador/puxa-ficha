import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

type Assinatura = { slug: string; assinaturaConteudo: string }

function normalizar(linhas: unknown): Assinatura[] {
  if (!Array.isArray(linhas)) throw new Error("lista de assinaturas ausente")
  const saida = linhas.map((linha) => {
    if (
      !linha ||
      typeof linha !== "object" ||
      typeof (linha as Assinatura).slug !== "string" ||
      !/^[0-9a-f]{64}$/.test((linha as Assinatura).assinaturaConteudo)
    ) {
      throw new Error("assinatura de Destaques inválida")
    }
    return { slug: (linha as Assinatura).slug, assinaturaConteudo: (linha as Assinatura).assinaturaConteudo }
  })
  if (new Set(saida.map((linha) => linha.slug)).size !== saida.length) {
    throw new Error("slug duplicado nas assinaturas de Destaques")
  }
  return saida.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function compararAssinaturasDestaques(local: unknown, publico: unknown): void {
  const localObj = local as { resumo?: { fichasDetalhe?: unknown } }
  const publicoObj = publico as { destaquesPorFicha?: unknown }
  const esperado = normalizar(localObj.resumo?.fichasDetalhe).map(({ slug, assinaturaConteudo }) => ({
    slug,
    assinaturaConteudo,
  }))
  const recebido = normalizar(publicoObj.destaquesPorFicha)
  if (esperado.length !== 194 || JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    throw new Error("conteúdo público de Destaques diverge do banco canônico")
  }
}

export function compararAssinaturasSuperficie(local: unknown, publico: unknown): void {
  const localObj = local as {
    universo?: Array<{ slug?: unknown; assinaturas?: { dinheiro?: unknown; perfilCompleto?: unknown } }>
  }
  const publicoObj = publico as {
    superficiePorFicha?: Array<{ slug?: unknown; dinheiro?: unknown; perfilCompleto?: unknown }>
  }
  const esperado = normalizarSuperficie(
    (localObj.universo ?? []).map((item) => ({ slug: item.slug, ...item.assinaturas })),
  )
  const recebido = normalizarSuperficie(publicoObj.superficiePorFicha)
  if (esperado.length !== 194 || JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    throw new Error("Dinheiro/trajetória públicos divergem do banco canônico")
  }
}

function normalizarSuperficie(linhas: unknown): Array<{
  slug: string
  dinheiro: string
  perfilCompleto: string
}> {
  if (!Array.isArray(linhas)) throw new Error("lista de assinaturas da superfície ausente")
  const saida = linhas.map((linha) => {
    if (!linha || typeof linha !== "object") throw new Error("assinatura da superfície inválida")
    const item = linha as { slug?: unknown; dinheiro?: unknown; perfilCompleto?: unknown }
    if (
      typeof item.slug !== "string" ||
      typeof item.dinheiro !== "string" ||
      typeof item.perfilCompleto !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.dinheiro) ||
      !/^[0-9a-f]{64}$/.test(item.perfilCompleto)
    ) {
      throw new Error("assinatura da superfície inválida")
    }
    return {
      slug: item.slug,
      dinheiro: item.dinheiro,
      perfilCompleto: item.perfilCompleto,
    }
  })
  if (new Set(saida.map((item) => item.slug)).size !== saida.length) {
    throw new Error("slug duplicado nas assinaturas da superfície")
  }
  return saida.sort((a, b) => a.slug.localeCompare(b.slug))
}

function main(): void {
  const [localPath, dinheiroPath, publicoPath] = process.argv.slice(2)
  if (!localPath || !dinheiroPath || !publicoPath) {
    throw new Error("uso: comparar-destaques-publicos.ts DESTAQUES.json DINHEIRO.json PUBLICO.json")
  }
  const publico = JSON.parse(readFileSync(publicoPath, "utf8"))
  compararAssinaturasDestaques(
    JSON.parse(readFileSync(localPath, "utf8")),
    publico,
  )
  compararAssinaturasSuperficie(JSON.parse(readFileSync(dinheiroPath, "utf8")), publico)
  console.log("PASS: conteúdo público coincide com o banco canônico")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
