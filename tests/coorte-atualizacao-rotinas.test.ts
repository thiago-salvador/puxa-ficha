/**
 * Guarda estática da coorte de atualização.
 *
 * Toda rotina de atualização (registro em scripts/data/coorte-atualizacao-rotinas.json)
 * é percorrida pelo fecho de imports a partir do workflow e das entradas
 * manuais. Cada ponto que seleciona um CONJUNTO de candidatos (tabela
 * `candidatos`/`candidatos_publico`, seed `data/candidatos.json`,
 * `/api/candidato-slugs`, `loadCandidatos()`) precisa de um marcador nas três
 * linhas anteriores:
 *
 *   coorte-atualizacao: aplica              (e o arquivo usa o predicado)
 *   coorte-atualizacao: isento (motivo)     (motivo com 10+ caracteres)
 *
 * Operação por linha (lookup por id/slug, update, insert) não é seleção de
 * conjunto e não precisa de marcador. Rotina nova que selecione candidatos
 * sem o predicado reprova aqui.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { readdirSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { describe, it } from "node:test"

import registro from "../scripts/data/coorte-atualizacao-rotinas.json"

const ROOT = join(__dirname, "..")
const PKG_SCRIPTS: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts

const API_PREDICADO = /\b(filtrarCoorteAtualizacao|aplicarCoorteAtualizacao|carregarCoorteAtualizacao|estaNaCoorteAtualizacao|naCoorteAtualizacao|loadCandidatosPublicos)\b|atualizacao_encerrada_em|pf_fase_sql/
const MARCADOR = /coorte-atualizacao:\s*(aplica|isento\s*\(([^)]*)\))/
// Menção ao nome da tabela que não é leitura: telemetria, mensagem de erro,
// comparação de nome, lookup unitário por helper.
const NAO_SELECAO = /tables_updated|\.includes\(|new Error\(|[=!]==\s*["']candidatos|readOne\(|readMany\(|readByFilters\(|assertPreflightNotTruncated|fonte_arquivo:|uso: |information_schema/
const API_SELECAO_ISENTA: Record<string, Array<{ motivo: string; assinatura: RegExp }>> = {
  "src/app/api/alerts/me/route.ts": [{ assinatura: /\.select\("id, slug, nome_urna, partido_sigla, cargo_disputado"\)[\s\S]*?\.in\("id", candidateIds\)/, motivo: "lê metadados das fichas já vinculadas às assinaturas do usuário" }],
  "src/app/api/alerts/send-digest/route.ts": [
    { assinatura: /\.select\("id, slug, nome_urna, partido_sigla, cargo_disputado, estado"\)[\s\S]*?\.in\("cargo_disputado", cohortCargos\)/, motivo: "lê nomes e cargos para montar digest com alertas já coletados" },
    { assinatura: /\.select\("id, slug, nome_urna, partido_sigla, cargo_disputado, estado"\)[\s\S]*?\.neq\("status", "removido"\)/, motivo: "lê rótulos das fichas escolhidas pelos próprios assinantes" },
  ],
  "src/app/api/alerts/subscribe/route.ts": [{ assinatura: /\.select\("id, slug, nome_urna, partido_sigla, cargo_disputado, estado"\)[\s\S]*?\.in\("cargo_disputado", \[\.\.\.ALERT_COHORT_CARGOS\]\)/, motivo: "valida e renderiza fichas escolhidas no fluxo de inscrição de alertas" }],
  "src/app/api/internal/published-consistency/route.ts": [{ assinatura: /\.select\(SELECT_COLUMNS\)/, motivo: "audita consistência das fichas publicadas sem atualizar candidatos" }],
}

function classificarIsencoesApi(sitios: Sitio[], isencoes: Array<{ motivo: string; assinatura: RegExp }>): boolean {
  if (sitios.length !== isencoes.length || isencoes.some((isencao) => isencao.motivo.trim().length < 20)) return false
  const restantes = [...isencoes]
  for (const sitio of sitios) {
    const indice = restantes.findIndex((isencao) => isencao.assinatura.test(sitio.texto))
    if (indice < 0) return false
    restantes.splice(indice, 1)
  }
  return restantes.length === 0
}

function scriptsDoTexto(texto: string, profundidade = 0): Set<string> {
  const out = new Set<string>()
  for (const m of texto.matchAll(/(scripts\/[\w\-/.]+\.(?:ts|mjs|js|sql|sh))/g)) out.add(m[1])
  if (profundidade < 3) {
    for (const m of texto.matchAll(/npm run ([\w:-]+)/g)) {
      const alvo = PKG_SCRIPTS[m[1]]
      if (alvo) for (const s of scriptsDoTexto(alvo, profundidade + 1)) out.add(s)
    }
  }
  return out
}

function resolverImport(de: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null
  const base = normalize(join(dirname(de), spec))
  for (const ext of ["", ".ts", ".mjs", ".js", "/index.ts"]) {
    const p = base + ext
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p
  }
  return null
}

function fecho(entradas: Iterable<string>): Set<string> {
  const vistos = new Set<string>()
  const visitar = (arquivo: string) => {
    if (vistos.has(arquivo) || !existsSync(join(ROOT, arquivo)) || arquivo.includes("node_modules")) return
    vistos.add(arquivo)
    const texto = readFileSync(join(ROOT, arquivo), "utf8")
    if (arquivo.endsWith(".sh")) {
      for (const s of scriptsDoTexto(texto)) visitar(s)
      return
    }
    if (!/\.(ts|mjs|js)$/.test(arquivo)) return
    for (const m of texto.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = resolverImport(arquivo, m[1] ?? m[2])
      if (r) visitar(r)
    }
  }
  for (const e of entradas) visitar(e)
  return vistos
}

interface Sitio { arquivo: string; linha: number; texto: string; resultado?: string }

function sitiosDeSelecao(arquivo: string, texto: string): Sitio[] {
  const linhas = texto.split("\n")
  const sitios: Sitio[] = []
  const sql = arquivo.endsWith(".sql")
  linhas.forEach((bruta, i) => {
    const linha = bruta.trim()
    if (sql) {
      if (linha.startsWith("--")) return
      if (/\b(from|join)\s+(public\.)?candidatos(_publico)?\b/i.test(linha)) sitios.push({ arquivo, linha: i + 1, texto: linha })
      return
    }
    if (linha.startsWith("*") || linha.startsWith("//") || linha.startsWith("/*")) return
    const seleciona = /["'`]candidatos(_publico)?["'`]/.test(linha)
      || /candidato-slugs/.test(linha)
      || /data\/candidatos\.json|["'`]candidatos\.json["'`]/.test(linha)
      || (/\bloadCandidatos\(\)/.test(linha) && !/function\s+loadCandidatos/.test(linha))
    if (!seleciona || NAO_SELECAO.test(linha)) return
    if (/\.from\(\s*["'`]candidatos(?:_publico)?["'`]\s*\)\s*\.(?:update|insert|upsert|delete)\(/.test(linha)) return
    const cadeiaQuery = linhas.slice(i, Math.min(linhas.length, i + 18)).join("\n").split(/;|\n\s*(?:const|let|return)\s/)[0]
    const escrita = cadeiaQuery.search(/\.(?:update|insert|upsert|delete)\(/)
    const leitura = cadeiaQuery.search(/\.select\(/)
    if (escrita >= 0 && (leitura < 0 || escrita < leitura)) return
    // Um write ou lookup próximo não transforma a seleção em operação por
    // linha. Só a própria query com identificador único é excluída.
    if (/\.from\(\s*["'`]candidatos(?:_publico)?["'`]\s*\)[\s\S]*?\.select\([^)]*\)[\s\S]*?\.(?:eq|in)\(\s*["'`](?:id|slug)["'][\s\S]*?\.(?:single|maybeSingle)\(/.test(cadeiaQuery)) return
    sitios.push({ arquivo, linha: i + 1, texto: linha })
  })
  return sitios
}

function selecoesDaRota(texto: string): Sitio[] {
  const sitios: Sitio[] = []
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
  const regex = /\.from\(\s*["'`]candidatos(?:_publico)?["'`]\s*\)/g
  for (const match of codigo.matchAll(regex)) {
    const inicio = match.index ?? 0
    const fimPontoEVirgula = codigo.indexOf(";", inicio)
    const resto = codigo.slice(inicio + match[0].length)
    const proximaQuery = resto.search(/\.from\(/)
    const fim = fimPontoEVirgula < 0 ? (proximaQuery < 0 ? codigo.length : inicio + match[0].length + proximaQuery) : fimPontoEVirgula
    const consulta = codigo.slice(inicio, fim + (codigo[fim] === ";" ? 1 : 0))
    if (!/\.select\(/.test(consulta)) continue
    const linha = codigo.slice(0, inicio).split("\n").length
    const anteriores = codigo.slice(Math.max(0, inicio - 500), inicio)
    const destructurado = [...anteriores.matchAll(/\b(?:const|let)\s*\{([^}]+)\}\s*=\s*await\b/g)].at(-1)?.[1]
    const campoData = destructurado?.match(/(?:^|,)\s*data(?:\s*:\s*(\w+))?\s*(?:,|$)/)
    const resultado = campoData?.[1] ?? (campoData ? "data" : undefined)
    sitios.push({ arquivo: "", linha, texto: consulta, resultado })
  }
  return sitios
}

function selecaoFiltrada(sitio: Sitio, funcao = ""): boolean {
  // O filtro precisa participar da mesma query/callsite. Referenciar o helper
  // em outro ponto do arquivo não satisfaz esse contrato.
  if (/\.(?:is|eq)\(\s*["'`]atualizacao_encerrada_em["']\s*,\s*null\s*\)/.test(sitio.texto)) return true
  if (!sitio.resultado) return false
  const resultado = sitio.resultado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:naCoorteAtualizacao|filtrarCoorteAtualizacao|filtrarPaginaNews)\\s*\\([^)]*\\b${resultado}\\b`).test(funcao)
}

function rotasApiComSelecao(): string[] {
  const apiRoot = join(ROOT, "src/app/api")
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entry.name)
      if (entry.isDirectory()) walk(caminho)
      else if (entry.name === "route.ts") {
        const relativo = caminho.slice(ROOT.length + 1)
        if (selecoesDaRota(readFileSync(caminho, "utf8")).length) found.push(relativo)
      }
    }
  }
  walk(apiRoot)
  return found
}

function marcadorDo(linhas: string[], linha: number): RegExpExecArray | null {
  for (let j = linha - 1; j >= Math.max(0, linha - 4); j -= 1) {
    const m = MARCADOR.exec(linhas[j])
    if (m) return m
  }
  return null
}

function funcaoDaLinha(texto: string, linha: number): string {
  const linhas = texto.split("\n")
  const corpo: string[] = []
  for (let i = linha - 1; i < linhas.length && i < linha + 200; i += 1) {
    if (i > linha - 1 && /^\s*(?:export\s+)?(?:async\s+)?function\s/.test(linhas[i])) break
    corpo.push(linhas[i])
  }
  return corpo.join("\n")
}

function arquivosDasRotinas(): Map<string, string> {
  const origem = new Map<string, string>()
  for (const rotina of registro.rotinas) {
    const entradas = new Set<string>(rotina.entradas)
    if (rotina.workflow) {
      const caminho = join(ROOT, ".github/workflows", rotina.workflow)
      assert.ok(existsSync(caminho), `workflow ausente: ${rotina.workflow}`)
      for (const s of scriptsDoTexto(readFileSync(caminho, "utf8"))) entradas.add(s)
    }
    for (const arquivo of fecho(entradas)) if (!origem.has(arquivo)) origem.set(arquivo, rotina.id)
  }
  return origem
}

describe("coorte de atualização: guarda das rotinas", () => {
  it("todo workflow que não é apply/rollback está classificado", () => {
    const registrados = new Set<string>([
      ...registro.rotinas.map((r) => r.workflow).filter((w): w is string => Boolean(w)),
      ...Object.keys(registro.workflows_sem_rotina),
    ])
    const faltando = readdirSync(join(ROOT, ".github/workflows"))
      .filter((f) => f.endsWith(".yml") && !/^(apply|rollback)-/.test(f))
      .filter((f) => !registrados.has(f))
    assert.deepEqual(faltando, [], "workflow novo precisa entrar em scripts/data/coorte-atualizacao-rotinas.json")
  })

  it("toda seleção de candidatos no fecho das rotinas passa pelo predicado ou declara isenção", () => {
    const problemas: string[] = []
    let sitiosAplica = 0
    for (const [arquivo, rotina] of arquivosDasRotinas()) {
      if (!/\.(ts|mjs|js|sql)$/.test(arquivo)) continue
      const texto = readFileSync(join(ROOT, arquivo), "utf8")
      const linhas = texto.split("\n")
      for (const sitio of sitiosDeSelecao(arquivo, texto)) {
        const m = marcadorDo(linhas, sitio.linha)
        if (!m) {
          problemas.push(`${rotina}: ${arquivo}:${sitio.linha} seleciona candidatos sem marcador: ${sitio.texto.slice(0, 120)}`)
          continue
        }
        if (m[1] === "aplica") {
          sitiosAplica += 1
          const contexto = arquivo.endsWith(".sql")
            ? texto.split("\n").slice(Math.max(0, sitio.linha - 20), sitio.linha + 20).join("\n")
            : funcaoDaLinha(texto, sitio.linha)
          if (!API_PREDICADO.test(contexto)) problemas.push(`${arquivo}:${sitio.linha} diz aplica mas o escopo da chamada não usa o predicado`)
        } else if ((m[2] ?? "").trim().length < 10) {
          problemas.push(`${arquivo}:${sitio.linha} isenção sem motivo`)
        }
      }
    }
    assert.deepEqual(problemas, [])
    assert.ok(sitiosAplica >= 10, `esperados 10+ pontos com o predicado, achados ${sitiosAplica}`)
  })

  it("a guarda reprova uma seleção sem marcador", () => {
    const texto = [
      "const { data } = await supabase.from(\"candidatos_publico\").select(\"slug\")",
      "for (const c of data) coletar(c)",
    ].join("\n")
    const sitios = sitiosDeSelecao("scripts/exemplo.ts", texto)
    assert.equal(sitios.length, 1)
    assert.equal(marcadorDo(texto.split("\n"), sitios[0].linha), null)
  })

  it("lookup por id não conta como seleção de conjunto", () => {
    const texto = "const { data } = await supabase.from(\"candidatos\").select(\"id\").eq(\"slug\", slug).single()"
    assert.deepEqual(sitiosDeSelecao("scripts/exemplo.ts", texto), [])
  })

  it("escaneia rotas API e crons do Vercel e valida seleções de candidatos nos crons", () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { crons: Array<{ path: string }> }
    const rotasComSelecao = rotasApiComSelecao()
    const caminhosCron = vercel.crons.map((cron) => join("src/app", cron.path.slice(1), "route.ts"))
    const cronsComSelecao = caminhosCron.filter((arquivo) => rotasComSelecao.includes(arquivo))
    const problemas: string[] = []
    for (const arquivo of caminhosCron) if (!existsSync(join(ROOT, arquivo))) problemas.push(`cron sem Route Handler: ${arquivo}`)
    for (const arquivo of rotasComSelecao) {
      const texto = readFileSync(join(ROOT, arquivo), "utf8")
      const sitios = selecoesDaRota(texto)
      if (arquivo === "src/app/api/news/refresh/route.ts") {
        for (const sitio of sitios) {
          if (!selecaoFiltrada(sitio, funcaoDaLinha(texto, sitio.linha))) problemas.push(`${arquivo}:${sitio.linha} seleção sem filtro do resultado da própria query`)
        }
      } else {
        const isencoes = API_SELECAO_ISENTA[arquivo] ?? []
        if (!classificarIsencoesApi(sitios, isencoes)) {
          problemas.push(`${arquivo} tem ${sitios.length} seleção(ões) sem classificação individual`)
        }
      }
    }
    const workflowsAgendados = readdirSync(join(ROOT, ".github/workflows"))
      .filter((arquivo) => arquivo.endsWith(".yml"))
      .filter((arquivo) => /\bschedule\s*:/.test(readFileSync(join(ROOT, ".github/workflows", arquivo), "utf8")))
    const workflowsRegistrados = new Set<string>([
      ...registro.rotinas.map((rotina) => rotina.workflow).filter((workflow): workflow is string => Boolean(workflow)),
      ...Object.keys(registro.workflows_sem_rotina),
    ])
    for (const workflow of workflowsAgendados) if (!workflowsRegistrados.has(workflow)) problemas.push(`workflow agendado não classificado: ${workflow}`)
    const arquivoNews = "src/app/api/news/refresh/route.ts"
    assert.ok(rotasComSelecao.includes("src/app/api/news/refresh/route.ts"), "scanner deve inventariar a rota news/refresh")
    assert.ok(cronsComSelecao.includes(arquivoNews), "cron news/refresh deve entrar no inventário")
    assert.deepEqual(problemas, [])
  })

  it("a guarda reprova seleção bypassada mesmo quando o arquivo menciona o predicado em outro lugar", () => {
    const texto = [
      "import { naCoorteAtualizacao } from '@/lib/coorte-atualizacao'",
      "function unrelated(row) { return naCoorteAtualizacao(row) }",
      "async function load() {",
      "  const { data } = await supabase.from(\"candidatos_publico\")",
      "    .select(\"slug\")",
      "    .eq(\"slug\", slug)",
      "    .update({ visto: true })",
      "  return data",
      "}",
    ].join("\n")
    const sitios = selecoesDaRota(texto)
    assert.equal(sitios.length, 1)
    assert.equal(selecaoFiltrada(sitios[0]), false)
  })

  it("valida cada select separado pelo resultado da própria query", () => {
    const texto = [
      "async function load() {",
      "  const { data: primeira } = await db.from(\"candidatos_publico\").select(\"slug\");",
      "  const { data: segunda } = await db.from(\"candidatos\").select(\"slug\");",
      "  filtrarCoorteAtualizacao(primeira, coorte, \"teste\");",
      "  return segunda",
      "}",
    ].join("\n")
    const sitios = selecoesDaRota(texto)
    assert.equal(sitios.length, 2)
    assert.equal(selecaoFiltrada(sitios[0], funcaoDaLinha(texto, sitios[0].linha)), true)
    assert.equal(selecaoFiltrada(sitios[1], funcaoDaLinha(texto, sitios[1].linha)), false)
  })

  it("exige assinatura individual da query para uma isenção de rota", () => {
    const permitida = "const { data } = await db.from(\"candidatos_publico\").select(\"id, slug, nome_urna, partido_sigla, cargo_disputado\").in(\"id\", candidateIds);"
    const bypass = permitida.replace("id, slug, nome_urna, partido_sigla, cargo_disputado", "*")
    const isencoes = [{
      assinatura: /\.select\("id, slug, nome_urna, partido_sigla, cargo_disputado"\)[\s\S]*?\.in\("id", candidateIds\)/,
      motivo: "lê somente metadados das fichas vinculadas ao usuário",
    }]
    const sitiosPermitidos = selecoesDaRota(permitida)
    const sitiosBypass = selecoesDaRota(bypass)
    assert.equal(sitiosPermitidos.length, sitiosBypass.length)
    assert.equal(classificarIsencoesApi(sitiosPermitidos, isencoes), true)
    assert.equal(classificarIsencoesApi(sitiosBypass, isencoes), false)
  })

  it("um update próximo não oculta um select de candidatos", () => {
    const texto = [
      "const { data } = await supabase.from(\"candidatos_publico\")",
      "  .select(\"slug\")",
      "  .range(0, 4)",
      "await supabase.from(\"candidatos\").update({ visto: true })",
    ].join("\n")
    assert.equal(sitiosDeSelecao("scripts/exemplo.ts", texto).length, 1)
  })

  it("um single de outra consulta não dispensa o select em lote", () => {
    const texto = [
      "const { data } = await db.from(\"candidatos_publico\").select(\"slug\").in(\"slug\", slugs)",
      "const { outro } = await db.from(\"estados\").select(\"uf\").eq(\"uf\", uf).single()",
    ].join("\n")
    assert.equal(sitiosDeSelecao("scripts/exemplo.ts", texto).length, 1)
  })

  it("não dispensa select em lote por in(slug) nem por menção ao predicado em outro ponto", () => {
    const texto = [
      "import { naCoorteAtualizacao } from '@/lib/coorte-atualizacao'",
      "function outraRotina(row) { return naCoorteAtualizacao(row) }",
      "const { data } = await db.from(\"candidatos_publico\").select(\"slug\").in(\"slug\", slugs)",
      "return data",
    ].join("\n")
    assert.equal(sitiosDeSelecao("scripts/exemplo.ts", texto).length, 1)
  })
})
