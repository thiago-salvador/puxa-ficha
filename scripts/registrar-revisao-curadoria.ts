/**
 * Registra a conclusão de uma revisão manual em `coleta_log`.
 *
 * O padrão é dry-run. `--apply` é a única forma de escrever. Este comando não
 * altera processos, pontos de atenção nem qualquer outro dado de candidato.
 *
 * Exemplo:
 *   npm run data:curadoria:registrar -- \
 *     --slug=fulano --frente=processos --data=2026-08-05 \
 *     --resultado=vazio_confirmado \
 *     --detalhe="órgãos: STF, STJ e TJSP; jurisdição: nacional e SP; período: até 2026-08-05; termos: nome completo + cargo + UF" \
 *     --identidade=cargo-e-uf --identidade-url=https://fonte-oficial.example/perfil \
 *     --url=https://fonte-oficial.example/busca
 */

import { pathToFileURL } from "node:url"

import {
  registrarColetaOuFalhar,
  type EntradaColeta,
  type ResultadoColeta
} from "./lib/coleta-log"
import { supabase } from "./lib/supabase"

export type FrenteCuradoria = "processos" | "contradicoes"
export type ProvaIdentidade = "id-oficial" | "cargo-e-uf" | "nao-confirmada"

export interface RevisaoManual {
  slug: string
  frente: FrenteCuradoria
  data: string
  resultado: ResultadoColeta
  detalhe: string
  urls: string[]
  evidenciasPublicaveis: string[]
  identidade: ProvaIdentidade
  identidadeUrls: string[]
  apply: boolean
}

const RESULTADOS_POR_FRENTE: Readonly<Record<FrenteCuradoria, readonly ResultadoColeta[]>> = {
  processos: ["encontrado", "vazio_confirmado", "indeterminado", "erro"],
  contradicoes: ["encontrado", "sem_achado_no_escopo", "indeterminado"]
}

const FLAGS_REPETIVEIS = new Set(["url", "evidencia-publicavel", "identidade-url"])
const FLAGS_VALOR = new Set([
  "slug",
  "frente",
  "data",
  "resultado",
  "detalhe",
  "identidade",
  ...FLAGS_REPETIVEIS
])

function semAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function lerFlagUnica(argv: string[], nome: string): string {
  const valores = argv
    .filter((arg) => arg.startsWith(`--${nome}=`))
    .map((arg) => arg.slice(nome.length + 3).trim())
  if (valores.length !== 1 || !valores[0]) throw new Error(`--${nome} é obrigatório e único`)
  return valores[0]
}

function lerFlagsRepetiveis(argv: string[], nome: string): string[] {
  const valores = lerFlagsRepetiveisOpcionais(argv, nome)
  if (valores.length === 0) throw new Error(`--${nome} exige ao menos uma fonte não vazia`)
  return valores
}

function lerFlagsRepetiveisOpcionais(argv: string[], nome: string): string[] {
  const valores = argv
    .filter((arg) => arg.startsWith(`--${nome}=`))
    .map((arg) => arg.slice(nome.length + 3).trim())
  if (valores.some((valor) => !valor)) {
    throw new Error(`--${nome} exige ao menos uma fonte não vazia`)
  }
  return [...new Set(valores)]
}

function validarUrl(valor: string, flag: string): void {
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error(`--${flag} contém URL inválida`)
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`--${flag} aceita apenas http/https`)
  }
  if (/\bcpf\b/i.test(valor)) throw new Error(`--${flag} não pode expor CPF`)
}

function validarData(valor: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error("--data deve usar AAAA-MM-DD")
  const data = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error("--data não é uma data real")
  }
  const hoje = new Date().toISOString().slice(0, 10)
  if (valor > hoje) throw new Error("--data não pode estar no futuro")
}

function camposDoDetalhe(detalhe: string): Map<string, string> {
  return new Map(
    detalhe.split(";").map((parte) => {
      const [chave, ...resto] = parte.split(":")
      return [semAcentos(chave.trim()), resto.join(":").trim()]
    })
  )
}

function validarEscopoProcessos(detalhe: string): void {
  const campos = camposDoDetalhe(detalhe)
  const obrigatorios = ["orgaos", "jurisdicao", "periodo", "termos"]
  const faltando = obrigatorios.filter((campo) => !campos.get(campo))
  if (faltando.length > 0) {
    throw new Error(
      `vazio_confirmado em processos exige escopo real no detalhe: ${obrigatorios.join(", ")}`
    )
  }
}

