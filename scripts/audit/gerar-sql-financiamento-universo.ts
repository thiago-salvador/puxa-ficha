import { readFileSync, writeFileSync } from "node:fs"

type Target = {
  slug: string
  ano_eleicao: number
  resultado: "publicado" | "zero_declarado" | "ausencia_oficial" | "erro"
  sq_candidato: string | null
  uf_candidatura: string | null
  total_arrecadado?: number
  total_fundo_partidario?: number
  total_fundo_eleitoral?: number
  total_pessoa_fisica?: number
  total_recursos_proprios?: number
  maiores_doadores?: unknown[]
  fonte_url: string
  detalhe?: string
}

const manifestPath =
  process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length) ??
  "QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json"
const tipo = process.argv.find((arg) => arg.startsWith("--tipo="))?.slice("--tipo=".length)
const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { targets: Target[] }
const targets = manifest.targets
const payload = JSON.stringify(targets)
const expected = {
  financiamento: targets.filter((row) => row.resultado === "publicado" || row.resultado === "zero_declarado").length,
  verificacoes: targets.filter((row) => row.resultado === "ausencia_oficial" || row.resultado === "erro").length,
}

const TEMP_TABLE = `
CREATE TEMP TABLE pf_financiamento_alvos (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  resultado text NOT NULL CHECK (
    resultado IN ('publicado', 'zero_declarado', 'ausencia_oficial', 'erro')
  ),
  sq_candidato text,
  uf_candidatura text,
  total_arrecadado numeric,
  total_fundo_partidario numeric,
  total_fundo_eleitoral numeric,
  total_pessoa_fisica numeric,
  total_recursos_proprios numeric,
  maiores_doadores jsonb,
  fonte_url text NOT NULL,
  detalhe text,
  PRIMARY KEY (slug, ano_eleicao)
) ON COMMIT DROP;

INSERT INTO pf_financiamento_alvos
SELECT *
FROM jsonb_to_recordset($_pf_manifest_$${payload}$_pf_manifest_$::jsonb) AS row(
  slug text,
  nome_completo text,
  nome_urna text,
  ano_eleicao integer,
  resultado text,
  sq_candidato text,
  uf_candidatura text,
  total_arrecadado numeric,
  total_fundo_partidario numeric,
  total_fundo_eleitoral numeric,
  total_pessoa_fisica numeric,
  total_recursos_proprios numeric,
  maiores_doadores jsonb,
  fonte_url text,
  detalhe text
);
`.replace(
  "INSERT INTO pf_financiamento_alvos\nSELECT *",
  `INSERT INTO pf_financiamento_alvos (
  slug, ano_eleicao, resultado, sq_candidato, uf_candidatura,
  total_arrecadado, total_fundo_partidario, total_fundo_eleitoral,
  total_pessoa_fisica, total_recursos_proprios, maiores_doadores,
  fonte_url, detalhe
)
SELECT
  slug, ano_eleicao, resultado, sq_candidato, uf_candidatura,
  total_arrecadado, total_fundo_partidario, total_fundo_eleitoral,
  total_pessoa_fisica, total_recursos_proprios, maiores_doadores,
  fonte_url, detalhe`,
)

const READBACK_TEMP_TABLE = TEMP_TABLE
  .replace(
    "  slug text NOT NULL,\n",
    "  slug text NOT NULL,\n  nome_completo text NOT NULL,\n  nome_urna text NOT NULL,\n  candidato_id uuid,\n",
  )
  .replaceAll(
    "  slug, ano_eleicao, resultado, sq_candidato, uf_candidatura,",
    "  slug, nome_completo, nome_urna, ano_eleicao, resultado, sq_candidato, uf_candidatura,",
  )

