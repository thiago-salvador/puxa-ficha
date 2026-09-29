/**
 * Despesas de campanha (TSE): coleta, plano e gravação.
 *
 * Uso:
 *   node --import tsx scripts/tse-despesas.ts coletar --fonte=2026 [--slugs=a,b] [--out=<dir>]
 *   node --import tsx scripts/tse-despesas.ts coletar --fonte=historico --manifest=<tse-local-assets.json> --anos=2018,2022 [--out=<dir>]
 *   node --import tsx scripts/tse-despesas.ts --coleta=<arquivo>[,<arquivo>] [--out=<dir>]          # dry-run (padrão)
 *   node --import tsx scripts/tse-despesas.ts --coleta=<arquivo> --apply --expected-plan-sha=<sha>
 *
 * A coleta grava só o resultado normalizado (sem documento). O plano é
 * recalculado a partir dos mesmos arquivos de coleta e da leitura atual das
 * candidaturas ligadas no banco; a gravação exige `--apply` e o SHA-256 do
 * plano revisado no dry-run. Plano, coleta, recibo e state do Jev ficam fora do
 * repositório, em arquivos modo 0600.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { assertOutsideRepository } from "./audit/lib/private-output"
import { escreverAuditado } from "./lib/escrita-auditada"
import { ANOS_DESPESAS_HISTORICO, coletarDespesasHistoricas } from "./lib/despesas-historico"
import { gravarEstadoJevDespesas, montarEstadoJevDespesas } from "./lib/despesas-jev"
import { textoTemDocumento } from "./lib/despesas-normalizar"
import {
  CHAVE_UPSERT_DESPESAS,
  TABELA_DESPESAS,
  decidirAplicacao,
  planejarDespesas,
  shaDoPlanoDespesas,
  type CandidaturaColetada,
  type CandidaturaVinculada,
  type PlanoDespesas,
} from "./lib/despesas-plano"

const ANOS_DESPESAS = [...ANOS_DESPESAS_HISTORICO, 2026] as const
export const DIRETORIO_PADRAO = join(homedir(), "Library", "Application Support", "puxa-ficha", "tse-despesas")
export const SCHEMA_COLETA = "despesas-coleta/v1"

export interface ArquivoColetaDespesas {
  schema: typeof SCHEMA_COLETA
  gerado_em: string
  origem: "2026" | "historico"
  pacotes?: Array<{ ano: number; url: string; sha256: string }>
  candidaturas: CandidaturaColetada[]
}

export interface OpcoesDespesas {
  comando: "planejar" | "coletar"
  fonte: "2026" | "historico" | null
  aplicar: boolean
  expectedPlanSha: string | null
  coletas: string[]
  out: string
  manifest: string | null
  anos: number[]
  slugs: string[] | null
}

export function lerArgsDespesas(argv: readonly string[]): OpcoesDespesas {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null
  const lista = (nome: string) => (valor(nome) ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const fonte = valor("fonte")
  if (fonte !== null && fonte !== "2026" && fonte !== "historico") throw new Error("--fonte deve ser 2026 ou historico")
  const anos = lista("anos").map(Number)
  if (anos.some((ano) => !(ANOS_DESPESAS_HISTORICO as readonly number[]).includes(ano))) throw new Error(`--anos aceita ${ANOS_DESPESAS_HISTORICO.join(", ")}`)
  return {
    comando: argv[0] === "coletar" ? "coletar" : "planejar",
    fonte,
    aplicar: argv.includes("--apply"),
    expectedPlanSha: valor("expected-plan-sha"),
    coletas: lista("coleta"),
    out: valor("out") ?? DIRETORIO_PADRAO,
    manifest: valor("manifest"),
    anos,
    slugs: valor("slugs") ? lista("slugs") : null,
  }
}

/** Arquivo privado: fora do repositório (logo, nunca em reports/), modo 0600. */
export function salvarPrivado(dir: string, nome: string, conteudo: unknown): string {
  const privado = resolve(assertOutsideRepository(dir, "--out"))
  mkdirSync(privado, { recursive: true, mode: 0o700 })
  const caminho = join(privado, nome)
  writeFileSync(caminho, `${JSON.stringify(conteudo, null, 2)}\n`, { mode: 0o600 })
  chmodSync(caminho, 0o600)
  return caminho
}