export function validarRevisaoManual(argv: string[]): RevisaoManual {
  const desconhecidas = argv.filter((arg) => {
    if (arg === "--apply" || arg === "--dry-run") return false
    const match = arg.match(/^--([^=]+)=/)
    return !match || !FLAGS_VALOR.has(match[1])
  })
  if (desconhecidas.length > 0) throw new Error(`flag desconhecida: ${desconhecidas[0]}`)
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }

  const slug = lerFlagUnica(argv, "slug")
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("--slug inválido")

  const frente = lerFlagUnica(argv, "frente") as FrenteCuradoria
  if (!(frente in RESULTADOS_POR_FRENTE)) throw new Error("--frente inválida")

  const data = lerFlagUnica(argv, "data")
  validarData(data)

  const resultado = lerFlagUnica(argv, "resultado") as ResultadoColeta
  if (!RESULTADOS_POR_FRENTE[frente].includes(resultado)) {
    if (frente === "contradicoes" && resultado === "vazio_confirmado") {
      throw new Error(
        "contradição não aceita ausência comprovada; use sem_achado_no_escopo"
      )
    }
    throw new Error(`--resultado inválido para ${frente}`)
  }

  const detalhe = lerFlagUnica(argv, "detalhe")
  if (/\bcpf\b/i.test(detalhe)) throw new Error("--detalhe não pode conter CPF")
  if (resultado === "vazio_confirmado" && frente === "processos") {
    validarEscopoProcessos(detalhe)
  }

  const identidade = lerFlagUnica(argv, "identidade") as ProvaIdentidade
  if (!new Set<ProvaIdentidade>(["id-oficial", "cargo-e-uf", "nao-confirmada"]).has(identidade)) {
    throw new Error("nome sozinho não prova identidade; use id-oficial, cargo-e-uf ou nao-confirmada")
  }
  if (identidade === "nao-confirmada" && resultado !== "indeterminado") {
    throw new Error("--identidade=nao-confirmada só é permitida para --resultado=indeterminado")
  }

  const urls = identidade === "nao-confirmada"
    ? lerFlagsRepetiveisOpcionais(argv, "url")
    : lerFlagsRepetiveis(argv, "url")
  urls.forEach((url) => validarUrl(url, "url"))

  const identidadeUrls = identidade === "nao-confirmada"
    ? lerFlagsRepetiveisOpcionais(argv, "identidade-url")
    : lerFlagsRepetiveis(argv, "identidade-url")
  if (identidade === "nao-confirmada") {
    const campos = camposDoDetalhe(detalhe)
    const motivo = campos.get("motivo") ?? ""
    if (motivo.length < 12) {
      throw new Error("identidade nao-confirmada exige motivo concreto no detalhe")
    }
    if (identidadeUrls.length === 0) {
      const fontes = campos.get("fontes consultadas") ?? ""
      const anos = campos.get("anos consultados") ?? ""
      if (!fontes || !/\b(?:19|20)\d{2}\b/.test(anos)) {
        throw new Error("identidade nao-confirmada sem URL de identidade exige fontes consultadas e anos consultados no detalhe")
      }
    }
  }
  identidadeUrls.forEach((url) => validarUrl(url, "identidade-url"))
  if (identidadeUrls.some((url) => !urls.includes(url))) {
    throw new Error("toda --identidade-url também precisa constar em --url")
  }

  const evidenciasPublicaveis = resultado === "encontrado"
    ? lerFlagsRepetiveis(argv, "evidencia-publicavel")
    : argv
        .filter((arg) => arg.startsWith("--evidencia-publicavel="))
        .map((arg) => arg.slice("--evidencia-publicavel=".length).trim())
        .filter(Boolean)
  evidenciasPublicaveis.forEach((url) => validarUrl(url, "evidencia-publicavel"))
  if (evidenciasPublicaveis.some((url) => !urls.includes(url))) {
    throw new Error("toda evidência publicável também precisa constar em --url")
  }

  return {
    slug,
    frente,
    data,
    resultado,
    detalhe,
    urls,
    evidenciasPublicaveis,
    identidade,
    identidadeUrls,
    apply: argv.includes("--apply")
  }
}

export function entradaDaRevisao(revisao: RevisaoManual): EntradaColeta {
  const fonte = revisao.frente === "processos"
    ? "processos-curadoria"
    : "contradicoes-curadoria"
  const detalhe = [
    `revisao_em=${revisao.data}`,
    `identidade=${revisao.identidade}`,
    `identidade_urls=${revisao.identidadeUrls.join(",")}`,
    `urls_consultadas=${revisao.urls.join(",")}`,
    `detalhe=${revisao.detalhe}`
  ].join("; ")
  return {
    fonte,
    alvo: revisao.slug,
    resultado: revisao.resultado,
    volume: revisao.resultado === "encontrado" ? 1 : 0,
    detalhe,
    url: revisao.urls[0]
  }
}

async function exigirSlugPublico(slug: string): Promise<void> {
  const { data, error } = await supabase
    .from("candidatos_publico")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error(`não foi possível validar o slug: ${error.message}`)
  if (!data) throw new Error(`slug não encontrado em candidatos_publico: ${slug}`)
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const revisao = validarRevisaoManual(argv)
  await exigirSlugPublico(revisao.slug)
  const entrada = entradaDaRevisao(revisao)

  if (!revisao.apply) {
    console.log(
      JSON.stringify(
        {
          modo: "dry-run",
          slug: entrada.alvo,
          frente: revisao.frente,
          fonte: entrada.fonte,
          data: revisao.data,
          resultado: entrada.resultado,
          urls_consultadas: revisao.urls.length,
          evidencias_publicaveis: revisao.evidenciasPublicaveis.length
        },
        null,
        2
      )
    )
    return
  }

  await registrarColetaOuFalhar(entrada)
  console.log(
    JSON.stringify({ modo: "apply", slug: entrada.alvo, fonte: entrada.fonte, resultado: entrada.resultado })
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
