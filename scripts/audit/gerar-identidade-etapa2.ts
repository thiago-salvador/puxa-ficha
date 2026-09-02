/**
 * Gerador do registro versionado de identidade da etapa 2.
 *
 * Casca de IO em volta do nucleo puro `scripts/lib/identidade-etapa2-classificador.ts`.
 * Le os tres ZIPs do TSE, o universo congelado, o snapshot do banco e o ledger
 * da B2, e escreve `data/identidade-etapa2-2026.json`.
 *
 * **Nao roda em CI, e nao deve.** Depende de 3,3 MB de ZIPs e 2,98 MB de ledger,
 * todos gitignorados, e do binario `unzip`. O que roda em CI e a VERIFICACAO dos
 * hashes a partir das 71 entradas versionadas, em
 * `tests/etapa2-identidade-protecao.test.ts`.
 *
 * Fail-closed em duas frentes, ambas herdadas do pipeline original:
 * o sha256 de cada ZIP tem de bater com `catalog.json`, e a derivacao do
 * universo tem de fechar o numero esperado de `no_safe_match`.
 *
 * Uso:
 *   npm run data:identidade-etapa2:gerar
 *   npm run data:identidade-etapa2:gerar -- --execucao=<dir> --saida=<arquivo>
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import {
  CARGOS_ALVO,
  classificarIdentidade,
  derivarUniversoNoSafeMatch,
  type LinhaLedgerB2,
  type LinhaTse,
  type PerfilDaFicha,
  type ResultadoClassificacao,
} from "../lib/identidade-etapa2-classificador"

const ESPERADO_NO_SAFE_MATCH = 71

/**
 * Quantos dias uma classificacao vale a partir da execucao que a produziu.
 *
 * Uma classificacao so e tao boa quanto o snapshot do TSE contra o qual rodou, e
 * o TSE publica atualizacao continuamente: registro entra, e julgado, e alterado.
 *
 * O valor original de 09/08/2026 era 7 dias (decidido em 09/08, revalidar ate
 * 16/08), escolhido para cobrir o fechamento da janela de pedidos de registro em
 * 15/08, quando a lista mudava todo dia. As duas datas passaram a ser CALCULADAS
 * na execucao, em vez de escritas fixas: uma renovacao rodada depois de 16/08
 * nascia vencida no mesmo instante em que era gerada.
 *
 * Em 02/09/2026 a validade subiu para 30 dias. Com a janela fechada, o que muda
 * no TSE e julgamento e substituicao, ritmo de semanas; e sete dias faziam a
 * porta de materializacao reprovar o CI toda semana. Trinta dias a partir da
 * renovacao de 02/09 vencem em 02/10, dois dias antes do primeiro turno, o que
 * obriga uma renovacao com a lista final de candidatos exatamente quando ela
 * importa. As renovacoes seguintes acompanham o calendario eleitoral.
 */
const VALIDADE_EM_DIAS = 30

function apenasData(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function argumento(nome: string, padrao: string): string {
  const prefixo = `--${nome}=`
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length) ?? padrao
}

const execucao = resolve(argumento("execucao", "output/pf-reverificacao-20260809"))
const ledgerPath = resolve(
  argumento("ledger", "output/pf-completeness-20260807T022551Z/research-b2/proposals.jsonl"),
)
const saida = resolve(argumento("saida", "data/identidade-etapa2-2026.json"))
const nascimentosPath = resolve(
  argumento("nascimentos", "data/identidade-etapa2-nascimentos.json"),
)

/**
 * Le a chave independente por slug. Fail-closed em tudo que nao seja ISO valida
 * ou `null` explicito: slug fora do universo lanca (entrada obsoleta ou typo
 * viraria promocao silenciosa em outro pleito), e formato invalido lanca em vez
 * de virar "sem chave", que esconderia o erro de digitacao numa nao-promocao.
 */
