/**
 * Coleta, somente leitura, as evidências já verificadas dos candidatos que têm
 * programa de governo, para o pré-filtro promessa x evidência.
 *
 * Nada é escrito no banco. Saída: `reports/promessa-evidencia/snapshot.json`
 * (fora do git), com recibo de contagens e sha256.
 *
 * Regras de entrada:
 * - candidato público (`publicavel` e status diferente de removido);
 * - posição declarada só com `verificado = true`, `gerado_por = curadoria` (a ficha
 *   só exibe posição curada; par com posição que não aparece seria vínculo
 *   invisível) e sem quarentena ativa;
 * - ponto de atenção de contradição só verificado e visível;
 * - fala só do catálogo revisado (`scripts/data/falas-candidatos.json`).
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { ensureSupabaseClient } from "./lib/supabase"
import { carregarProgramasComResumo } from "./promessa-evidencia-programas"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const SNAPSHOT_PATH = path.join(ROOT, "reports/promessa-evidencia/snapshot.json")
const CARGOS_PARLAMENTAR_FEDERAL = new Set(["Deputado Federal", "Senador"])

export type SnapshotCandidato = {
  id: string
  slug: string
  mandatoFederal: boolean
}

export type SnapshotVoto = {
  id: string
  candidato_id: string
  voto: string
  contradicao: boolean
  contradicao_descricao: string | null
  votacao: {
    id: string
    titulo: string
    descricao: string | null
    data_votacao: string | null
    casa: string | null
    tema: string | null
    proposicao_id: string | null
  }
}

export type SnapshotProjeto = {
  id: string
  candidato_id: string
  tipo: string | null
  numero: string | null
  ano: number | null
  ementa: string | null
  tema: string | null
  situacao: string | null
  url_inteiro_teor: string | null
}

export type SnapshotPosicao = {
  id: string
  candidato_id: string
  tema: string
  posicao: string
  descricao: string | null
  fonte: string | null
  url_fonte: string | null
}

export type SnapshotPontoContradicao = {
  id: string
  candidato_id: string
  titulo: string
  descricao: string | null
  fontes: Array<{ titulo?: string; url?: string }>
  data_referencia: string | null
}

export type SnapshotEvidencias = {
  schema_version: "promessa-evidencia-snapshot-v1"
  coletado_em: string
  candidatos: SnapshotCandidato[]
  votos: SnapshotVoto[]
  projetos: SnapshotProjeto[]
  posicoes: SnapshotPosicao[]
  contradicoes: SnapshotPontoContradicao[]
  falas: CatalogoFalas["quotes"]
}

type ChaveQuarentena = { candidato_id: string; tema: string; posicao: string; url_fonte: string | null }

/** Defesa em profundidade: o trigger do banco já zera `verificado`, e aqui a mesma tupla sai de novo. */
export function posicoesForaDeQuarentena<T extends ChaveQuarentena>(posicoes: T[], quarentenaAtiva: ChaveQuarentena[]): T[] {
  const chave = (q: ChaveQuarentena) => [q.candidato_id, q.tema, q.posicao, q.url_fonte ?? ""].join("|")
  const bloqueadas = new Set(quarentenaAtiva.map(chave))
  return posicoes.filter((posicao) => !bloqueadas.has(chave(posicao)))
}

type Resposta<T> = { data: T[] | null; error: { message: string } | null }

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<Resposta<T>>): Promise<T[]> {
  const linhas: T[] = []
  const tamanho = 1000
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await consulta(de, de + tamanho - 1)
    if (error) throw new Error(error.message)
    linhas.push(...(data ?? []))
    if (!data || data.length < tamanho) return linhas
  }
}

function lotes<T>(itens: T[], tamanho = 50): T[][] {
  const saida: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho))
  return saida
}

