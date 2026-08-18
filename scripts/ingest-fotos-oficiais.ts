/**
 * Promove fotos oficiais do DivulgaCand para fichas públicas sem foto real.
 *
 * Dry-run é o default: consulta o banco, valida identidade por SQ/UF/cargo e
 * CPF quando presente, baixa os arquivos locais e imprime o plano nominal.
 * `--apply` é a única forma de atualizar `candidatos`, sempre por
 * `escreverAuditado` e com guarda no valor original de `foto_url`.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { isPhotoPlaceholder } from "../src/lib/photo-placeholder"
import { ativarDryRun } from "./lib/dry-run"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

const DIVULGACAND = "https://divulgacandcontas.tse.jus.br/divulga"
const MIN_PHOTO_BYTES = 5_000
const FOTO_CREDITO_OFICIAL = "Foto oficial de candidatura (TSE/DivulgaCand 2026)"

export interface AlvoFotoOficial {
  slug: string
  estado: string | null
  cargo_disputado: string | null
  cpf: string | null
  foto_url: string | null
}

export interface AncoraFotoOficial {
  slug: string
  sq_candidato: string
  uf: string
  cargo: string
  fonte: string
}

export interface CandidaturaDivulgaCand {
  id?: string | number | null
  cpf?: string | null
  ufCandidatura?: string | null
  cargo?: { nome?: string | null } | null
}

export interface DownloadFotoOficial {
  status: number
  contentType: string | null
  bytes: Uint8Array
  sourceUrl: string
}

export interface FotoLocal {
  path: string
  sha256: string
  size: number
}

export interface DependenciasFotosOficiais {
  buscarCandidatura(ancora: AncoraFotoOficial): Promise<CandidaturaDivulgaCand>
  baixarFoto(ancora: AncoraFotoOficial): Promise<DownloadFotoOficial>
  salvarFoto(slug: string, bytes: Uint8Array): Promise<FotoLocal>
  aplicarPatch(alvo: AlvoFotoOficial, patch: Record<string, unknown>): Promise<number>
}

interface ItemNominal {
  slug: string
  motivo: string
}

export interface RelatorioFotosOficiais {
  aplicaveis: Array<FotoLocal & { slug: string; sourceUrl: string }>
  sem_oficial: ItemNominal[]
  identidade_fraca: ItemNominal[]
  erros: ItemNominal[]
  ignorados_foto_real: string[]
  placeholders_removidos: string[]
  /** Patch guardado que tocou 0 linhas: o foto_url mudou entre carregarAlvos
   *  e o apply. É conflito a re-rodar, nunca sucesso silencioso. */
  conflitos_guarda: string[]
}

function normalizarTexto(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function normalizarCpf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

function razoesDeIdentidade(
  alvo: AlvoFotoOficial,
  ancora: AncoraFotoOficial,
  candidatura: CandidaturaDivulgaCand,
): string[] {
  const razoes: string[] = []
  if (String(candidatura.id ?? "") !== ancora.sq_candidato) razoes.push("SQ divergente")
  if (normalizarTexto(candidatura.ufCandidatura) !== normalizarTexto(ancora.uf)) {
    razoes.push("UF divergente")
  }
  if (normalizarTexto(candidatura.cargo?.nome) !== normalizarTexto(ancora.cargo)) {
    razoes.push("cargo divergente")
  }
  const cpfFicha = normalizarCpf(alvo.cpf)
  if (cpfFicha && normalizarCpf(candidatura.cpf) !== cpfFicha) razoes.push("CPF divergente")
  return razoes
}

/**
 * Estrutura mínima de um JPEG íntegro: SOI (ff d8 ff) no início e EOI (ff d9)
 * no fim. O trailer pega download truncado e blob arbitrário que só imita o
 * prefixo; decodificação completa exigiria dependência nova, desproporcional
 * para bytes vindos do endpoint oficial do TSE (thread do CodeRabbit no #217).
 */
function bytesSaoJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  )
}

/** Primeiros bytes em hex, para o motivo de sem_oficial dizer o que veio de fato. */
function assinaturaHex(bytes: Uint8Array): string {
  if (bytes.length === 0) return "vazia"
  return Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join(" ")
}

function fotoAplicavel(download: DownloadFotoOficial): boolean {
  // O arquivo é salvo como `/candidates/<slug>.jpg`, então quem decide é a
  // ASSINATURA dos bytes, não o content-type: no apply de 16/08 o DivulgaCand
  // serviu as fotos dos 2 alvos de SP com `content-type: image/png` e bytes
  // JPEG legítimos, o filtro por header derrubou os dois em sem_oficial e o
  // ramo "placeholder sem oficial" zerou o foto_url de quem tinha foto boa
  // esperando. PNG/WebP/SVG de verdade continuam reprovados pela assinatura,
  // que era a preocupação da thread do CodeRabbit no PR #214; o content-type
  // segue registrado no motivo de sem_oficial só como diagnóstico.
  return download.status === 200 && download.bytes.length > MIN_PHOTO_BYTES && bytesSaoJpeg(download.bytes)
}

