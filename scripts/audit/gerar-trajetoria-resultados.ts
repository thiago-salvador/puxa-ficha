/**
 * Gera o backfill de observações de candidaturas sem tocar banco ou rede.
 * Identidade é resolvida somente por SQ_CANDIDATO explícito ou CPF documentado.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

import {
  extrairResultadoFinal,
  linhasSemResultadoFinal,
  parseCiclo,
  type HistoricoCandidaturaGateRow,
} from "./lib/candidatura-resultado-gate"
import { stripAccents } from "../../src/lib/strip-accents"

interface HistoricoRow extends HistoricoCandidaturaGateRow {
  candidato_id: string
  cargo: string
}

interface CandidatoRow {
  id: string
  slug: string
  cpf: string | null
}

interface Alvo {
  historico: HistoricoRow
  candidato: CandidatoRow | null
  sqExplicito: string | null
  cpf: string | null
  matches: Tserow[]
}

interface Tserow {
  arquivo: string
  sq: string
  cpf: string
  cargo: string
  turno: number
  resultado: string
}

export interface Saida {
  id: string | null
  candidato_id: string
  slug: string
  ano: number
  cargo: string
  observacao_atual: string
  observacao_nova: string | null
  resultado_tse: string | null
  fonte: string | null
  confianca: string
}

function flag(argv: string[], nome: string): string | null {
  const prefixo = `--${nome}=`
  const inline = argv.find((item) => item.startsWith(prefixo))
  if (inline) return inline.slice(prefixo.length)
  const indice = argv.indexOf(`--${nome}`)
  return indice >= 0 ? argv[indice + 1] ?? "" : null
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ";" && !quoted) {
      values.push(value)
      value = ""
    } else {
      value += char
    }
  }
  values.push(value.replace(/\r$/, ""))
  return values
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

function extrairSq(observacoes: string | null): string | null {
  const match = (observacoes ?? "").match(/\bSQ(?:_CANDIDATO)?\s*[:=]?\s*(\d{4,})\b/i)
  return match?.[1] ?? null
}

function normalizarCargo(value: string): string {
  return stripAccents(value)
    .replace(/^CANDIDATURA\s+(?:A|AO)\s+/i, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase()
}

function cargosCompativeis(historico: string, tse: string): boolean {
  const left = normalizarCargo(historico)
  const right = normalizarCargo(tse)
  if (left === right) return true
  if (left.includes("SUPLENTE") && right.includes("SUPLENTE")) return true
  return left.includes(right) || right.includes(left)
}

function resultadoCanonico(raw: string): string | null {
  const texto = raw.trim().toUpperCase()
  if (!texto || texto === "#NULO#" || texto === "NÃO DIVULGÁVEL") return null
  if (texto === "MÉDIA") return "ELEITO POR MÉDIA"
  return extrairResultadoFinal(texto) ?? (texto === "2º TURNO" ? "2º TURNO" : null)
}

async function scanCsv(arquivo: string, alvos: Alvo[], tseDir: string): Promise<void> {
  const input = createInterface({ input: createReadStream(arquivo, { encoding: "latin1" }), crlfDelay: Infinity })
  let header: string[] | null = null
  let index: Record<string, number> = {}
  for await (const line of input) {
    if (!header) {
      header = parseCsvLine(line)
      index = Object.fromEntries(header.map((name, position) => [name, position]))
      continue
    }
    const candidatos = alvos.filter((alvo) =>
      (alvo.sqExplicito && line.includes(alvo.sqExplicito)) ||
      (!alvo.sqExplicito && alvo.cpf && line.includes(alvo.cpf))
    )
    if (!candidatos.length) continue
    const values = parseCsvLine(line)
    const row: Tserow = {
      arquivo: relative(tseDir, arquivo),
      sq: values[index.SQ_CANDIDATO] ?? "",
      cpf: digits(values[index.NR_CPF_CANDIDATO]),
      cargo: values[index.DS_CARGO] ?? "",
      turno: Number(values[index.NR_TURNO] ?? 0),
      resultado: values[index.DS_SIT_TOT_TURNO] ?? "",
    }
    for (const alvo of candidatos) {
      if (alvo.sqExplicito) {
        if (row.sq === alvo.sqExplicito) alvo.matches.push(row)
      } else if (alvo.cpf && row.cpf === alvo.cpf) {
        alvo.matches.push(row)
      }
    }
  }
}

function selecionarMatchesIdentidade(alvo: Alvo): Tserow[] | null {
  let matches = alvo.matches
  if (!alvo.sqExplicito) {
    const compativeis = matches.filter((row) => cargosCompativeis(alvo.historico.cargo, row.cargo))
    const sqUnicos = new Set(matches.map((row) => row.sq).filter(Boolean))
    if (compativeis.length) matches = compativeis
    else if (sqUnicos.size !== 1) return null
  }
  return matches
}

function selecionarMatch(alvo: Alvo): { row: Tserow; resultado: string } | null {
  const matches = selecionarMatchesIdentidade(alvo)
  if (!matches) return null
  const finais = matches
    .map((row) => ({ row, resultado: resultadoCanonico(row.resultado) }))
    .filter((item): item is { row: Tserow; resultado: string } => !!item.resultado && item.resultado !== "2º TURNO")
    .sort((left, right) => right.row.turno - left.row.turno)
  return finais[0] ?? null
}

function observacaoNova(atual: string, resultado: string, ano: number): string {
  if (/^Candidatura:\s*(?:M[ÉE]DIA)?\s*\(TSE\s+\d{4}\)\.?$/i.test(atual.trim())) {
    return `Candidatura: ${resultado} (TSE ${ano})`
  }
  const base = atual.trim().replace(/[.\s]+$/, "")
  return `${base}. Resultado da candidatura: ${resultado} (TSE ${ano}).`
}

function validarSaida(rows: Saida[]): void {
  const identidades = new Set<string>()
  for (const row of rows) {
    for (const key of ["slug", "cargo", "observacao_atual", "confianca"] as const) {
      if (typeof row[key] !== "string") throw new Error(`${row.id || "linha"}: campo ${key} inválido`)
    }
    if (!row.candidato_id || !Number.isInteger(row.ano)) {
      throw new Error(`${row.id || "linha"}: identidade estável inválida`)
    }
    const identidade = row.id ?? `${row.candidato_id}\u0000${row.ano}\u0000${row.cargo}\u0000${row.observacao_atual}`
    if (identidades.has(identidade)) throw new Error(`${row.id || identidade}: identidade duplicada`)
    identidades.add(identidade)
    if (row.resultado_tse && !extrairResultadoFinal(row.observacao_nova)) {
      throw new Error(`${row.id}: observacao_nova não contém resultado final`)
    }
  }
}

export async function gerar(argv = process.argv.slice(2)): Promise<Saida[]> {
  const historicoPath = flag(argv, "historico")
  const candidatosPath = flag(argv, "candidatos")
  const tseDir = flag(argv, "tse-dir")
  const outputPath = flag(argv, "output")
  const planoCargaPath = flag(argv, "plano-carga")
  const cicloCorrente = parseCiclo(flag(argv, "ciclo"))
  if (!historicoPath || !candidatosPath || !tseDir || !outputPath) {
    throw new Error("uso: --historico PATH --candidatos PATH --tse-dir PATH --output PATH [--ciclo 2026]")
  }

  const historico = JSON.parse(readFileSync(historicoPath, "utf8")) as HistoricoRow[]
  if (planoCargaPath) {
    const plano = JSON.parse(readFileSync(planoCargaPath, "utf8")) as {
      inserts?: { historico_politico?: Omit<HistoricoRow, "id">[] }
    }
    for (const row of plano.inserts?.historico_politico ?? []) {
      const duplicada = historico.some((atual) =>
        atual.candidato_id === row.candidato_id &&
        atual.periodo_inicio === row.periodo_inicio &&
        atual.cargo === row.cargo &&
        atual.observacoes === row.observacoes
      )
      if (!duplicada) historico.push({ ...row, id: null })
    }
  }
  const candidatos = JSON.parse(readFileSync(candidatosPath, "utf8")) as CandidatoRow[]
  const candidatoPorId = new Map(candidatos.map((row) => [row.id, row]))
  const alvos: Alvo[] = linhasSemResultadoFinal(historico, cicloCorrente).map((row) => {
    const historicoRow = row as HistoricoRow
    const candidato = candidatoPorId.get(historicoRow.candidato_id) ?? null
    return {
      historico: historicoRow,
      candidato,
      sqExplicito: extrairSq(historicoRow.observacoes),
      cpf: digits(candidato?.cpf) || null,
      matches: [],
    }
  })

  const porAno = new Map<number, Alvo[]>()
  for (const alvo of alvos) {
    const ano = alvo.historico.periodo_inicio!
    porAno.set(ano, [...(porAno.get(ano) ?? []), alvo])
  }
  for (const [ano, alvosDoAno] of porAno) {
    const dir = join(tseDir, String(ano))
    if (!existsSync(dir)) continue
    for (const arquivo of readdirSync(dir).filter((name) => /^consulta_cand_.*\.csv$/i.test(name)).sort()) {
      await scanCsv(join(dir, arquivo), alvosDoAno, tseDir)
    }
  }

  const prioridade = new Map([
    ["edmilson-costa:2010", 0],
    ["hertz-dias:2010", 1],
    ["rui-costa-pimenta:2014", 2],
    ["lula:2006", 3],
  ])
  const output = alvos.map((alvo): Saida => {
    const row = alvo.historico
    const candidato = alvo.candidato
    const match = selecionarMatch(alvo)
    if (!candidato) {
      return { id: row.id, candidato_id: row.candidato_id, slug: "", ano: row.periodo_inicio!, cargo: row.cargo, observacao_atual: row.observacoes ?? "", observacao_nova: null, resultado_tse: null, fonte: null, confianca: "pendente_sem_identidade" }
    }
    if (!alvo.sqExplicito && !alvo.cpf) {
      return { id: row.id, candidato_id: row.candidato_id, slug: candidato.slug, ano: row.periodo_inicio!, cargo: row.cargo, observacao_atual: row.observacoes ?? "", observacao_nova: null, resultado_tse: null, fonte: null, confianca: "pendente_sem_ancora" }
    }
    if (!match) {
      const matchesIdentidade = selecionarMatchesIdentidade(alvo)
      const fonte = matchesIdentidade?.length
        ? [...new Set(matchesIdentidade.map((item) =>
            `${item.arquivo}; SQ_CANDIDATO=${item.sq}; DS_SIT_TOT_TURNO=${item.resultado || "(vazio)"}`
          ))].join(" | ")
        : null
      return {
        id: row.id,
        candidato_id: row.candidato_id,
        slug: candidato.slug,
        ano: row.periodo_inicio!,
        cargo: row.cargo,
        observacao_atual: row.observacoes ?? "",
        observacao_nova: null,
        resultado_tse: null,
        fonte,
        confianca: fonte ? "pendente_sem_resultado_final" : "pendente_sem_match_tse",
      }
    }
    return {
      id: row.id,
      candidato_id: row.candidato_id,
      slug: candidato.slug,
      ano: row.periodo_inicio!,
      cargo: row.cargo,
      observacao_atual: row.observacoes ?? "",
      observacao_nova: observacaoNova(row.observacoes ?? "", match.resultado, row.periodo_inicio!),
      resultado_tse: match.resultado,
      fonte: `${match.row.arquivo}; SQ_CANDIDATO=${match.row.sq}`,
      confianca: alvo.sqExplicito ? "alta_sq" : "alta_cpf",
    }
  }).sort((left, right) => {
    const lp = prioridade.get(`${left.slug}:${left.ano}`) ?? 99
    const rp = prioridade.get(`${right.slug}:${right.ano}`) ?? 99
    return lp - rp || left.slug.localeCompare(right.slug) || left.ano - right.ano
  })
  validarSaida(output)
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  const resolvidas = output.filter((row) => row.resultado_tse).length
  console.log(JSON.stringify({ output: resolve(outputPath), total: output.length, resolvidas, pendentes: output.length - resolvidas }))
  return output
}

const executadoDiretamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (executadoDiretamente) {
  void gerar().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
