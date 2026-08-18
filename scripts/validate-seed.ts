/**
 * Valida `data/candidatos.json` contra o contrato de `CandidatoConfig` (`scripts/lib/types.ts`)
 * e invariantes operacionais (slugs unicos, enum de cargo, estado para Governador,
 * colisao de nome_urna normalizado bloqueada por allowlist explicita).
 *
 * Uso: npm run validate:seed
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { normalizeForMatch } from "./lib/normalize-for-match"
import {
  carregarIdentidadeEtapa2,
  conferirSeedContraEtapa2,
  type CandidatoDoSeed,
} from "./lib/identidade-etapa2"
import type { CandidatoConfig } from "./lib/types"

const CARGO_VALUES = new Set<CandidatoConfig["cargo_disputado"]>([
  "Presidente",
  "Governador",
  "Vice-Governador",
  "Senador",
  "Deputado Federal",
  "Nenhum",
])

const SEED_PATH = resolve(process.cwd(), "data/candidatos.json")

/**
 * Fase 14.7 (2026-04-14): homonym prevention proativa.
 *
 * Cada entrada e uma tupla de slugs que tem permissao explicita de compartilhar
 * nome_urna normalizado. Casos historicos: mesma pessoa concorrendo a dois
 * cargos distintos ate o pleito formal comecar em agosto/2026 (ex: Ciro Gomes
 * como Presidente E como Governador CE ao mesmo tempo, ate o TSE decidir qual
 * cargo ele de fato disputa).
 *
 * Qualquer nova colisao fora dessa allowlist bloqueia validate:seed com erro
 * explicito. Adicionar uma tupla nova aqui exige decisao consciente de
 * curadoria: a pergunta pra se fazer e "sao mesma pessoa em 2 cargos, ou sao
 * homonimos que precisam desambiguar via cargo/UF/SQ explicito?". Homonimos
 * nao entram na allowlist; eles precisam de seed disambiguation (ex: UF
 * explicita, SQ manual).
 */
export const ALLOWED_NAME_COLLISION_GROUPS: ReadonlyArray<readonly string[]> = [
  ["ciro-gomes", "ciro-gomes-gov-ce"],
]

export interface NameCollisionViolation {
  normalized: string
  slugs: string[]
}

export interface DuplicateSqViolation {
  ano: string
  sq: string
  slugs: string[]
}

export interface DuplicateHouseIdViolation {
  id: number
  slugs: string[]
}

/**
 * Pure function para testabilidade. Detecta slugs que compartilham nome_urna
 * normalizado sem estarem em allowedGroups. Retorna violacoes como array,
 * vazio se nenhuma.
 */
export function detectNameUrnaCollisions(
  entries: ReadonlyArray<{ slug: string; nome_urna: string }>,
  allowedGroups: ReadonlyArray<readonly string[]> = ALLOWED_NAME_COLLISION_GROUPS
): NameCollisionViolation[] {
  const byNormalized = new Map<string, string[]>()
  for (const entry of entries) {
    const norm = normalizeForMatch(entry.nome_urna || "")
    if (!norm) continue
    const slugs = byNormalized.get(norm) ?? []
    if (!slugs.includes(entry.slug)) slugs.push(entry.slug)
    byNormalized.set(norm, slugs)
  }
  const allowedKeys = new Set(allowedGroups.map((group) => [...group].sort().join("|")))
  const violations: NameCollisionViolation[] = []
  for (const [name, slugs] of byNormalized) {
    if (slugs.length < 2) continue
    const sortedSlugs = [...slugs].sort()
    const key = sortedSlugs.join("|")
    if (allowedKeys.has(key)) continue
    violations.push({ normalized: name, slugs: sortedSlugs })
  }
  violations.sort((a, b) => a.normalized.localeCompare(b.normalized))
  return violations
}

/**
 * Fase 14.7 extension (2026-04-14): detecta slugs que compartilham o mesmo
 * tse_sq_candidato[ano]. Descoberta durante investigacao de 14.5: o seed
 * tinha 130002114686 duplicado entre `evandro-augusto` e `gabriel-azevedo`,
 * ambos apontando pra um vereador de Guaxupe MG sem relacao com nenhum dos
 * dois. Duplicate SQ sem allowlist e bug de seed (copy-paste ou heuristica
 * de name match escolhendo o mesmo SQ errado pra slugs diferentes).
 *
 * Reaproveita ALLOWED_NAME_COLLISION_GROUPS porque "mesma pessoa em 2 cargos"
 * legitimamente compartilha SQs historicos (ciro-gomes + ciro-gomes-gov-ce
 * compartilham SQ 2022 porque e a mesma pessoa).
 */
