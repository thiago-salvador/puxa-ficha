import { stripAccents } from "../../src/lib/strip-accents"

/**
 * Decisões humanas de identidade por célula (slug × família) para o gate do
 * ingest TSE local. O arquivo é público: só slug, família, decisão e a chave
 * da linha oficial (ano, UF, município, SQ). CPF, nascimento e nome civil
 * nunca entram; o parser recusa qualquer campo fora do contrato.
 *
 * Até 2008 o SQ_CANDIDATO não é único no país (é sequencial por UF e, na
 * eleição municipal, repete entre municípios), então a chave dessas linhas
 * exige o município (NM_UE do pacote). Linha antiga sem município nunca casa.
 */
export const FAMILIAS_CELULA = ["financiamento", "patrimonio", "historico_politico"] as const
export type FamiliaCelula = typeof FAMILIAS_CELULA[number]
export type RiscoIdentidadePinado = {
  schema_version: 1
  kind: "tse-identidade-risco"
  gerado_em: string
  origem: string
  slugs: string[]
  celulas_liberadas: string[]
}

/** O agendado não aplica um plano quando o pin público de identidade é inválido. */
export function parseRiscoIdentidadePinado(value: Uint8Array | string): RiscoIdentidadePinado {
  const fail = (reason: string): never => { throw new Error(`pin de identidade inválido: ${reason}`) }
  let parsed: unknown
  try { parsed = JSON.parse(typeof value === "string" ? value : new TextDecoder().decode(value)) } catch { return fail("JSON") }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("raiz")
  const root = parsed as Record<string, unknown>
  if (Object.keys(root).sort().join(",") !== "celulas_liberadas,gerado_em,kind,origem,schema_version,slugs"
    || root.schema_version !== 1 || root.kind !== "tse-identidade-risco"
    || typeof root.gerado_em !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(root.gerado_em)
    || !Number.isFinite(Date.parse(`${root.gerado_em}T00:00:00Z`))
    || new Date(`${root.gerado_em}T00:00:00Z`).toISOString().slice(0, 10) !== root.gerado_em
    || typeof root.origem !== "string" || !root.origem.trim()
    || !Array.isArray(root.slugs) || !Array.isArray(root.celulas_liberadas)) return fail("cabeçalho")
  const slugs = root.slugs as unknown[]
  if (slugs.some((slug) => typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug))
    || slugs.some((slug, index) => index > 0 && String(slugs[index - 1]) >= String(slug))) return fail("slugs")
  const knownSlugs = new Set(slugs)
  const cells = root.celulas_liberadas as unknown[]
  if (cells.some((cell) => {
    if (typeof cell !== "string") return true
    const parts = cell.split("|")
    return parts.length !== 2 || !knownSlugs.has(parts[0]) || !FAMILIAS_CELULA.includes(parts[1] as FamiliaCelula)
  }) || cells.some((cell, index) => index > 0 && String(cells[index - 1]) >= String(cell))) return fail("células liberadas")
  return root as RiscoIdentidadePinado
}
const DECISOES = ["publicar", "manter_oculto", "sem_mudanca"] as const
export type DecisaoIdentidade = typeof DECISOES[number]
export type LinhaTseChave = { ano: number; uf: string; municipio: string | null; sq: string }
export type LinhaDecidida = LinhaTseChave & { decisao: DecisaoIdentidade }
export type CelulaIdentidade = { lote: string; slug: string; familia: FamiliaCelula; decisao: DecisaoIdentidade; linhas: LinhaDecidida[] }
export type DecisoesIdentidadeCelulas = { schema_version: 1; kind: "tse-identidade-celulas"; celulas: CelulaIdentidade[] }
/** Evidência que o dry-run mede: âncora 2026 do seed e linhas TSE que o coletor ligou à pessoa. `null` = sem identidade ancorada. */
export type EvidenciaIdentidade = { ancoras_2026: Record<string, LinhaTseChave | null>; historico: Record<string, LinhaTseChave[] | null> }

/** Último ano em que o SQ se repete dentro do país. */
export const ULTIMO_ANO_SQ_NAO_UNICO = 2008
const FONTE_FAMILIA: Record<string, FamiliaCelula> = { "tse-financiamento": "financiamento", "tse-patrimonio": "patrimonio", "tse-historico": "historico_politico" }