function lerNascimentos(caminho: string, universo: ReadonlySet<string>): Map<string, string | null> {
  const bruto = JSON.parse(readFileSync(caminho, "utf8")) as {
    nascimentos?: Record<string, { data_nascimento?: unknown; proveniencia?: unknown }>
  }
  const mapa = new Map<string, string | null>()
  for (const [slug, valor] of Object.entries(bruto.nascimentos ?? {})) {
    if (!universo.has(slug)) {
      throw new Error(
        `${caminho}: slug ${slug} nao pertence ao universo dos ${universo.size} da etapa 2`,
      )
    }
    const data = valor?.data_nascimento
    if (data === null) {
      mapa.set(slug, null)
      continue
    }
    if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new Error(`${caminho}: ${slug} com data_nascimento invalida (esperado YYYY-MM-DD ou null)`)
    }
    const [a, m, d] = data.split("-").map(Number)
    const dt = new Date(Date.UTC(a, m - 1, d))
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      throw new Error(`${caminho}: ${slug} com data que o calendario nao tem: ${data}`)
    }
    if (!Array.isArray(valor?.proveniencia) || valor.proveniencia.length === 0) {
      throw new Error(
        `${caminho}: ${slug} sem proveniencia. A chave so e independente se a origem da data for ` +
          `rastreavel e anterior ao pleito conferido.`,
      )
    }
    mapa.set(slug, data)
  }
  return mapa
}

/**
 * Guarda de execucao. Este script SOBRESCREVE `data/identidade-etapa2-2026.json`,
 * que e arquivo versionado, e e entry do knip (`scripts/audit/*.ts`). Sem a
 * guarda, qualquer import acidental reescreveria dado rastreado.
 */
