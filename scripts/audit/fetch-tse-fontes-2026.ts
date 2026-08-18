/**
 * Aquisicao oficial dos pacotes do TSE de 2026, versionada.
 *
 * ## Por que este arquivo existe
 *
 * A aquisicao vivia em `output/pf-reverificacao-20260809/fetch-tse-official.mjs`,
 * que e gitignorado. Num checkout limpo nao havia caminho para reobter os ZIPs,
 * entao a renovacao do registro `data/identidade-etapa2-2026.json` era uma data
 * sem procedimento: `revalidar_ate` cobrava um recheque que ninguem sabia
 * executar. Com o script versionado, a bomba-relogio tem desarme.
 *
 * ## Limites deliberados
 *
 * - **Faz rede.** Nunca entra em CI nem em workflow. E comando de operador.
 * - **Escreve fora do Git.** O destino default fica sob `output/`, que segue
 *   ignorado; 3,3 MB de ZIP nao pertencem ao repositorio.
 * - **Fail-closed.** HTTP diferente de 200, recurso ausente do catalogo ou
 *   corpo vazio abortam. Baixar meio pacote e pior que nao baixar: o
 *   classificador confere o sha256 contra o catalogo e reprovaria depois, longe
 *   da causa.
 * - **`--dry-run`** resolve o catalogo e imprime o que baixaria, sem gravar
 *   nada. E a forma barata de conferir que a fonte oficial continua no ar e com
 *   os mesmos nomes de recurso.
 */

import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const CATALOGO_URL = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026"

/** Nome do recurso no catalogo do TSE -> nome do arquivo local. */
export const RECURSOS_ESPERADOS: ReadonlyMap<string, string> = new Map([
  ["Candidatos", "consulta_cand_2026.zip"],
  ["Candidatos - Informações complementares", "consulta_cand_complementar_2026.zip"],
  ["Redes sociais de candidatos", "rede_social_candidato_2026.zip"],
])

interface RecursoCatalogo {
  name: string
  url: string
}

interface Catalogo {
  title?: string
  metadata_modified?: string
  license_title?: string
  resources: RecursoCatalogo[]
}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length)
}

export async function buscarCatalogo(): Promise<Catalogo> {
  const resposta = await fetch(CATALOGO_URL, { signal: AbortSignal.timeout(30_000) })
  if (!resposta.ok) throw new Error(`catalogo TSE HTTP ${resposta.status}`)
  const payload = (await resposta.json()) as { result?: Catalogo }
  const catalogo = payload.result
  if (!catalogo?.resources?.length) {
    throw new Error("catalogo TSE sem lista de recursos; a fonte mudou de formato")
  }
  return catalogo
}

/** Confere que os tres recursos esperados existem, antes de baixar qualquer um. */
export function resolverRecursos(catalogo: Catalogo): { nome: string; arquivo: string; url: string }[] {
  const encontrados: { nome: string; arquivo: string; url: string }[] = []
  for (const [nome, arquivo] of RECURSOS_ESPERADOS) {
    const recurso = catalogo.resources.find((r) => r.name === nome)
    if (!recurso) {
      throw new Error(
        `recurso ausente do catalogo oficial: "${nome}". ` +
          `Recursos publicados: ${catalogo.resources.map((r) => r.name).join(" | ")}`,
      )
    }
    encontrados.push({ nome, arquivo, url: recurso.url })
  }
  return encontrados
}

async function main(): Promise<void> {
  const destino = resolve(argumento("destino") ?? "output/pf-reverificacao-20260809/sources")
  const dryRun = process.argv.includes("--dry-run")

  const catalogo = await buscarCatalogo()
  const recursos = resolverRecursos(catalogo)

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          catalogo_url: CATALOGO_URL,
          catalogo_metadata_modified: catalogo.metadata_modified ?? null,
          destino,
          baixaria: recursos,
        },
        null,
        2,
      ),
    )
    return
  }

  mkdirSync(destino, { recursive: true })

  const gravados = []
  for (const recurso of recursos) {
    const resposta = await fetch(recurso.url, { signal: AbortSignal.timeout(120_000) })
    if (!resposta.ok) throw new Error(`${recurso.nome}: HTTP ${resposta.status}`)
    const corpo = Buffer.from(await resposta.arrayBuffer())
    if (corpo.byteLength === 0) throw new Error(`${recurso.nome}: corpo vazio`)
    const caminho = join(destino, recurso.arquivo)
    writeFileSync(caminho, corpo)
    gravados.push({
      name: recurso.nome,
      url: recurso.url,
      arquivo: recurso.arquivo,
      bytes: corpo.byteLength,
      sha256: createHash("sha256").update(corpo).digest("hex"),
      http_last_modified: resposta.headers.get("last-modified"),
      etag: resposta.headers.get("etag"),
    })
  }

  const evidencia = {
    fetched_at: new Date().toISOString(),
    catalog_url: CATALOGO_URL,
    catalog_title: catalogo.title ?? null,
    catalog_metadata_modified: catalogo.metadata_modified ?? null,
    catalog_license: catalogo.license_title ?? null,
    // `path` absoluto foi removido de proposito: identificava a maquina e nunca
    // foi lido por consumidor nenhum.
    resources: gravados,
    catalog_resource_names: catalogo.resources.map((r) => r.name),
  }
  writeFileSync(join(destino, "catalog.json"), `${JSON.stringify(evidencia, null, 2)}\n`)
  console.log(JSON.stringify(evidencia, null, 2))
}

if (process.argv[1]?.endsWith("/scripts/audit/fetch-tse-fontes-2026.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
