/**
 * Fila de revisão humana do vínculo promessa x evidência.
 *
 * Entrada: `reports/promessa-evidencia/pares.json` e o log de sombra do Jev
 * (`reports/promessa-evidencia/sombra-v1.json`). Saída:
 * `reports/promessa-evidencia/fila-revisao.json`, um item por par que o Jev NÃO
 * descartou, com o pré-rótulo como sugestão. Decisão, motivo e revisor ficam em
 * branco para quem revisa. Regerar a fila preserva decisões já preenchidas.
 *
 * Só lê e escreve arquivos locais.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { ParCandidato } from "./promessa-evidencia-pares"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PASTA = path.join(ROOT, "reports/promessa-evidencia")
export const SCHEMA_FILA_REVISAO = "promessa-fila-revisao-v1"
export const DECISOES = ["sustenta", "contradiz", "relacionada", "nao_relacionada"] as const
export type Decisao = (typeof DECISOES)[number]

export type RegistroSombra = {
  estado_sha256: string
  model?: string
  answers?: Record<string, { type: string; probabilities?: Record<string, number>; noul?: number }>
  preRotulo?: Decisao
  descartado?: boolean
  erro?: string
}

export type ItemFila = {
  par_id: string
  grupo: "presidencial" | "governador_congresso" | "governador_sem_congresso"
  candidato_slug: string
  candidato_id: string
  programa_chave: string
  tema_id: string
  frase_ids: string[]
  compromisso: { titulo: string; descricao: string; trechos: Array<{ pagina: number; trecho: string }> }
  evidencia: { tipo: string; ref: string; data: string | null; url: string | null; conteudo: Record<string, string | number | boolean | null> }
  jev: { versao: string; modelo: string | null; pre_rotulo: Decisao; probabilidades: Record<string, number>; mesmo_compromisso: number | null; direcao_oposta: number | null }
  decisao: Decisao | null
  motivo: string | null
  revisado_por: string | null
  revisado_em: string | null
}

export type FilaRevisao = {
  schema_version: typeof SCHEMA_FILA_REVISAO
  versao_jev: string
  total_pares: number
  descartados_pelo_jev: number
  sem_resposta_do_jev: number
  itens: ItemFila[]
}

const ORDEM_GRUPO = { presidencial: 0, governador_congresso: 1, governador_sem_congresso: 2 } as const

function grupo(par: ParCandidato): ItemFila["grupo"] {
  if (par.cargo === "PRESIDENTE") return "presidencial"
  return par.mandatoFederal ? "governador_congresso" : "governador_sem_congresso"
}

export function gerarFilaRevisao(input: {
  pares: ParCandidato[]
  sombra: Record<string, RegistroSombra>
  versaoJev: string
  anterior?: FilaRevisao | null
}): FilaRevisao {
  const decididos = new Map((input.anterior?.itens ?? []).filter((i) => i.decisao).map((i) => [i.par_id, i]))
  const itens: ItemFila[] = []
  let descartados = 0
  let semResposta = 0
  for (const par of input.pares) {
    const registro = input.sombra[par.parId]
    // Sem resposta do Jev o par vai para a fila: falha de serviço nunca descarta.
    if (!registro?.answers || !registro.preRotulo) semResposta += 1
    else if (registro.descartado) {
      descartados += 1
      continue
    }
    const anterior = decididos.get(par.parId)
    itens.push({
      par_id: par.parId,
      grupo: grupo(par),
      candidato_slug: par.slug,
      candidato_id: par.candidatoId,
      programa_chave: par.programaChave,
      tema_id: par.compromisso.temaId,
      frase_ids: par.compromisso.frases.map((f) => f.id),
      compromisso: {
        titulo: par.compromisso.titulo,
        descricao: par.compromisso.descricao,
        trechos: par.compromisso.evidencias.slice(0, 2).map((e) => ({ pagina: e.pagina, trecho: e.trecho })),
      },
      evidencia: { tipo: par.evidencia.tipo, ref: par.evidencia.ref, data: par.evidencia.data, url: par.evidencia.url, conteudo: par.evidencia.conteudo },
      jev: {
        versao: input.versaoJev,
        modelo: registro?.model ?? null,
        pre_rotulo: registro?.preRotulo ?? "relacionada",
        probabilidades: registro?.answers?.relacao?.probabilities ?? {},
        mesmo_compromisso: registro?.answers?.mesmo_compromisso?.noul ?? null,
        direcao_oposta: registro?.answers?.direcao_oposta?.noul ?? null,
      },
      decisao: anterior?.decisao ?? null,
      motivo: anterior?.motivo ?? null,
      revisado_por: anterior?.revisado_por ?? null,
      revisado_em: anterior?.revisado_em ?? null,
    })
  }
  itens.sort((a, b) => ORDEM_GRUPO[a.grupo] - ORDEM_GRUPO[b.grupo]
    || a.candidato_slug.localeCompare(b.candidato_slug)
    || a.tema_id.localeCompare(b.tema_id)
    || a.par_id.localeCompare(b.par_id))
  return {
    schema_version: SCHEMA_FILA_REVISAO,
    versao_jev: input.versaoJev,
    total_pares: input.pares.length,
    descartados_pelo_jev: descartados,
    sem_resposta_do_jev: semResposta,
    itens,
  }
}

function main(): void {
  const versao = process.argv.find((a) => a.startsWith("--versao="))?.slice("--versao=".length) ?? "v1"
  const { pares } = JSON.parse(readFileSync(path.join(PASTA, "pares.json"), "utf8")) as { pares: ParCandidato[] }
  const { registros } = JSON.parse(readFileSync(path.join(PASTA, `sombra-${versao}.json`), "utf8")) as { registros: Record<string, RegistroSombra> }
  const destino = path.join(PASTA, "fila-revisao.json")
  const anterior = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) as FilaRevisao : null
  const fila = gerarFilaRevisao({ pares, sombra: registros, versaoJev: versao, anterior })
  writeFileSync(destino, `${JSON.stringify(fila, null, 2)}\n`)
  const porGrupo: Record<string, number> = {}
  for (const item of fila.itens) porGrupo[item.grupo] = (porGrupo[item.grupo] ?? 0) + 1
  console.log(JSON.stringify({
    destino: path.relative(ROOT, destino),
    total_pares: fila.total_pares,
    descartados_pelo_jev: fila.descartados_pelo_jev,
    sem_resposta_do_jev: fila.sem_resposta_do_jev,
    na_fila: fila.itens.length,
    por_grupo: porGrupo,
    ja_decididos: fila.itens.filter((i) => i.decisao).length,
  }, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main()