export async function coletarSnapshot(): Promise<SnapshotEvidencias> {
  const db = ensureSupabaseClient()
  const programas = await carregarProgramasComResumo()
  const slugs = programas.map((programa) => programa.slug)

  const candidatosBrutos: Array<{ id: string; slug: string; publicavel: boolean; status: string | null }> = []
  for (const lote of lotes(slugs)) {
    const { data, error } = await db.from("candidatos").select("id,slug,publicavel,status").in("slug", lote)
    if (error) throw new Error(error.message)
    candidatosBrutos.push(...(data ?? []))
  }
  const publicos = candidatosBrutos.filter((c) => c.publicavel === true && c.status !== "removido")
  const ids = publicos.map((c) => c.id)

  const historico: Array<{ candidato_id: string; cargo_canonico: string | null; tipo_evento: string | null }> = []
  const votos: SnapshotVoto[] = []
  const projetos: SnapshotProjeto[] = []
  const posicoesBrutas: SnapshotPosicao[] = []
  const quarentena: ChaveQuarentena[] = []
  const contradicoes: SnapshotPontoContradicao[] = []
  for (const lote of lotes(ids)) {
    historico.push(...await paginar((de, ate) => db.from("historico_politico")
      .select("candidato_id,cargo_canonico,tipo_evento").in("candidato_id", lote)
      .is("despublicado_em", null).order("id").range(de, ate)))
    const votosBrutos = await paginar((de, ate) => db.from("votos_candidato")
      .select("id,candidato_id,voto,contradicao,contradicao_descricao,votacao:votacoes_chave(id,titulo,descricao,data_votacao,casa,tema,proposicao_id)")
      .in("candidato_id", lote).order("id").range(de, ate))
    for (const bruto of votosBrutos) {
      // A relação embutida chega como objeto ou como lista de um item, conforme a inferência do cliente.
      const votacao = (Array.isArray(bruto.votacao) ? bruto.votacao[0] : bruto.votacao) as SnapshotVoto["votacao"] | undefined
      if (votacao) votos.push({ ...bruto, votacao })
    }
    projetos.push(...await paginar<SnapshotProjeto>((de, ate) => db.from("projetos_lei")
      .select("id,candidato_id,tipo,numero,ano,ementa,tema,situacao,url_inteiro_teor")
      .in("candidato_id", lote).order("id").range(de, ate)))
    posicoesBrutas.push(...await paginar<SnapshotPosicao>((de, ate) => db.from("posicoes_declaradas")
      .select("id,candidato_id,tema,posicao,descricao,fonte,url_fonte")
      .in("candidato_id", lote).eq("verificado", true).eq("gerado_por", "curadoria").order("id").range(de, ate)))
    quarentena.push(...await paginar((de, ate) => db.from("quiz_position_quarantine")
      .select("candidato_id,tema,posicao,url_fonte").in("candidato_id", lote).eq("ativo", true)
      .order("candidato_id").range(de, ate)))
    const pontos = await paginar<SnapshotPontoContradicao & { categoria: string; visivel: boolean | null }>((de, ate) => db.from("pontos_atencao")
      .select("id,candidato_id,categoria,titulo,descricao,fontes,data_referencia,visivel")
      .in("candidato_id", lote).eq("verificado", true).order("id").range(de, ate))
    for (const ponto of pontos) {
      const categoria = ponto.categoria.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      if (categoria !== "contradicao" || ponto.visivel === false) continue
      contradicoes.push({
        id: ponto.id, candidato_id: ponto.candidato_id, titulo: ponto.titulo, descricao: ponto.descricao,
        fontes: ponto.fontes ?? [], data_referencia: ponto.data_referencia,
      })
    }
  }
  const posicoes = posicoesForaDeQuarentena(posicoesBrutas, quarentena)

  const federal = new Set(historico
    .filter((h) => h.tipo_evento === "mandato" && CARGOS_PARLAMENTAR_FEDERAL.has(h.cargo_canonico ?? ""))
    .map((h) => h.candidato_id))
  const catalogo = JSON.parse(await readFile(path.join(ROOT, "scripts/data/falas-candidatos.json"), "utf8")) as CatalogoFalas
  const idsPublicos = new Set(ids)

  return {
    schema_version: "promessa-evidencia-snapshot-v1",
    coletado_em: new Date().toISOString(),
    candidatos: publicos.map((c) => ({ id: c.id, slug: c.slug, mandatoFederal: federal.has(c.id) }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    votos,
    projetos,
    posicoes,
    contradicoes,
    falas: catalogo.quotes.filter((q) => idsPublicos.has(q.candidate_id)),
  }
}

async function main(): Promise<void> {
  const snapshot = await coletarSnapshot()
  const corpo = `${JSON.stringify(snapshot, null, 2)}\n`
  await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true })
  await writeFile(SNAPSHOT_PATH, corpo)
  console.log(JSON.stringify({
    destino: path.relative(ROOT, SNAPSHOT_PATH),
    sha256: createHash("sha256").update(corpo).digest("hex"),
    coletado_em: snapshot.coletado_em,
    candidatos: snapshot.candidatos.length,
    comMandatoFederal: snapshot.candidatos.filter((c) => c.mandatoFederal).length,
    votos: snapshot.votos.length,
    projetos: snapshot.projetos.length,
    posicoes: snapshot.posicoes.length,
    contradicoes: snapshot.contradicoes.length,
    falas: snapshot.falas.length,
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