function migration(): string {
  return `-- Reconciliacao fail-closed dos 235 pleitos sem financiamento coletado.
-- Gerado de QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json.
${TEMP_TABLE}
DO $$
DECLARE
  v_count integer;
BEGIN
  -- O replay linear tem schema completo e nenhuma ficha. Somente esse estado
  -- totalmente vazio vira no-op; qualquer base nao vazia exige a coorte toda.
  IF (
    SELECT min(c.slug)
    FROM public.candidatos c
    JOIN pf_financiamento_alvos a ON a.slug = c.slug
  ) IS NULL THEN
    RAISE NOTICE 'financiamento reconciliado: coorte totalmente ausente; nada a carregar no replay';
    RETURN;
  END IF;
  SELECT count(*) INTO v_count FROM pf_financiamento_alvos;
  IF v_count <> 235 THEN
    RAISE EXCEPTION 'financiamento reconciliado: esperado 235, obtido %', v_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pf_financiamento_alvos
    WHERE (resultado <> 'erro' AND (sq_candidato IS NULL OR uf_candidatura !~ '^[A-Z]{2}$'))
       OR (resultado = 'erro' AND detalhe IS NULL)
  ) THEN
    RAISE EXCEPTION 'financiamento reconciliado: identidade ou erro sem evidencia';
  END IF;
  IF (SELECT count(*) FROM public.candidatos c JOIN pf_financiamento_alvos a ON a.slug = c.slug) <> 235 THEN
    RAISE EXCEPTION 'financiamento reconciliado: slug ausente ou duplicado em candidatos';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pf_financiamento_alvos a
    JOIN public.candidatos c ON c.slug = a.slug
    JOIN public.financiamento f
      ON f.candidato_id = c.id AND f.ano_eleicao = a.ano_eleicao
  ) THEN
    RAISE EXCEPTION 'financiamento reconciliado: universo mudou; existe linha financeira em alvo medido como lacuna';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pf_financiamento_alvos a
    JOIN public.candidatos c ON c.slug = a.slug
    JOIN public.financiamento_verificacoes v
      ON v.candidato_id = c.id AND v.ano_eleicao = a.ano_eleicao
  ) THEN
    RAISE EXCEPTION 'financiamento reconciliado: universo mudou; existe verificacao no alvo';
  END IF;
END
$$;

-- @write tabela=financiamento ref=pf-ajustes-financiamento-20260810 campos=ano_eleicao,sq_candidato,uf_candidatura,total_arrecadado,total_fundo_partidario,total_fundo_eleitoral,total_pessoa_fisica,total_recursos_proprios,maiores_doadores,fonte
INSERT INTO public.financiamento (
  candidato_id, ano_eleicao, sq_candidato, uf_candidatura,
  total_arrecadado, total_fundo_partidario, total_fundo_eleitoral,
  total_pessoa_fisica, total_recursos_proprios, maiores_doadores, fonte
)
SELECT
  c.id, a.ano_eleicao, a.sq_candidato, a.uf_candidatura,
  a.total_arrecadado, coalesce(a.total_fundo_partidario, 0),
  coalesce(a.total_fundo_eleitoral, 0), coalesce(a.total_pessoa_fisica, 0),
  coalesce(a.total_recursos_proprios, 0), coalesce(a.maiores_doadores, '[]'::jsonb),
  'pf-ajustes-financiamento-20260810'
FROM pf_financiamento_alvos a
JOIN public.candidatos c ON c.slug = a.slug
WHERE a.resultado IN ('publicado', 'zero_declarado')
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE SET
  sq_candidato = EXCLUDED.sq_candidato,
  uf_candidatura = EXCLUDED.uf_candidatura,
  total_arrecadado = EXCLUDED.total_arrecadado,
  total_fundo_partidario = EXCLUDED.total_fundo_partidario,
  total_fundo_eleitoral = EXCLUDED.total_fundo_eleitoral,
  total_pessoa_fisica = EXCLUDED.total_pessoa_fisica,
  total_recursos_proprios = EXCLUDED.total_recursos_proprios,
  maiores_doadores = EXCLUDED.maiores_doadores,
  fonte = EXCLUDED.fonte;

-- @write tabela=financiamento_verificacoes ref=pf-ajustes-financiamento-20260810 campos=ano_eleicao,sq_candidato,uf_candidatura,resultado,fonte_url,verificado_em,detalhe,execucao
INSERT INTO public.financiamento_verificacoes (
  candidato_id, ano_eleicao, sq_candidato, uf_candidatura, resultado,
  fonte_url, verificado_em, detalhe, execucao
)
SELECT
  c.id, a.ano_eleicao, a.sq_candidato, a.uf_candidatura, a.resultado,
  a.fonte_url, '2026-08-10T00:00:00.000Z'::timestamptz, a.detalhe,
  'pf-ajustes-financiamento-20260810'
FROM pf_financiamento_alvos a
JOIN public.candidatos c ON c.slug = a.slug
WHERE a.resultado IN ('ausencia_oficial', 'erro')
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE SET
  sq_candidato = EXCLUDED.sq_candidato,
  uf_candidatura = EXCLUDED.uf_candidatura,
  resultado = EXCLUDED.resultado,
  fonte_url = EXCLUDED.fonte_url,
  verificado_em = EXCLUDED.verificado_em,
  detalhe = EXCLUDED.detalhe,
  execucao = EXCLUDED.execucao,
  updated_at = now();

-- @write tabela=coleta_log ref=pf-ajustes-financiamento-20260810 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log (
  fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao
)
SELECT
  'tse', 'candidato', a.slug || ':' || a.ano_eleicao, c.id,
  CASE
    WHEN a.resultado IN ('publicado', 'zero_declarado') THEN 'encontrado'
    WHEN a.resultado = 'ausencia_oficial' THEN 'vazio_confirmado'
    ELSE 'erro'
  END,
  CASE WHEN a.resultado IN ('publicado', 'zero_declarado') THEN 1 ELSE 0 END,
  coalesce(a.detalhe, 'Receita oficial reconciliada por SQ_CANDIDATO, ano e UF.'),
  a.fonte_url,
  'pf-ajustes-financiamento-20260810'
FROM pf_financiamento_alvos a
JOIN public.candidatos c ON c.slug = a.slug;

DO $$
BEGIN
  IF (
    SELECT min(c.slug)
    FROM public.candidatos c
    JOIN pf_financiamento_alvos a ON a.slug = c.slug
  ) IS NULL THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.financiamento WHERE fonte = 'pf-ajustes-financiamento-20260810') <> ${expected.financiamento} THEN
    RAISE EXCEPTION 'financiamento reconciliado: cardinalidade financeira divergente';
  END IF;
  IF (SELECT count(*) FROM public.financiamento_verificacoes WHERE execucao = 'pf-ajustes-financiamento-20260810') <> ${expected.verificacoes} THEN
    RAISE EXCEPTION 'financiamento reconciliado: cardinalidade de verificacoes divergente';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'pf-ajustes-financiamento-20260810') <> 235 THEN
    RAISE EXCEPTION 'financiamento reconciliado: cardinalidade de proveniencia divergente';
  END IF;
END
$$;

`
}

