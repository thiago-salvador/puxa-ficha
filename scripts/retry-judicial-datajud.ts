/**
 * Retry judicial com fonte adicional (DoD do lançamento, 10/08/2026).
 *
 * ## O que este retry é, e o que ele não pode ser
 *
 * A frente judicial fechou em 05/08 com 119 de 185 fichas em `bloqueado`, todas
 * pelo mesmo motivo: ocorrência por nome exato no DJEN sem um segundo
 * identificador. `docs/criterio-processos-judiciais.md` já registrou por que
 * nenhuma re-execução do DJEN muda isso, então repetir a mesma consulta seria a
 * segunda falha idêntica sem evidência nova, que é o que encerra a frente.
 *
 * O que existe de genuinamente NOVO é a **fonte adicional prevista pelo próprio
 * critério**: o DataJud, consultado por NÚMERO CNJ. Cada ocorrência ambígua do
 * lote de 05/08 traz `numero_cnj` e `tribunal`, então dá para caracterizar cada
 * processo em fonte oficial diferente da que o achou.
 *
 * **E o resultado honesto é conhecido de antemão, o que não torna o retry
 * inútil.** A API pública do DataJud não expõe as partes do processo (política
 * de dados do CNJ), então ela não resolve identidade e não pode promover
 * ninguém de `bloqueado` para `encontrado`. O que ela entrega é outra coisa, e
 * é o que a curadoria manual precisa: classe processual, órgão julgador,
 * assuntos, grau e datas de cada número, para o humano saber qual abrir
 * primeiro, e a confirmação medida (não presumida) de que a via automática se
 * esgotou.
 *
 * Por isso o estado terminal de todo candidato aqui é, por construção,
 * `indeterminado`. O script existe para PROVAR isso com dado, não para mudar.
 *
 * ## O que ele não faz
 *
 * Não lê Supabase (universo vem do JSON de evidência versionado), não escreve
 * em lugar nenhum, e não consulta o DJEN de novo.
 *
 * Uso:
 *   PF_DRY_RUN=1 npx tsx scripts/retry-judicial-datajud.ts --prioridade=1 --out=relatorio.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { ativarDryRun, exigirDryRun } from "./lib/dry-run"
import { log, warn } from "./lib/logger"

ativarDryRun()
exigirDryRun("retry-judicial-datajud")

const DATAJUD = "https://api-publica.datajud.cnj.jus.br"
const WIKI_CHAVE = "https://datajud-wiki.cnj.jus.br/api-publica/acesso/"
const ENTRADA_PADRAO = "QA/evidencias/2026-08-09-trilha-b/curadoria-judicial-bloqueados.json"

interface OcorrenciaAmbigua {
  numero_cnj: string
  tribunal: string
  motivo: string
}

interface FichaBloqueada {
  slug: string
  nome_urna: string
  nome_completo: string
  cargo: string
  uf: string | null
  partido: string
  prioridade: number
  identidade_status: string
  motivo: string
  ocorrencias_ambiguas_total: number
  amostra_ocorrencias: OcorrenciaAmbigua[]
  busca_url: string
}

/**
 * Desfecho de UMA consulta, explícito.
 *
 * A versão anterior guardava só `encontrado_no_datajud: boolean` mais um
 * `detalhe` em texto, e o agregador decidia se era falha procurando a palavra
 * "falhou" na string. Isso era fail-open: uma resposta `HTTP 403` produzia o
 * detalhe "HTTP 403 em api_publica_tjsp", que não casa com aquele filtro, então
 * a consulta reprovada entrava na conta como se fosse simplesmente um número
 * ausente do acervo. Com o DataJud fora do ar, a rodada declararia a frente
 * ENCERRADA e sairia 0 sem ter conferido nada.
 *
 *   caracterizado   200 com documento: classe, órgão e assuntos vieram.
 *   nao_localizado  200 sem hit. É RESPOSTA, não falha: o número não está no
 *                   acervo público daquele tribunal.
 *   erro            qualquer HTTP não OK, timeout, corpo ilegível ou exceção de
 *                   rede. Não fecha nada.
 */