export function normalizarUe(value: unknown): string {
  return typeof value === "string" ? stripAccents(value).trim().replace(/\s+/g, " ").toUpperCase() : ""
}

/** Chave canônica da linha; null quando falta o que a torna única (fail-closed). */
export function chaveLinhaTse(linha: LinhaTseChave): string | null {
  const uf = normalizarUe(linha.uf)
  const sq = typeof linha.sq === "string" ? linha.sq.trim() : ""
  if (!Number.isInteger(linha.ano) || !/^[A-Z]{2}$/.test(uf) || !/^\d{1,20}$/.test(sq)) return null
  if (linha.ano > ULTIMO_ANO_SQ_NAO_UNICO) return `${linha.ano}|${uf}|*|${sq}`
  const municipio = normalizarUe(linha.municipio)
  return municipio ? `${linha.ano}|${uf}|${municipio}|${sq}` : null
}

function cpfDigitosConferem(cpf: string): boolean {
  const digito = (corpo: string) => {
    const soma = [...corpo].reduce((total, char, index) => total + Number(char) * (corpo.length + 1 - index), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10])
}

/**
 * CPF do pacote TSE. Com 11 dígitos, mantém a regra antiga. Alguns anos (2012)
 * exportam o CPF como número e perdem os zeros à esquerda: com 8 a 10 dígitos,
 * os zeros voltam só se o dígito verificador fechar. Máscaras (-1, -3, -4) e
 * sequências repetidas viram null.
 */
export function normalizarCpfTse(value: unknown): string | null {
  const raw = (typeof value === "string" ? value : typeof value === "number" && Number.isInteger(value) ? String(value) : "").trim().replace(/\D/g, "")
  if (/^\d{11}$/.test(raw)) return /^(\d)\1{10}$/.test(raw) ? null : raw
  if (!/^\d{8,10}$/.test(raw)) return null
  const cpf = raw.padStart(11, "0")
  return !/^(\d)\1{10}$/.test(cpf) && cpfDigitosConferem(cpf) ? cpf : null
}

export function chaveCelula(slug: string, familia: FamiliaCelula): string {
  return `${slug}|${familia}`
}

export function familiaDaFonte(fonte: unknown): FamiliaCelula | null {
  return typeof fonte === "string" ? FONTE_FAMILIA[fonte] ?? null : null
}

/** Recibo continua fora do coleta_log se o perfil está em risco e a célula dele não foi liberada. */
export function reciboBloqueadoPorIdentidade(recibo: { alvo?: unknown; fonte?: unknown }, riskSlugs: ReadonlySet<string>, liberadas: ReadonlySet<string>): boolean {
  const alvo = String(recibo.alvo ?? "")
  if (!riskSlugs.has(alvo)) return false
  const familia = familiaDaFonte(recibo.fonte)
  return !familia || !liberadas.has(chaveCelula(alvo, familia))
}