function rollback(): string {
  return `-- Rollback pareado da carga pf-ajustes-financiamento-20260810.
DO $$
BEGIN
  IF (
    (SELECT count(*) FROM public.financiamento WHERE fonte = 'pf-ajustes-financiamento-20260810') +
    (SELECT count(*) FROM public.financiamento_verificacoes WHERE execucao = 'pf-ajustes-financiamento-20260810')
  ) <> 235 THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: coorte divergente de 235';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'pf-ajustes-financiamento-20260810') <> 235 THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: proveniencia divergente de 235';
  END IF;
END
$$;

-- @write tabela=coleta_log ref=pf-ajustes-financiamento-20260810 campos=execucao
DELETE FROM public.coleta_log
WHERE execucao = 'pf-ajustes-financiamento-20260810';

-- @write tabela=financiamento_verificacoes ref=pf-ajustes-financiamento-20260810 campos=execucao
DELETE FROM public.financiamento_verificacoes
WHERE execucao = 'pf-ajustes-financiamento-20260810';

-- @write tabela=financiamento ref=pf-ajustes-financiamento-20260810 campos=fonte
DELETE FROM public.financiamento
WHERE fonte = 'pf-ajustes-financiamento-20260810';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'pf-ajustes-financiamento-20260810')
     OR EXISTS (SELECT 1 FROM public.financiamento_verificacoes WHERE execucao = 'pf-ajustes-financiamento-20260810')
     OR EXISTS (SELECT 1 FROM public.financiamento WHERE fonte = 'pf-ajustes-financiamento-20260810') THEN
    RAISE EXCEPTION 'rollback pf-ajustes-financiamento-20260810: residuos apos exclusao';
  END IF;
END
$$;

`
}

