/**
 * Reconsulta, sem escrita remota, os 66 CNJs da curadoria judicial de 10/08.
 *
 * O artefato bruto fica fora do repositorio porque contem identificadores
 * pessoais. A saida persiste apenas campos publicos e a medicao fail-closed.
 * Status da comunicacao e data de disponibilizacao no DJEN nunca sao
 * promovidos a status de merito, data de inicio ou data de decisao do processo.
 *
 * Uso:
 *   node --import tsx scripts/audit/auditar-payload-judicial-66.ts \
 *     --raw=/caminho/curadoria-32-fichas.json \
 *     --output=QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/auditoria-payload-66.json
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { stripAccents } from "../../src/lib/strip-accents"

const HOST_OFICIAL = "comunicaapi.pje.jus.br"
const CAMINHO_OFICIAL = "/api/v1/comunicacao"
const ESPERA_JANELA_MS = 60_000

interface FonteConsultadaBruta {
  url_por_processo?: Record<string, string> | string[]
}

interface FichaBruta {
  slug: string
  nome_completo: string
  nome_urna: string
  desfecho: string
  nivel_evidencia: string
  identificador: string
  cnj_relevantes: string[]
  fonte_consultada?: FonteConsultadaBruta
}

interface CuradoriaBruta {
  fichas: FichaBruta[]
}

interface DestinatarioDjen {
  nome?: string
  polo?: string
  cpf_cnpj?: string
}

interface ComunicacaoDjen {
  numero_processo?: string
  numeroprocessocommascara?: string
  data_disponibilizacao?: string
  datadisponibilizacao?: string
  siglaTribunal?: string
  tipoComunicacao?: string
  nomeOrgao?: string
  nomeClasse?: string
  codigoClasse?: string
  ativo?: boolean
  status?: string
  texto?: string
  destinatarios?: DestinatarioDjen[]
}

interface RespostaDjen {
  count?: number
  items?: ComunicacaoDjen[]
}

interface Trabalho {
  ficha: FichaBruta
  numero_cnj: string
  url_fonte: string | null
}

interface Opcoes {
  raw: string
  output: string
}

function somenteDigitos(valor: string | undefined): string {
  return (valor ?? "").replace(/\D/g, "")
}

function normalizarNome(valor: string | undefined): string {
  return stripAccents((valor ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function unicos<T>(valores: T[]): T[] {
  return [...new Set(valores)]
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex")
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function lerOpcoes(argv: string[]): Opcoes {
  const valor = (nome: string) => argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const raw = valor("raw")
  const output = valor("output")
  if (!raw || !output) throw new Error("--raw e --output sao obrigatorios")
  return { raw: resolve(raw), output: resolve(output) }
}

function trabalhosDaCuradoria(curadoria: CuradoriaBruta): Trabalho[] {
  return curadoria.fichas
    .filter((ficha) => ficha.desfecho === "confirmado")
    .flatMap((ficha) => {
      const urls = Object.values(ficha.fonte_consultada?.url_por_processo ?? {})
      return ficha.cnj_relevantes.map((numero_cnj, indice) => ({
        ficha,
        numero_cnj,
        url_fonte: urls[indice] ?? null,
      }))
    })
}

function urlOficial(trabalho: Trabalho): URL | null {
  if (!trabalho.url_fonte) return null
  const url = new URL(trabalho.url_fonte)
  if (url.protocol !== "https:" || url.hostname !== HOST_OFICIAL || url.pathname !== CAMINHO_OFICIAL) {
    return null
  }
  if (somenteDigitos(url.searchParams.get("numeroProcesso") ?? "") !== somenteDigitos(trabalho.numero_cnj)) {
    return null
  }
  url.searchParams.set("itensPorPagina", "100")
  url.searchParams.set("pagina", "1")
  return url
}

async function consultar(url: URL): Promise<{ resposta: RespostaDjen; restante: number | null }> {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    })
    const restanteCabecalho = response.headers.get("x-ratelimit-remaining")
    const restante = restanteCabecalho === null ? null : Number(restanteCabecalho)
    if (response.status === 429) {
      if (tentativa === 2) throw new Error("DJEN respondeu 429 apos tres tentativas")
      await esperar(ESPERA_JANELA_MS)
      continue
    }
    if (!response.ok) throw new Error(`DJEN respondeu HTTP ${response.status}`)
    return { resposta: (await response.json()) as RespostaDjen, restante }
  }
  throw new Error("consulta DJEN sem desfecho")
}

function identidadeNaComunicacao(comunicacao: ComunicacaoDjen, ficha: FichaBruta): boolean {
  const nomes = [ficha.nome_completo, ficha.nome_urna].map(normalizarNome).filter(Boolean)
  const cpf = somenteDigitos(ficha.identificador).match(/\d{11}/)?.[0]
  const destinatarioExato = (comunicacao.destinatarios ?? []).some((destinatario) =>
    nomes.includes(normalizarNome(destinatario.nome)),
  )
  const nomeNoTexto = nomes.some(
    (nome) => nome.length >= 8 && normalizarNome(comunicacao.texto).includes(nome),
  )
  const cpfNaResposta = cpf ? somenteDigitos(JSON.stringify(comunicacao)).includes(cpf) : false
  return destinatarioExato || nomeNoTexto || cpfNaResposta
}

function polosDoCandidato(comunicacoes: ComunicacaoDjen[], ficha: FichaBruta): string[] {
  const nomes = [ficha.nome_completo, ficha.nome_urna].map(normalizarNome).filter(Boolean)
  const cpf = somenteDigitos(ficha.identificador).match(/\d{11}/)?.[0]
  return unicos(
    comunicacoes.flatMap((comunicacao) =>
      (comunicacao.destinatarios ?? [])
        .filter((destinatario) => {
          const nomeExato = nomes.includes(normalizarNome(destinatario.nome))
          const cpfExato = cpf
            ? somenteDigitos(JSON.stringify(destinatario)).includes(cpf)
            : false
          return nomeExato || cpfExato
        })
        .map((destinatario) => destinatario.polo)
        .filter((polo): polo is string => Boolean(polo)),
    ),
  ).sort()
}

async function auditar(trabalho: Trabalho) {
  const url = urlOficial(trabalho)
  if (!url) {
    return {
      slug: trabalho.ficha.slug,
      numero_cnj: trabalho.numero_cnj,
      publicacao_pronta: false,
      erro_consulta: "url_oficial_ausente_ou_divergente",
      campos_faltantes: ["fonte_oficial", "classe", "polo_candidato", "orgao", "data_comunicacao", "descricao_publica"],
    }
  }

  try {
    const { resposta, restante } = await consultar(url)
    const comunicacoes = (resposta.items ?? []).filter(
      (item) =>
        somenteDigitos(item.numero_processo ?? item.numeroprocessocommascara) ===
        somenteDigitos(trabalho.numero_cnj),
    )
    const comunicacoesComIdentidade = comunicacoes.filter((item) =>
      identidadeNaComunicacao(item, trabalho.ficha),
    )
    const polos = polosDoCandidato(comunicacoesComIdentidade, trabalho.ficha)
    const classes = unicos(comunicacoesComIdentidade.map((item) => item.nomeClasse).filter((valor): valor is string => Boolean(valor))).sort()
    const codigosClasse = unicos(comunicacoesComIdentidade.map((item) => item.codigoClasse).filter((valor): valor is string => Boolean(valor))).sort()
    const tribunais = unicos(comunicacoesComIdentidade.map((item) => item.siglaTribunal).filter((valor): valor is string => Boolean(valor))).sort()
    const tiposComunicacao = unicos(comunicacoesComIdentidade.map((item) => item.tipoComunicacao).filter((valor): valor is string => Boolean(valor))).sort()
    const orgaos = unicos(comunicacoesComIdentidade.map((item) => item.nomeOrgao).filter((valor): valor is string => Boolean(valor))).sort()
    const datas = unicos(
      comunicacoesComIdentidade
        .map((item) => item.data_disponibilizacao ?? item.datadisponibilizacao)
        .filter((valor): valor is string => Boolean(valor)),
    ).sort()
    const camposFaltantes: string[] = []
    if (comunicacoesComIdentidade.length === 0) camposFaltantes.push("identidade_na_resposta_oficial")
    if (classes.length === 0) camposFaltantes.push("classe")
    if (tribunais.length === 0) camposFaltantes.push("tribunal")
    if (datas.length === 0) camposFaltantes.push("data_comunicacao")
    if (polos.length === 0) camposFaltantes.push("polo_candidato")
    if (orgaos.length === 0) camposFaltantes.push("orgao")

    const rotuloPolo: Record<string, string> = {
      A: "ativo",
      P: "passivo",
      T: "terceiro interessado",
      D: "outro destinatário",
    }
    const polosPublicos = polos.map((polo) => rotuloPolo[polo] ?? polo)
    const descricaoProcedural = camposFaltantes.length === 0
      ? `O DJEN registra comunicação processual oficial no processo ${trabalho.numero_cnj}, ` +
        `nas classes ${classes.join("; ")}, perante ${orgaos.join("; ")} (${tribunais.join(", ")}). ` +
        `O candidato consta nos polos ${polosPublicos.join(" e ")}. ` +
        `As comunicações ${tiposComunicacao.join("; ")} foram disponibilizadas entre ${datas[0]} e ${datas.at(-1)}. ` +
        "A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho."
      : null

    const evidenciaPublica = {
      classes,
      codigos_classe: codigosClasse,
      tribunais,
      orgaos,
      polos_candidato: polos,
      tipos_comunicacao: tiposComunicacao,
      primeira_comunicacao: datas[0] ?? null,
      ultima_comunicacao: datas.at(-1) ?? null,
      comunicacoes_retornadas: comunicacoes.length,
      comunicacoes_com_identidade: comunicacoesComIdentidade.length,
    }
    const resultado = {
      slug: trabalho.ficha.slug,
      numero_cnj: trabalho.numero_cnj,
      payload_tecnico_pronto: camposFaltantes.length === 0,
      publicacao_pronta: false,
      identidade_curada: true,
      nivel_evidencia_identidade: trabalho.ficha.nivel_evidencia,
      identidade_observada_na_resposta: comunicacoesComIdentidade.length > 0,
      fonte_oficial: url.toString(),
      ...evidenciaPublica,
      status_publico: "comunicacao_processual_publicada_merito_nao_inferido",
      status_processual_merito: null,
      data_inicio: null,
      data_decisao: null,
      descricao_publica: descricaoProcedural,
      campos_nao_inferidos: ["status_processual_merito", "data_inicio", "data_decisao", "gravidade"],
      campos_faltantes: camposFaltantes.sort(),
      evidencia_publica_sha256: sha256(JSON.stringify(evidenciaPublica)),
      rate_limit_restante_apos_consulta: restante,
    }
    if (restante === 0) await esperar(ESPERA_JANELA_MS)
    return resultado
  } catch (error) {
    return {
      slug: trabalho.ficha.slug,
      numero_cnj: trabalho.numero_cnj,
      publicacao_pronta: false,
      erro_consulta: error instanceof Error ? error.message : String(error),
      campos_faltantes: ["erro_consulta", "classe", "polo_candidato", "orgao", "data_comunicacao", "descricao_publica"],
    }
  }
}

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2))
  const bruto = readFileSync(opcoes.raw, "utf8")
  const curadoria = JSON.parse(bruto) as CuradoriaBruta
  const trabalhos = trabalhosDaCuradoria(curadoria)
  const processos: Awaited<ReturnType<typeof auditar>>[] = []
  for (const [indice, trabalho] of trabalhos.entries()) {
    processos.push(await auditar(trabalho))
    process.stderr.write(`auditados ${indice + 1}/${trabalhos.length}\n`)
  }

  const contagemCampo = (campo: string) =>
    processos.filter((processo) => !processo.campos_faltantes.includes(campo)).length
  const artefato = {
    schema_version: 1,
    gerado_em: new Date().toISOString(),
    estado: "auditoria_fail_closed_nao_publicavel",
    publicacao_pronta: false,
    origem_bruta_sha256: sha256(bruto),
    fonte_api: "https://comunicaapi.pje.jus.br/swagger/djen.yml",
    semantica: {
      status_comunicacao: "nao_e_status_de_merito_do_processo",
      data_disponibilizacao: "nao_e_data_inicio_nem_data_decisao_do_processo",
      texto_comunicacao: "inteiro_teor_nao_foi_promovido_a_descricao_editorial",
      descricao_publica: "deterministica_e_procedural_sem_inferencia_de_merito",
    },
    totais: {
      processos: processos.length,
      fichas: new Set(processos.map((processo) => processo.slug)).size,
      publicaveis: processos.filter((processo) => processo.publicacao_pronta).length,
      payloads_tecnicos_prontos: processos.filter(
        (processo) => "payload_tecnico_pronto" in processo && processo.payload_tecnico_pronto,
      ).length,
      consultas_com_erro: processos.filter((processo) => "erro_consulta" in processo).length,
      campos_sustentados: {
        identidade_na_resposta_oficial: contagemCampo("identidade_na_resposta_oficial"),
        classe: contagemCampo("classe"),
        tribunal: contagemCampo("tribunal"),
        polo_candidato: contagemCampo("polo_candidato"),
        data_comunicacao: contagemCampo("data_comunicacao"),
        orgao: contagemCampo("orgao"),
        status_publico: processos.filter((processo) => "status_publico" in processo).length,
        descricao_publica: contagemCampo("descricao_publica"),
      },
    },
    processos,
  }
  mkdirSync(dirname(opcoes.output), { recursive: true })
  writeFileSync(opcoes.output, `${JSON.stringify(artefato, null, 2)}\n`)
  console.log(JSON.stringify(artefato.totais, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
