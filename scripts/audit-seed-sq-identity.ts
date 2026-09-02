/**
 * Audita se cada `ids.tse_sq_candidato[ano]` do seed pertence de fato ao
 * candidato que o declara, comparando com o pacote oficial consulta_cand do
 * TSE.
 *
 * POR QUE ISTO EXISTE
 *
 * O SQ_CANDIDATO e o degrau de MAIOR prioridade do `tse-resolver`, acima do
 * CPF e do nome. Um SQ errado nao degrada para o degrau seguinte: ele ancora
 * a pessoa errada com confianca maxima, e a ingestao grava os dados dela.
 *
 * O `validate-seed` ja detecta SQ duplicado entre dois slugs
 * (`detectDuplicateSqCandidato`), mas nada verificava se o SQ e da pessoa
 * certa. Em 26/07/2026 essa lacuna produziu dois casos:
 *
 *   jeronimo, 2022 -> SQ de um deputado estadual do MDB no Maranhao, cujo CPF
 *                     acabou gravado no cadastro do governador da Bahia.
 *   jeronimo, 2020 -> SQ de um vereador do MDB em Santo Amaro/BA.
 *
 * Os dois foram achados a mao. Este script existe para que o proximo seja
 * achado por maquina.
 *
 * USO
 *
 *   npx tsx scripts/audit-seed-sq-identity.ts              # todos os anos do seed
 *   npx tsx scripts/audit-seed-sq-identity.ts 2022 2020    # anos especificos
 *   npx tsx scripts/audit-seed-sq-identity.ts --gate       # sai 1 se houver divergencia
 *
 * Baixa cada pacote anual uma vez e reaproveita o cache em .tse-audit-cache/.
 * Os pacotes sao grandes (dezenas de MB), entao rodar todos os 14 anos leva
 * alguns minutos na primeira vez.
 */
import { execFileSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { createInterface } from "node:readline"
import { createReadStream } from "node:fs"
import { resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { stripAccents } from "../src/lib/strip-accents"

const CACHE_DIR = resolve(process.cwd(), ".tse-audit-cache")
const SEED_PATH = resolve(process.cwd(), "data/candidatos.json")

interface SeedEntry {
  slug: string
  nome_completo: string
  nome_urna?: string
  estado?: string | null
  ids?: { tse_sq_candidato?: Record<string, string> }
}

export interface RegistroTSE {
  nome: string
  urna: string
  cargo: string
  partido: string
  ue: string
  uf: string
  /**
   * DT_NASCIMENTO, no formato cru do TSE (dd/mm/aaaa).
   *
   * Existe por causa do achado de 30/07/2026: a comparacao por NOME tem um
   * ponto cego em homonimo, e ela sozinha aprovou 30 SQ de outra pessoa. O
   * caso fundador foi `alvaro-dias-rn` (Alvaro Costa Dias, ex-prefeito de
   * Natal) casando com ALVARO FERNANDES DIAS, senador do PR: os dois nomes
   * compartilham "Alvaro" e "Dias", entao `avaliarIdentidade` devolvia forte.
   *
   * Data de nascimento fecha esse buraco sem falso positivo, porque uma pessoa
   * tem UMA data. Ver `inconsistenciasDeNascimento`.
   */
  nascimento: string
}

/** Remove acentos e caixa, porque o TSE grava tudo em maiuscula sem padrao de acento. */
function normalizar(valor: string | null | undefined): string {
  return stripAccents((valor ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

const PARTICULAS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"])

function tokens(valor: string): string[] {
  return normalizar(valor)
    .split(" ")
    .filter((t) => t.length > 1 && !PARTICULAS.has(t))
}

/**
 * Compara um par de nomes. Devolve o quanto eles se sustentam como a mesma
 * pessoa, em tres niveis, porque a comparacao aqui e genuinamente ambigua:
 * o seed as vezes guarda o nome de urna ("Soldado Sampaio") e o TSE guarda o
 * nome civil ("Francisco dos Santos Sampaio"), e nomes de casada mudam o
 * sobrenome entre uma eleicao e outra.
 *
 * Tratar tudo isso como erro geraria uma lista de falsos positivos, que e
 * pior que nao ter lista nenhuma: ensina a ignorar o alerta.
 */
export function compararNomes(a: string, b: string): "forte" | "parcial" | "nenhum" {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (!na || !nb) return "nenhum"
  if (na === nb) return "forte"

  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return "nenhum"

  // Conter o outro so vale quando o nome contido tem ao menos dois termos.
  //
  // Sem essa condicao, o seed do `jeronimo` (nome de urna "Jeronimo", um termo
  // so) casava como "forte" com "JERONIMO CAVALCANTE", que e outra pessoa, por
  // simples substring. Foi assim que a primeira versao deste auditor deu zero
  // divergencia em 2022 justamente no caso que motivou escreve-lo.
  const menorTokens = ta.length <= tb.length ? ta : tb
  if (menorTokens.length >= 2 && (na.includes(nb) || nb.includes(na))) return "forte"

  const comuns = ta.filter((t) => tb.includes(t))
  if (!comuns.length) return "nenhum"

  // Primeiro nome igual mais qualquer sobrenome em comum e evidencia forte.
  if (ta[0] === tb[0] && comuns.length >= 2) return "forte"
  // Um sobrenome raro em comum, sem o primeiro nome, nao decide nada sozinho.
  return "parcial"
}

/**
 * Confronta todos os nomes que o seed conhece (civil e urna) com todos os que
 * o TSE traz. O melhor resultado do conjunto e o veredito.
 */
export function avaliarIdentidade(
  nomesSeed: readonly string[],
  registro: RegistroTSE
): "forte" | "parcial" | "nenhum" {
  const nomesTse = [registro.nome, registro.urna].filter(Boolean)
  let melhor: "forte" | "parcial" | "nenhum" = "nenhum"
  for (const ns of nomesSeed) {
    for (const nt of nomesTse) {
      const r = compararNomes(ns, nt)
      if (r === "forte") return "forte"
      if (r === "parcial") melhor = "parcial"
    }
  }
  return melhor
}

async function baixarPacote(ano: string): Promise<string | null> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const dirAno = resolve(CACHE_DIR, ano)
  if (existsSync(dirAno) && readdirSync(dirAno).some((f) => f.endsWith(".csv"))) return dirAno

  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
  const zipPath = resolve(CACHE_DIR, `consulta_cand_${ano}.zip`)

  process.stderr.write(`  baixando ${ano}...\n`)
  const resposta = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!resposta.ok || !resposta.body) {
    process.stderr.write(`  ${ano}: HTTP ${resposta.status}, pulando\n`)
    return null
  }
  await pipeline(Readable.fromWeb(resposta.body as never), createWriteStream(zipPath))

  mkdirSync(dirAno, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zipPath, `consulta_cand_${ano}_*.csv`, "-d", dirAno], { stdio: "pipe" })
  rmSync(zipPath, { force: true })
  return dirAno
}

/**
 * Le os CSVs do ano e devolve SQ -> TODOS os registros com aquele SQ.
 *
 * Guardar apenas o primeiro estava errado e gerava 40 falsos positivos: ate
 * 2008, SQ_CANDIDATO nao e chave global, e sim sequencial POR UF (valores
 * curtos como "10354"). Ficando com o primeiro arquivo em ordem alfabetica,
 * candidatos do pais inteiro casavam com alguem do Acre.
 */
async function indexarAno(dirAno: string): Promise<Map<string, RegistroTSE[]>> {
  const indice = new Map<string, RegistroTSE[]>()

  for (const arquivo of readdirSync(dirAno).filter((f) => f.endsWith(".csv"))) {
    // O arquivo _BRASIL repete o conteudo dos estaduais nos anos em que existe.
    if (arquivo.includes("_BRASIL")) continue

    const rl = createInterface({
      input: createReadStream(resolve(dirAno, arquivo), { encoding: "latin1" }),
      crlfDelay: Infinity,
    })

    let colunas: string[] | null = null
    for await (const linha of rl) {
      const campos = linha.split(";").map((c) => c.replace(/^"|"$/g, ""))
      if (!colunas) {
        colunas = campos
        continue
      }
      const pos = (nome: string) => {
        const i = colunas!.indexOf(nome)
        return i >= 0 ? campos[i] : ""
      }
      const sq = pos("SQ_CANDIDATO")
      if (!sq) continue
      const registro: RegistroTSE = {
        nome: pos("NM_CANDIDATO"),
        urna: pos("NM_URNA_CANDIDATO"),
        cargo: pos("DS_CARGO"),
        partido: pos("SG_PARTIDO"),
        ue: pos("NM_UE"),
        uf: pos("SG_UF"),
        nascimento: pos("DT_NASCIMENTO"),
      }
      const lista = indice.get(sq) ?? []
      // 1o e 2o turno repetem a mesma pessoa; guardar uma vez so.
      if (!lista.some((r) => r.nome === registro.nome && r.uf === registro.uf)) {
        lista.push(registro)
      }
      indice.set(sq, lista)
    }
  }

  return indice
}

interface Divergencia {
  slug: string
  ano: string
  sq: string
  nomeSeed: string
  ufSeed: string | null
  achado: RegistroTSE | null
  nivel: "parcial" | "nenhum" | "ausente"
}

export interface ObservacaoNascimento {
  ano: string
  sq: string
  nascimento: string
  nome: string
  uf: string
}

export interface InconsistenciaNascimento {
  slug: string
  /** A data de maior frequencia entre os anos; e a ancora presumida. */
  ancora: string
  /** Observacoes cuja data diverge da ancora, ou seja os SQ suspeitos. */
  divergentes: ObservacaoNascimento[]
}

/**
 * Cruza as datas de nascimento que os SQ de um mesmo slug devolvem.
 *
 * Uma pessoa tem UMA data de nascimento. Se os SQ atribuidos a um slug
 * discordam, pelo menos um deles e de outra pessoa. Isso nao tem falso
 * positivo por homonimo, que e justamente o buraco da comparacao por nome.
 *
 * O que ele NAO decide: qual dos lados esta certo. A ancora e so a data mais
 * frequente, e um slug com 1 SQ certo e 3 errados apontaria para o lado
 * errado. Por isso a saida e "confira estes", nao "corrija assim".
 *
 * Divergencia de 1 digito com nome identico em todos os anos costuma ser erro
 * de digitacao do proprio TSE, e nao pessoa errada. O gate reporta mesmo
 * assim, porque distinguir isso exige leitura humana, mas o texto avisa.
 */
export function inconsistenciasDeNascimento(
  porSlug: Map<string, ObservacaoNascimento[]>,
  /**
   * Pares "slug:ano" ja revisados e confirmados como erro de digitacao do TSE,
   * vindos de `data/sq-exceptions.json` com reason `tse-birthdate-typo`.
   *
   * Exceção so entra com evidencia de DOCUMENTO (CPF e titulo eleitoral
   * batendo entre os anos), nunca por nome parecido: nome foi exatamente o que
   * deixou 30 SQ de outra pessoa passarem.
   */
  isentos: ReadonlySet<string> = new Set()
): InconsistenciaNascimento[] {
  const saida: InconsistenciaNascimento[] = []

  for (const [slug, observacoes] of porSlug) {
    const validas = observacoes.filter(
      (o) =>
        o.nascimento &&
        o.nascimento !== "#NULO#" &&
        o.nascimento !== "#NE#" &&
        !isentos.has(`${slug}:${o.ano}`)
    )
    if (validas.length < 2) continue

    const frequencia = new Map<string, number>()
    for (const o of validas) frequencia.set(o.nascimento, (frequencia.get(o.nascimento) ?? 0) + 1)
    if (frequencia.size < 2) continue

    let ancora = ""
    let melhor = -1
    for (const [data, n] of frequencia) {
      if (n > melhor) {
        melhor = n
        ancora = data
      }
    }

    saida.push({
      slug,
      ancora,
      divergentes: validas.filter((o) => o.nascimento !== ancora),
    })
  }

  return saida.sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function main() {
  const args = process.argv.slice(2)
  const modoGate = args.includes("--gate")
  const anosPedidos = args.filter((a) => /^\d{4}$/.test(a))

  const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8")) as SeedEntry[]

  const porAno = new Map<
    string,
    Array<{ slug: string; nomes: string[]; nome: string; uf: string | null; sq: string }>
  >()
  for (const entrada of seed) {
    const sqs = entrada.ids?.tse_sq_candidato ?? {}
    const nomes = [entrada.nome_completo, entrada.nome_urna].filter(Boolean) as string[]
    for (const [ano, sq] of Object.entries(sqs)) {
      if (!sq) continue
      const lista = porAno.get(ano) ?? []
      lista.push({
        slug: entrada.slug,
        nomes,
        nome: entrada.nome_completo,
        uf: entrada.estado ?? null,
        sq,
      })
      porAno.set(ano, lista)
    }
  }

  const anos = (anosPedidos.length ? anosPedidos : [...porAno.keys()]).sort()
  const divergencias: Divergencia[] = []
  const nascimentosPorSlug = new Map<string, ObservacaoNascimento[]>()
  let conferidos = 0
  let semPacote = 0

  for (const ano of anos) {
    const pares = porAno.get(ano) ?? []
    if (!pares.length) continue

    const dirAno = await baixarPacote(ano)
    if (!dirAno) {
      semPacote += pares.length
      continue
    }

    const indice = await indexarAno(dirAno)
    for (const par of pares) {
      conferidos += 1
      const candidatos = indice.get(par.sq) ?? []

      // Coleta a data de nascimento deste (slug, ano) para o cruzamento entre
      // anos. Ate 2008 o SQ e sequencial POR UF e `candidatos` traz varias
      // pessoas: so alimenta o cruzamento quando da pra saber de quem e a
      // data, ou seja quando ha um registro so, ou quando a UF do seed
      // desempata. Ambiguidade fica de fora em vez de virar acusacao errada.
      {
        const daUf = par.uf
          ? candidatos.filter((r) => r.uf && normalizar(r.uf) === normalizar(par.uf as string))
          : []
        const escolhido =
          daUf.length === 1 ? daUf[0] : candidatos.length === 1 ? candidatos[0] : null
        if (escolhido?.nascimento) {
          const lista = nascimentosPorSlug.get(par.slug) ?? []
          lista.push({
            ano,
            sq: par.sq,
            nascimento: escolhido.nascimento,
            nome: escolhido.nome,
            uf: escolhido.uf,
          })
          nascimentosPorSlug.set(par.slug, lista)
        }
      }

      if (!candidatos.length) {
        divergencias.push({
          slug: par.slug, ano, sq: par.sq, nomeSeed: par.nome,
          ufSeed: par.uf, achado: null, nivel: "ausente",
        })
        continue
      }

      // Ate 2008 o mesmo SQ aparece em varias UFs, entao basta UM registro
      // sustentar a identidade para o par estar certo. So e divergencia quando
      // nenhum deles casa.
      let melhorRegistro: RegistroTSE | null = null
      let melhorAvaliacao: "parcial" | "nenhum" = "nenhum"
      let temForte = false

      for (const registro of candidatos) {
        const avaliacao = avaliarIdentidade(par.nomes, registro)
        if (avaliacao === "forte") {
          temForte = true
          break
        }
        const mesmaUf =
          Boolean(par.uf) && Boolean(registro.uf) && normalizar(par.uf) === normalizar(registro.uf)
        // Para o relatorio, prefere o registro da UF do candidato: e o que a
        // ingestao provavelmente usaria e o mais util de ler.
        const melhorQueAtual =
          !melhorRegistro || avaliacao === "parcial" || (mesmaUf && melhorAvaliacao === "nenhum")
        if (melhorQueAtual) {
          melhorRegistro = registro
          melhorAvaliacao = avaliacao
        }
      }

      if (temForte || !melhorRegistro) continue

      // A UF desempata a ambiguidade de nome. Compartilhar o primeiro nome com
      // alguem que disputou em outro estado nao e coincidencia aceitavel: foi
      // exatamente o caso do `jeronimo` (Bahia) casando com um deputado do
      // Maranhao. Sem este desempate, o caso que motivou o auditor cairia na
      // lista de ambiguos em vez de reprovar.
      const ufDiverge =
        Boolean(par.uf) &&
        Boolean(melhorRegistro.uf) &&
        normalizar(par.uf) !== normalizar(melhorRegistro.uf)

      const nivel = melhorAvaliacao === "parcial" && !ufDiverge ? "parcial" : "nenhum"

      divergencias.push({
        slug: par.slug, ano, sq: par.sq, nomeSeed: par.nome,
        ufSeed: par.uf, achado: melhorRegistro, nivel,
      })
    }
    process.stderr.write(`  ${ano}: ${pares.length} conferidos\n`)
  }

  const graves = divergencias.filter((d) => d.nivel !== "parcial")
  const ambiguas = divergencias.filter((d) => d.nivel === "parcial")

  console.log("")
  console.log("=".repeat(72))
  console.log("AUDITORIA DE IDENTIDADE DOS SQ_CANDIDATO DO SEED")
  console.log("=".repeat(72))
  console.log(`Pares conferidos      : ${conferidos}`)
  console.log(`Sem pacote disponivel : ${semPacote}`)
  console.log(`Provavel pessoa errada: ${graves.length}`)
  console.log(`Ambiguo, checar a mao : ${ambiguas.length}`)

  const imprimir = (d: Divergencia) => {
    console.log(`\n  ${d.slug} (${d.ano}), SQ ${d.sq}`)
    console.log(`    seed diz : ${d.nomeSeed}${d.ufSeed ? ` [${d.ufSeed}]` : ""}`)
    if (!d.achado) {
      console.log(`    no TSE   : SQ nao existe no pacote deste ano`)
      return
    }
    console.log(`    no TSE   : ${d.achado.nome}${d.achado.urna ? ` (urna: ${d.achado.urna})` : ""}`)
    console.log(`               ${d.achado.cargo} | ${d.achado.partido} | ${d.achado.ue}/${d.achado.uf}`)
    if (d.ufSeed && d.achado.uf && normalizar(d.ufSeed) !== normalizar(d.achado.uf)) {
      console.log(`               UF diverge do seed (${d.ufSeed} vs ${d.achado.uf})`)
    }
  }

  if (graves.length) {
    console.log("\n" + "-".repeat(72))
    console.log("PROVAVEL PESSOA ERRADA (nenhum nome em comum, ou SQ inexistente)")
    console.log("-".repeat(72))
    graves.forEach(imprimir)
    console.log("")
    console.log("Cada linha acima ancora a pessoa errada com prioridade MAXIMA na")
    console.log("ingestao, acima do CPF e do nome. Confira no TSE antes de corrigir.")
  }

  if (ambiguas.length) {
    console.log("\n" + "-".repeat(72))
    console.log("AMBIGUO (algum sobrenome em comum; pode ser nome de casada,")
    console.log("nome de urna ou grafia diferente, e pode ser pessoa errada)")
    console.log("-".repeat(72))
    ambiguas.forEach(imprimir)
  }

  // Cruzamento de data de nascimento entre anos. Roda sobre TODOS os pares,
  // inclusive os que a comparacao por nome aprovou, que e exatamente onde o
  // homonimo se esconde.
  const isentosNascimento = new Set<string>()
  try {
    const excecoes = JSON.parse(
      readFileSync(resolve(process.cwd(), "data/sq-exceptions.json"), "utf-8")
    ) as { entries?: Array<{ slug: string; ano: number; reason: string }> }
    for (const e of excecoes.entries ?? []) {
      if (e.reason === "tse-birthdate-typo") isentosNascimento.add(`${e.slug}:${e.ano}`)
    }
  } catch {
    // Sem arquivo de excecao o gate fica mais rigoroso, nunca mais frouxo.
  }

  const nascimentoInconsistente = inconsistenciasDeNascimento(
    nascimentosPorSlug,
    isentosNascimento
  )
  console.log(`Nascimento divergente : ${nascimentoInconsistente.length}`)

  if (nascimentoInconsistente.length) {
    console.log("\n" + "-".repeat(72))
    console.log("DATA DE NASCIMENTO DIVERGENTE ENTRE OS ANOS DO MESMO SLUG")
    console.log("-".repeat(72))
    console.log("Uma pessoa tem UMA data de nascimento. Se os SQ de um slug discordam,")
    console.log("pelo menos um deles e de outra pessoa. Divergencia de 1 digito com nome")
    console.log("identico em todos os anos costuma ser erro de digitacao do TSE.")
    for (const item of nascimentoInconsistente) {
      console.log(`\n  ${item.slug} (ancora ${item.ancora})`)
      for (const d of item.divergentes) {
        console.log(`    ${d.ano} SQ ${d.sq} nasc ${d.nascimento} [${d.uf}] ${d.nome}`)
      }
    }
  }

  if (!divergencias.length && !nascimentoInconsistente.length) {
    console.log("\nNenhuma divergencia nos anos conferidos.")
  }

  // O gate so reprova o que tem evidencia de pessoa errada. Ambiguidade vira
  // trabalho de revisao, nao build vermelho: um gate que grita por engano
  // ensina a ignorar o gate.
  //
  // Nascimento divergente entra como reprovacao porque nao e ambiguidade: e
  // contradicao factual entre dois registros oficiais atribuidos a mesma
  // pessoa. Foi o unico sinal que pegou os 30 SQ errados de 30/07/2026, que a
  // comparacao por nome tinha aprovado com 0 divergencia.
  if (modoGate && (graves.length || nascimentoInconsistente.length)) process.exit(1)
}

// Precisa ser exato: o arquivo de teste tambem contem "audit-seed-sq-identity"
// no nome, e um includes() faria a suite rodar a auditoria inteira.
const executadoDireto = /audit-seed-sq-identity\.ts$/.test(process.argv[1] ?? "")
if (executadoDireto) {
  main().catch((erro) => {
    console.error("audit-seed-sq-identity falhou:", erro)
    process.exit(1)
  })
}