export type StatusConsultaDatajud = "caracterizado" | "nao_localizado" | "erro"

export interface ProcessoCaracterizado {
  numero_cnj: string
  tribunal: string
  status: StatusConsultaDatajud
  /** Mantido para leitura humana do relatório; o veredito é `status`. */
  encontrado_no_datajud: boolean
  /** Presente quando o erro veio do protocolo, para o diagnóstico não virar texto. */
  http_status?: number
  classe?: string | null
  orgao_julgador?: string | null
  grau?: string | null
  data_ajuizamento?: string | null
  assuntos?: string[]
  /** SEMPRE false até hoje: a API pública do DataJud não devolve partes. Medido, não presumido. */
  expoe_partes: boolean
  detalhe?: string
}

interface ResultadoFicha {
  slug: string
  nome_urna: string
  cargo: string
  partido: string
  prioridade: number
  identidade_status: string
  motivo_original: string
  ocorrencias_ambiguas_total: number
  numeros_conferidos: number
  processos: ProcessoCaracterizado[]
  /** Estado terminal. `indeterminado` por construção: ver o cabeçalho. */
  resultado: "indeterminado" | "erro"
  conclusao: string
}

function parseArgs(argv: string[]): { prioridade: number | null; entrada: string; out: string | null } {
  const args = { prioridade: null as number | null, entrada: ENTRADA_PADRAO, out: null as string | null }
  for (const raw of argv) {
    const m = /^--([a-z]+)=(.+)$/.exec(raw)
    if (!m) continue
    if (m[1] === "prioridade") args.prioridade = Number(m[2])
    if (m[1] === "entrada") args.entrada = m[2]
    if (m[1] === "out") args.out = m[2]
  }
  return args
}

/** A chave pública do DataJud vive na documentação oficial do CNJ. */
async function chaveDatajud(): Promise<string> {
  const texto = await (await fetch(WIKI_CHAVE, { signal: AbortSignal.timeout(30_000) })).text()
  const semHtml = texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
  const match = semHtml.match(/Authorization:\s*APIKey\s+([A-Za-z0-9+/_=-]{20,})/)
  if (!match) throw new Error("chave pública do DataJud não encontrada na documentação oficial")
  return match[1]
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null
}