export function detectDuplicateSqCandidato(
  entries: ReadonlyArray<{ slug: string; ids: { tse_sq_candidato: Record<string, string> } }>,
  allowedGroups: ReadonlyArray<readonly string[]> = ALLOWED_NAME_COLLISION_GROUPS
): DuplicateSqViolation[] {
  const bySqKey = new Map<string, { ano: string; sq: string; slugs: string[] }>()
  for (const entry of entries) {
    const sqs = entry.ids?.tse_sq_candidato ?? {}
    for (const [ano, sq] of Object.entries(sqs)) {
      if (!sq) continue
      const key = `${ano}:${sq}`
      const bucket = bySqKey.get(key) ?? { ano, sq, slugs: [] }
      if (!bucket.slugs.includes(entry.slug)) bucket.slugs.push(entry.slug)
      bySqKey.set(key, bucket)
    }
  }
  const allowedKeys = new Set(allowedGroups.map((group) => [...group].sort().join("|")))
  const violations: DuplicateSqViolation[] = []
  for (const bucket of bySqKey.values()) {
    if (bucket.slugs.length < 2) continue
    const sortedSlugs = [...bucket.slugs].sort()
    const key = sortedSlugs.join("|")
    if (allowedKeys.has(key)) continue
    violations.push({ ano: bucket.ano, sq: bucket.sq, slugs: sortedSlugs })
  }
  violations.sort((a, b) => (a.ano === b.ano ? a.sq.localeCompare(b.sq) : a.ano.localeCompare(b.ano)))
  return violations
}

/**
 * Fase 2.2 (2026-04-16): detecta slugs que compartilham o mesmo `ids.camara`.
 *
 * Descoberta durante auditoria read-only de 2026-04-16: o unico duplicate
 * conhecido na coorte atual e 141406 em ciro-gomes + ciro-gomes-gov-ce
 * (mesma pessoa concorrendo a Presidente e Governador CE). Esse par ja esta
 * em ALLOWED_NAME_COLLISION_GROUPS por conta de colisao de nome_urna e SQ;
 * reaproveitar a mesma allowlist mantem o contrato consistente: "mesma
 * pessoa em 2 cargos legitimamente compartilha IDs historicos de mandato".
 *
 * Qualquer nova duplicidade fora dessa tupla indica copy-paste de seed ou
 * ID colado errado entre slugs diferentes (vetor de contaminacao de perfil).
 */
export function detectDuplicateCamaraIds(
  entries: ReadonlyArray<{ slug: string; ids: { camara: number | null } }>,
  allowedGroups: ReadonlyArray<readonly string[]> = ALLOWED_NAME_COLLISION_GROUPS
): DuplicateHouseIdViolation[] {
  return detectDuplicateHouseIds(
    entries.map((e) => ({ slug: e.slug, id: e.ids?.camara ?? null })),
    allowedGroups
  )
}

/**
 * Fase 2.2 (2026-04-16): detecta slugs que compartilham o mesmo `ids.senado`.
 * Mesmo racional de `detectDuplicateCamaraIds`. Na coorte de 2026-04-16 nao
 * ha duplicate senado conhecido; a regra existe para prevenir regressao
 * silenciosa em adicoes futuras.
 */
export function detectDuplicateSenadoIds(
  entries: ReadonlyArray<{ slug: string; ids: { senado: number | null } }>,
  allowedGroups: ReadonlyArray<readonly string[]> = ALLOWED_NAME_COLLISION_GROUPS
): DuplicateHouseIdViolation[] {
  return detectDuplicateHouseIds(
    entries.map((e) => ({ slug: e.slug, id: e.ids?.senado ?? null })),
    allowedGroups
  )
}

/**
 * Helper interno compartilhado entre detectDuplicateCamaraIds e
 * detectDuplicateSenadoIds. Ids null/undefined sao ignorados (seed aceita
 * `ids.camara: null` e `ids.senado: null` para slugs que nao exercem cargo
 * federal daquele tipo).
 */
