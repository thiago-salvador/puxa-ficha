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
const POR_LINHA = /\.eq\(\s*["'](id|slug)["']|\.single\(|\.maybeSingle\(|\.update\(|\.insert\(|\.upsert\(|\.delete\(|\.in\(\s*["'](id|slug)["']/
// Menção ao nome da tabela que não é leitura: telemetria, mensagem de erro,
// comparação de nome, lookup unitário por helper.
const NAO_SELECAO = /tables_updated|\.includes\(|new Error\(|[=!]==\s*["']candidatos|readOne\(|readMany\(|readByFilters\(|assertPreflightNotTruncated|fonte_arquivo:|uso: |information_schema/

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

interface Sitio { arquivo: string; linha: number; texto: string }

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
    const janela = linhas.slice(i, i + 6).join("\n")
    if (POR_LINHA.test(janela)) return
    sitios.push({ arquivo, linha: i + 1, texto: linha })
  })
  return sitios
}

function marcadorDo(linhas: string[], linha: number): RegExpExecArray | null {
  for (let j = linha - 1; j >= Math.max(0, linha - 4); j -= 1) {
    const m = MARCADOR.exec(linhas[j])
    if (m) return m
  }
  return null
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
          if (!API_PREDICADO.test(texto)) problemas.push(`${arquivo}:${sitio.linha} diz aplica mas o arquivo não usa o predicado`)
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
})
