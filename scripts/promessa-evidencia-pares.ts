/**
 * Pré-filtro determinístico promessa x evidência (sem modelo).
 *
 * Entrada: programas aprovados em `src/data/programas-governo/` e o snapshot
 * gerado por `promessa-evidencia-coletar.ts`. Saída:
 * `reports/promessa-evidencia/pares.json`, com um par por (tema do programa,
 * evidência do mesmo candidato) quando os dois caem em ao menos um eixo comum,
 * e recibo com contagens e hashes das entradas.
 *
 * Só lê arquivos locais; não escreve no banco.
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { eixosDoTemaCanonico, eixosDoTexto, intersecao, type Eixo } from "./lib/promessa-eixos"
import { carregarProgramasComResumo, type CompromissoTema, type ProgramaCompromissos } from "./promessa-evidencia-programas"
import { SNAPSHOT_PATH, type SnapshotEvidencias } from "./promessa-evidencia-coletar"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const PARES_PATH = path.join(ROOT, "reports/promessa-evidencia/pares.json")

/** Proposições de autoria que expressam posição legislativa; emendas e requerimentos ficam fora. */
export const TIPOS_PROJETO_AUTORAL = new Set(["PL", "PLP", "PEC", "PDL", "PLS", "PLC", "PLV", "PDS"])

export type TipoEvidencia = "votacao_chave" | "posicao_declarada" | "fala" | "projeto_lei" | "contradicao"

export type EvidenciaNormalizada = {
  tipo: TipoEvidencia
  ref: string
  candidatoId: string
  data: string | null
  /** Campos da fonte, sem texto gerado. */
  conteudo: Record<string, string | number | boolean | null>
  url: string | null
  eixos: Eixo[]
}

export type ParCandidato = {
  parId: string
  slug: string
  candidatoId: string
  programaChave: string
  cargo: "PRESIDENTE" | "GOVERNADOR"
  mandatoFederal: boolean
  compromisso: CompromissoTema
  evidencia: EvidenciaNormalizada
  eixosComuns: Eixo[]
}

export function normalizarEvidencias(snapshot: SnapshotEvidencias): EvidenciaNormalizada[] {
  const saida: EvidenciaNormalizada[] = []
  for (const voto of snapshot.votos) {
    const v = voto.votacao
    const eixos = new Set([...eixosDoTemaCanonico(v.tema), ...eixosDoTexto(v.titulo, v.descricao)])
    saida.push({
      tipo: "votacao_chave", ref: voto.id, candidatoId: voto.candidato_id, data: v.data_votacao,
      conteudo: {
        votacao_titulo: v.titulo, votacao_descricao: v.descricao, casa: v.casa, voto: voto.voto,
        proposicao: v.proposicao_id, contradicao_registrada: voto.contradicao,
        contradicao_descricao: voto.contradicao_descricao,
      },
      url: null, eixos: [...eixos],
    })
  }
  for (const projeto of snapshot.projetos) {
    if (!TIPOS_PROJETO_AUTORAL.has((projeto.tipo ?? "").toUpperCase()) || !projeto.ementa) continue
    saida.push({
      tipo: "projeto_lei", ref: projeto.id, candidatoId: projeto.candidato_id,
      data: projeto.ano ? String(projeto.ano) : null,
      conteudo: { tipo: projeto.tipo, numero: projeto.numero, ano: projeto.ano, ementa: projeto.ementa, situacao: projeto.situacao },
      url: projeto.url_inteiro_teor, eixos: [...eixosDoTexto(projeto.ementa, projeto.tema)],
    })
  }
  for (const posicao of snapshot.posicoes) {
    const eixos = new Set([...eixosDoTemaCanonico(posicao.tema), ...eixosDoTexto(posicao.descricao)])
    saida.push({
      tipo: "posicao_declarada", ref: posicao.id, candidatoId: posicao.candidato_id, data: null,
      conteudo: { tema: posicao.tema, posicao: posicao.posicao, descricao: posicao.descricao, fonte: posicao.fonte },
      url: posicao.url_fonte, eixos: [...eixos],
    })
  }
  for (const fala of snapshot.falas) {
    saida.push({
      tipo: "fala", ref: fala.id, candidatoId: fala.candidate_id, data: fala.occurred_on ?? fala.occurred_between?.from ?? null,
      conteudo: { citacao: fala.quote_text, contexto: fala.context, evento: fala.event_context, tipo_evento: fala.event_type, veiculo: fala.publisher },
      url: fala.article_url, eixos: [...eixosDoTexto(fala.quote_text, fala.context)],
    })
  }
  for (const ponto of snapshot.contradicoes) {
    saida.push({
      tipo: "contradicao", ref: ponto.id, candidatoId: ponto.candidato_id, data: ponto.data_referencia,
      conteudo: { titulo: ponto.titulo, descricao: ponto.descricao },
      url: ponto.fontes.find((f) => f.url)?.url ?? null, eixos: [...eixosDoTexto(ponto.titulo, ponto.descricao)],
    })
  }
  return saida
}

export function eixosDoCompromisso(tema: CompromissoTema): Set<Eixo> {
  return eixosDoTexto(tema.titulo, tema.descricao, tema.temaId.replace(/-/gu, " "))
}

