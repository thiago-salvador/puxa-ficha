/**
 * Recalcula, valida e gera o backfill de patrimônio dos presidenciáveis
 * registrados no snapshot TSE de 15/08/2026 às 16:35 BRT.
 *
 * Hertz Dias e Rui Costa Pimenta continuam sem linhas de bens neste snapshot.
 * Essa ausência é apenas transitória e, por isso, não gera
 * `patrimonio_ausencia_oficial`. Leonardo Avalanche fica fora do recorte porque
 * o registro não foi localizado no pacote após o prazo e segue em verificação.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { dedupeTsePatrimonioRows } from "../src/lib/tse-patrimonio-dedupe";
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto";
import { sanitizePublicText } from "../src/lib/public-text";
import { parseCSV } from "./lib/parse-csv-local";

const SNAPSHOT = "2026-08-15 16:35 BRT";
const GERACAO_CSV = "15/08/2026 16:30:08";
const ZIP_SHA256 =
  "960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1";
const FONTE_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip";
const ZIP = resolve(process.cwd(), "data/tse/bem_candidato_2026.zip");
const WORK = resolve(process.cwd(), ".tmp/p-patrimonio-2026");
const OUT = resolve(
  process.cwd(),
  "supabase/migrations/20260815223000_backfill_patrimonio_presidenciaveis_2026.sql",
);

interface CandidatoComBens {
  slug: string;
  nome: string;
  sq: string;
  totalCentavos: number;
  nBens: number;
}

const COM_BENS: readonly CandidatoComBens[] = [
  {
    slug: "samara-martins",
    nome: "Samara Martins",
    sq: "280002538811",
    totalCentavos: 3_300_000,
    nBens: 2,
  },
  {
    slug: "renan-filho",
    nome: "Renan Filho",
    sq: "280002540694",
    totalCentavos: 79_508_900,
    nBens: 4,
  },
  {
    slug: "wilson-grassi-junior",
    nome: "Wilson Grassi Júnior",
    sq: "280002548139",
    totalCentavos: 5_000_000_000,
    nBens: 1,
  },
  {
    slug: "clariana-barao",
    nome: "Clariana Barão",
    sq: "280002552484",
    totalCentavos: 182_076_017,
    nBens: 7,
  },
  {
    slug: "romeu-zema",
    nome: "Romeu Zema",
    sq: "280002539826",
    totalCentavos: 17_870_761_009,
    nBens: 18,
  },
  {
    slug: "ronaldo-caiado",
    nome: "Ronaldo Caiado",
    sq: "280002551932",
    totalCentavos: 5_255_793_098,
    nBens: 14,
  },
  {
    slug: "edmilson-costa",
    nome: "Edmilson Costa",
    sq: "280002551975",
    totalCentavos: 45_448_568,
    nBens: 4,
  },
  {
    slug: "flavio-bolsonaro",
    nome: "Flávio Bolsonaro",
    sq: "280002551544",
    totalCentavos: 818_655_583,
    nBens: 9,
  },
  {
    slug: "lula",
    nome: "Lula",
    sq: "280002542548",
    totalCentavos: 477_565_064,
    nBens: 18,
  },
  {
    slug: "augusto-cury",
    nome: "Augusto Cury",
    sq: "280002551547",
    totalCentavos: 24_228_116_252,
    nBens: 56,
  },
];

const SEM_DECLARACAO_NESTE_SNAPSHOT = [
  { slug: "hertz-dias", nome: "Hertz Dias", sq: "280002541457" },
  { slug: "rui-costa-pimenta", nome: "Rui Costa Pimenta", sq: "280002552487" },
] as const;

interface BemLido {
  slug: string;
  sourceKey: string;
  ordem: string;
  tipo: string;
  descricao: string;
  valor: number;
  geracao: string;
}

function parseBRL(value: string): number {
  return Number((value || "0").trim().replace(/\./g, "").replace(",", "."));
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function centavosParaSql(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100);
  return `${inteiro}.${String(centavos % 100).padStart(2, "0")}`;
}

function fonteDaLinha(candidato: CandidatoComBens): string {
  return `TSE Dados Abertos bem_candidato_2026 SQ ${candidato.sq} (total agregado, snapshot ${SNAPSHOT}; CSV gerado ${GERACAO_CSV} BRT; ${FONTE_URL})`;
}

function extrairZip(): string[] {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  execFileSync("unzip", ["-o", "-q", ZIP, "-d", WORK]);
  return readdirSync(WORK)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort()
    .map((name) => resolve(WORK, name));
}

function validarHash(): void {
  const hash = createHash("sha256").update(readFileSync(ZIP)).digest("hex");
  if (hash !== ZIP_SHA256) {
    throw new Error(
      `ZIP divergente: sha256 ${hash}, esperado ${ZIP_SHA256} para o snapshot ${SNAPSHOT}`,
    );
  }
}

async function lerBens(): Promise<Map<string, BemLido[]>> {
  const alvos = new Map(
    [...COM_BENS, ...SEM_DECLARACAO_NESTE_SNAPSHOT].map((candidato) => [
      candidato.sq,
      candidato,
    ]),
  );
  const rowsPorSq = new Map<string, BemLido[]>();

  for (const csvPath of extrairZip()) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim();
      const candidato = alvos.get(sq);
      if (!candidato) return;

      const rows = rowsPorSq.get(sq) ?? [];
      rows.push({
        slug: candidato.slug,
        sourceKey: csvPath,
        ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
        tipo: row.DS_TIPO_BEM_CANDIDATO || "",
        descricao: row.DS_BEM_CANDIDATO || "",
        valor: parseBRL(row.VR_BEM_CANDIDATO || "0"),
        geracao: `${row.DT_GERACAO || ""} ${row.HH_GERACAO || ""}`.trim(),
      });
      rowsPorSq.set(sq, rows);
    });
  }

  return rowsPorSq;
}

function ordenarBens(rows: BemLido[]): BemLido[] {
  return [...rows].sort((a, b) => {
    const ordem = Number(a.ordem) - Number(b.ordem);
    if (ordem !== 0) return ordem;
    return `${a.tipo}|${a.descricao}|${a.valor}`.localeCompare(
      `${b.tipo}|${b.descricao}|${b.valor}`,
      "pt-BR",
    );
  });
}

function validarEPreparar(
  rowsPorSq: Map<string, BemLido[]>,
): Map<string, BemLido[]> {
  const divergencias: string[] = [];
  const validados = new Map<string, BemLido[]>();

  for (const candidato of COM_BENS) {
    const bens = ordenarBens(
      dedupeTsePatrimonioRows(rowsPorSq.get(candidato.sq) ?? []),
    );
    const totalCentavos = bens.reduce(
      (total, bem) => total + Math.round(bem.valor * 100),
      0,
    );
    const geracoes = new Set(bens.map((bem) => bem.geracao));

    if (totalCentavos !== candidato.totalCentavos) {
      divergencias.push(
        `${candidato.slug}: total ${totalCentavos} != ${candidato.totalCentavos} centavos`,
      );
    }
    if (bens.length !== candidato.nBens) {
      divergencias.push(
        `${candidato.slug}: ${bens.length} bens != ${candidato.nBens}`,
      );
    }
    if (geracoes.size !== 1 || !geracoes.has(GERACAO_CSV)) {
      divergencias.push(
        `${candidato.slug}: geração CSV ${[...geracoes].join(", ") || "ausente"} != ${GERACAO_CSV}`,
      );
    }
    validados.set(candidato.sq, bens);
  }

  for (const candidato of SEM_DECLARACAO_NESTE_SNAPSHOT) {
    const bens = dedupeTsePatrimonioRows(rowsPorSq.get(candidato.sq) ?? []);
    if (bens.length !== 0) {
      divergencias.push(
        `${candidato.slug}: esperado sem declaração transitória, mas o ZIP contém ${bens.length} bens`,
      );
    }
  }

  if (divergencias.length > 0) {
    throw new Error(
      `DIVERGÊNCIAS CONTRA OS TOTAIS DA COORDENAÇÃO:\n - ${divergencias.join("\n - ")}`,
    );
  }

  return validados;
}

function gerarSql(bensPorSq: Map<string, BemLido[]>): string {
  const slugs = COM_BENS.map((candidato) => sqlLiteral(candidato.slug)).join(
    ", ",
  );
  const linhas = COM_BENS.map((candidato) => {
    const bens = (bensPorSq.get(candidato.sq) ?? []).map((bem) => ({
      tipo: bem.tipo,
      descricao: maskDocumentLikeSequences(sanitizePublicText(bem.descricao)),
      valor: bem.valor,
    }));
    const bensJson = JSON.stringify(bens).replace(/'/g, "''");
    const total = centavosParaSql(candidato.totalCentavos);

    return `-- @write tabela=patrimonio slug=${candidato.slug} ano=2026 snapshot=${SNAPSHOT.replaceAll(" ", "_")} campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, ${total}, '${bensJson}'::jsonb, ${sqlLiteral(fonteDaLinha(candidato))}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(candidato.slug)}
  AND (
    SELECT COUNT(*) FROM public.candidatos
    WHERE slug IN (${slugs})
  ) = ${COM_BENS.length}
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);`;
  });

  const esperados = COM_BENS.map(
    (candidato) =>
      `    (${sqlLiteral(candidato.slug)}, ${centavosParaSql(candidato.totalCentavos)}::numeric, ${candidato.nBens}, ${sqlLiteral(fonteDaLinha(candidato))})`,
  ).join(",\n");
  return `-- P-PATRIMONIO-2026: bens dos presidenciáveis registrados no TSE.
-- Fonte oficial: ${FONTE_URL}
-- ZIP sha256: ${ZIP_SHA256}
-- Snapshot congelado: ${SNAPSHOT}; CSV gerado ${GERACAO_CSV} BRT.
--
-- Hertz Dias (SQ 280002541457) e Rui Costa Pimenta (SQ 280002552487) não
-- têm declaração neste snapshot pré-fechamento do lote. Nenhuma ausência
-- oficial é registrada; rechecagem obrigatória no ZIP de 16/08/2026.
-- Leonardo Avalanche (PRTB) fica fora: registro não localizado após o prazo e
-- ainda em verificação.
BEGIN;

DO $$
DECLARE
  n_coorte integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos
  WHERE slug IN (${slugs});

  IF n_coorte NOT IN (0, ${COM_BENS.length})
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-PATRIMONIO-2026: coorte parcial em banco com ledger, esperados ${COM_BENS.length} candidatos, encontrados %', n_coorte;
  END IF;
END $$;

${linhas.join("\n\n")}

DO $$
DECLARE
  n_coorte integer;
  n_corretos integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos
  WHERE slug IN (${slugs});

  -- Replay vazio/parcial não tem ledger e não recebe nenhuma linha. Em banco
  -- integrado, o guard anterior já abortou coorte parcial antes dos upserts.
  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte <> ${COM_BENS.length} THEN
    RETURN;
  END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
${esperados}
  )
  SELECT COUNT(*) INTO n_corretos
  FROM esperados e
  JOIN public.candidatos c ON c.slug = e.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = 2026
   AND p.valor_total = e.valor_total
   AND jsonb_array_length(p.bens) = e.n_bens
   AND p.fonte = e.fonte;

  IF n_corretos <> ${COM_BENS.length} THEN
    RAISE EXCEPTION 'P-PATRIMONIO-2026: esperadas ${COM_BENS.length} linhas exatas, encontradas %', n_corretos;
  END IF;
END $$;

COMMIT;
`;
}

async function main(): Promise<void> {
  validarHash();
  const validados = validarEPreparar(await lerBens());

  for (const candidato of COM_BENS) {
    console.log(
      `${candidato.slug}|SQ=${candidato.sq}|bens=${candidato.nBens}|total=${centavosParaSql(candidato.totalCentavos)}|snapshot=${SNAPSHOT}`,
    );
  }
  for (const candidato of SEM_DECLARACAO_NESTE_SNAPSHOT) {
    console.log(
      `${candidato.slug}|SQ=${candidato.sq}|sem_declaracao_transitoria|snapshot=${SNAPSHOT}`,
    );
  }

  if (process.argv.includes("--check")) return;
  writeFileSync(OUT, gerarSql(validados));
  console.log(`migration gerada: ${OUT}`);
}

main().catch((error) => {
  console.error("FALHA:", (error as Error).message);
  process.exitCode = 1;
});