export function lerArquivoColeta(caminho: string): ArquivoColetaDespesas {
  const bruto = JSON.parse(readFileSync(assertOutsideRepository(caminho, "--coleta"), "utf8")) as ArquivoColetaDespesas
  if (bruto?.schema !== SCHEMA_COLETA || !Array.isArray(bruto.candidaturas)) throw new Error(`${caminho}: arquivo de coleta inválido`)
  for (const c of bruto.candidaturas) {
    const linha = c.normalizado?.linha
    if (linha && textoTemDocumento([linha.concentracao_despesas, linha.maiores_fornecedores, linha.doacoes_a_terceiros])) {
      throw new Error(`${caminho}: coleta com documento em campo público`)
    }
  }
  return bruto
}

// ---------------------------------------------------------------------------
// Leitura do banco (somente leitura)

type Resposta = { data: unknown[] | null; error: { message: string } | null }
interface Consulta {
  in(coluna: string, valores: readonly unknown[]): Consulta
  not(coluna: string, operador: string, valor: unknown): Consulta
  is(coluna: string, valor: unknown): Consulta
  order(coluna: string): Consulta
  range(de: number, ate: number): PromiseLike<Resposta>
}

async function selecionarTudo<T>(tabela: string, colunas: string, filtro: (q: Consulta) => Consulta): Promise<T[]> {
  const { supabase } = await import("./lib/supabase")
  const saida: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const base = supabase.from(tabela).select(colunas) as unknown as Consulta
    const { data, error } = await filtro(base).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    saida.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return saida
  }
}

type LinhaVinculo = { candidato_id: string; ano_eleicao: number; sq_candidato: string | null; uf_candidatura?: string | null }

/**
 * Candidaturas já ligadas a candidatos públicos da coorte: SQ gravado em
 * `financiamento` (linha publicada) ou em `financiamento_verificacoes`.
 */
export async function carregarVinculadas(anos: readonly number[]): Promise<Array<CandidaturaVinculada & { uf: string | null }>> {
  const { aplicarCoorteAtualizacao } = await import("./lib/coorte-atualizacao")
  const publicos = await aplicarCoorteAtualizacao(
    await selecionarTudo<{ id: string; slug: string }>("candidatos_publico", "id, slug", (q) => q.order("slug")),
    "tse-despesas",
  )
  const slugPorId = new Map(publicos.map((p) => [p.id, p.slug]))
  const filtro = (q: Consulta) => q.in("ano_eleicao", anos).not("sq_candidato", "is", null).order("id")
  const [financiamento, verificacoes] = await Promise.all([
    selecionarTudo<LinhaVinculo>("financiamento", "candidato_id, ano_eleicao, sq_candidato, uf_candidatura", (q) => filtro(q).is("despublicado_em", null)),
    selecionarTudo<LinhaVinculo>("financiamento_verificacoes", "candidato_id, ano_eleicao, sq_candidato, uf_candidatura", filtro),
  ])
  const unicas = new Map<string, CandidaturaVinculada & { uf: string | null }>()
  for (const linha of [...financiamento, ...verificacoes]) {
    const slug = slugPorId.get(linha.candidato_id)
    const sq = typeof linha.sq_candidato === "string" ? linha.sq_candidato.trim() : ""
    if (!slug || !/^\d{5,20}$/.test(sq)) continue
    const k = `${linha.candidato_id}|${linha.ano_eleicao}|${sq}`
    if (!unicas.has(k)) unicas.set(k, { candidato_id: linha.candidato_id, slug, ano_eleicao: linha.ano_eleicao, sq_candidato: sq, uf: linha.uf_candidatura ?? null })
  }
  return [...unicas.values()]
}

// ---------------------------------------------------------------------------
// Coleta