export function parseDecisoesIdentidadeCelulas(value: Uint8Array | string): DecisoesIdentidadeCelulas {
  const fail = (motivo: string): never => { throw new Error(`decisões de identidade por célula inválidas: ${motivo}`) }
  let parsed: unknown
  try { parsed = JSON.parse(typeof value === "string" ? value : new TextDecoder().decode(value)) } catch { return fail("JSON") }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("raiz")
  const root = parsed as Record<string, unknown>
  if (Object.keys(root).sort().join(",") !== "celulas,kind,schema_version" || root.schema_version !== 1 || root.kind !== "tse-identidade-celulas" || !Array.isArray(root.celulas)) return fail("cabeçalho")
  const vistas = new Set<string>()
  const celulas = root.celulas.map((entry, index): CelulaIdentidade => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail(`célula ${index}`)
    const row = entry as Record<string, unknown>
    if (Object.keys(row).sort().join(",") !== "decisao,familia,linhas,lote,slug") return fail(`campos da célula ${index}`)
    if (typeof row.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(row.slug)) return fail(`slug da célula ${index}`)
    if (typeof row.lote !== "string" || !row.lote.trim()) return fail(`lote da célula ${index}`)
    if (!FAMILIAS_CELULA.includes(row.familia as FamiliaCelula) || !DECISOES.includes(row.decisao as DecisaoIdentidade) || !Array.isArray(row.linhas)) return fail(`célula ${row.slug}`)
    const familia = row.familia as FamiliaCelula
    const chave = chaveCelula(row.slug, familia)
    if (vistas.has(chave)) return fail(`célula repetida ${chave}`)
    vistas.add(chave)
    const chavesLinha = new Set<string>()
    const linhas = row.linhas.map((item): LinhaDecidida => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail(`linha de ${chave}`)
      const linha = item as Record<string, unknown>
      if (Object.keys(linha).sort().join(",") !== "ano,decisao,municipio,sq,uf") return fail(`campos da linha de ${chave}`)
      if (typeof linha.uf !== "string" || typeof linha.sq !== "string" || (linha.municipio !== null && typeof linha.municipio !== "string")
        || !DECISOES.includes(linha.decisao as DecisaoIdentidade)) return fail(`linha de ${chave}`)
      const decidida = linha as unknown as LinhaDecidida
      const key = chaveLinhaTse(decidida)
      if (!key) return fail(`linha sem chave única em ${chave} (${decidida.ano})`)
      if (chavesLinha.has(key)) return fail(`linha repetida em ${chave}`)
      chavesLinha.add(key)
      return decidida
    })
    if (familia !== "historico_politico" && row.decisao === "publicar"
      && (linhas.length !== 1 || linhas[0]!.ano !== 2026 || linhas[0]!.decisao !== "publicar")) return fail(`${chave} precisa de uma âncora 2026 aprovada`)
    if (row.decisao !== "publicar" && linhas.some((linha) => linha.decisao === "publicar")) return fail(`${chave} fechada com linha aprovada`)
    return { lote: row.lote, slug: row.slug, familia, decisao: row.decisao as DecisaoIdentidade, linhas }
  })
  return { schema_version: 1, kind: "tse-identidade-celulas", celulas }
}

/**
 * Libera só células de perfis em risco cuja decisão é `publicar` e cuja
 * evidência medida casa, linha a linha, com as linhas aprovadas. Qualquer
 * linha medida sem chave, não aprovada ou marcada para ficar oculta mantém a
 * célula fechada, assim como perfil sem identidade ancorada.
 */
export function celulasLiberadas(decisoes: DecisoesIdentidadeCelulas, evidencia: EvidenciaIdentidade, riskSlugs: ReadonlySet<string>): { liberadas: Set<string>; fechadas: Record<string, string> } {
  const liberadas = new Set<string>()
  const fechadas: Record<string, string> = {}
  for (const celula of decisoes.celulas) {
    if (!riskSlugs.has(celula.slug)) continue
    const chave = chaveCelula(celula.slug, celula.familia)
    if (celula.decisao !== "publicar") { fechadas[chave] = `decisao_${celula.decisao}`; continue }
    const medidas = celula.familia === "historico_politico"
      ? evidencia.historico[celula.slug] ?? null
      : evidencia.ancoras_2026[celula.slug] ? [evidencia.ancoras_2026[celula.slug]!] : null
    if (!medidas) { fechadas[chave] = "sem_identidade_ancorada"; continue }
    const decididas = new Map(celula.linhas.map((linha) => [chaveLinhaTse(linha)!, linha.decisao]))
    const chaves = medidas.map(chaveLinhaTse)
    if (chaves.some((key) => key === null)) { fechadas[chave] = "linha_medida_sem_chave_unica"; continue }
    const decisaoDe = chaves.map((key) => decididas.get(key!))
    if (decisaoDe.some((decisao) => decisao === "manter_oculto")) { fechadas[chave] = "linha_mantida_oculta"; continue }
    if (decisaoDe.some((decisao) => decisao !== "publicar")) { fechadas[chave] = "linha_nao_aprovada"; continue }
    if (celula.familia !== "historico_politico" && chaves.length !== 1) { fechadas[chave] = "ancora_ambigua"; continue }
    liberadas.add(chave)
  }
  return { liberadas, fechadas }
}