function main(): void {
  const sha256Arquivo = (caminho: string) =>
    createHash("sha256").update(readFileSync(caminho)).digest("hex")
  const sha256Texto = (texto: string) => createHash("sha256").update(texto).digest("hex")

  // ---- integridade das fontes, antes de qualquer parse ----
  const ZIPS = [
    {
      arquivo: join(execucao, "sources/consulta_cand_2026.zip"),
      url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
      entrada: "consulta_cand_2026_BRASIL.csv",
    },
    {
      arquivo: join(execucao, "sources/consulta_cand_complementar_2026.zip"),
      url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
      entrada: "consulta_cand_complementar_2026_BRASIL.csv",
    },
    {
      arquivo: join(execucao, "sources/rede_social_candidato_2026.zip"),
      url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip",
      entrada: "rede_social_candidato_2026_BRASIL.csv",
    },
  ]

  const catalogPath = join(execucao, "sources/catalog.json")
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
    fetched_at?: string
    resources: { url: string; sha256: string; name?: string; http_last_modified?: string | null }[]
  }
  const catalogoPorUrl = new Map(catalog.resources.map((r) => [r.url, r]))
  for (const zip of ZIPS) {
    const registro = catalogoPorUrl.get(zip.url)
    if (!registro) throw new Error(`catalog.json sem entrada para ${zip.url}`)
    const medido = sha256Arquivo(zip.arquivo)
    if (medido !== registro.sha256) {
      throw new Error(
        `hash divergente para ${zip.arquivo}: esperado ${registro.sha256}, medido ${medido}`,
      )
    }
  }

  // ---- leitura dos CSVs ----
  function parseLinhaCsv(linha: string): string[] {
    const valores: string[] = []
    let valor = ""
    let entreAspas = false
    for (let i = 0; i < linha.length; i += 1) {
      const ch = linha[i]
      if (ch === '"') {
        if (entreAspas && linha[i + 1] === '"') {
          valor += '"'
          i += 1
        } else entreAspas = !entreAspas
      } else if (ch === ";" && !entreAspas) {
        valores.push(valor)
        valor = ""
      } else valor += ch
    }
    valores.push(valor)
    return valores
  }

  function lerCsvDoZip(zip: string, entrada: string): Record<string, string>[] {
    const buffer = execFileSync("unzip", ["-p", zip, entrada], { maxBuffer: 64 * 1024 * 1024 })
    const bruto = new TextDecoder("latin1").decode(buffer)
    const linhas = bruto.split(/\r?\n/).filter(Boolean)
    const cabecalho = parseLinhaCsv(linhas.shift() as string)
    return linhas.map((linha) => {
      const v = parseLinhaCsv(linha)
      return Object.fromEntries(cabecalho.map((k, i) => [k, v[i] ?? ""]))
    })
  }

  /**
   * Dois modos, e a diferenca importa para quem vai renovar num checkout limpo.
   *
   * `--reclassificar` (default): reaproveita os PERFIS e o conjunto de slugs ja
   * congelados em `data/identidade-etapa2-2026.json` e roda a cascata contra um
   * snapshot NOVO do TSE. Precisa apenas dos tres ZIPs e do `catalog.json`, que
   * `npm run data:identidade-etapa2:fontes` reconstroi. E este o caminho que a
   * renovacao de `revalidar_ate` exige, e ele funciona em maquina limpa.
   *
   * `--do-zero`: rederiva o universo a partir de `pendentes-agosto.json`,
   * `db-snapshot-83.json` e do ledger da B2, os tres gitignorados. So roda em
   * maquina que tenha os artefatos da execucao original.
   *
   * Reaproveitar os perfis nao e circular: eles sao a ENTRADA da classificacao
   * (nome civil, nome de urna, cargo, UF, lidos do banco em 09/08), e o registro
   * os congela verbatim. O que muda entre uma renovacao e outra e o snapshot do
   * TSE, que e a outra entrada.
   */
  const doZero = process.argv.includes("--do-zero")

  let slugs: string[]
  let porSlug: Map<string, PerfilDaFicha>
  let herdado: Record<string, unknown> = {}

  if (doZero) {
    const universoPath = join(execucao, "pendentes-agosto.json")
    const universo = (JSON.parse(readFileSync(universoPath, "utf8")) as string[]).filter(
      (s) => s !== "candidatos",
    )

    const ledger: LinhaLedgerB2[] = readFileSync(ledgerPath, "utf8")
      .split("\n")
      .filter((linha) => linha.trim())
      .map((linha) => JSON.parse(linha) as LinhaLedgerB2)

    slugs = derivarUniversoNoSafeMatch(universo, ledger, ESPERADO_NO_SAFE_MATCH)

    const snapshotPath = join(execucao, "db-snapshot-83.json")
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as PerfilDaFicha[]
    porSlug = new Map(snapshot.map((p) => [p.slug, p]))
    herdado = {
      universo_83_sha256: sha256Arquivo(universoPath),
      db_snapshot_83_sha256: sha256Arquivo(snapshotPath),
      ledger_b2_sha256: sha256Arquivo(ledgerPath),
    }
  } else {
    const anterior = JSON.parse(readFileSync(saida, "utf8")) as {
      entradas: PerfilDaFicha[]
      fonte: Record<string, unknown>
    }
    if (!Array.isArray(anterior.entradas) || anterior.entradas.length !== ESPERADO_NO_SAFE_MATCH) {
      throw new Error(
        `registro anterior com ${anterior.entradas?.length} entradas, esperado ${ESPERADO_NO_SAFE_MATCH}. ` +
          `Para rederivar o universo do zero use --do-zero, que exige os artefatos gitignorados.`,
      )
    }
    slugs = anterior.entradas.map((e) => e.slug).sort()
    porSlug = new Map(
      anterior.entradas.map((e) => [
        e.slug,
        {
          slug: e.slug,
          nome_completo: e.nome_completo,
          nome_urna: e.nome_urna,
          cargo_disputado: e.cargo_disputado,
          estado: e.estado,
        },
      ]),
    )
    // Proveniencia da derivacao original, carregada adiante sem ser refeita.
    for (const chave of ["universo_83_sha256", "db_snapshot_83_sha256", "ledger_b2_sha256"]) {
      if (anterior.fonte?.[chave] != null) herdado[chave] = anterior.fonte[chave]
    }
  }

  const todas = lerCsvDoZip(ZIPS[0].arquivo, ZIPS[0].entrada) as unknown as LinhaTse[]
  const complementares = lerCsvDoZip(ZIPS[1].arquivo, ZIPS[1].entrada)
  const redes = lerCsvDoZip(ZIPS[2].arquivo, ZIPS[2].entrada)

  const sqComComplemento = new Set(complementares.map((r) => String(r.SQ_CANDIDATO)))
  const redesPorSq = new Map<string, number>()
  for (const r of redes) {
    const sq = String(r.SQ_CANDIDATO)
    redesPorSq.set(sq, (redesPorSq.get(sq) ?? 0) + 1)
  }

  const fontes = { todas, sqComComplemento, redesPorSq }

  /**
   * A regra de chave independente e opcional POR CONSTRUCAO: sem
   * `DT_NASCIMENTO`, `nascimentoConfere` devolve false e a cascata se comporta
   * como antes. Isso e o que preserva o comportamento historico, e tambem o que
   * tornaria a regra inerte em silencio se o TSE renomeasse a coluna. Medir a
   * densidade converte esse silencio em falha ruidosa.
   */
  const alvoParaDensidade = todas.filter((linha) => CARGOS_ALVO.has(linha.DS_CARGO))
  const comNascimento = alvoParaDensidade.filter(
    (linha) => typeof linha.DT_NASCIMENTO === "string" && linha.DT_NASCIMENTO.trim() !== "",
  ).length
  const densidade = alvoParaDensidade.length > 0 ? comNascimento / alvoParaDensidade.length : 0
  if (densidade < 0.99) {
    throw new Error(
      `DT_NASCIMENTO presente em apenas ${(densidade * 100).toFixed(1)}% das ${alvoParaDensidade.length} ` +
        `linhas dos cargos-alvo. A coluna pode ter sido renomeada pelo TSE, e a regra de chave ` +
        `independente ficaria inerte sem ninguem perceber.`,
    )
  }

  const nascimentos = lerNascimentos(nascimentosPath, new Set(slugs))

  const entradas: ResultadoClassificacao[] = []
  for (const slug of slugs) {
    const perfil = porSlug.get(slug)
    if (!perfil) throw new Error(`${slug}: sem perfil de entrada (db-snapshot-83 ou registro anterior)`)
    entradas.push(
      classificarIdentidade({ ...perfil, data_nascimento: nascimentos.get(slug) ?? null }, fontes),
    )
  }

  // ---- reproducao dos hashes que o registro publica ----
  const diagnostico = Object.fromEntries(entradas.map((e) => [e.slug, e]))
  const diagnosticoSha256 = sha256Texto(JSON.stringify(diagnostico, null, 2))
  const slugsSha256 = sha256Texto(`${entradas.map((e) => e.slug).join("\n")}\n`)

  const contagem: Record<string, number> = {}
  for (const e of entradas) contagem[e.classe] = (contagem[e.classe] ?? 0) + 1

  // Datas da EXECUCAO ATUAL, nunca literais. `--decidido-em` existe so para o
  // teste conseguir fixar o relogio; sem ele vale hoje.
  const agora = new Date(argumento("decidido-em", apenasData(new Date())))
  if (Number.isNaN(agora.getTime())) throw new Error("--decidido-em invalida")
  const decididoEm = apenasData(agora)
  const revalidarAte = apenasData(
    new Date(agora.getTime() + VALIDADE_EM_DIAS * 24 * 60 * 60 * 1000),
  )

  const registro = {
    _comentario:
      "Registro de decisao de identidade eleitoral da etapa 2 (execucao pf-reverificacao-20260809). " +
      "CANONICO PARA A DECISAO: quais slugs podem materializar candidatura TSE 2026 e sob qual chave. " +
      "As 71 entradas sao transcricao verbatim do diagnostico, e por isso os dois hashes abaixo sao " +
      "RECOMPUTAVEIS em CI a partir de `entradas`, sem nenhum artefato gitignorado. " +
      "ADULTERACAO: qualquer edicao manual de `entradas` quebra os hashes e o teste falha; a correcao " +
      "e regenerar, nunca reescrever o hash. DIVERGENCIA: o parser lanca e nada e materializado.",
    versao: 2,
    execucao: "pf-reverificacao-20260809",
    pleito: 2026,
    decidido_em: decididoEm,
    total: entradas.length,
    contrato: {
      classe_que_promove_chave: "match_fresco",
      criterio_identidade:
        "confirmacao por um de dois caminhos. (1) nome civil + nome de urna + cargo + UF (mesmo contrato da B2). (2) chave independente: nome civil 1:1 OU subconjunto, mais cargo, UF e DATA DE NASCIMENTO identica a do nosso cadastro, com hit UNICO. Nome civil sozinho, sem chave independente, segue encaminhando revisao.",
      chave_independente:
        "data de nascimento por slug em data/identidade-etapa2-nascimentos.json, com proveniencia ANTERIOR ao pleito conferido (consulta_cand/DivulgaCandContas de ciclos passados ou curadoria). Conferir o pleito 2026 com dado extraido do proprio snapshot 2026 seria circular, defeito que derrubou a rota 2 do backfill de CPF. `null` mantem o slug bloqueado.",
      chave_vs_evidencia:
        "`chave` so existe em match_fresco. `hits[].sq` existe em classes bloqueadas e e EVIDENCIA para revisao, nao promocao. O invariante e `nenhuma chave promovida`, nao `nenhum SQ em lugar nenhum`.",
      reproducao:
        "diagnostico_final_71_sha256 = sha256(JSON.stringify(Object.fromEntries(entradas.map(e => [e.slug, e])), null, 2)); slugs_derivados_71_sha256 = sha256(entradas.map(e => e.slug).join('\\n') + '\\n')",
      janela_registro:
        "convencoes ate 05/08; pedidos de registro ate 15/08 as 19h (Resolucao TSE 23.609/2019, art. 19). As nao-localizacoes EXIGEM recheque apos 15/08 e nunca sao lidas como ausencia de registro.",
    },
    renovacao: {
      revalidar_ate: revalidarAte,
      responsavel:
        "dono do repositorio, unico autor de migrations e unico operador do banco (Settings/WORKFLOWS.md)",
      procedimento: [
        "npm run data:identidade-etapa2:fontes",
        "npm run data:identidade-etapa2:gerar",
        "node --import tsx --test tests/etapa2-identidade-protecao.test.ts",
      ],
      prorrogacao:
        "mover `revalidar_ate` sem regenerar exige decisao registrada em Settings/STATUS.md no mesmo commit.",
      roda_em_ci: false,
      motivo_de_nao_rodar_em_ci:
        "3,3 MB de ZIPs do TSE e 2,98 MB de ledger, ambos gitignorados, mais o binario unzip. O que roda em CI e a verificacao dos hashes, nao a regeneracao.",
    },
    consumidores: [
      "scripts/lib/identidade-etapa2.ts",
      "scripts/validate-seed.ts",
      "tests/etapa2-identidade-protecao.test.ts",
    ],
    fonte: {
      nucleo: "scripts/lib/identidade-etapa2-classificador.ts",
      gerador: "scripts/audit/gerar-identidade-etapa2.ts",
      modo: doZero ? "do-zero" : "reclassificar",
      diagnostico_gitignorado: "output/pf-reverificacao-20260809/diagnostico-final-71.json",
      diagnostico_final_71_sha256: diagnosticoSha256,
      slugs_derivados_71_sha256: slugsSha256,
      // Proveniencia da derivacao original. Em `--reclassificar` ela e herdada
      // do registro anterior, porque os artefatos que a produziram sao
      // gitignorados e nao existem em checkout limpo.
      ...herdado,
      nascimentos: "data/identidade-etapa2-nascimentos.json",
      nascimentos_sha256: sha256Arquivo(nascimentosPath),
      catalog_sha256: sha256Arquivo(catalogPath),
      catalog_fetched_at: catalog.fetched_at ?? null,
      snapshot_tse_sha256: sha256Arquivo(ZIPS[0].arquivo),
      snapshot_complemento_sha256: sha256Arquivo(ZIPS[1].arquivo),
      snapshot_redes_sha256: sha256Arquivo(ZIPS[2].arquivo),
      dt_geracao_tse: `${(todas[0] as unknown as Record<string, string>)?.DT_GERACAO ?? "?"} ${(todas[0] as unknown as Record<string, string>)?.HH_GERACAO ?? ""}`.trim(),
    },
    contagem,
    entradas,
  }

  writeFileSync(saida, `${JSON.stringify(registro, null, 2)}\n`)
  console.log(
    JSON.stringify(
      { saida, total: entradas.length, contagem, diagnosticoSha256, slugsSha256 },
      null,
      2,
    ),
  )
}

if (process.argv[1]?.includes("gerar-identidade-etapa2")) {
  main()
}
