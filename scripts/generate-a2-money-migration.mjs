import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

const sourcePath = resolve(process.argv[2] ?? "")
const outputPath = resolve(process.argv[3] ?? "")
if (!process.argv[2] || !process.argv[3]) {
  throw new Error("uso: node scripts/generate-a2-money-migration.mjs <proposals.jsonl> <migration.sql>")
}

const source = readFileSync(sourcePath, "utf8")
const rows = source.trim().split(/\r?\n/).map((line) => JSON.parse(line))
const proposals = rows.flatMap((row) =>
  row.proposals.map((proposal) => ({ slug: row.candidate_slug, ...proposal })),
)
const candidatesPath = fileURLToPath(new URL("../data/candidatos.json", import.meta.url))
const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"))
const sqBySlug = new Map(
  candidates.map((candidate) => [candidate.slug, candidate.ids?.tse_sq_candidato ?? {}]),
)
const accepted = proposals.filter((proposal) => {
  if (proposal.proposed_state !== "encontrado_reconciliado" || proposal.conflict === true) {
    return false
  }
  const canonicalSq = sqBySlug.get(proposal.slug)?.[String(proposal.ano)]
  return canonicalSq == null || String(canonicalSq) === String(proposal.SQ)
})
const financing = accepted.filter((proposal) => proposal.field === "financiamento")
const patrimony = accepted.filter((proposal) => proposal.field === "patrimonio")

if (rows.length !== 194 || financing.length !== 294 || patrimony.length !== 39) {
  throw new Error(
    `fila inesperada: perfis=${rows.length}, financiamento=${financing.length}, patrimonio=${patrimony.length}`,
  )
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`
const money = (value) => Number(value ?? 0).toFixed(2)
const reconciledMetric = (value, metricKey, donorKey) => {
  const metric = value.metricas_consolidadas_tse?.[metricKey]
  if (metric != null && Number.isFinite(Number(metric))) return Number(metric)
  return Number(value.doadores_tipo_totais?.[donorKey] ?? 0)
}

const financingValues = financing.map((proposal) => {
  const value = proposal.proposed_value
  const categories = value.categorias_canonicas ?? {}
  return `  (${[
    quote(proposal.slug),
    Number(proposal.ano),
    quote(proposal.SQ),
    money(value.total_arrecadado),
    money(categories.fundo_partidario),
    money(categories.fundo_eleitoral),
    money(reconciledMetric(value, "totalReceitaPF", "PF")),
    money(reconciledMetric(value, "totalProprios", "recursos_proprios")),
    json(value.maiores_doadores_sanitizados ?? []),
    json(categories),
  ].join(", ")})`
}).join(",\n")

const patrimonyValues = patrimony.map((proposal) => {
  const value = proposal.proposed_value
  const bens = (value.items ?? []).map((item) => ({
    tipo: item.tipo,
    descricao: item.descricao ?? "",
    valor: Number(item.valor),
  }))
  return `  (${[
    quote(proposal.slug),
    Number(proposal.ano),
    quote(proposal.SQ),
    money(value.total),
    json(bens),
  ].join(", ")})`
}).join(",\n")

const sourceHash = createHash("sha256").update(source).digest("hex")
const sql = `BEGIN;

-- Gerado exclusivamente das propostas A2 reconciliadas, sem conflito e sem
-- divergencia contra um SQ canonico ja persistido para o mesmo ano.
-- Execucao: pf-completeness-20260807T022551Z
-- SHA-256 do ledger: ${sourceHash}
-- Bloqueados, parciais, indeterminados e vazios confirmados nao entram nesta carga.

ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS categorias_origem jsonb;

CREATE TEMP TABLE _pf_financiamento_reconciliado (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  sq_candidato text NOT NULL,
  total_arrecadado numeric(15,2) NOT NULL,
  total_fundo_partidario numeric(15,2) NOT NULL,
  total_fundo_eleitoral numeric(15,2) NOT NULL,
  total_pessoa_fisica numeric(15,2) NOT NULL,
  total_recursos_proprios numeric(15,2) NOT NULL,
  maiores_doadores jsonb NOT NULL,
  categorias_origem jsonb NOT NULL,
  UNIQUE (slug, ano_eleicao)
) ON COMMIT DROP;

-- @write tabela=_pf_financiamento_reconciliado ref=A2-reconciliacao-20260807 campos=slug,ano_eleicao,sq_candidato,totais,maiores_doadores,categorias_origem
INSERT INTO _pf_financiamento_reconciliado
SELECT *
FROM (VALUES
${financingValues}
) AS source(
  slug, ano_eleicao, sq_candidato, total_arrecadado,
  total_fundo_partidario, total_fundo_eleitoral, total_pessoa_fisica,
  total_recursos_proprios, maiores_doadores, categorias_origem
)
WHERE 'A2-reconciliacao-20260807' = 'A2-reconciliacao-20260807';

CREATE TEMP TABLE _pf_patrimonio_reconciliado (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  sq_candidato text NOT NULL,
  valor_total numeric(15,2) NOT NULL,
  bens jsonb NOT NULL,
  UNIQUE (slug, ano_eleicao)
) ON COMMIT DROP;

-- @write tabela=_pf_patrimonio_reconciliado ref=A2-reconciliacao-20260807 campos=slug,ano_eleicao,sq_candidato,valor_total,bens
INSERT INTO _pf_patrimonio_reconciliado
SELECT *
FROM (VALUES
${patrimonyValues}
) AS source(slug, ano_eleicao, sq_candidato, valor_total, bens)
WHERE 'A2-reconciliacao-20260807' = 'A2-reconciliacao-20260807';

DO $guard$
BEGIN
  IF (SELECT count(*) FROM _pf_financiamento_reconciliado) <> 294 THEN
    RAISE EXCEPTION 'A2 financiamento: cardinalidade diferente de 294';
  END IF;
  IF (SELECT count(*) FROM _pf_patrimonio_reconciliado) <> 39 THEN
    RAISE EXCEPTION 'A2 patrimonio: cardinalidade diferente de 39';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _pf_financiamento_reconciliado d
    LEFT JOIN public.candidatos c ON c.slug = d.slug
    WHERE c.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM _pf_patrimonio_reconciliado d
    LEFT JOIN public.candidatos c ON c.slug = d.slug
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A2: slug sem candidato correspondente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _pf_financiamento_reconciliado
    WHERE abs(total_arrecadado - (
      COALESCE((categorias_origem->>'fundo_eleitoral')::numeric, 0) +
      COALESCE((categorias_origem->>'fundo_partidario')::numeric, 0) +
      COALESCE((categorias_origem->>'outros_recursos')::numeric, 0) +
      COALESCE((categorias_origem->>'nao_informado_pelo_tse')::numeric, 0)
    )) > 0.01
  ) THEN
    RAISE EXCEPTION 'A2: categoria oficial nao fecha com o total';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _pf_patrimonio_reconciliado
    WHERE abs(valor_total - COALESCE((
      SELECT sum((item->>'valor')::numeric)
      FROM jsonb_array_elements(bens) AS item
    ), 0)) > 0.01
  ) THEN
    RAISE EXCEPTION 'A2: bens nao fecham com o total';
  END IF;