async function removerPlaceholder(
  apply: boolean,
  alvo: AlvoFotoOficial,
  deps: DependenciasFotosOficiais,
  relatorio: RelatorioFotosOficiais,
) {
  if (!apply || !isPhotoPlaceholder(alvo.foto_url)) return
  const tocadas = await deps.aplicarPatch(alvo, { foto_url: null, foto_credito: null })
  if (tocadas > 0) relatorio.placeholders_removidos.push(alvo.slug)
  else relatorio.conflitos_guarda.push(alvo.slug)
}

export async function executarIngestFotosOficiais(params: {
  apply: boolean
  alvos: AlvoFotoOficial[]
  ancoras: AncoraFotoOficial[]
  deps: DependenciasFotosOficiais
}): Promise<RelatorioFotosOficiais> {
  const { apply, deps } = params
  const relatorio: RelatorioFotosOficiais = {
    aplicaveis: [],
    sem_oficial: [],
    identidade_fraca: [],
    erros: [],
    ignorados_foto_real: [],
    placeholders_removidos: [],
    conflitos_guarda: [],
  }
  const ancoras = new Map<string, AncoraFotoOficial>()
  for (const ancora of params.ancoras) {
    if (ancoras.has(ancora.slug)) throw new Error(`âncora duplicada para ${ancora.slug}`)
    ancoras.set(ancora.slug, ancora)
  }

  for (const alvo of [...params.alvos].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (alvo.foto_url && !isPhotoPlaceholder(alvo.foto_url)) {
      relatorio.ignorados_foto_real.push(alvo.slug)
      continue
    }

    const ancora = ancoras.get(alvo.slug)
    if (
      !ancora ||
      normalizarTexto(alvo.estado) !== normalizarTexto(ancora.uf) ||
      normalizarTexto(alvo.cargo_disputado) !== normalizarTexto(ancora.cargo)
    ) {
      relatorio.identidade_fraca.push({
        slug: alvo.slug,
        motivo: ancora ? "âncora não confere com UF/cargo da ficha" : "sem âncora SQ 2026 congelada",
      })
      await removerPlaceholder(apply, alvo, deps, relatorio)
      continue
    }

    let candidatura: CandidaturaDivulgaCand
    try {
      candidatura = await deps.buscarCandidatura(ancora)
    } catch (error) {
      relatorio.erros.push({
        slug: alvo.slug,
        motivo: `falha ao consultar identidade: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    const razoes = razoesDeIdentidade(alvo, ancora, candidatura)
    if (razoes.length > 0) {
      relatorio.identidade_fraca.push({ slug: alvo.slug, motivo: razoes.join(", ") })
      await removerPlaceholder(apply, alvo, deps, relatorio)
      continue
    }

    let download: DownloadFotoOficial
    try {
      download = await deps.baixarFoto(ancora)
    } catch (error) {
      relatorio.erros.push({
        slug: alvo.slug,
        motivo: `falha ao baixar foto: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    if (!fotoAplicavel(download)) {
      relatorio.sem_oficial.push({
        slug: alvo.slug,
        motivo: `resposta ${download.status}, ${download.contentType ?? "sem content-type"}, ${download.bytes.length} bytes, assinatura ${assinaturaHex(download.bytes)}`,
      })
      await removerPlaceholder(apply, alvo, deps, relatorio)
      continue
    }

    let local: FotoLocal
    try {
      local = await deps.salvarFoto(alvo.slug, download.bytes)
    } catch (error) {
      relatorio.erros.push({
        slug: alvo.slug,
        motivo: `falha ao salvar foto local: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    relatorio.aplicaveis.push({ slug: alvo.slug, sourceUrl: download.sourceUrl, ...local })

    if (apply) {
      const tocadas = await deps.aplicarPatch(alvo, {
        foto_url: local.path,
        foto_credito: {
          origem: "tse",
          fonte_url: download.sourceUrl,
          descricao: FOTO_CREDITO_OFICIAL,
        },
      })
      if (tocadas === 0) relatorio.conflitos_guarda.push(alvo.slug)
    }
  }

  return relatorio
}

interface ManifestoFotos {
  codigo_eleicao: string
  ancoras: AncoraFotoOficial[]
}

function carregarManifesto(): ManifestoFotos {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "data/fotos-oficiais-2026.json"), "utf8"),
  ) as ManifestoFotos
}

async function carregarAlvos(): Promise<AlvoFotoOficial[]> {
  const { data, error } = await supabase
    .from("candidatos")
    .select("slug, estado, cargo_disputado, cpf, foto_url")
    .eq("publicavel", true)
    .neq("status", "removido")
    .order("slug")
  if (error) throw new Error(`falha ao carregar candidatos: ${error.message}`)
  return (data ?? []) as AlvoFotoOficial[]
}

function dependenciasReais(codigoEleicao: string): DependenciasFotosOficiais {
  return {
    async buscarCandidatura(ancora) {
      const url = `${DIVULGACAND}/rest/v1/candidatura/buscar/2026/${ancora.uf}/${codigoEleicao}/candidato/${ancora.sq_candidato}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentType = response.headers.get("content-type")
      if (!contentType?.toLowerCase().includes("application/json")) {
        throw new Error(`content-type inesperado: ${contentType ?? "ausente"}`)
      }
      return (await response.json()) as CandidaturaDivulgaCand
    },
    async baixarFoto(ancora) {
      const sourceUrl = `${DIVULGACAND}/rest/arquivo/img/${codigoEleicao}/${ancora.sq_candidato}/${ancora.uf}`
      const response = await fetch(sourceUrl)
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: new Uint8Array(await response.arrayBuffer()),
        sourceUrl,
      }
    },
    async salvarFoto(slug, bytes) {
      const directory = resolve(process.cwd(), "public/candidates")
      const file = resolve(directory, `${slug}.jpg`)
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      mkdirSync(directory, { recursive: true })
      if (existsSync(file)) {
        const atual = readFileSync(file)
        const hashAtual = createHash("sha256").update(atual).digest("hex")
        if (hashAtual !== sha256) {
          throw new Error("arquivo local já existe com conteúdo diferente")
        }
      } else {
        writeFileSync(file, bytes)
      }
      return { path: `/candidates/${slug}.jpg`, sha256, size: bytes.length }
    },
    async aplicarPatch(alvo, patch) {
      return (
        await escreverAuditado(
          {
            script: "ingest-fotos-oficiais",
            tabela: "candidatos",
            motivo: "promove foto oficial TSE ou remove placeholder persistido",
            recorte: alvo.slug,
          },
          () => {
            let query = supabase
              .from("candidatos")
              .update(patch)
              .eq("slug", alvo.slug)
              .eq("publicavel", true)
              .neq("status", "removido")
            query = alvo.foto_url == null
              ? query.is("foto_url", null)
              : query.eq("foto_url", alvo.foto_url)
            return query.select("slug")
          },
        )
      ).length
    },
  }
}

function flagValor(nome: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

function imprimirGrupo(nome: string, itens: ItemNominal[]) {
  console.log(`${nome}: ${itens.length}`)
  for (const item of itens) console.log(`  ${item.slug}: ${item.motivo}`)
}

async function main() {
  const apply = process.argv.includes("--apply")
  if (!apply) ativarDryRun()
  const manifesto = carregarManifesto()
  const relatorio = await executarIngestFotosOficiais({
    apply,
    alvos: await carregarAlvos(),
    ancoras: manifesto.ancoras,
    deps: dependenciasReais(manifesto.codigo_eleicao),
  })

  console.log(`ingest-fotos-oficiais: ${apply ? "APPLY" : "DRY-RUN"}`)
  console.log(`aplicáveis: ${relatorio.aplicaveis.length}`)
  for (const item of relatorio.aplicaveis) {
    console.log(`  ${item.slug}: ${item.path} ${item.size} bytes sha256=${item.sha256}`)
  }
  imprimirGrupo("sem-oficial", relatorio.sem_oficial)
  imprimirGrupo("identidade-fraca", relatorio.identidade_fraca)
  imprimirGrupo("erros", relatorio.erros)
  console.log(`fotos reais ignoradas: ${relatorio.ignorados_foto_real.length}`)
  console.log(`placeholders removidos: ${relatorio.placeholders_removidos.length}`)
  // Conflito de guarda invisível foi o que obrigou conciliação manual no apply
  // de 16/08: o grupo estava só no JSON opcional e o exit era 0.
  console.log(`conflitos de guarda: ${relatorio.conflitos_guarda.length}`)
  for (const slug of relatorio.conflitos_guarda) console.log(`  ${slug}: re-rodar, foto_url mudou entre a leitura e o patch`)

  const json = flagValor("json")
  if (json) writeFileSync(resolve(process.cwd(), json), `${JSON.stringify(relatorio, null, 2)}\n`)
  if (relatorio.erros.length > 0 || relatorio.conflitos_guarda.length > 0) process.exit(1)
}

if (process.argv[1]?.endsWith("ingest-fotos-oficiais.ts")) {
  main().catch((error) => {
    console.error("ingest-fotos-oficiais falhou:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
