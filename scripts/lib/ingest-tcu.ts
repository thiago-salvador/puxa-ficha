import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"
import { motivoRecusaDeFonte } from "../../src/lib/public-attention-point"

const TCU_INABILITADOS_URL =
  "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados"

function stripCPF(cpf: string): string {
  return cpf.replace(/[.\-]/g, "")
}

interface TCUInabilitado {
  nome?: string
  numeroRegistro?: string
  dataAcordao?: string
  dataFinalSancao?: string
  numeroAcordaoFormatado?: string
  linkDeliberacoesProcesso?: string
  linkAcompanhamentoProcesso?: string
}

interface TCUCadirreg {
  nome?: string
  cpf?: string
  numeroAcordaoFormatado?: string
  numeroProcessoFormatado?: string
  dataTransitoEmJulgado?: string
  linkDeliberacoesProcesso?: string
  linkAcompanhamentoProcesso?: string
}

interface FonteTCU {
  titulo: string
  url: string
  data: string
}

const HOSTS_PUBLICOS_TCU = new Set(["contas.tcu.gov.br", "conecta-tcu.apps.tcu.gov.br"])

/**
 * A API oficial devolve links públicos do próprio processo. Preferimos o TVP,
 * cuja URL tem o identificador no caminho, e recusamos host ou raiz genérica.
 * CPF nunca entra na fonte pública.
 *
 * Issue #202: o TVP do Conecta é casca de SPA e o link-check o classifica como
 * `sem_substancia`. O outro link da API, `linkDeliberacoesProcesso`, NÃO é
 * saída melhor: `contas.tcu.gov.br/pesquisaJurisprudencia/#/...` põe o
 * identificador no fragmento, então o caminho que o servidor vê tem UM
 * segmento (raiz de aplicação) e o corpo é a mesma casca de SPA. Admiti-lo
 * trocaria uma fonte sem substância por duas. A âncora durável do acórdão é o
 * documento REST de `pesquisa.apps.tcu.gov.br`, que a API não devolve e que
 * por isso é ato de curadoria: o trabalho deste arquivo é PRESERVAR essa
 * curadoria (ver `montarLinhaPontoAtencaoTCU`), não adivinhá-la.
 */
export function fontePublicaTCU(
  registro: Pick<TCUInabilitado, "linkAcompanhamentoProcesso" | "linkDeliberacoesProcesso">,
  titulo: string,
  data = new Date(),
): FonteTCU[] {
  const candidatos = [registro.linkAcompanhamentoProcesso, registro.linkDeliberacoesProcesso]

  for (const raw of candidatos) {
    if (!raw) continue
    try {
      const url = new URL(raw)
      const segmentos = url.pathname.split("/").filter(Boolean)
      if (
        url.protocol !== "https:" ||
        !HOSTS_PUBLICOS_TCU.has(url.hostname) ||
        segmentos.length < 2 ||
        url.username ||
        url.password ||
        url.search
      ) {
        continue
      }
      return [{ titulo, url: url.toString(), data: data.toISOString().slice(0, 10) }]
    } catch {
      continue
    }
  }

  return []
}

