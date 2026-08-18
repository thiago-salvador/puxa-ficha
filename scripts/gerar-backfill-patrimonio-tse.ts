/**
 * Gera as migrations de patrimônio do workflow pf-patrimonio-20260807T170643Z:
 *   1. patrimonio_ausencia_oficial: tabela + 48 ausências oficiais 2010-2024
 *      confirmadas nos pacotes bem_candidato do TSE (estado ausencia_oficial).
 *   2. backfill de 27 lacunas 2006-2024 com bens extraídos dos mesmos pacotes
 *      (estado lacuna_com_dados_tse).
 *
 * SOMENTE GERA ARQUIVOS: nenhuma escrita no banco. O manifesto auditado vem da
 * etapa 2b (a2b/manifest.jsonl) e os pacotes oficiais estão em a2b/zips/.
 * Qualquer divergência entre o que o pacote contém e o manifesto aborta a
 * geração (proteção contra sair do estado auditado).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { execFileSync } from "node:child_process"
import { dedupeTsePatrimonioRows } from "../src/lib/tse-patrimonio-dedupe"
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"
import { sanitizePublicText } from "../src/lib/public-text"
import { parseCSV } from "./lib/parse-csv-local"

const EXEC_DIR = "/tmp/pf-patrimonio-20260807T170643Z"
const A2B = resolve(EXEC_DIR, "a2b")
const ZIPS = resolve(A2B, "zips")
const WORK = resolve(EXEC_DIR, "e3-bens")
const OUT_DIR = resolve(process.cwd(), "supabase/migrations")

interface Celula {
  slug: string
  ano: number
  sq: string
  estado: string
  valor_total?: number | null
  n_bens?: number | null
  url?: string | null
  verificado_em?: string | null
  detalhe?: string | null
}

function sq(input: string): string {
  return input.trim().replace(/\./g, "").replace(",", ".")
}

function parseBRL(value: string): number {
  return Number(sq(value || "0"))
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function loadManifest(): Celula[] {
  return readFileSync(resolve(A2B, "manifest.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Celula)
}

/**
 * UF por (slug, ano), que é o que o filtro pré-2010 precisa de verdade.
 *
 * `entry.estado` sozinho não serve: ele é a UF ATUAL do candidato, nula para
 * quem concorre a Presidente, e nada garante que seja a UF da candidatura
 * daquele ano. A fonte preferida é `ids.tse_uf_candidatura[ano]`, que registra
 * a UF da candidatura junto do SQ que a identifica. `entry.estado` fica como
 * queda, e a ausência das duas é recusa, nunca casamento livre.
 */
function loadSeedUf(): Map<string, string> {
  const seed = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as Array<{
    slug: string
    estado?: string | null
    ids?: { tse_uf_candidatura?: Record<string, string> | null }
  }>
  const mapa = new Map<string, string>()
  for (const entry of seed) {
    const atual = (entry.estado ?? "").trim().toUpperCase()
    if (atual) mapa.set(entry.slug, atual)
    for (const [ano, uf] of Object.entries(entry.ids?.tse_uf_candidatura ?? {})) {
      const valor = (uf ?? "").trim().toUpperCase()
      if (valor) mapa.set(`${entry.slug}|${ano}`, valor)
    }
  }
  return mapa
}

/** A UF da candidatura daquele ano vence a UF atual do candidato. */
export function ufDaCelula(
  ufPorSlug: Map<string, string>,
  slug: string,
  ano: number,
): string {
  const anual = ufPorSlug.get(`${slug}|${ano}`)
  if (anual) return anual
  if (ano <= 2008) return ""
  return ufPorSlug.get(slug) ?? ""
}

function extractZip(ano: number): string[] {
  const zipPath = resolve(ZIPS, `bem_candidato_${ano}.zip`)
  if (!existsSync(zipPath)) throw new Error(`zip ausente: ${zipPath}`)
  const dest = resolve(WORK, String(ano))
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", dest])
  return readdirSync(dest)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => resolve(dest, name))
}

interface Bem {
  tipo: string
  descricao: string
  valor: number
}

interface BensPorCelula {
  bens: Bem[]
  total: number
}

/**
 * O SQ_CANDIDATO é sequencial por UF até 2008, então o mesmo número pertence a
 * pessoas diferentes em estados diferentes. Só a UF do candidato desempata.
 *
 * Fail-closed de propósito: sem UF conhecida, a linha é RECUSADA, nunca aceita.
 * A versão anterior (`if (uf && ...)`) fazia o contrário, e o efeito era o pior
 * possível: `estado` é nulo para presidenciáveis, então bastava um SQ pré-2010
 * entrar no seed de um deles para o casamento aceitar linha de qualquer estado
 * e publicar bem de terceiro como se fosse dele.
 */