function readback(): string {
  return `-- Readback da coorte reconciliada. Somente leitura.
BEGIN;
${READBACK_TEMP_TABLE}
DO $$
DECLARE
  v_ledger integer;
  v_identidade_mismatch integer;
  v_mismatch integer;
  v_nao_coletado integer;
  v_payload_mismatch integer;
  v_financiamentos_lote integer;
  v_verificacoes_lote integer;
  v_logs_lote integer;
BEGIN
  SELECT count(*) INTO v_ledger
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260810121000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810121000: ledger=% (esperado 1)', v_ledger;
  END IF;

  UPDATE pf_financiamento_alvos a
  SET candidato_id = c.id
  FROM public.candidatos c
  WHERE c.nome_completo = a.nome_completo
    AND c.nome_urna = a.nome_urna
    AND (
      c.slug = a.slug
      OR (
        a.slug = 'orleans-brandao'
        AND c.id = '47a1de10-1cf7-47f8-837b-dbbf94480421'
        AND EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '20260811102100'
        )
      )
    );

  SELECT count(*) INTO v_identidade_mismatch
  FROM pf_financiamento_alvos
  WHERE candidato_id IS NULL;

  SELECT count(*) INTO v_mismatch
  FROM pf_financiamento_alvos a
  JOIN public.candidatos c ON c.id = a.candidato_id
  LEFT JOIN public.financiamento f
    ON f.candidato_id = c.id AND f.ano_eleicao = a.ano_eleicao
  LEFT JOIN public.financiamento_verificacoes v
    ON v.candidato_id = c.id AND v.ano_eleicao = a.ano_eleicao
  WHERE a.resultado IS DISTINCT FROM CASE
    WHEN f.id IS NOT NULL AND f.total_arrecadado = 0 THEN 'zero_declarado'
    WHEN f.id IS NOT NULL THEN 'publicado'
    WHEN v.resultado = 'ausencia_oficial' THEN 'ausencia_oficial'
    WHEN v.resultado = 'erro' THEN 'erro'
    ELSE 'nao_coletado'
  END;

  SELECT count(*) INTO v_nao_coletado
  FROM pf_financiamento_alvos a
  JOIN public.candidatos c ON c.id = a.candidato_id
  LEFT JOIN public.financiamento f
    ON f.candidato_id = c.id AND f.ano_eleicao = a.ano_eleicao
  LEFT JOIN public.financiamento_verificacoes v
    ON v.candidato_id = c.id AND v.ano_eleicao = a.ano_eleicao
  WHERE f.id IS NULL AND v.resultado IS NULL;

  SELECT count(*) INTO v_payload_mismatch
  FROM pf_financiamento_alvos a
  JOIN public.candidatos c ON c.id = a.candidato_id
  LEFT JOIN public.financiamento f
    ON f.candidato_id = c.id AND f.ano_eleicao = a.ano_eleicao
  LEFT JOIN public.financiamento_verificacoes v
    ON v.candidato_id = c.id AND v.ano_eleicao = a.ano_eleicao
  LEFT JOIN public.coleta_log l
    ON l.candidato_id = c.id
   AND l.alvo = a.slug || ':' || a.ano_eleicao
   AND l.execucao = 'pf-ajustes-financiamento-20260810'
  WHERE
    l.id IS NULL
    OR l.fonte IS DISTINCT FROM 'tse'
    OR l.escopo IS DISTINCT FROM 'candidato'
    OR l.natureza IS DISTINCT FROM 'coleta'
    OR l.url IS DISTINCT FROM a.fonte_url
    OR l.detalhe IS DISTINCT FROM coalesce(a.detalhe, 'Receita oficial reconciliada por SQ_CANDIDATO, ano e UF.')
    OR l.resultado IS DISTINCT FROM CASE
      WHEN a.resultado IN ('publicado', 'zero_declarado') THEN 'encontrado'
      WHEN a.resultado = 'ausencia_oficial' THEN 'vazio_confirmado'
      ELSE 'erro'
    END
    OR l.volume IS DISTINCT FROM CASE
      WHEN a.resultado IN ('publicado', 'zero_declarado') THEN 1
      ELSE 0
    END
    OR (
      a.resultado IN ('publicado', 'zero_declarado')
      AND (
        f.id IS NULL
        OR v.id IS NOT NULL
        OR f.sq_candidato IS DISTINCT FROM a.sq_candidato
        OR f.uf_candidatura IS DISTINCT FROM a.uf_candidatura
        OR f.total_arrecadado IS DISTINCT FROM a.total_arrecadado
        OR f.total_fundo_partidario IS DISTINCT FROM coalesce(a.total_fundo_partidario, 0)
        OR f.total_fundo_eleitoral IS DISTINCT FROM coalesce(a.total_fundo_eleitoral, 0)
        OR f.total_pessoa_fisica IS DISTINCT FROM coalesce(a.total_pessoa_fisica, 0)
        OR f.total_recursos_proprios IS DISTINCT FROM coalesce(a.total_recursos_proprios, 0)
        OR f.maiores_doadores IS DISTINCT FROM coalesce(a.maiores_doadores, '[]'::jsonb)
        OR f.fonte IS DISTINCT FROM 'pf-ajustes-financiamento-20260810'
      )
    )
    OR (
      a.resultado IN ('ausencia_oficial', 'erro')
      AND (
        f.id IS NOT NULL
        OR v.id IS NULL
        OR v.sq_candidato IS DISTINCT FROM a.sq_candidato
        OR v.uf_candidatura IS DISTINCT FROM a.uf_candidatura
        OR v.resultado IS DISTINCT FROM a.resultado
        OR v.fonte_url IS DISTINCT FROM a.fonte_url
        OR v.verificado_em IS DISTINCT FROM '2026-08-10T00:00:00.000Z'::timestamptz
        OR v.detalhe IS DISTINCT FROM a.detalhe
        OR v.execucao IS DISTINCT FROM 'pf-ajustes-financiamento-20260810'
      )
    );

  SELECT count(*) INTO v_financiamentos_lote
    FROM public.financiamento WHERE fonte='pf-ajustes-financiamento-20260810';
  SELECT count(*) INTO v_verificacoes_lote
    FROM public.financiamento_verificacoes WHERE execucao='pf-ajustes-financiamento-20260810';
  SELECT count(*) INTO v_logs_lote
    FROM public.coleta_log WHERE execucao='pf-ajustes-financiamento-20260810';

  IF (SELECT count(*) FROM pf_financiamento_alvos) <> 235 OR v_identidade_mismatch <> 0
     OR v_mismatch <> 0 OR v_nao_coletado <> 0 OR v_payload_mismatch <> 0
     OR v_financiamentos_lote <> ${expected.financiamento} OR v_verificacoes_lote <> ${expected.verificacoes} OR v_logs_lote <> 235 THEN
    RAISE EXCEPTION 'readback financiamento: alvo=235 identidade_mismatch=% estado_mismatch=% payload_mismatch=% nao_coletado=% financiamento=% verificacoes=% logs=%',
      v_identidade_mismatch, v_mismatch, v_payload_mismatch, v_nao_coletado, v_financiamentos_lote, v_verificacoes_lote, v_logs_lote;
  END IF;
  IF (SELECT total_arrecadado FROM public.financiamento f JOIN public.candidatos c ON c.id=f.candidato_id WHERE c.slug='cabo-daciolo' AND f.ano_eleicao=2006) <> 1259.44
     OR (SELECT total_arrecadado FROM public.financiamento f JOIN public.candidatos c ON c.id=f.candidato_id WHERE c.slug='cabo-daciolo' AND f.ano_eleicao=2008) <> 720
     OR (SELECT total_arrecadado FROM public.financiamento f JOIN public.candidatos c ON c.id=f.candidato_id WHERE c.slug='flavio-bolsonaro' AND f.ano_eleicao=2002) <> 5988
     OR (SELECT total_arrecadado FROM public.financiamento f JOIN public.candidatos c ON c.id=f.candidato_id WHERE c.slug='rui-costa-pimenta' AND f.ano_eleicao=2006) <> 11000 THEN
    RAISE EXCEPTION 'readback financiamento: regressao nomeada divergente';
  END IF;
END
$$;

SELECT
  a.resultado,
  count(*) AS pleitos
FROM pf_financiamento_alvos a
GROUP BY a.resultado
ORDER BY a.resultado;

ROLLBACK;
`
}

const output = tipo === "migration" ? migration() : tipo === "rollback" ? rollback() : tipo === "readback" ? readback() : null
if (!output) throw new Error("use --tipo=migration, --tipo=rollback ou --tipo=readback")
if (outputPath) writeFileSync(outputPath, output)
else process.stdout.write(output)
