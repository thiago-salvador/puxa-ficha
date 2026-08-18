/**
 * Gera a migration de patrimônio do ciclo 2026 (workflow
 * pf-patrimonio-20260807T170643Z): 17 lacunas preenchidas com bens do pacote
 * oficial bem_candidato_2026 (snapshot local de 2026-08-04) e 13 ausências
 * oficiais registradas em patrimonio_ausencia_oficial.
 *
 * O snapshot de 2026 está em fluxo (registros de candidatura em andamento),
 * então toda linha declara o snapshot na fonte/detalhe. Nenhum valor é
 * fabricado: os bens saem do pacote oficial e os totais são conferidos contra
 * o manifesto auditado da etapa 2b antes de gerar qualquer SQL.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { dedupeTsePatrimonioRows } from "../src/lib/tse-patrimonio-dedupe"
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"
import { sanitizePublicText } from "../src/lib/public-text"
import { parseCSV } from "./lib/parse-csv-local"

const EXEC_DIR = "/tmp/pf-patrimonio-20260807T170643Z"
const A2B = resolve(EXEC_DIR, "a2b")
const WORK = resolve(EXEC_DIR, "e3-bens-2026")
const ZIP_2026 = resolve(process.cwd(), "data/tse/bem_candidato_2026.zip")
const FONTE_URL_2026 = "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"
const OUT = resolve(process.cwd(), "supabase/migrations/20260807183000_backfill_patrimonio_oficial_2026_snapshot.sql")

interface Celula {
  slug: string
  ano: number
  sq: string
  estado: string
  valor_total?: number | null
  n_bens?: number | null
  verificado_em?: string | null
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function parseBRL(value: string): number {
  return Number((value || "0").trim().replace(/\./g, "").replace(",", "."))
}

function extractZip(): string[] {
  const dest = WORK
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  execFileSync("unzip", ["-o", "-q", ZIP_2026, "-d", dest])
  return readdirSync(dest)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => resolve(dest, name))
}

async function main(): Promise<void> {
  const manifest = readFileSync(resolve(A2B, "manifest.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Celula)

  const lacunas = manifest.filter((c) => c.estado === "lacuna_com_dados_tse" && c.ano === 2026)
  const ausencias = manifest.filter((c) => c.estado === "ausencia_oficial" && c.ano === 2026)
  console.log(`lacunas 2026: ${lacunas.length}, ausencias 2026: ${ausencias.length}`)

  const csvPaths = extractZip()
  const sqParaLacuna = new Map(lacunas.map((c) => [c.sq, c]))
  const rowsPorSq = new Map<string, Array<{ slug: string; sourceKey: string; ordem: string; tipo: string; descricao: string; valor: number }>>()

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      const celula = sqParaLacuna.get(sq)
      if (!celula) return
      const list = rowsPorSq.get(sq) ?? []
      list.push({
        slug: celula.slug,
        sourceKey: csvPath,
        ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
        tipo: row.DS_TIPO_BEM_CANDIDATO || "",
        descricao: row.DS_BEM_CANDIDATO || "",
        valor: parseBRL(row.VR_BEM_CANDIDATO || "0"),
      })
      rowsPorSq.set(sq, list)
    })
  }

  const divergencias: string[] = []
  const linhasBens: string[] = []
  for (const celula of lacunas) {
    const rows = rowsPorSq.get(celula.sq) ?? []
    const deduped = dedupeTsePatrimonioRows(rows)
    const bens = deduped.map((item) => ({
      tipo: item.tipo,
      // sanitizePublicText antes da mascara: sem ele os marcadores tecnicos do
      // TSE (#NULO#, #NE#) entram literais no SQL gerado. Foi assim que a
      // 20260807182000 reintroduziu 9 marcadores horas depois da limpeza de
      // 07/08 (auditoria de 08/08).
      descricao: maskDocumentLikeSequences(sanitizePublicText(item.descricao)),
      valor: item.valor,
    }))
    const total = Math.round(bens.reduce((acc, bem) => acc + bem.valor, 0) * 100) / 100
    const esperado = Math.round(Number(celula.valor_total ?? 0) * 100) / 100
    if (Math.abs(total - esperado) > 0.01) {
      divergencias.push(`${celula.slug}|2026: total ${total} != manifesto ${esperado}`)
      continue
    }
    if (bens.length !== Number(celula.n_bens)) {
      divergencias.push(`${celula.slug}|2026: n_bens ${bens.length} != manifesto ${celula.n_bens}`)
      continue
    }
    const bensJson = JSON.stringify(bens).replace(/'/g, "''")
    const fonte = `TSE Dados Abertos bem_candidato_2026 SQ ${celula.sq} (total agregado, snapshot 2026-08-04)`
    linhasBens.push(
      `-- @write tabela=patrimonio slug=${celula.slug} campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, ${total}, '${bensJson}'::jsonb, ${sqlLiteral(fonte)}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(celula.slug)}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = 2026
  );`
    )
  }

  if (divergencias.length > 0) {
    console.error("DIVERGENCIAS CONTRA O MANIFESTO AUDITADO:")
    for (const item of divergencias) console.error(` - ${item}`)
    process.exitCode = 1
    return
  }

  const linhasAusencia = ausencias.map((celula) => {
    const detalhe = `SQ ausente no pacote oficial bem_candidato_2026 (snapshot local de 2026-08-04; registros de 2026 em andamento, revalidar quando o TSE publicar pacote atualizado).`
    return `-- @write tabela=patrimonio_ausencia_oficial slug=${celula.slug} campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2026, ${sqlLiteral(celula.sq)}, ${sqlLiteral(FONTE_URL_2026)}, ${sqlLiteral(celula.verificado_em ?? "")}::timestamptz,
       ${sqlLiteral(detalhe)}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(celula.slug)}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2026
  );`
  })

  const sql = `-- Backfill de patrimônio do ciclo 2026 (workflow pf-patrimonio-20260807T170643Z).
-- Snapshot local do pacote oficial bem_candidato_2026 de 2026-08-04: os
-- registros de 2026 ainda estão em andamento no TSE, então cada linha declara
-- o snapshot na fonte/detalhe e deverá ser revalidada quando o TSE publicar
-- pacote atualizado. Nenhuma célula inventada: bens extraídos do pacote
-- oficial com dedupe _UF/_BRASIL e descrição mascarada; totais conferidos
-- contra o manifesto auditado da etapa 2b antes da geração.
BEGIN;

${linhasBens.join("\n\n")}

${linhasAusencia.join("\n\n")}

DO $$
DECLARE
  n_bens integer;
  n_ausencias integer;
BEGIN
  SELECT COUNT(*) INTO n_bens
  FROM public.patrimonio p
  WHERE p.ano_eleicao = 2026
    AND p.fonte LIKE 'TSE Dados Abertos bem\\_candidato\\_2026 SQ%'
    AND p.fonte LIKE '%snapshot 2026-08-04%';
  IF n_bens <> ${lacunas.length} THEN
    RAISE EXCEPTION 'backfill 2026: esperados ${lacunas.length} bens, encontrados %', n_bens;
  END IF;

  SELECT COUNT(*) INTO n_ausencias
  FROM public.patrimonio_ausencia_oficial a
  WHERE a.ano_eleicao = 2026
    AND a.detalhe LIKE 'SQ ausente no pacote oficial bem_candidato_2026%';
  IF n_ausencias <> ${ausencias.length} THEN
    RAISE EXCEPTION 'backfill 2026: esperadas ${ausencias.length} ausencias, encontradas %', n_ausencias;
  END IF;
END $$;

COMMIT;
`
  writeFileSync(OUT, sql)
  console.log("migration gerada:", OUT)
}

main().catch((err) => {
  console.error("FALHA:", (err as Error).message)
  process.exitCode = 1
})