function detectDuplicateHouseIds(
  entries: ReadonlyArray<{ slug: string; id: number | null }>,
  allowedGroups: ReadonlyArray<readonly string[]>
): DuplicateHouseIdViolation[] {
  const byId = new Map<number, string[]>()
  for (const entry of entries) {
    if (entry.id == null) continue
    const slugs = byId.get(entry.id) ?? []
    if (!slugs.includes(entry.slug)) slugs.push(entry.slug)
    byId.set(entry.id, slugs)
  }
  const allowedKeys = new Set(allowedGroups.map((group) => [...group].sort().join("|")))
  const violations: DuplicateHouseIdViolation[] = []
  for (const [id, slugs] of byId) {
    if (slugs.length < 2) continue
    const sortedSlugs = [...slugs].sort()
    const key = sortedSlugs.join("|")
    if (allowedKeys.has(key)) continue
    violations.push({ id, slugs: sortedSlugs })
  }
  violations.sort((a, b) => a.id - b.id)
  return violations
}

function fail(msg: string): never {
  console.error(`validate-seed: ${msg}`)
  process.exit(1)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function validateEntry(raw: unknown, index: number): void {
  const prefix = `[${index}]`
  if (!isRecord(raw)) fail(`${prefix} entrada deve ser um objeto`)

  const slug = raw.slug
  const nome_completo = raw.nome_completo
  const nome_urna = raw.nome_urna
  const cargo_disputado = raw.cargo_disputado
  const ids = raw.ids

  if (typeof slug !== "string" || slug.trim() === "") fail(`${prefix} slug inválido`)
  if (typeof nome_completo !== "string" || nome_completo.trim() === "") {
    fail(`${prefix} nome_completo obrigatório`)
  }
  if (typeof nome_urna !== "string" || nome_urna.trim() === "") fail(`${prefix} nome_urna obrigatório`)
  if (typeof cargo_disputado !== "string" || !CARGO_VALUES.has(cargo_disputado as CandidatoConfig["cargo_disputado"])) {
    fail(`${prefix} cargo_disputado inválido: ${String(cargo_disputado)}`)
  }

  if (cargo_disputado === "Governador") {
    const est = raw.estado
    if (typeof est !== "string" || est.trim() === "") {
      fail(`${prefix} estado obrigatório quando cargo_disputado é Governador (slug=${slug})`)
    }
  }

  if (raw.wikipedia_title !== undefined && typeof raw.wikipedia_title !== "string") {
    fail(`${prefix} wikipedia_title deve ser string quando presente`)
  }
  if (raw.estado !== undefined && typeof raw.estado !== "string") {
    fail(`${prefix} estado deve ser string quando presente`)
  }

  if (!isRecord(ids)) fail(`${prefix} ids obrigatório (objeto)`)

  const camara = ids.camara
  const senado = ids.senado
  const tse_sq = ids.tse_sq_candidato

  if (camara !== null && typeof camara !== "number") fail(`${prefix} ids.camara deve ser number ou null`)
  if (senado !== null && typeof senado !== "number") fail(`${prefix} ids.senado deve ser number ou null`)
  if (!isRecord(tse_sq)) fail(`${prefix} ids.tse_sq_candidato deve ser um objeto`)

  for (const [ano, sq] of Object.entries(tse_sq)) {
    if (!/^\d{4}$/.test(ano)) {
      fail(`${prefix} chave de ano inválida em tse_sq_candidato: ${ano}`)
    }
    if (typeof sq !== "string" || sq.trim() === "") {
      fail(`${prefix} tse_sq_candidato[${ano}] deve ser string não vazia`)
    }
  }

  /**
   * UF da candidatura por ano, opcional. Existe porque o SQ_CANDIDATO anterior
   * a 2010 é sequencial POR UF e colide entre estados: sem a UF daquele ano, um
   * SQ pré-2010 casa linha de gente diferente. `estado` não resolve, porque é a
   * UF atual do candidato e é nulo para quem concorre a Presidente.
   */
  const tse_uf = ids.tse_uf_candidatura
  if (tse_uf !== undefined && tse_uf !== null) {
    if (!isRecord(tse_uf)) fail(`${prefix} ids.tse_uf_candidatura deve ser um objeto`)
    for (const [ano, uf] of Object.entries(tse_uf)) {
      if (!/^\d{4}$/.test(ano)) {
        fail(`${prefix} chave de ano inválida em tse_uf_candidatura: ${ano}`)
      }
      if (typeof uf !== "string" || !/^[A-Z]{2}$/.test(uf)) {
        fail(`${prefix} tse_uf_candidatura[${ano}] deve ser sigla de UF com 2 letras maiúsculas`)
      }
      if (!(ano in tse_sq)) {
        fail(
          `${prefix} tse_uf_candidatura[${ano}] sem tse_sq_candidato[${ano}]: a UF só desambigua um SQ que exista`,
        )
      }
    }
  }
}

function main() {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(SEED_PATH, "utf-8"))
  } catch (e) {
    fail(`não foi possível ler ou fazer parse de ${SEED_PATH}: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!Array.isArray(parsed)) fail("raiz do JSON deve ser um array")

  const slugs = new Map<string, number>()
  for (let i = 0; i < parsed.length; i++) {
    validateEntry(parsed[i], i)
    const s = (parsed[i] as { slug: string }).slug
    if (slugs.has(s)) {
      fail(`slug duplicado "${s}" nas entradas [${slugs.get(s)}] e [${i}]`)
    }
    slugs.set(s, i)
  }

  // Fase 14.7: bloquear colisao de nome_urna normalizado, exceto allowlist.
  const entriesForCollision = (parsed as Array<{ slug: string; nome_urna: string }>).map((entry) => ({
    slug: entry.slug,
    nome_urna: entry.nome_urna,
  }))
  const nameViolations = detectNameUrnaCollisions(entriesForCollision)
  if (nameViolations.length > 0) {
    const lines = nameViolations.map((v) => `  - "${v.normalized}": [${v.slugs.join(", ")}]`).join("\n")
    fail(
      `colisao de nome_urna normalizado detectada na coorte:\n${lines}\n\n` +
        `Cada linha acima mostra slugs da coorte que compartilham o mesmo nome_urna normalizado. ` +
        `Isso quebra matching por nome no resolver TSE e e vetor de contaminacao por homonimo.\n\n` +
        `Como resolver:\n` +
        `  1. Se sao a MESMA pessoa disputando 2 cargos distintos (ex: Presidente + Governador), ` +
        `adicione a tupla ordenada em ALLOWED_NAME_COLLISION_GROUPS dentro de scripts/validate-seed.ts.\n` +
        `  2. Se sao HOMONIMOS (pessoas diferentes com mesmo nome), nao entrem na allowlist. ` +
        `Em vez disso, garanta que cada slug tem 'estado' explicito ou 'ids.tse_sq_candidato[ano]' ` +
        `preenchido para todos os anos relevantes, para que o resolver matche por UF ou SQ em vez de nome.`
    )
  }

  // Fase 14.7 extension: bloquear duplicate tse_sq_candidato[ano] cross-slug.
  const entriesForSq = parsed as Array<{
    slug: string
    ids: { tse_sq_candidato: Record<string, string> }
  }>
  const sqViolations = detectDuplicateSqCandidato(entriesForSq)
  if (sqViolations.length > 0) {
    const lines = sqViolations
      .map((v) => `  - [${v.ano}] SQ ${v.sq} -> [${v.slugs.join(", ")}]`)
      .join("\n")
    fail(
      `duplicate tse_sq_candidato detectado cross-slug:\n${lines}\n\n` +
        `Dois ou mais slugs da coorte apontam para o mesmo SQ_CANDIDATO do TSE no mesmo ano. ` +
        `Isso e normalmente copy-paste de seed ou heuristica de name-match apontando pro mesmo ` +
        `registro errado pra slugs diferentes. Quando o ingest roda, o resolver matcha a mesma ` +
        `linha do CSV pra slugs diferentes (ordem de iteracao do Map define quem vence), ` +
        `contaminando um dos dois com dados do outro.\n\n` +
        `Como resolver:\n` +
        `  1. Se sao a MESMA pessoa disputando 2 cargos (ex: Presidente + Governador), ` +
        `adicione a tupla ordenada em ALLOWED_NAME_COLLISION_GROUPS.\n` +
        `  2. Caso contrario, descubra qual e o SQ correto pra cada slug (via curadoria) ` +
        `e corrija no seed. Se nao houver SQ correto conhecido, remova a entrada errada ` +
        `(seed aceita 'tse_sq_candidato: {}').`
    )
  }

  // Etapa 2 da re-verificacao (09/08/2026): o seed nao pode materializar
  // candidatura TSE 2026 para slug cuja identidade a etapa 2 NAO confirmou.
  //
  // Esta e a checagem de POS-CONDICAO, e e de proposito mais forte que uma
  // varredura do codigo escritor: ela nao depende de COMO o valor chegou aqui.
  // `data/identidade-etapa2-2026.json` classificou 71 dos slugs do seed, e so
  // `match_fresco` (12) promove chave. Das 59 bloqueadas, 16 trazem SQ dentro de
  // `hits[]` apenas como EVIDENCIA para revisao humana; as outras 43 nao tem
  // hit nenhum.
  const violacoesEtapa2 = conferirSeedContraEtapa2(
    parsed as CandidatoDoSeed[],
    carregarIdentidadeEtapa2(),
  )
  if (violacoesEtapa2.length > 0) {
    const lines = violacoesEtapa2
      .map((v) => `  - [${v.tipo}] ${v.slug} (${v.classe}) ano ${v.ano}, SQ ${v.sq}: ${v.detalhe}`)
      .join("\n")
    fail(
      `identidade da etapa 2 violada pelo seed:\n${lines}\n\n` +
        `SQ_CANDIDATO confirmado e a chave eleitoral de persistencia ` +
        `(Settings/EXPECTED_BEHAVIOR.md). Nome igual ou parecido nunca autoriza merge, ` +
        `e evidencia em hits[] nao e confirmacao de identidade.\n\n` +
        `Como resolver:\n` +
        `  1. Se a identidade foi confirmada por chave independente depois de 09/08, ` +
        `regenere o registro com \`npm run data:identidade-etapa2:gerar\` sobre um snapshot ` +
        `novo do TSE e registre a decisao.\n` +
        `  2. Caso contrario, remova o SQ do seed. Os 43 nao localizados exigem recheque ` +
        `do TSE posterior a 15/08/2026, quando a janela de pedidos de registro fecha.`
    )
  }

  // Fase 2.2 (2026-04-16): bloquear duplicate ids.camara cross-slug, exceto allowlist.
  const entriesForCamara = parsed as Array<{ slug: string; ids: { camara: number | null } }>
  const camaraViolations = detectDuplicateCamaraIds(entriesForCamara)
  if (camaraViolations.length > 0) {
    const lines = camaraViolations
      .map((v) => `  - ids.camara ${v.id} -> [${v.slugs.join(", ")}]`)
      .join("\n")
    fail(
      `duplicate ids.camara detectado cross-slug:\n${lines}\n\n` +
        `Dois ou mais slugs da coorte apontam para o mesmo ID de deputado federal. ` +
        `Isso indica copy-paste de seed ou ID colado errado entre slugs diferentes. ` +
        `Enriquecimento por API da Camara puxa os dados da mesma pessoa para todos os slugs ` +
        `envolvidos, contaminando perfis.\n\n` +
        `Como resolver:\n` +
        `  1. Se sao a MESMA pessoa disputando 2 cargos (ex: Presidente + Governador), ` +
        `adicione a tupla ordenada em ALLOWED_NAME_COLLISION_GROUPS dentro de scripts/validate-seed.ts.\n` +
        `  2. Caso contrario, descubra o ID correto de cada slug na API da Camara ` +
        `(dadosabertos.camara.leg.br/api/v2/deputados) e corrija no seed. ` +
        `Se nao houver ID correto conhecido, use 'ids.camara: null'.`
    )
  }

  // Fase 2.2 (2026-04-16): bloquear duplicate ids.senado cross-slug, exceto allowlist.
  const entriesForSenado = parsed as Array<{ slug: string; ids: { senado: number | null } }>
  const senadoViolations = detectDuplicateSenadoIds(entriesForSenado)
  if (senadoViolations.length > 0) {
    const lines = senadoViolations
      .map((v) => `  - ids.senado ${v.id} -> [${v.slugs.join(", ")}]`)
      .join("\n")
    fail(
      `duplicate ids.senado detectado cross-slug:\n${lines}\n\n` +
        `Dois ou mais slugs da coorte apontam para o mesmo ID de senador. ` +
        `Mesmo risco que duplicate ids.camara: enriquecimento por API do Senado ` +
        `contamina perfis de pessoas diferentes com dados da mesma pessoa.\n\n` +
        `Como resolver:\n` +
        `  1. Se sao a MESMA pessoa disputando 2 cargos (ex: Presidente + Senador), ` +
        `adicione a tupla ordenada em ALLOWED_NAME_COLLISION_GROUPS dentro de scripts/validate-seed.ts.\n` +
        `  2. Caso contrario, descubra o ID correto de cada slug no legis.senado.leg.br ` +
        `e corrija no seed. Se nao houver ID correto conhecido, use 'ids.senado: null'.`
    )
  }

  console.log(`validate-seed: OK (${parsed.length} candidatos em ${SEED_PATH})`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
