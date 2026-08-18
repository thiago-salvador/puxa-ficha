/**
 * Reauditoria read-only das fontes factuais das fichas vazias em Destaques.
 *
 * O script deriva o universo do readback real, consulta CEIS/CNEP/CEAF apenas
 * com CPF válido e baixa os pacotes atuais consulta_cand/bem_candidato do TSE
 * apenas para SQs versionados. Não abre nenhum verbo de escrita no Supabase.
 * Processos são incorporados de um recibo judicial já executado, com SHA-256;
 * votações sem ID Câmara/Senado continuam não coletadas.
 *
 * Uso:
 *   PF_DRY_RUN=1 node --import tsx scripts/audit/auditar-fontes-destaques-vazios.ts \
 *     --judicial=/caminho/retry-djen-28.json --out=QA/evidencias/.../fontes-32.json
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

import { supabase } from "../lib/supabase"
import { cpfEhValido } from "../lib/cpf"
import { coletarSancoesDoCandidato } from "../lib/ingest-transparencia-sanctions"
import { parseCSV } from "../lib/parse-csv-local"
import { normalizeForMatch } from "../lib/helpers"
import {
  classificarPatrimonioTse,
  classificarTrajetoriaTse,
  parseValorTse,
  type CandidaturaTseAuditada,
} from "./lib/destaques-fontes-externas"

interface Args {
  readback: string
  judicial: string | null
  out: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    readback: "QA/evidencias/2026-08-10-item4-14-destaques/readback-destaques.json",
    judicial: null,
    out: "QA/evidencias/2026-08-10-item4-14-destaques/auditoria-fontes-32.json",
  }
  for (const raw of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(raw)
    if (!match) throw new Error(`opção inválida: ${raw}`)
    const [, chave, valor] = match
    if (chave === "readback") args.readback = valor
    else if (chave === "judicial") args.judicial = valor
    else if (chave === "out") args.out = valor
    else throw new Error(`opção desconhecida: --${chave}`)
  }
  return args
}

function sha256Arquivo(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

async function baixar(url: string, destino: string): Promise<{ sha256: string; bytes: number }> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!resposta.ok || !resposta.body) throw new Error(`${url}: HTTP ${resposta.status}`)
  const hash = createHash("sha256")
  const contador = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(resposta.body as import("node:stream/web").ReadableStream),
    contador,
    createWriteStream(destino),
  )
  return { sha256: hash.digest("hex"), bytes: statSync(destino).size }
}

function extrairCsvs(zip: string, destino: string, ufs: ReadonlySet<string>): string[] {
  mkdirSync(destino, { recursive: true })
  const entradas = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.toLowerCase().endsWith(".csv"))
    .filter((item) => {
      const nome = item.split("/").at(-1)?.toUpperCase() ?? ""
      return [...ufs].some((uf) => nome.endsWith(`_${uf}.CSV`))
    })
  if (entradas.length === 0) {
    throw new Error(`${zip}: nenhum CSV encontrado para ${[...ufs].join(", ")}`)
  }
  execFileSync("unzip", ["-o", "-q", zip, ...entradas, "-d", destino])
  return (readdirSync(destino, { recursive: true }) as string[])
    .filter((item) => item.toLowerCase().endsWith(".csv"))
    .map((item) => join(destino, item))
}

function nomesCompativeis(esperado: string, observado: string): boolean {
  const a = normalizeForMatch(esperado)
  const b = normalizeForMatch(observado)
  if (a.length < 8 || b.length < 8) return false
  return a === b || a.includes(b) || b.includes(a)
}

interface CandidatoBanco {
  id: string
  slug: string
  nome_completo: string
  cpf: string | null
  estado: string | null
}

interface AlvoTse {
  slug: string
  nome: string
  ano: number
  sq: string
  uf: string
}

interface PacoteAuditado {
  ano: number
  consultaCand: { url: string; sha256: string; bytes: number }
  bemCandidato: { url: string; sha256: string; bytes: number }
}

async function auditarTse(
  alvos: readonly AlvoTse[],
): Promise<{ porSlug: Map<string, CandidaturaTseAuditada[]>; pacotes: PacoteAuditado[] }> {
  const porSlug = new Map<string, CandidaturaTseAuditada[]>()
  const pacotes: PacoteAuditado[] = []
  const trabalho = mkdtempSync(join(tmpdir(), "pf-destaques-fontes-"))
  try {
    for (const ano of [...new Set(alvos.map((item) => item.ano))].sort()) {
      const alvosAno = alvos.filter((item) => item.ano === ano)
      const porSq = new Map(alvosAno.map((item) => [item.sq, item]))
      const ufs = new Set(alvosAno.map((item) => item.uf.toUpperCase()))
      const urlConsulta = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
      const urlBens = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`
      const zipConsulta = join(trabalho, `consulta_cand_${ano}.zip`)
      const zipBens = join(trabalho, `bem_candidato_${ano}.zip`)
      const [metaConsulta, metaBens] = await Promise.all([
        baixar(urlConsulta, zipConsulta),
        baixar(urlBens, zipBens),
      ])
      pacotes.push({
        ano,
        consultaCand: { url: urlConsulta, ...metaConsulta },
        bemCandidato: { url: urlBens, ...metaBens },
      })

      const hits = new Map<string, Array<Record<string, string>>>()
      for (const csv of extrairCsvs(zipConsulta, join(trabalho, `consulta-${ano}`), ufs)) {
        await parseCSV(csv, (row) => {
          const sq = (row.SQ_CANDIDATO ?? "").trim()
          if (!porSq.has(sq)) return
          hits.set(sq, [...(hits.get(sq) ?? []), row])
        })
      }
      const bens = new Map<string, { quantidade: number; total: number }>()
      for (const csv of extrairCsvs(zipBens, join(trabalho, `bens-${ano}`), ufs)) {
        await parseCSV(csv, (row) => {
          const sq = (row.SQ_CANDIDATO ?? "").trim()
          if (!porSq.has(sq)) return
          const atual = bens.get(sq) ?? { quantidade: 0, total: 0 }
          atual.quantidade++
          atual.total += parseValorTse(row.VR_BEM_CANDIDATO)
          bens.set(sq, atual)
        })
      }

      for (const alvo of alvosAno) {
        const encontrados = hits.get(alvo.sq) ?? []
        const nomesOk = encontrados.filter((row) => nomesCompativeis(alvo.nome, row.NM_CANDIDATO ?? ""))
        const identidade =
          encontrados.length === 1 && nomesOk.length === 1
            ? "confirmada"
            : encontrados.length === 0
              ? "nao_localizada"
              : "ambigua"
        const row = identidade === "confirmada" ? nomesOk[0] : null
        const patrimonio = bens.get(alvo.sq) ?? { quantidade: 0, total: 0 }
        const item: CandidaturaTseAuditada = {
          ano,
          sq: alvo.sq,
          identidade,
          resultadoEleitoral: row?.DS_SIT_TOT_TURNO?.trim() || null,
          declarouBens: row?.ST_DECLARAR_BENS?.trim() || null,
          bens: patrimonio.quantidade,
          valorTotal: Math.round(patrimonio.total * 100) / 100,
        }
        porSlug.set(alvo.slug, [...(porSlug.get(alvo.slug) ?? []), item])
      }
    }
    return { porSlug, pacotes }
  } finally {
    rmSync(trabalho, { recursive: true, force: true })
  }
}

function contar<T extends string>(valores: readonly T[]): Record<T, number> {
  return valores.reduce((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
}

async function main(): Promise<void> {
  if (process.env.PF_DRY_RUN !== "1") throw new Error("PF_DRY_RUN=1 é obrigatório")
  const args = parseArgs(process.argv.slice(2))
  const readbackPath = resolve(args.readback)
  const readback = JSON.parse(readFileSync(readbackPath, "utf8")) as {
    resumo: {
      fichasVazias: string[]
      fichasVaziasDetalhe: Array<{
        slug: string
        fontes: Array<{ chave: string; estado: string }>
      }>
    }
  }
  const slugs = [...readback.resumo.fichasVazias].sort()
  if (slugs.length !== 32) throw new Error(`baseline divergente: esperado 32, recebido ${slugs.length}`)

  const { data: candidatos, error } = await supabase
    .from("candidatos")
    .select("id, slug, nome_completo, cpf, estado")
    .in("slug", slugs)
  if (error) throw error
  if (candidatos?.length !== 32) throw new Error(`produção retornou ${candidatos?.length ?? 0}/32 fichas`)
  const porSlugBanco = new Map((candidatos as CandidatoBanco[]).map((item) => [item.slug, item]))

  const seed = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as Array<{
    slug: string
    ids?: { camara?: number | null; senado?: number | null; tse_sq_candidato?: Record<string, string> }
  }>
  const seedPorSlug = new Map(seed.map((item) => [item.slug, item]))
  const ids = (candidatos as CandidatoBanco[]).map((item) => item.id)
  const { data: processosAtuais, error: erroProcessosAtuais } = await supabase
    .from("coleta_log_ultima")
    .select("candidato_id, resultado, executado_em")
    .in("candidato_id", ids)
    .eq("fonte", "processos-curadoria")
  if (erroProcessosAtuais) throw erroProcessosAtuais
  const processoAtualPorId = new Map(
    (processosAtuais ?? []).map((item) => [item.candidato_id, item]),
  )
  const { data: historico, error: erroHistorico } = await supabase
    .from("historico_politico")
    .select("candidato_id, periodo_inicio, estado")
    .in("candidato_id", ids)
  if (erroHistorico) throw erroHistorico
  const estadoHistorico = new Map<string, string>()
  const slugPorId = new Map((candidatos as CandidatoBanco[]).map((item) => [item.id, item.slug]))
  for (const linha of historico ?? []) {
    const slug = slugPorId.get(linha.candidato_id)
    if (slug && linha.periodo_inicio && linha.estado) {
      estadoHistorico.set(`${slug}|${linha.periodo_inicio}`, String(linha.estado).toUpperCase())
    }
  }
  const alvosTse: AlvoTse[] = []
  for (const slug of slugs) {
    const candidato = porSlugBanco.get(slug)!
    for (const [ano, sq] of Object.entries(seedPorSlug.get(slug)?.ids?.tse_sq_candidato ?? {})) {
      const uf = estadoHistorico.get(`${slug}|${ano}`) ?? candidato.estado
      if (!uf) continue
      alvosTse.push({ slug, nome: candidato.nome_completo, ano: Number(ano), sq, uf })
    }
  }

  const chaveApi = process.env.TRANSPARENCIA_API_KEY
  if (!chaveApi) throw new Error("TRANSPARENCIA_API_KEY ausente")
  const apiCgu = "https://api.portaldatransparencia.gov.br/api-de-dados"
  const deps = {
    async buscar(endpoint: { path: string; paramDocumento: string }, documento: string) {
      const url = `${apiCgu}/${endpoint.path}?${endpoint.paramDocumento}=${encodeURIComponent(documento)}&pagina=1`
      try {
        const resposta = await fetch(url, {
          headers: { "chave-api-dados": chaveApi, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        })
        if (!resposta.ok) return { ok: false as const, erro: `${endpoint.path}: HTTP ${resposta.status}` }
        const corpo = await resposta.json()
        return Array.isArray(corpo)
          ? { ok: true as const, registros: corpo }
          : { ok: false as const, erro: `${endpoint.path}: resposta não é lista` }
      } catch (erroBusca) {
        return {
          ok: false as const,
          erro: `${endpoint.path}: ${erroBusca instanceof Error ? erroBusca.message : String(erroBusca)}`,
        }
      }
    },
  }
  const sancoes = new Map<string, Record<string, unknown>>()
  for (const slug of slugs) {
    const candidato = porSlugBanco.get(slug)!
    if (!cpfEhValido(candidato.cpf)) {
      sancoes.set(slug, {
        consulta_externa: false,
        resultado: "erro",
        motivo: "CPF válido ausente; nenhum cadastro foi consultado",
      })
      continue
    }
    const resultado = await coletarSancoesDoCandidato(candidato.cpf, candidato.nome_completo, deps)
    const agregado = resultado.falhas.length > 0
      ? "erro"
      : resultado.porCadastro.some((item) => item.resultado === "indeterminado")
        ? "indeterminado"
        : resultado.sancoes.length > 0
          ? "encontrado"
          : "vazio_confirmado"
    sancoes.set(slug, {
      consulta_externa: true,
      resultado: agregado,
      volume: resultado.sancoes.length,
      por_cadastro: resultado.porCadastro.map((item) => ({
        cadastro: item.tipo,
        resultado: item.resultado,
        volume: item.volume,
      })),
      falhas: resultado.falhas,
    })
    await new Promise((resolveEspera) => setTimeout(resolveEspera, 1_200))
  }

  const tse = await auditarTse(alvosTse)
  const judicialPath = args.judicial ? resolve(args.judicial) : null
  const judicial = judicialPath
    ? JSON.parse(readFileSync(judicialPath, "utf8")) as {
        consultado_em: string
        fonte: string
        fichas: Array<Record<string, unknown> & { slug: string }>
      }
    : null
  const judicialPorSlug = new Map((judicial?.fichas ?? []).map((item) => [item.slug, item]))
  const estadoAtual = new Map(
    readback.resumo.fichasVaziasDetalhe.map((item) => [
      item.slug,
      Object.fromEntries(item.fontes.map((fonte) => [fonte.chave, fonte.estado])),
    ]),
  )

  const fichas = slugs.map((slug) => {
    const ids = seedPorSlug.get(slug)?.ids
    const candidaturas = (tse.porSlug.get(slug) ?? []).sort((a, b) => a.ano - b.ano)
    const processo = judicialPorSlug.get(slug)
    const processoAtual = processoAtualPorId.get(porSlugBanco.get(slug)!.id)
    return {
      slug,
      estado_atual: estadoAtual.get(slug),
      fontes: {
        sancoes: sancoes.get(slug),
        processos: processo
          ? {
              consulta_externa: true,
              fonte: judicial?.fonte,
              consultado_em: judicial?.consultado_em,
              total_api: processo.total_api,
              ocorrencias_nome_exato: processo.ocorrencias_nome_exato,
              resultado: processo.resultado,
              motivo: processo.motivo,
            }
          : {
              consulta_externa: false,
              resultado: processoAtual?.resultado === "encontrado"
                ? "erro_divergencia_encontrado_sem_card"
                : processoAtual?.resultado ?? "erro_sem_tentativa_versionada",
              origem: "coleta_log_ultima",
              executado_em: processoAtual?.executado_em ?? null,
              motivo: processoAtual?.resultado === "encontrado"
                ? "a coleta anterior marcou encontrado, mas nenhum processo publicável chegou à ficha; divergência explícita, nunca ausência"
                : processoAtual
                  ? "resultado explícito da tentativa anterior; nenhuma nova busca foi executada nesta frente"
                  : "nenhuma tentativa versionada localizada; ausência de busca é erro, nunca ausência judicial",
            },
        trajetoria: {
          consulta_externa: candidaturas.length > 0,
          resultado: candidaturas.length > 0
            ? classificarTrajetoriaTse(candidaturas)
            : "bloqueio_identidade_sem_sq",
          escopo: "candidaturas com SQ_CANDIDATO versionado; não cobre cargos nomeados nem carreira fora desses pleitos",
          candidaturas,
        },
        patrimonio: {
          consulta_externa: candidaturas.length > 0,
          resultado: candidaturas.length > 0
            ? classificarPatrimonioTse(candidaturas)
            : "bloqueio_identidade_sem_sq",
          dependencia: candidaturas.some((item) => item.ano === 2026 && item.bens > 0)
            ? "PR #156, item 1, carga do pacote bem_candidato_2026"
            : null,
          candidaturas,
        },
        votacoes: ids?.camara || ids?.senado
          ? {
              consulta_externa: false,
              resultado: "bloqueio_editorial_identidade_legislativa",
              motivo: "identificador existe, mas exige auditoria nominal antes da API de votações",
            }
          : {
              consulta_externa: false,
              resultado: "bloqueio_identidade_sem_id_legislativo",
              motivo: "sem identificador Câmara/Senado; nenhuma API foi consultada e nenhum vazio foi inferido",
            },
      },
    }
  })

  const relatorio = {
    schema_version: 1,
    script: "auditar-fontes-destaques-vazios",
    modo: "dry-run_read_only",
    consultado_em: new Date().toISOString(),
    universo: slugs.length,
    readback: { path: args.readback, sha256: sha256Arquivo(readbackPath) },
    recibo_judicial: judicialPath
      ? { arquivo: basename(judicialPath), sha256: sha256Arquivo(judicialPath) }
      : null,
    fontes_externas: {
      sancoes: [
        `${apiCgu}/ceis`,
        `${apiCgu}/cnep`,
        `${apiCgu}/ceaf`,
      ],
      tse_pacotes: tse.pacotes,
      votacoes: "não consultadas: 0/32 têm ID Câmara ou Senado no registro versionado",
    },
    resumo: {
      sancoes: contar(fichas.map((item) => String(item.fontes.sancoes?.resultado ?? "erro"))),
      processos: contar(fichas.map((item) => String(item.fontes.processos.resultado))),
      trajetoria: contar(fichas.map((item) => item.fontes.trajetoria.resultado)),
      patrimonio: contar(fichas.map((item) => item.fontes.patrimonio.resultado)),
      votacoes: contar(fichas.map((item) => String(item.fontes.votacoes.resultado))),
    },
    fichas,
  }
  mkdirSync(dirname(resolve(args.out)), { recursive: true })
  writeFileSync(resolve(args.out), `${JSON.stringify(relatorio, null, 2)}\n`)
  console.log(JSON.stringify({ universo: relatorio.universo, resumo: relatorio.resumo }, null, 2))
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
