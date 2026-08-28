import { existsSync } from "node:fs"
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import path, { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  renderizarProgramaGovernoRevisaoRegional,
  contarEstadosProgramaGovernoRevisao,
  assertProgramaGovernoRevisaoSemAprovado,
  type ProgramaGovernoRevisaoRegistro,
} from "./lib/programas-governo-revisao-html"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export type OndaDefinicao = { regiao: string; ufs: readonly string[] }

export const ONDAS: readonly OndaDefinicao[] = [
  { regiao: "norte", ufs: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"] },
  { regiao: "nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { regiao: "centro-oeste", ufs: ["DF", "GO", "MS", "MT"] },
  { regiao: "sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  { regiao: "sul", ufs: ["PR", "RS", "SC"] },
]

const REGIAO_TITULO: Record<string, string> = {
  norte: "Onda Norte",
  nordeste: "Onda Nordeste",
  "centro-oeste": "Onda Centro-Oeste",
  sudeste: "Onda Sudeste",
  sul: "Sul e revisão consolidada",
}

type InventarioMinimo = {
  escopo?: { ano?: number; cargo?: string }
  candidaturas?: Array<{ uf: string; chave: string }>
}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length)
}

async function lerRegistrosDaOnda(diretorioOndas: string, onda: OndaDefinicao): Promise<{ registros: ProgramaGovernoRevisaoRegistro[]; ufsPresentes: string[] }> {
  const registros: ProgramaGovernoRevisaoRegistro[] = []
  const ufsPresentes: string[] = []
  for (const uf of onda.ufs) {
    let ufDir: string
    try {
      ufDir = path.join(diretorioOndas, onda.regiao, uf)
      await readdir(ufDir)
    } catch {
      continue
    }
    const arquivos = (await readdir(ufDir)).filter((arquivo) => arquivo.endsWith(".json")).sort()
    for (const arquivo of arquivos) {
      registros.push(JSON.parse(await readFile(path.join(ufDir, arquivo), "utf8")) as ProgramaGovernoRevisaoRegistro)
    }
    if (arquivos.length > 0 || (await readdir(ufDir)).length >= 0) ufsPresentes.push(uf)
  }
  return { registros, ufsPresentes }
}

async function esperadoPorRegiaoDoInventario(inventarioPath: string): Promise<Record<string, Record<string, string[]>>> {
  const inventory = JSON.parse(await readFile(inventarioPath, "utf8")) as InventarioMinimo
  if (inventory?.escopo?.ano !== 2026 || inventory?.escopo?.cargo !== "GOVERNADOR" || !Array.isArray(inventory.candidaturas)) {
    throw new Error("inventario fora do escopo 2026:GOVERNADOR")
  }
  const porRegiao: Record<string, Record<string, string[]>> = {}
  for (const onda of ONDAS) {
    porRegiao[onda.regiao] = {}
    for (const uf of onda.ufs) {
      porRegiao[onda.regiao][uf] = inventory.candidaturas
        .filter(({ uf: candidaturaUf }) => candidaturaUf === uf)
        .map(({ chave }) => chave)
        .sort()
    }
  }
  return porRegiao
}

export type RevisaoConsolidadaResultado = {
  porRegiao: Record<string, Record<string, number>>
  totalRegistros: number
  coberturaExata: boolean
  pendenciasCobertura: string[]
}

export async function gerarRevisaoConsolidada(
  diretorioOndas: string,
  destinoRaiz: string,
  opcoes: { inventarioPath?: string } = {},
): Promise<RevisaoConsolidadaResultado> {
  const porRegiao: Record<string, Record<string, number>> = {}
  let totalRegistros = 0
  const pendenciasCobertura: string[] = []
  const esperado = opcoes.inventarioPath ? await esperadoPorRegiaoDoInventario(opcoes.inventarioPath) : null
  for (const onda of ONDAS) {
    const { registros, ufsPresentes } = await lerRegistrosDaOnda(diretorioOndas, onda)
    assertProgramaGovernoRevisaoSemAprovado(registros)
    porRegiao[onda.regiao] = contarEstadosProgramaGovernoRevisao(registros)
    totalRegistros += registros.length
    // Cobertura exata contra o inventario: cada UF presente com contagem exata.
    if (esperado) {
      for (const uf of onda.ufs) {
        const identidadesEsperadas = esperado[onda.regiao]?.[uf] ?? []
        if (identidadesEsperadas.length === 0) continue
        const identidadesPresentes = registros
          .filter((registro) => registro.fonte.uf === uf)
          .map((registro) => registro.ingestao?.identityKey ?? "")
          .sort()
        const conjuntoPresente = new Set(identidadesPresentes)
        const faltantes = identidadesEsperadas.filter((chave) => !conjuntoPresente.has(chave))
        const extras = [...conjuntoPresente].filter((chave) => !identidadesEsperadas.includes(chave))
        const duplicadas = identidadesPresentes.filter((chave, indice) => chave === identidadesPresentes[indice - 1])
        if (!ufsPresentes.includes(uf)) {
          pendenciasCobertura.push(`${onda.regiao}/${uf}: sem diretório de resultados (esperadas ${identidadesEsperadas.length} candidaturas)`)
        } else if (faltantes.length || extras.length || duplicadas.length) {
          pendenciasCobertura.push(`${onda.regiao}/${uf}: identidades divergentes (faltantes=${faltantes.length}, extras=${extras.length}, duplicadas=${duplicadas.length})`)
        }
      }
    }
    if (registros.length === 0) continue
    const dirRegional = path.join(destinoRaiz, onda.regiao)
    await mkdir(dirRegional, { recursive: true })
    await writeFile(
      path.join(dirRegional, "review.html"),
      renderizarProgramaGovernoRevisaoRegional(registros, {
        titulo: `Programas de governo 2026 · Governadores · ${REGIAO_TITULO[onda.regiao]}`,
        mensagemNadaAprovado: true,
        resolverLinkTextoExtraido: (registro) => linkTextoExtraido(registro, dirRegional),
      }),
    )
  }
  const totalEsperado = esperado
    ? Object.entries(esperado).reduce((total, [, porUf]) => total + Object.values(porUf).reduce((subtotal, identidades) => subtotal + identidades.length, 0), 0)
    : null
  const coberturaExata = esperado !== null && pendenciasCobertura.length === 0 && totalRegistros === totalEsperado
  const estadoTexto = esperado === null
    ? `cobertura não verificável (${totalRegistros} de 198; rode com --inventario para verificação exata)`
    : coberturaExata ? `cobertura exata confirmada (${totalRegistros}/198)` : `cobertura incompleta: ${pendenciasCobertura.length} pendência(s); ${totalRegistros} de 198`
  const links = ONDAS.map((onda) => (
    `<li><a href="./${onda.regiao}/review.html">${REGIAO_TITULO[onda.regiao]}</a> (${Object.entries(porRegiao[onda.regiao] ?? {}).map(([estado, total]) => `${estado}=${total}`).join(", ") || "pendente"})</li>`
  )).join("")
  const indice = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Programas de governo 2026 · Governadores · Revisão consolidada</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:900px;margin:auto;padding:24px}.faixa{background:#b91c1c;color:#fff;padding:10px 14px;border-radius:8px;font-weight:700}</style></head><body>
<p class="faixa">NADA APROVADO. Este artefato não publica nenhum conteúdo pendente; é inventário local de auditoria.</p>
<h1>Programas de governo 2026 · Governadores · Revisão consolidada</h1>
<p>Candidaturas contabilizadas: <strong>${estadoTexto}</strong>.</p>
${pendenciasCobertura.length ? `<details open><summary>Pendências de cobertura</summary><ul>${pendenciasCobertura.map((item) => `<li>${item}</li>`).join("")}</ul></details>` : ""}
<ul>${links}</ul></body></html>`
  await mkdir(destinoRaiz, { recursive: true })
  await writeFile(path.join(destinoRaiz, "index.html"), indice)
  return { porRegiao, totalRegistros, coberturaExata, pendenciasCobertura }
}

/** Só devolve caminho se o arquivo de texto extraído existir de fato no disco. */
function linkTextoExtraido(registro: ProgramaGovernoRevisaoRegistro, dirRegional: string): string | null {
  const { slug, uf } = registro.fonte
  if (!slug || !registro.documentos?.length) return null
  const alvoNoRepo = path.join(RAIZ, "src", "data", "programas-governo", "governadores-2026", uf, `${slug}.json`)
  if (!existsSync(alvoNoRepo)) return null
  const relativo = path.relative(dirRegional, alvoNoRepo)
  return relativo.split(path.sep).map(encodeURIComponent).join("/")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inventarioArg = argumento("inventario")
  void gerarRevisaoConsolidada(
    argumento("ondas-dir") ?? "/tmp/pf-gov-ondas",
    argumento("destino") ?? path.join(RAIZ, "docs/reviews/programas-governo-governadores-2026"),
    { ...(inventarioArg ? { inventarioPath: resolve(inventarioArg) } : {}) },
  ).then(({ totalRegistros, coberturaExata, pendenciasCobertura }) => {
    if (inventarioArg && !coberturaExata) {
      console.error(`REVISAO_CONSOLIDADA_COBERTURA_INCOMPLETA registros=${totalRegistros}`)
      console.error(pendenciasCobertura.map((item) => `PENDENTE ${item}`).join("\n"))
      process.exitCode = 1
      return
    }
    if (!inventarioArg) {
      console.log(`REVISAO_CONSOLIDADA_SEM_VERIFICACAO_INVENTARIO registros=${totalRegistros} (token de PASS proibido sem --inventario)`)
      process.exitCode = 2
      return
    }
    console.log(`REVISAO_CONSOLIDADA_PASS registros=${totalRegistros} cobertura=exata`)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
