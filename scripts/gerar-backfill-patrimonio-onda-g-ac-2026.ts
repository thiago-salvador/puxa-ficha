/**
 * Recalcula e gera o backfill de patrimônio dos seis candidatos a governador
 * do Acre registrados no TSE em 15/08/2026.
 *
 * O ZIP oficial é lido inteiro. Cinco SQs têm bens; Dr. Luisinho tem zero
 * linhas em 2026. A ausência de 2020 usa o SQ eleitoral confirmado no
 * `consulta_cand_2020` e o SHA do pacote `bem_candidato_2020`, também lido de
 * ponta a ponta com zero linhas para o SQ.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"

import { dedupeTsePatrimonioRows } from "../src/lib/tse-patrimonio-dedupe"
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"
import { sanitizePublicText } from "../src/lib/public-text"
import { parseCSV } from "./lib/parse-csv-local"

const SNAPSHOT = "2026-08-15 16:35 BRT"
const GERACAO_CSV = "15/08/2026 16:30:08"
const VERIFICADO_EM = "2026-08-16T03:59:31Z"
const FONTE_2026 =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"
const SHA_2026 = "960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1"
const FONTE_2020 =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip"
const SHA_2020 = "04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74"
const SQ_LUISINHO_2020 = "40000972144"
const WORK = resolve(process.cwd(), ".tmp/patrimonio-onda-g-ac-2026")
const ZIP_LOCAL = resolve(process.cwd(), "data/tse/bem_candidato_2026.zip")
const ZIP_TEMP = resolve(WORK, "bem_candidato_2026.zip")
const OUT = resolve(
  process.cwd(),
  "supabase/migrations/20260816010000_backfill_patrimonio_onda_g_ac_2026.sql",
)

interface CandidatoComBens {
  slug: string
  sq: string
  totalCentavos: number
  nBens: number
}

const COM_BENS: readonly CandidatoComBens[] = [
  { slug: "alan-rick", sq: "10002532492", totalCentavos: 524_456_772, nBens: 25 },
  { slug: "thor-dantas", sq: "10002550719", totalCentavos: 76_146_279, nBens: 27 },
  { slug: "eudo-raffael", sq: "10002549500", totalCentavos: 16_500_000, nBens: 2 },
  { slug: "mailza-assis", sq: "10002544107", totalCentavos: 16_748_291, nBens: 5 },
  { slug: "tiao-bocalom", sq: "10002544015", totalCentavos: 121_650_000, nBens: 7 },
] as const

const DR_LUISINHO_2026 = {
  slug: "dr-luisinho",
  sq: "10002533539",
  nBens: 0,
} as const

interface BemLido {
  slug: string
  sourceKey: string
  ordem: string
  tipo: string
  descricao: string
  valor: number
  geracao: string
}

function parseBRL(value: string): number {
  return Number((value || "0").trim().replace(/\./g, "").replace(",", "."))
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function centavosParaSql(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100)
  return `${inteiro}.${String(centavos % 100).padStart(2, "0")}`
}

async function obterZip(): Promise<string> {
  if (existsSync(ZIP_LOCAL)) return ZIP_LOCAL
  mkdirSync(WORK, { recursive: true })
  const resposta = await fetch(FONTE_2026, { signal: AbortSignal.timeout(120_000) })
  if (!resposta.ok) throw new Error(`download do ZIP 2026 falhou: HTTP ${resposta.status}`)
  const bytes = Buffer.from(await resposta.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error("download do ZIP 2026 veio vazio")
  writeFileSync(ZIP_TEMP, bytes)
  return ZIP_TEMP
}

function validarHash(zipPath: string): void {
  const hash = createHash("sha256").update(readFileSync(zipPath)).digest("hex")
  if (hash !== SHA_2026) {
    throw new Error(`ZIP 2026 divergente: sha256 ${hash}, esperado ${SHA_2026}`)
  }
}

function extrairZip(zipPath: string): string[] {
  const destino = resolve(WORK, "csv")
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destino])
  return readdirSync(destino)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort()
    .map((name) => resolve(destino, name))
}

async function lerBens(zipPath: string): Promise<Map<string, BemLido[]>> {
  const alvos = new Map(
    [...COM_BENS, DR_LUISINHO_2026].map((candidato) => [candidato.sq, candidato]),
  )
  const rowsPorSq = new Map<string, BemLido[]>()

  for (const csvPath of extrairZip(zipPath)) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      const candidato = alvos.get(sq)
      if (!candidato) return
      const rows = rowsPorSq.get(sq) ?? []
      rows.push({
        slug: candidato.slug,
        sourceKey: csvPath,
        ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
        tipo: row.DS_TIPO_BEM_CANDIDATO || "",
        descricao: row.DS_BEM_CANDIDATO || "",
        valor: parseBRL(row.VR_BEM_CANDIDATO || "0"),
        geracao: `${row.DT_GERACAO || ""} ${row.HH_GERACAO || ""}`.trim(),
      })
      rowsPorSq.set(sq, rows)
    })
  }
  return rowsPorSq
}

function ordenarBens(rows: BemLido[]): BemLido[] {
  return [...rows].sort((a, b) => {
    const ordem = Number(a.ordem) - Number(b.ordem)
    if (ordem !== 0) return ordem
    return `${a.tipo}|${a.descricao}|${a.valor}`.localeCompare(
      `${b.tipo}|${b.descricao}|${b.valor}`,
      "pt-BR",
    )
  })
}

function validarEPreparar(rowsPorSq: Map<string, BemLido[]>): Map<string, BemLido[]> {
  const divergencias: string[] = []
  const validados = new Map<string, BemLido[]>()

  for (const candidato of COM_BENS) {
    const bens = ordenarBens(dedupeTsePatrimonioRows(rowsPorSq.get(candidato.sq) ?? []))
    const totalCentavos = bens.reduce(
      (total, bem) => total + Math.round(bem.valor * 100),
      0,
    )
    const geracoes = new Set(bens.map((bem) => bem.geracao))
    if (totalCentavos !== candidato.totalCentavos) {
      divergencias.push(`${candidato.slug}: total ${totalCentavos} != ${candidato.totalCentavos}`)
    }
    if (bens.length !== candidato.nBens) {
      divergencias.push(`${candidato.slug}: ${bens.length} bens != ${candidato.nBens}`)
    }
    if (geracoes.size !== 1 || !geracoes.has(GERACAO_CSV)) {
      divergencias.push(`${candidato.slug}: geração ${[...geracoes].join(", ") || "ausente"}`)
    }
    validados.set(candidato.sq, bens)
  }

  const bensLuisinho = dedupeTsePatrimonioRows(rowsPorSq.get(DR_LUISINHO_2026.sq) ?? [])
  if (bensLuisinho.length !== 0) {
    divergencias.push(`dr-luisinho: esperado zero linhas, vieram ${bensLuisinho.length}`)
  }

  if (divergencias.length > 0) {
    throw new Error(`DIVERGÊNCIAS CONTRA O ZIP OFICIAL:\n - ${divergencias.join("\n - ")}`)
  }
  return validados
}

function fontePatrimonio(candidato: CandidatoComBens): string {
  return `TSE Dados Abertos bem_candidato_2026 SQ ${candidato.sq} (total agregado, snapshot ${SNAPSHOT}; CSV gerado ${GERACAO_CSV} BRT; SHA-256 ${SHA_2026}; ${FONTE_2026})`
}

function gerarSql(bensPorSq: Map<string, BemLido[]>): string {
  const coorte = [...COM_BENS.map(({ slug }) => slug), DR_LUISINHO_2026.slug]
  const slugs = coorte.map(sqlLiteral).join(", ")
  const insertsPatrimonio = COM_BENS.map((candidato) => {
    const bens = (bensPorSq.get(candidato.sq) ?? []).map((bem) => ({
      tipo: bem.tipo,
      descricao: maskDocumentLikeSequences(sanitizePublicText(bem.descricao)),
      valor: bem.valor,
    }))
    const json = JSON.stringify(bens).replace(/'/g, "''")
    return `-- @write tabela=patrimonio slug=${candidato.slug} ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, ${centavosParaSql(candidato.totalCentavos)}, '${json}'::jsonb, ${sqlLiteral(fontePatrimonio(candidato))}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(candidato.slug)}
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN (${slugs})) = ${coorte.length}
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);`
  }).join("\n\n")

  const expectedPatrimonio = COM_BENS.map(
    (candidato) =>
      `    (${sqlLiteral(candidato.slug)}, ${centavosParaSql(candidato.totalCentavos)}::numeric, ${candidato.nBens}, ${sqlLiteral(fontePatrimonio(candidato))})`,
  ).join(",\n")

  const detalhe2026 =
    `Pacote oficial bem_candidato_2026 do TSE lido de ponta a ponta sem bens para o SQ ${DR_LUISINHO_2026.sq}; snapshot ${SNAPSHOT}; SHA-256 ${SHA_2026}.`
  const detalhe2020 =
    `Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para o SQ ${SQ_LUISINHO_2020}; SHA-256 ${SHA_2020}.`

  return `-- P-AC-POS-REGISTRO: patrimônio 2026 dos seis candidatos do Acre.
-- Fonte 2026: ${FONTE_2026}
-- SHA-256 2026: ${SHA_2026}; Last-Modified Sat, 15 Aug 2026 19:33:34 GMT.
-- Evidência 2020 Dr. Luisinho: ${FONTE_2020}
-- SHA-256 2020: ${SHA_2020}; SQ ${SQ_LUISINHO_2020}.

DO $$
DECLARE
  n_coorte integer;
  n_contradicoes integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte FROM public.candidatos WHERE slug IN (${slugs});
  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte NOT IN (0, ${coorte.length})
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: coorte parcial em banco com ledger, esperados ${coorte.length}, encontrados %', n_coorte;
  END IF;

  SELECT COUNT(*) INTO n_contradicoes
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id
  JOIN public.patrimonio_ausencia_oficial a
    ON a.candidato_id = c.id AND a.ano_eleicao = p.ano_eleicao
  WHERE c.slug IN (${slugs}) AND p.ano_eleicao IN (2020, 2026);
  IF n_contradicoes <> 0 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: patrimônio e ausência oficial coexistem em % célula(s)', n_contradicoes;
  END IF;
END $$;

${insertsPatrimonio}

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 snapshot=2026-08-15_16:35_BRT campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial
  (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, '${DR_LUISINHO_2026.sq}', '${FONTE_2026}', '${VERIFICADO_EM}'::timestamptz,
       ${sqlLiteral(detalhe2026)}
FROM public.candidatos c
WHERE c.slug = 'dr-luisinho'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN (${slugs})) = ${coorte.length}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  )
ON CONFLICT (candidato_id, ano_eleicao) DO NOTHING;

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2020 snapshot=2026-08-16 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial
  (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '${SQ_LUISINHO_2020}', '${FONTE_2020}', '${VERIFICADO_EM}'::timestamptz,
       ${sqlLiteral(detalhe2020)}
FROM public.candidatos c
WHERE c.slug = 'dr-luisinho'
  AND (SELECT COUNT(*) FROM public.candidatos WHERE slug IN (${slugs})) = ${coorte.length}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p WHERE p.candidato_id = c.id AND p.ano_eleicao = 2020
  )
ON CONFLICT (candidato_id, ano_eleicao) DO NOTHING;

DO $$
DECLARE
  n_coorte integer;
  n_corretos integer;
  n_ausencias integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte FROM public.candidatos WHERE slug IN (${slugs});
  IF n_coorte <> ${coorte.length} THEN RETURN; END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
${expectedPatrimonio}
  )
  SELECT COUNT(*) INTO n_corretos
  FROM esperados e
  JOIN public.candidatos c ON c.slug = e.slug
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE p.valor_total = e.valor_total
    AND jsonb_array_length(p.bens) = e.n_bens
    AND p.fonte = e.fonte;
  IF n_corretos <> 5 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: esperados 5 patrimônios exatos, encontrados %', n_corretos;
  END IF;

  SELECT COUNT(*) INTO n_ausencias
  FROM public.candidatos c
  JOIN public.patrimonio_ausencia_oficial a ON a.candidato_id = c.id
  WHERE c.slug = 'dr-luisinho'
    AND (
      (a.ano_eleicao = 2026 AND a.sq_candidato = '${DR_LUISINHO_2026.sq}' AND a.fonte_url = '${FONTE_2026}' AND a.detalhe = ${sqlLiteral(detalhe2026)})
      OR
      (a.ano_eleicao = 2020 AND a.sq_candidato = '${SQ_LUISINHO_2020}' AND a.fonte_url = '${FONTE_2020}' AND a.detalhe = ${sqlLiteral(detalhe2020)})
    );
  IF n_ausencias <> 2 THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: esperadas 2 ausências oficiais exatas, encontradas %', n_ausencias;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.candidatos c
    JOIN public.patrimonio p ON p.candidato_id = c.id
    JOIN public.patrimonio_ausencia_oficial a
      ON a.candidato_id = c.id AND a.ano_eleicao = p.ano_eleicao
    WHERE c.slug IN (${slugs}) AND p.ano_eleicao IN (2020, 2026)
  ) THEN
    RAISE EXCEPTION 'P-AC-POS-REGISTRO: patrimônio e ausência oficial coexistem após a migration';
  END IF;
END $$;
`
}

async function main(): Promise<void> {
  const zipPath = await obterZip()
  validarHash(zipPath)
  const validados = validarEPreparar(await lerBens(zipPath))
  for (const candidato of COM_BENS) {
    console.log(
      `${candidato.slug}|SQ=${candidato.sq}|bens=${candidato.nBens}|total=${centavosParaSql(candidato.totalCentavos)}|snapshot=${SNAPSHOT}`,
    )
  }
  console.log(
    `dr-luisinho|SQ=${DR_LUISINHO_2026.sq}|zero linhas 2026|SQ2020=${SQ_LUISINHO_2020}|zero linhas 2020`,
  )
  if (process.argv.includes("--check")) return
  writeFileSync(OUT, gerarSql(validados))
  console.log(`migration gerada: ${OUT}`)
}

void main().catch((error: unknown) => {
  console.error("FALHA:", error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
