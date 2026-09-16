import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import type { CandidatoConfig, IngestResult } from "./types"
import { motivoRecusaDeFonte } from "../../src/lib/public-attention-point"
import { namesLookCompatible } from "./name-match"

const TCU_INABILITADOS_URL =
  "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados"

function stripCPF(cpf: string): string {
  return cpf.replace(/[.\-]/g, "")
}

export interface TCUInabilitado {
  nome?: string
  numeroRegistro?: string
  dataAcordao?: string
  dataFinalSancao?: string
  numeroAcordaoFormatado?: string
  linkDeliberacoesProcesso?: string
  linkAcompanhamentoProcesso?: string
}

export interface TCUCadirreg {
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

type RegistroComFonteTCU = {
  linkAcompanhamentoProcesso?: string
  linkDeliberacoesProcesso?: string
  numeroProcessoFormatado?: string
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
  registro: RegistroComFonteTCU,
  titulo: string,
  data = new Date(),
): FonteTCU[] {
  const candidatos = [registro.linkAcompanhamentoProcesso, registro.linkDeliberacoesProcesso]

  for (const raw of candidatos) {
    if (!raw) continue
    try {
      const url = new URL(raw)
      const segmentos = url.pathname.split("/").filter(Boolean)
      const processo = registro.numeroProcessoFormatado?.match(/^(\d+)\.(\d{3})\/(\d{4})-(\d)$/)
      const isAcompanhamentoProcesso =
        url.hostname === "contas.tcu.gov.br" && url.pathname === "/etcu/AcompanharProcesso"
      if (isAcompanhamentoProcesso) {
        const params = [...url.searchParams.entries()]
        const exactKeys = params.length === 3 && new Set(params.map(([key]) => key)).size === 3 && ["p1", "p2", "p3"].every((key) => url.searchParams.has(key))
        const exactProcess =
          processo &&
          url.searchParams.get("p1") === processo[1] + processo[2] &&
          url.searchParams.get("p2") === processo[3] &&
          url.searchParams.get("p3") === processo[4]
        if (url.protocol !== "https:" || !processo || !exactKeys || !exactProcess || url.username || url.password) continue
        return [{ titulo, url: url.toString(), data: data.toISOString().slice(0, 10) }]
      }
      if (
        url.protocol !== "https:" ||
        !HOSTS_PUBLICOS_TCU.has(url.hostname) ||
        segmentos.length < 2 ||
        !segmentos.some((segmento) => /\d/.test(segmento)) ||
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

function campoTexto(registro: Record<string, unknown>, campo: string): string {
  const valor = registro[campo]
  return typeof valor === "string" ? valor.trim() : ""
}

/** Valida a forma mínima de cada registro antes de tratar a resposta como positiva. */
export function validarRegistrosTCU<T extends TCUInabilitado | TCUCadirreg>(
  payload: unknown,
): T[] | null {
  if (!Array.isArray(payload)) return null
  for (const item of payload) {
    if (typeof item !== "object" || item === null) return null
    const registro = item as Record<string, unknown>
    const nome = campoTexto(registro, "nome")
    const temRegistro = ["numeroRegistro", "numeroProcessoFormatado", "codigoProcesso"]
      .some((campo) => typeof registro[campo] === "string" && campoTexto(registro, campo) !== "" || typeof registro[campo] === "number" && Number.isFinite(registro[campo]))
    if (!nome || !temRegistro) return null
  }
  return payload as T[]
}

/** Liga cada item positivo ao candidato consultado sem expor o CPF. */
export function registroTCUIdentidadeCompativel(
  registro: Pick<TCUInabilitado | TCUCadirreg, "nome">,
  nomesEsperados: readonly string[],
): boolean {
  return typeof registro.nome === "string" && namesLookCompatible([...nomesEsperados], [registro.nome])
}

function descricaoRegistroTCU(registro: TCUInabilitado | TCUCadirreg, indice: number): string {
  const campos = [
    ["Acórdão", registro.numeroAcordaoFormatado],
    ["Processo", "numeroProcessoFormatado" in registro ? registro.numeroProcessoFormatado : undefined],
    ["Data do acórdão", "dataAcordao" in registro ? registro.dataAcordao : undefined],
    ["Fim da sanção", "dataFinalSancao" in registro ? registro.dataFinalSancao : undefined],
    ["Trânsito em julgado", "dataTransitoEmJulgado" in registro ? registro.dataTransitoEmJulgado : undefined],
  ]
    .filter(([, valor]) => typeof valor === "string" && valor.trim() !== "")
    .map(([rotulo, valor]) => `${rotulo}: ${valor}`)
  return `Registro ${indice + 1}${campos.length > 0 ? ` (${campos.join(" | ")})` : ""}`
}

export function descreverRegistrosTCU(registros: readonly (TCUInabilitado | TCUCadirreg)[]): string {
  return registros.map(descricaoRegistroTCU).join("; ")
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
    return validarRegistrosTCU<TCUInabilitado>(data)
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
    return validarRegistrosTCU<TCUCadirreg>(data)
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
 * tinha corrigido.
 *
 * Contexto da issue #202: em producao o que aconteceu NAO foi sobrescrita, foi
 * duplicata. A issue #96 renomeou o titulo das claims curadas, a busca por
 * (candidato_id, titulo) nao as achou e o reingest de 28/08/2026 INSERIU duas
 * copias com o titulo antigo e o TVP do Conecta; o link-check reprovou em 31/08
 * pela copia sem fonte utilizavel. A migration 20260901180000 reancora e
 * despublica essas copias. Daqui em diante o reingest as encontra pelo titulo
 * antigo e cai neste UPDATE, que preserva a ancora duravel e nao as republica
 * (`visivel` nao faz parte da linha gravada aqui).
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
  // Texto já verificado é curadoria editorial: novas respostas da API não
  // podem contaminar nem duplicar essa alegação. Para linhas automáticas ainda
  // não verificadas, a evidência nova pode ser anexada idempotentemente.
  const marcadoresDeEvidencia = [...descricao.matchAll(/(?:Acórdão|Processo|Data do acórdão|Fim da sanção|Trânsito em julgado):\s*([^|)]+)/g)]
    .map(([, valor]) => valor.trim())
    .filter(Boolean)
  const evidenciaJaPresente = Boolean(
    descricaoExistente &&
    marcadoresDeEvidencia.length > 0 &&
    marcadoresDeEvidencia.every((valor) => descricaoExistente.includes(valor)),
  )
  const descricaoComEvidencia = existente.verificado === true || evidenciaJaPresente
    ? descricaoExistente ?? descricao
    : descricaoExistente && descricao && !descricaoExistente.includes(descricao)
      ? `${descricaoExistente}\n\n${descricao}`
      : descricaoExistente ?? descricao

  return {
    ...row,
    descricao: descricaoComEvidencia,
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

export type IngestTCUOptions = {
  targetSlugs?: readonly string[]
  fetchImpl?: typeof fetch
  /** Coorte pública materializada do banco, para não depender do seed histórico. */
  candidateRows?: readonly Pick<CandidatoConfig, "slug" | "nome_completo" | "nome_urna">[]
}

export async function ingestTCU(options: IngestTCUOptions = {}): Promise<IngestResult[]> {
  const selectedSlugs = options.targetSlugs ? new Set(options.targetSlugs) : null
  const fetchImpl = options.fetchImpl ?? fetch
  const candidatos = (options.candidateRows ? [...options.candidateRows] : await loadCandidatosPublicos())
    .filter((cand) => !selectedSlugs || selectedSlugs.has(cand.slug))
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
        fetchTCUInabilitados(cpfLimpo, fetchImpl),
        fetchTCUCadirreg(cpfLimpo, fetchImpl),
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

      const nomesEsperados = [cand.nome_completo, cand.nome_urna].filter(Boolean)
      const registrosInabilitadosValidos = inabilitados.every((registro) => registroTCUIdentidadeCompativel(registro, nomesEsperados))
      const registrosCadirregValidos = cadirreg.every((registro) => registroTCUIdentidadeCompativel(registro, nomesEsperados))
      if (!registrosInabilitadosValidos || !registrosCadirregValidos) {
        result.errors.push("Resposta TCU positiva sem identidade compatível com o candidato consultado; flags e processos preservados")
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
        const fontes = inabilitados.flatMap((registro) => fontePublicaTCU(registro, "TCU — processo de inabilitação"))
        const descricao = descreverRegistrosTCU(inabilitados)

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
        const fontes = cadirreg.flatMap((registro) => fontePublicaTCU(registro, "TCU — processo com contas julgadas irregulares"))
        const descricao = descreverRegistrosTCU(cadirreg)

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
      result.coleta_volume = inabilitados.length + cadirreg.length
      result.coleta_resultado = result.errors.length > 0
        ? "erro"
        : result.coleta_volume > 0 ? "encontrado" : "vazio_confirmado"
      result.coleta_detalhe = [
        "escopo=TCU Plataforma de Certidões; consultas oficiais inabilitados e contas irregulares",
        `inabilitados_itens=${inabilitados.length}`,
        `cadirreg_itens=${cadirreg.length}`,
        "identidade=nome retornado compatível com nome civil/urna; CPF consultado não persistido",
        ...(result.errors.length > 0 ? [`erros=${result.errors.join(" | ")}`] : []),
      ].join("; ")
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