async function coletar(opcoes: OpcoesDespesas): Promise<number> {
  const gerado_em = new Date().toISOString()
  if (opcoes.fonte === "2026") {
    const { coletarDespesas2026 } = await import("./tse-local/divulga-despesas")
    const vinculadas = (await carregarVinculadas([2026])).filter((v) => !opcoes.slugs || opcoes.slugs.includes(v.slug))
    const candidatos = vinculadas.flatMap((v) => (v.uf ? [{ slug: v.slug, uf: v.uf, sqCandidato: v.sq_candidato }] : []))
    const coletas = await coletarDespesas2026(candidatos)
    const arquivo: ArquivoColetaDespesas = {
      schema: SCHEMA_COLETA,
      gerado_em,
      origem: "2026",
      candidaturas: coletas.map(({ coleta }) => ({
        ano_eleicao: 2026,
        sq_candidato: coleta.sq_candidato,
        resultado: coleta.resultado,
        ...(coleta.motivo ? { motivo: coleta.motivo } : {}),
        normalizado: coleta.normalizado,
      })),
    }
    const caminho = salvarPrivado(opcoes.out, `coleta-2026-${gerado_em.replace(/[:.]/g, "-")}.json`, arquivo)
    console.log(JSON.stringify({ coleta: caminho, candidaturas: arquivo.candidaturas.length, por_resultado: contarResultados(arquivo) }, null, 2))
    return 0
  }
  if (opcoes.fonte === "historico") {
    if (!opcoes.manifest || !opcoes.anos.length) throw new Error("coleta histórica exige --manifest e --anos")
    const vinculadas = await carregarVinculadas(opcoes.anos)
    const arquivo: ArquivoColetaDespesas = { schema: SCHEMA_COLETA, gerado_em, origem: "historico", pacotes: [], candidaturas: [] }
    const leituras: unknown[] = []
    for (const ano of opcoes.anos) {
      const coorteSq = new Set(vinculadas.filter((v) => v.ano_eleicao === ano && (!opcoes.slugs || opcoes.slugs.includes(v.slug))).map((v) => v.sq_candidato))
      if (!coorteSq.size) continue
      const lido = await coletarDespesasHistoricas({ manifestoPath: opcoes.manifest, ano, coorteSq })
      arquivo.pacotes!.push({ ano, ...lido.pacote })
      leituras.push({ ano, nao_encontradas: lido.leitura.nao_encontradas.length, ambiguos: lido.leitura.ambiguos.length, conservacao_pagas: lido.leitura.conservacao_pagas })
      for (const c of lido.candidaturas) {
        arquivo.candidaturas.push({
          ano_eleicao: ano,
          sq_candidato: c.sq_candidato,
          resultado: c.resultado.divergencias.length ? "rejeitado" : c.resultado.linha.estado_coleta === "sem_prestacao" ? "sem_prestacao" : "coletado",
          ...(c.pagas_isoladas ? { motivo: "pagas_isoladas_por_prestador_ambiguo" } : {}),
          normalizado: c.resultado,
        })
      }
      // SQ da coorte ausente do pacote: cobertura não comprovada, nunca "sem despesa".
      for (const sq of lido.leitura.nao_encontradas) {
        arquivo.candidaturas.push({ ano_eleicao: ano, sq_candidato: sq, resultado: "erro", motivo: "sq_ausente_do_pacote", normalizado: null })
      }
    }
    const caminho = salvarPrivado(opcoes.out, `coleta-historico-${gerado_em.replace(/[:.]/g, "-")}.json`, arquivo)
    console.log(JSON.stringify({ coleta: caminho, candidaturas: arquivo.candidaturas.length, por_resultado: contarResultados(arquivo), leituras }, null, 2))
    return 0
  }
  throw new Error("coletar exige --fonte=2026 ou --fonte=historico")
}

function contarResultados(arquivo: ArquivoColetaDespesas): Record<string, number> {
  return arquivo.candidaturas.reduce<Record<string, number>>((acc, c) => { acc[c.resultado] = (acc[c.resultado] ?? 0) + 1; return acc }, {})
}