export function decidirPorUf(
  anoDaCelula: number,
  ufDoSeed: string,
  ufDaLinha: string,
): "aceita" | "recusa_sem_uf" | "recusa_uf_divergente" {
  if (anoDaCelula > 2008) return "aceita"
  const seed = ufDoSeed.trim().toUpperCase()
  if (!seed) return "recusa_sem_uf"
  return ufDaLinha.trim().toUpperCase() === seed ? "aceita" : "recusa_uf_divergente"
}

async function coletarBens(
  celulas: Celula[],
  csvPaths: string[],
  ufPorSlug: Map<string, string>,
): Promise<Map<string, BensPorCelula>> {
  const porAnoSq = new Map<string, Celula[]>()
  for (const celula of celulas) {
    const key = `${celula.ano}|${celula.sq}`
    porAnoSq.set(key, [...(porAnoSq.get(key) ?? []), celula])
  }

  const rowsPorCelula = new Map<string, Array<{ slug: string; sourceKey: string; ordem: string; tipo: string; descricao: string; valor: number; uf: string }>>()
  /** Células pré-2010 recusadas por não haver UF que desambigue o SQ. */
  const semUfPreDezena = new Set<string>()

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const rowSq = (row.SQ_CANDIDATO || "").trim()
      const ano = Number((row.ANO_ELEICAO || "").trim())
      const candidatos = porAnoSq.get(`${ano}|${rowSq}`)
      if (!candidatos) return
      for (const celula of candidatos) {
        const decisao = decidirPorUf(
          celula.ano,
          ufDaCelula(ufPorSlug, celula.slug, celula.ano),
          row.SG_UF || "",
        )
        if (decisao === "recusa_sem_uf") {
          semUfPreDezena.add(`${celula.slug}|${celula.ano}`)
          continue
        }
        if (decisao === "recusa_uf_divergente") continue
        const valor = parseBRL(row.VR_BEM_CANDIDATO || "0")
        const list = rowsPorCelula.get(`${celula.slug}|${celula.ano}`) ?? []
        list.push({
          slug: celula.slug,
          sourceKey: csvPath,
          ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
          tipo: row.DS_TIPO_BEM_CANDIDATO || "",
          descricao: row.DS_BEM_CANDIDATO || "",
          valor,
          uf: (row.SG_UF || "").trim().toUpperCase(),
        })
        rowsPorCelula.set(`${celula.slug}|${celula.ano}`, list)
      }
    })
  }

  if (semUfPreDezena.size > 0) {
    console.log(
      `recusadas por falta de UF (SQ pré-2010 não desambiguável): ${semUfPreDezena.size} célula(s): ${[...semUfPreDezena].sort().join(", ")}`,
    )
  }

  const resultado = new Map<string, BensPorCelula>()
  for (const [key, rows] of rowsPorCelula) {
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
    resultado.set(key, { bens, total })
  }
  return resultado
}