function parId(programaChave: string, temaId: string, evidencia: Pick<EvidenciaNormalizada, "tipo" | "ref">): string {
  return createHash("sha256").update(`${programaChave}|${temaId}|${evidencia.tipo}|${evidencia.ref}`).digest("hex").slice(0, 16)
}

export function gerarPares(programas: ProgramaCompromissos[], snapshot: SnapshotEvidencias): ParCandidato[] {
  const candidatoPorSlug = new Map(snapshot.candidatos.map((c) => [c.slug, c]))
  const evidenciasPorCandidato = new Map<string, EvidenciaNormalizada[]>()
  for (const evidencia of normalizarEvidencias(snapshot)) {
    evidenciasPorCandidato.set(evidencia.candidatoId, [...(evidenciasPorCandidato.get(evidencia.candidatoId) ?? []), evidencia])
  }
  const pares: ParCandidato[] = []
  for (const programa of programas) {
    const candidato = candidatoPorSlug.get(programa.slug)
    if (!candidato) continue
    for (const tema of programa.temas) {
      const eixosTema = eixosDoCompromisso(tema)
      for (const evidencia of evidenciasPorCandidato.get(candidato.id) ?? []) {
        const comuns = intersecao(eixosTema, new Set(evidencia.eixos))
        if (comuns.length === 0) continue
        pares.push({
          parId: parId(programa.programaChave, tema.temaId, evidencia),
          slug: programa.slug, candidatoId: candidato.id, programaChave: programa.programaChave,
          cargo: programa.cargo, mandatoFederal: candidato.mandatoFederal,
          compromisso: tema, evidencia, eixosComuns: comuns,
        })
      }
    }
  }
  return pares.sort((a, b) => a.parId.localeCompare(b.parId))
}

export function reciboPares(programas: ProgramaCompromissos[], snapshot: SnapshotEvidencias, pares: ParCandidato[]) {
  const porTipo: Record<string, number> = {}
  for (const par of pares) porTipo[par.evidencia.tipo] = (porTipo[par.evidencia.tipo] ?? 0) + 1
  const candidatoPorSlug = new Map(snapshot.candidatos.map((c) => [c.slug, c]))
  const evidencias = normalizarEvidencias(snapshot)
  const tiposPorCandidato = new Map<string, Set<TipoEvidencia>>()
  for (const e of evidencias) tiposPorCandidato.set(e.candidatoId, new Set([...(tiposPorCandidato.get(e.candidatoId) ?? []), e.tipo]))
  const governadores = programas.filter((p) => p.cargo === "GOVERNADOR")
  const govPublicos = governadores.filter((p) => candidatoPorSlug.has(p.slug))
  const govSemCongresso = govPublicos.filter((p) => !candidatoPorSlug.get(p.slug)!.mandatoFederal)
  const soFalaPosicao = govPublicos.filter((p) => {
    const tipos = tiposPorCandidato.get(candidatoPorSlug.get(p.slug)!.id) ?? new Set()
    return [...tipos].every((t) => t === "fala" || t === "posicao_declarada")
  })
  const comPar = new Set(pares.map((p) => p.slug))
  return {
    programasComResumo: programas.length,
    programasSemCandidatoPublico: programas.filter((p) => !candidatoPorSlug.has(p.slug)).map((p) => p.slug),
    temas: programas.reduce((total, p) => total + p.temas.length, 0),
    evidenciasNormalizadas: evidencias.length,
    pares: pares.length,
    paresPorTipo: porTipo,
    paresPresidenciais: pares.filter((p) => p.cargo === "PRESIDENTE").length,
    paresGovernadoresComCongresso: pares.filter((p) => p.cargo === "GOVERNADOR" && p.mandatoFederal).length,
    paresGovernadoresSemCongresso: pares.filter((p) => p.cargo === "GOVERNADOR" && !p.mandatoFederal).length,
    candidatosComPar: comPar.size,
    governadoresPublicos: govPublicos.length,
    governadoresSemMandatoFederal: govSemCongresso.length,
    governadoresSoFalaOuPosicao: soFalaPosicao.length,
    governadoresSemNenhumPar: govPublicos.filter((p) => !comPar.has(p.slug)).length,
  }
}

async function main(): Promise<void> {
  const snapshotBruto = await readFile(SNAPSHOT_PATH, "utf8")
  const snapshot = JSON.parse(snapshotBruto) as SnapshotEvidencias
  if (snapshot.schema_version !== "promessa-evidencia-snapshot-v1") throw new Error("snapshot com schema inesperado")
  const programas = await carregarProgramasComResumo()
  const pares = gerarPares(programas, snapshot)
  const recibo = {
    gerado_em: new Date().toISOString(),
    snapshot_sha256: createHash("sha256").update(snapshotBruto).digest("hex"),
    snapshot_coletado_em: snapshot.coletado_em,
    ...reciboPares(programas, snapshot, pares),
  }
  await mkdir(path.dirname(PARES_PATH), { recursive: true })
  await writeFile(PARES_PATH, `${JSON.stringify({ schema_version: "promessa-evidencia-pares-v1", recibo, pares }, null, 2)}\n`)
  console.log(JSON.stringify(recibo, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