END
$guard$;

-- @write tabela=financiamento ref=A2-reconciliacao-20260807 campos=total_arrecadado,total_fundo_partidario,total_fundo_eleitoral,total_pessoa_fisica,total_recursos_proprios,maiores_doadores,categorias_origem,fonte
INSERT INTO public.financiamento (
  candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores, categorias_origem, fonte
)
SELECT
  c.id, d.ano_eleicao, d.total_arrecadado, d.total_fundo_partidario,
  d.total_fundo_eleitoral, d.total_pessoa_fisica, d.total_recursos_proprios,
  d.maiores_doadores, d.categorias_origem, 'TSE DivulgaCandContas'
FROM _pf_financiamento_reconciliado d
JOIN public.candidatos c ON c.slug = d.slug
WHERE 'A2-reconciliacao-20260807' = 'A2-reconciliacao-20260807'
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE SET
  total_arrecadado = EXCLUDED.total_arrecadado,
  total_fundo_partidario = EXCLUDED.total_fundo_partidario,
  total_fundo_eleitoral = EXCLUDED.total_fundo_eleitoral,
  total_pessoa_fisica = EXCLUDED.total_pessoa_fisica,
  total_recursos_proprios = EXCLUDED.total_recursos_proprios,
  maiores_doadores = EXCLUDED.maiores_doadores,
  categorias_origem = EXCLUDED.categorias_origem,
  fonte = EXCLUDED.fonte;

-- @write tabela=patrimonio ref=A2-reconciliacao-20260807 campos=valor_total,bens,fonte
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, d.ano_eleicao, d.valor_total, d.bens, 'TSE DivulgaCandContas'
FROM _pf_patrimonio_reconciliado d
JOIN public.candidatos c ON c.slug = d.slug
WHERE 'A2-reconciliacao-20260807' = 'A2-reconciliacao-20260807'
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE SET
  valor_total = EXCLUDED.valor_total,
  bens = EXCLUDED.bens,
  fonte = EXCLUDED.fonte;

CREATE OR REPLACE VIEW public.financiamento_publico AS
SELECT
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.maiores_doadores_publicos AS maiores_doadores,
  f.fonte,
  f.created_at,
  f.categorias_origem
FROM public.financiamento AS f
WHERE public.is_public_candidate(f.candidato_id);

ALTER VIEW public.financiamento_publico SET (security_invoker = true);
GRANT SELECT (categorias_origem) ON TABLE public.financiamento TO anon, authenticated;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;

COMMIT;
`

writeFileSync(outputPath, sql)
console.log(JSON.stringify({
  source_sha256: sourceHash,
  profiles: rows.length,
  financing: financing.length,
  patrimony: patrimony.length,
  output: outputPath,
}))