// ---------------------------------------------------------------------------
// Plano e gravação

export function resumoPublicoDoPlano(plano: PlanoDespesas, sha: string) {
  return { plano_sha256: sha, versao: plano.versao, resumo: plano.resumo }
}

async function gravarAcoes(plano: PlanoDespesas): Promise<{ gravadas: number; falhas: Array<{ slug: string; ano: number; erro: string }> }> {
  const { supabase } = await import("./lib/supabase")
  const falhas: Array<{ slug: string; ano: number; erro: string }> = []
  let gravadas = 0
  for (let offset = 0; offset < plano.acoes.length; offset += 25) {
    const lote = plano.acoes.slice(offset, offset + 25)
    try {
      await escreverAuditado(
        {
          script: "tse-despesas",
          tabela: TABELA_DESPESAS,
          motivo: "publica despesas de campanha do TSE, com plano verificado por SHA",
          recorte: `lote de ${lote.length} candidatura(s) a partir de ${lote[0].slug} ${lote[0].linha.ano_eleicao}`,
        },
        () => supabase.from(TABELA_DESPESAS).upsert(lote.map((a) => a.linha), { onConflict: CHAVE_UPSERT_DESPESAS }).select("id"),
      )
      gravadas += lote.length
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      for (const a of lote) falhas.push({ slug: a.slug, ano: a.linha.ano_eleicao, erro: mensagem })
    }
  }
  return { gravadas, falhas }
}

async function planejarEAplicar(opcoes: OpcoesDespesas): Promise<number> {
  if (!opcoes.coletas.length) throw new Error("informe --coleta=<arquivo de coleta>")
  // Recusa cedo: --apply sem SHA não chega a ler o banco.
  if (opcoes.aplicar && !opcoes.expectedPlanSha) {
    console.error(decidirAplicacao(opcoes, "", 0).motivo)
    return 2
  }
  const arquivos = opcoes.coletas.map(lerArquivoColeta)
  const coletas = arquivos.flatMap((a) => a.candidaturas)
  const anos = [...new Set(coletas.map((c) => c.ano_eleicao))].filter((ano) => (ANOS_DESPESAS as readonly number[]).includes(ano))
  const vinculadas = await carregarVinculadas(anos)
  const plano = planejarDespesas({ vinculadas, coletas })
  const sha = shaDoPlanoDespesas(plano)
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-")
  const planoPath = salvarPrivado(opcoes.out, `plano-despesas-${carimbo}.json`, { plano_sha256: sha, generated_at: new Date().toISOString(), ...plano })
  const jevPath = gravarEstadoJevDespesas(join(resolve(opcoes.out), `jev-estado-despesas-${carimbo}.json`), montarEstadoJevDespesas(
    coletas.flatMap((c) => (c.normalizado ? [{ ano_eleicao: c.ano_eleicao, sq_candidato: c.sq_candidato, resultado: c.normalizado }] : [])),
  ))
  console.log(JSON.stringify({ modo: opcoes.aplicar ? "apply" : "dry-run", ...resumoPublicoDoPlano(plano, sha), plano: planoPath, estado_jev: jevPath }, null, 2))

  const decisao = decidirAplicacao(opcoes, sha, plano.acoes.length)
  if (!decisao.aplicar) {
    if (opcoes.aplicar) console.error(`${decisao.motivo}; nada gravado`)
    return decisao.codigo
  }
  const resultado = await gravarAcoes(plano)
  const recibo = salvarPrivado(opcoes.out, `recibo-despesas-${carimbo}.json`, { plano_sha256: sha, aplicado_em: new Date().toISOString(), ...resultado })
  console.log(JSON.stringify({ gravadas: resultado.gravadas, falhas: resultado.falhas.length, recibo }, null, 2))
  return resultado.falhas.length ? 4 : 0
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const opcoes = lerArgsDespesas(argv)
  return opcoes.comando === "coletar" ? coletar(opcoes) : planejarEAplicar(opcoes)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(erro instanceof Error ? erro.message : erro)
      process.exit(1)
    },
  )
}