export async function consultarDatajud(
  numero: string,
  tribunal: string,
  chave: string,
  base: string = DATAJUD,
): Promise<ProcessoCaracterizado> {
  const alias = tribunal.toLowerCase()
  const digitos = numero.replace(/\D/g, "")
  const url = `${base}/api_publica_${alias}/_search`

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { Authorization: `APIKey ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ size: 1, query: { match: { numeroProcesso: digitos } } }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!resposta.ok) {
      // Qualquer status fora de 2xx é ERRO, e é o mesmo veredito para 403
      // (chave recusada), 429 (rate limit) e 500 (falha do lado do CNJ): em
      // nenhum deles se sabe se o processo existe. Rotular como "não
      // localizado" seria transformar indisponibilidade em ausência.
      return {
        numero_cnj: numero,
        tribunal,
        status: "erro",
        encontrado_no_datajud: false,
        http_status: resposta.status,
        expoe_partes: false,
        detalhe: `HTTP ${resposta.status} em api_publica_${alias}`,
      }
    }

    let corpo: { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } }
    try {
      corpo = (await resposta.json()) as typeof corpo
    } catch (err) {
      // 200 com corpo ilegível não é acervo vazio: é resposta que não sabemos
      // ler, mesma doutrina do ingest de sanções.
      return {
        numero_cnj: numero,
        tribunal,
        status: "erro",
        encontrado_no_datajud: false,
        http_status: resposta.status,
        expoe_partes: false,
        detalhe: `corpo ilegível: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const fonte = corpo.hits?.hits?.[0]?._source
    if (!fonte) {
      return {
        numero_cnj: numero,
        tribunal,
        status: "nao_localizado",
        encontrado_no_datajud: false,
        expoe_partes: false,
        detalhe: "número não localizado no acervo público do tribunal",
      }
    }

    const assuntos = Array.isArray(fonte.assuntos)
      ? (fonte.assuntos as Array<Record<string, unknown>>)
          .map((a) => texto(a?.nome))
          .filter((n): n is string => Boolean(n))
      : []

    // Medição, não suposição: procura QUALQUER campo de parte no documento
    // devolvido. Se um dia a política do CNJ mudar, este campo vira true
    // sozinho e a conclusão do relatório muda com ele.
    const chavesDoDocumento = Object.keys(fonte).map((k) => k.toLowerCase())
    const expoePartes = chavesDoDocumento.some(
      (k) => k.includes("parte") || k.includes("polo") || k.includes("envolvido"),
    )

    return {
      numero_cnj: numero,
      tribunal,
      status: "caracterizado",
      encontrado_no_datajud: true,
      classe: texto((fonte.classe as Record<string, unknown>)?.nome),
      orgao_julgador: texto((fonte.orgaoJulgador as Record<string, unknown>)?.nome),
      grau: texto(fonte.grau),
      data_ajuizamento: texto(fonte.dataAjuizamento),
      assuntos,
      expoe_partes: expoePartes,
    }
  } catch (err) {
    return {
      numero_cnj: numero,
      tribunal,
      status: "erro",
      encontrado_no_datajud: false,
      expoe_partes: false,
      detalhe: `consulta falhou: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Fecha o desfecho de UMA ficha. Puro, para o teste poder exercer a regra sem
 * rede.
 *
 * A regra muda em relação à versão anterior: **uma** consulta com erro já
 * derruba a ficha para `erro`. Antes exigia que TODAS falhassem, então uma
 * ficha com 1 número conferido e 9 recusados por 429 saía como
 * `indeterminado`, indistinguível de uma conferida por inteiro.
 */
export function fecharFicha(processos: ProcessoCaracterizado[]): {
  resultado: "indeterminado" | "erro"
  caracterizados: number
  nao_localizados: number
  erros: number
} {
  const caracterizados = processos.filter((p) => p.status === "caracterizado").length
  const nao_localizados = processos.filter((p) => p.status === "nao_localizado").length
  const erros = processos.filter((p) => p.status === "erro").length
  return {
    resultado: erros > 0 ? "erro" : "indeterminado",
    caracterizados,
    nao_localizados,
    erros,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const consultadoEm = new Date().toISOString()

  const entrada = JSON.parse(readFileSync(resolve(args.entrada), "utf8")) as {
    linhas: FichaBloqueada[]
  }
  const fichas = entrada.linhas.filter(
    (f) => args.prioridade === null || f.prioridade === args.prioridade,
  )
  if (fichas.length === 0) {
    throw new Error(`nenhuma ficha para prioridade ${args.prioridade} em ${args.entrada}`)
  }
  log("retry-judicial", `${fichas.length} ficha(s) na fila, prioridade ${args.prioridade ?? "todas"}`)

  const chave = await chaveDatajud()
  log("retry-judicial", "chave pública do DataJud obtida da documentação do CNJ")

  const resultados: ResultadoFicha[] = []
  for (const ficha of fichas) {
    const processos: ProcessoCaracterizado[] = []
    for (const ocorrencia of ficha.amostra_ocorrencias) {
      processos.push(await consultarDatajud(ocorrencia.numero_cnj, ocorrencia.tribunal, chave))
    }

    const comPartes = processos.filter((p) => p.expoe_partes)
    const fechamento = fecharFicha(processos)
    const resultado = fechamento.resultado

    const conclusao =
      fechamento.erros > 0
        ? `INCONCLUSIVO: ${fechamento.erros} de ${processos.length} consulta(s) ao DataJud ` +
          `falharam (${processos
            .filter((p) => p.status === "erro")
            .map((p) => p.detalhe ?? "erro")
            .join("; ")}). Consulta que não respondeu não vira ausência: a ficha ` +
          `permanece por conferir e a rodada precisa ser repetida.`
        : comPartes.length > 0
          ? `ATENÇÃO: ${comPartes.length} documento(s) do DataJud trouxeram campo de parte. ` +
            `A premissa do critério de 05/08 mudou e merece reavaliação da frente.`
          : ficha.ocorrencias_ambiguas_total === 0
            ? "sem ocorrência ambígua registrada no lote de 05/08; nada a conferir por número"
            : `${fechamento.caracterizados} de ${processos.length} número(s) caracterizado(s) no ` +
              `DataJud (classe, órgão, assunto). NENHUM expõe parte, então a identidade continua ` +
              `não resolvida por via automática: permanece indeterminado, para curadoria manual.`

    resultados.push({
      slug: ficha.slug,
      nome_urna: ficha.nome_urna,
      cargo: ficha.cargo,
      partido: ficha.partido,
      prioridade: ficha.prioridade,
      identidade_status: ficha.identidade_status,
      motivo_original: ficha.motivo,
      ocorrencias_ambiguas_total: ficha.ocorrencias_ambiguas_total,
      numeros_conferidos: processos.length,
      processos,
      resultado,
      conclusao,
    })
    log(
      "retry-judicial",
      `  ${ficha.slug}: ${fechamento.caracterizados}/${processos.length} caracterizado(s), ` +
        `${fechamento.erros} erro(s), ${resultado}`,
    )
  }

  const porResultado = resultados.reduce<Record<string, number>>((acc, r) => {
    acc[r.resultado] = (acc[r.resultado] ?? 0) + 1
    return acc
  }, {})
  const algumExpoeParte = resultados.some((r) => r.processos.some((p) => p.expoe_partes))
  const consultasComErro = resultados.reduce(
    (acc, r) => acc + r.processos.filter((p) => p.status === "erro").length,
    0,
  )

  if (algumExpoeParte) {
    warn("retry-judicial", "DataJud devolveu campo de parte: reavaliar o critério de 05/08")
  }
  if (consultasComErro > 0) {
    warn(
      "retry-judicial",
      `${consultasComErro} consulta(s) falharam: a rodada é INCONCLUSIVA e não encerra a frente`,
    )
  }

  const relatorio = {
    script: "retry-judicial-datajud",
    modo: "dry-run",
    fuso_dos_instantes: "UTC (ISO 8601, sufixo Z)",
    consultado_em: consultadoEm,
    fonte_adicional: `${DATAJUD} (API Pública do DataJud, consulta por número CNJ)`,
    fonte_original_do_lote: "DJEN/PJe-CNJ, busca por nome (lote de 05/08)",
    entrada: args.entrada,
    universo: resultados.length,
    por_resultado: porResultado,
    consultas_com_erro: consultasComErro,
    datajud_expoe_partes: algumExpoeParte,
    // A ORDEM importa: erro vence tudo. Uma rodada com consulta falhada não
    // conferiu o que diz ter conferido, então não pode declarar a frente
    // encerrada nem que a premissa de 05/08 segue valendo.
    conclusao_da_frente:
      consultasComErro > 0
        ? `INCONCLUSIVA: ${consultasComErro} consulta(s) ao DataJud falharam. A frente NÃO está ` +
          `encerrada por esta rodada, e nenhuma conclusão sobre a fonte adicional pode ser tirada ` +
          `dela. Repetir quando o serviço responder.`
        : algumExpoeParte
          ? "REABRIR: a fonte adicional passou a expor parte, contrariando o critério de 05/08."
          : "ENCERRADA com bloqueio documentado. A fonte adicional caracteriza o processo e não " +
            "identifica a parte, então nenhuma ficha sai de indeterminado por via automática. " +
            "A saída é curadoria manual, com os números já caracterizados abaixo.",
    fichas: resultados,
  }

  const saida = JSON.stringify(relatorio, null, 2)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(resolve(args.out), `${saida}\n`)
    log("retry-judicial", `relatório em ${args.out}`)
  } else {
    console.log(saida)
  }

  // Exit não zero com QUALQUER consulta falhada, e não só quando a ficha
  // inteira falha. O relatório sai primeiro: quem lê fica com o diagnóstico, e
  // nenhum CI trata a rodada como sucesso.
  if (consultasComErro > 0) process.exitCode = 2
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