function main(): void {
  const manifest = loadManifest()
  const ufPorSlug = loadSeedUf()

  const ausencias = manifest.filter((c) => c.estado === "ausencia_oficial" && c.ano <= 2024)
  const lacunas = manifest.filter((c) => c.estado === "lacuna_com_dados_tse" && c.ano <= 2024)
  const excluidas2026 = manifest.filter((c) => c.estado !== "publicado" && c.ano === 2026).length

  console.log(`ausencias estaveis: ${ausencias.length}, lacunas estaveis: ${lacunas.length}, celulas 2026 excluidas (dados em fluxo): ${excluidas2026}`)

  const anos = new Set<number>()
  for (const celula of lacunas) anos.add(celula.ano)

  ;(async () => {
    const bensPorCelula = new Map<string, BensPorCelula>()
    for (const ano of [...anos].sort()) {
      const csvPaths = extractZip(ano)
      const doAno = lacunas.filter((c) => c.ano === ano)
      const coletado = await coletarBens(doAno, csvPaths, ufPorSlug)
      for (const [key, value] of coletado) bensPorCelula.set(key, value)
    }

    // ---- verificação contra o manifesto auditado ----
    const divergencias: string[] = []
    for (const celula of lacunas) {
      const key = `${celula.slug}|${celula.ano}`
      const coletado = bensPorCelula.get(key)
      if (!coletado) {
        divergencias.push(`${key}: pacote oficial não trouxe bens`)
        continue
      }
      const esperado = Math.round(Number(celula.valor_total ?? 0) * 100) / 100
      if (Math.abs(coletado.total - esperado) > 0.01) {
        divergencias.push(`${key}: total ${coletado.total} != manifesto ${esperado}`)
      }
      if (Number(celula.n_bens) !== coletado.bens.length) {
        divergencias.push(`${key}: n_bens ${coletado.bens.length} != manifesto ${celula.n_bens}`)
      }
    }
    if (divergencias.length > 0) {
      console.error("DIVERGENCIAS CONTRA O MANIFESTO AUDITADO:")
      for (const item of divergencias) console.error(` - ${item}`)
      process.exitCode = 1
      return
    }

    // ---- migration 1: ausências oficiais ----
    const linhasAusencia: string[] = []
    for (const celula of ausencias) {
      linhasAusencia.push(
        `-- @write tabela=patrimonio_ausencia_oficial slug=${celula.slug} campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, ${celula.ano}, ${sqlLiteral(celula.sq)}, ${sqlLiteral(celula.url ?? "")}, ${sqlLiteral(celula.verificado_em ?? "")}::timestamptz,
       ${sqlLiteral(`Pacote oficial bem_candidato_${celula.ano} do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.`)}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(celula.slug)}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = ${celula.ano}
  );`,
      )
    }

    const migrationAusencia = `-- Ausências oficiais de patrimônio confirmadas nos pacotes bem_candidato do
-- TSE (etapa 2b da execucao pf-patrimonio-20260807T170643Z). Cada linha afirma
-- apenas que o pacote oficial daquele ano nao traz bens para o SQ_CANDIDATO;
-- nenhum valor zero e fabricado. As 13 celulas de 2026 ficam de fora ate o TSE
-- publicar snapshot atualizado (registros em andamento).
BEGIN;

-- @write tabela=patrimonio_ausencia_oficial ref=A2B-ausencias-oficiais-20260807 campos=criacao_da_tabela
CREATE TABLE IF NOT EXISTS public.patrimonio_ausencia_oficial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao INTEGER NOT NULL,
  sq_candidato TEXT NOT NULL,
  fonte_url TEXT,
  verificado_em TIMESTAMPTZ,
  detalhe TEXT,
  execucao TEXT NOT NULL DEFAULT 'A2B-ausencias-oficiais-20260807',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidato_id, ano_eleicao)
);

${linhasAusencia.join("\n\n")}

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.patrimonio_ausencia_oficial;
  IF n <> ${ausencias.length} THEN
    RAISE EXCEPTION 'patrimonio_ausencia_oficial: esperadas ${ausencias.length} linhas, encontradas %', n;
  END IF;
END $$;

COMMIT;
`
    writeFileSync(resolve(OUT_DIR, "20260807181000_patrimonio_ausencia_oficial.sql"), migrationAusencia)

    // ---- migration 2: backfill de bens ----
    const linhasBens: string[] = []
    for (const celula of lacunas) {
      const key = `${celula.slug}|${celula.ano}`
      const coletado = bensPorCelula.get(key)!
      const bensJson = JSON.stringify(coletado.bens).replace(/'/g, "''")
      const fonte = `TSE Dados Abertos bem_candidato_${celula.ano} SQ ${celula.sq} (total agregado)`
      linhasBens.push(
        `-- @write tabela=patrimonio slug=${celula.slug} campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, ${celula.ano}, ${coletado.total}, '${bensJson}'::jsonb, ${sqlLiteral(fonte)}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(celula.slug)}
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio p
    WHERE p.candidato_id = c.id AND p.ano_eleicao = ${celula.ano}
  );`,
      )
    }

    const migrationBens = `-- Backfill de patrimonio (bens declarados ao TSE) para ${lacunas.length} eleicoes 2006-2024
-- que tinham lacuna publicada (etapa 2b da execucao pf-patrimonio-20260807T170643Z).
-- Bens extraidos dos pacotes oficiais bem_candidato com dedupe entre arquivos
-- _UF/_BRASIL (dedupeTsePatrimonioRows) e descricao mascarada
-- (maskDocumentLikeSequences), mesmo pipeline do ingest-tse. Valores totais e
-- contagens conferidos contra o manifesto auditado antes da geracao.
-- Celulas de 2026 ficam de fora: snapshot do TSE em fluxo, tratadas no gate do
-- ciclo atual (migration 20260807052000 da completude).
BEGIN;

${linhasBens.join("\n\n")}

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.patrimonio p
  WHERE p.fonte LIKE 'TSE Dados Abertos bem\\_candidato\\_% (total agregado)';
  IF n < ${lacunas.length} THEN
    RAISE EXCEPTION 'backfill patrimonio: esperadas pelo menos ${lacunas.length} linhas com fonte TSE Dados Abertos, encontradas %', n;
  END IF;
END $$;

COMMIT;
`
    writeFileSync(resolve(OUT_DIR, "20260807182000_backfill_patrimonio_oficial_2006_2024.sql"), migrationBens)

    console.log("migrations geradas:")
    console.log(" - supabase/migrations/20260807181000_patrimonio_ausencia_oficial.sql")
    console.log(" - supabase/migrations/20260807182000_backfill_patrimonio_oficial_2006_2024.sql")
  })().catch((err) => {
    console.error("FALHA:", (err as Error).message)
    process.exitCode = 1
  })
}

/**
 * Só roda como CLI. Sem esta guarda, um `import` do módulo (por teste ou por
 * outro script) DISPARA a geração e reescreve migrations já aplicadas em
 * `supabase/migrations/`, porque o sanitizador de hoje produz texto diferente
 * do que produzia quando elas nasceram. Aconteceu em 10/08/2026, ao importar o
 * módulo para testar o filtro de UF, e foi pego pelo `git status`: a
 * `20260807182000` voltou modificada em 7 linhas.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