// Retorno null = fonte indisponível (HTTP != 200, payload inválido, rede).
// null NUNCA pode ser tratado como lista vazia: vazio verdadeiro é 200 + [].
export async function fetchTCUInabilitados(
  cpf: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TCUInabilitado[] | null> {
  try {
    const res = await fetchImpl(TCU_INABILITADOS_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ cpf }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data as TCUInabilitado[]
  } catch {
    return null
  }
}

// O ORDS antigo (`/consenec/rest/consulta/cadirreg/{cpf}`) morreu: 404 para
// qualquer CPF, inclusive fictício (verificado em 2026-08-14). A fonte viva é a
// Plataforma de Certidões, POST com body JSON e sem auth.
const TCU_CADIRREG_URL =
  "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares"

export async function fetchTCUCadirreg(
  cpf: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TCUCadirreg[] | null> {
  try {
    const res = await fetchImpl(TCU_CADIRREG_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ cpf }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    return data as TCUCadirreg[]
  } catch {
    return null
  }
}

/** Linha existente de `pontos_atencao` que o ingest pode reescrever. */
export interface PontoAtencaoExistente {
  id: string
  descricao: unknown
  fontes: unknown
  verificado: unknown
}

export interface LinhaPontoAtencaoTCU {
  candidato_id: string
  categoria: string
  titulo: string
  descricao: string
  gravidade: string
  verificado: boolean
  gerado_por: string
  fontes: unknown[]
}

function urlDeFonte(fonte: unknown): string {
  if (typeof fonte !== "object" || fonte === null) return ""
  const url = (fonte as { url?: unknown }).url
  return typeof url === "string" ? url.trim() : ""
}

/**
 * Uniao de fontes por URL, com as EXISTENTES na frente.
 *
 * A ancora duravel de um acordao do TCU nao vem da API: ela e curada a mao
 * (issue #96 reancorou dois acordaos em `pesquisa.apps.tcu.gov.br`). A API so
 * devolve o TVP do Conecta, que e casca de SPA. Uniao, e nao substituicao,
 * porque a fonte nova e adicional, nunca superior a curadoria.
 */
export function unirFontesPorUrl(existentes: unknown, novas: unknown[]): unknown[] {
  const base = Array.isArray(existentes) ? existentes : []
  const vistas = new Set<string>()
  const resultado: unknown[] = []

  for (const fonte of [...base, ...novas]) {
    const url = urlDeFonte(fonte)
    if (url === "" || vistas.has(url)) continue
    vistas.add(url)
    resultado.push(fonte)
  }

  return resultado
}

/**
 * Monta a linha que o ingest vai gravar.
 *
 * Sem `existente` (INSERT) o comportamento e o de sempre. Com `existente`
 * (UPDATE) a regra e nao destruir curadoria, porque o `update(row)` antigo
 * reescrevia a linha INTEIRA e apagava, a cada reingest, tudo o que um humano
 * tinha corrigido. Foi assim que as duas claims de contas irregulares do TCU
 * voltaram a apontar para o Conecta depois da issue #96, e o link-check
 * reprovou de novo em 31/08/2026 (issue #202).
 *
 * Tres invariantes no UPDATE:
 *  - `fontes` e uniao por URL, existentes primeiro: fonte curada nunca sai;
 *  - `descricao` existente e nao vazia e preservada: o texto gerado aqui e
 *    concatenacao de campos da API, e a curadoria e irrecuperavel;
 *  - `verificado` nunca cai de `true` para `false`.
 */
export function montarLinhaPontoAtencaoTCU(
  candidatoId: string,
  titulo: string,
  descricao: string,
  fontes: FonteTCU[],
  existente: PontoAtencaoExistente | null,
): LinhaPontoAtencaoTCU {
  const row: LinhaPontoAtencaoTCU = {
    candidato_id: candidatoId,
    categoria: "processo_grave",
    titulo,
    descricao,
    gravidade: "critica",
    verificado: false,
    gerado_por: "automatico",
    fontes,
  }

  if (!existente) return row

  const descricaoExistente =
    typeof existente.descricao === "string" && existente.descricao.trim() !== ""
      ? existente.descricao
      : null

  return {
    ...row,
    descricao: descricaoExistente ?? descricao,
    verificado: existente.verificado === true,
    fontes: unirFontesPorUrl(existente.fontes, fontes),
  }
}

async function upsertPontoAtencao(
  candidatoId: string,
  titulo: string,
  descricao: string,
  fontes: FonteTCU[],
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("pontos_atencao")
    .select("id, descricao, fontes, verificado")
    .eq("candidato_id", candidatoId)
    .eq("titulo", titulo)
    .single()

  const existente = (existing as PontoAtencaoExistente | null) ?? null
  const row = montarLinhaPontoAtencaoTCU(candidatoId, titulo, descricao, fontes, existente)

  // Guard de fonte (auditoria de 2026-07-24, achados V1 e A3).
  //
  // Esta rota grava gravidade "critica" sem nenhuma fonte, e "automatico" nao
  // e "ia", entao o gate antigo deixava a claim ir ao ar mesmo com
  // verificado = false. O gate de 20260725160000 recusa esse INSERT no banco.
  // Aqui a gente para ANTES, com aviso legivel, em vez de deixar o pipeline
  // estourar no meio.
  //
  // O guard roda sobre a linha EFETIVA, ja com as fontes unidas: e ela que vai
  // para o banco, nao a lista crua devolvida pela API.
  const recusa = motivoRecusaDeFonte(row.gravidade, row.fontes)
  if (recusa) {
    warn("tcu", `ponto de atencao nao gravado (${recusa}): ${titulo}`)
    return false
  }

  let error
  if (existente) {
    if (row.descricao !== descricao) {
      warn(
        "tcu",
        `descricao curada preservada em "${titulo}" (${existente.id}); ` +
          `a API devolveria: ${descricao}`,
      )
    }
    ;({ error } = await supabase.from("pontos_atencao").update(row).eq("id", existente.id))
  } else {
    ;({ error } = await supabase.from("pontos_atencao").insert(row))
  }
  if (error) throw new Error(`Erro ao gravar ponto de atencao TCU: ${error.message}`)
  return true
}

export async function ingestTCU(): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "tcu",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("tcu", `Processando ${cand.slug}`)

    try {
      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("id, cpf, slug")
        .eq("slug", cand.slug)
        .single()

      if (!dbCand) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      if (!dbCand.cpf) {
        warn("tcu", `  ${cand.slug}: sem CPF no banco, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const cpfLimpo = stripCPF(dbCand.cpf)
      const candidatoId = dbCand.id

      const [inabilitados, cadirreg] = await Promise.all([
        fetchTCUInabilitados(cpfLimpo),
        fetchTCUCadirreg(cpfLimpo),
      ])

      // Fonte indisponível não é ausência de sanção: sem resposta 200 da fonte,
      // as flags não são tocadas e o candidato fica com erro registrado.
      if (inabilitados === null || cadirreg === null) {
        const fontesMortas = [
          inabilitados === null ? "TCU inabilitados" : null,
          cadirreg === null ? "TCU CADIRREG (certidoes)" : null,
        ].filter(Boolean)
        result.errors.push(`Fonte indisponivel, flags nao atualizadas: ${fontesMortas.join(", ")}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const tcuInabilitado = inabilitados.length > 0
      const tcuContasIrregulares = cadirreg.length > 0

      const { error: updateErr } = await supabase
        .from("candidatos")
        .update({
          tcu_inabilitado: tcuInabilitado,
          tcu_contas_irregulares: tcuContasIrregulares,
        })
        .eq("id", candidatoId)

      if (updateErr) {
        result.errors.push(`Erro ao atualizar candidatos: ${updateErr.message}`)
      } else {
        result.tables_updated.push("candidatos")
        result.rows_upserted++
      }

      if (tcuInabilitado) {
        const primeiro = inabilitados[0]
        const fontes = fontePublicaTCU(primeiro, "TCU — processo de inabilitação")
        const descricao = [
          primeiro.numeroAcordaoFormatado ? `Acórdão: ${primeiro.numeroAcordaoFormatado}` : null,
          primeiro.dataAcordao ? `Data do acórdão: ${primeiro.dataAcordao}` : null,
          primeiro.dataFinalSancao ? `Fim da sanção: ${primeiro.dataFinalSancao}` : null,
        ]
          .filter(Boolean)
          .join(" | ")

        const gravado = await upsertPontoAtencao(
          candidatoId,
          "Inabilitado pelo TCU",
          descricao || "Condenação de inabilitação registrada no TCU",
          fontes,
        )

        if (gravado) {
          if (!result.tables_updated.includes("pontos_atencao")) {
            result.tables_updated.push("pontos_atencao")
          }
          result.rows_upserted++
        } else {
          result.errors.push("Inabilitacao encontrada, mas sem link publico de processo do TCU")
        }
        log("tcu", `  ${cand.slug}: INABILITADO (${inabilitados.length} registro(s))`)
      }

      if (tcuContasIrregulares) {
        const primeiro = cadirreg[0]
        const fontes = fontePublicaTCU(primeiro, "TCU — processo com contas julgadas irregulares")
        const descricao = [
          primeiro.numeroAcordaoFormatado ? `Acórdão: ${primeiro.numeroAcordaoFormatado}` : null,
          primeiro.numeroProcessoFormatado ? `Processo: ${primeiro.numeroProcessoFormatado}` : null,
          primeiro.dataTransitoEmJulgado ? `Trânsito em julgado: ${primeiro.dataTransitoEmJulgado}` : null,
        ]
          .filter(Boolean)
          .join(" | ")

        const gravado = await upsertPontoAtencao(
          candidatoId,
          "Contas irregulares no TCU",
          descricao || "Contas julgadas irregulares registradas no CADIRREG/TCU",
          fontes,
        )

        if (gravado) {
          if (!result.tables_updated.includes("pontos_atencao")) {
            result.tables_updated.push("pontos_atencao")
          }
          result.rows_upserted++
        } else {
          result.errors.push("Contas irregulares encontradas, mas sem link publico de processo do TCU")
        }
        log("tcu", `  ${cand.slug}: CONTAS IRREGULARES (${cadirreg.length} registro(s))`)
      }

      if (!tcuInabilitado && !tcuContasIrregulares) {
        log("tcu", `  ${cand.slug}: sem irregularidades no TCU`)
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTCU().then((r) => console.log(JSON.stringify(r, null, 2)))
}
