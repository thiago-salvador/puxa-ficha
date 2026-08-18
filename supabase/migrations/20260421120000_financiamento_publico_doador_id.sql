BEGIN;
-- Fluxo 3 / Dinheiro:
-- Atualiza a view publica financiamento_publico para expor `id` nao-sensivel
-- em maiores_doadores quando houver dados suficientes no armazenamento bruto.
-- Prioridade:
-- 1. preserva `id` ja persistido no JSON bruto;
-- 2. deriva de `cpf_hash` truncado (16 hex);
-- 3. deriva de hash SHA-256 de `pj:` + CNPJ (16 hex).
-- cpf_hash e cnpj continuam fora do payload publico.

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
  COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'nome', elem.value ->> 'nome',
          'valor', elem.value ->> 'valor',
          'tipo', elem.value ->> 'tipo',
          'id',
            COALESCE(
              NULLIF(trim(elem.value ->> 'id'), ''),
              CASE
                WHEN NULLIF(trim(elem.value ->> 'cpf_hash'), '') IS NOT NULL
                  THEN left(trim(elem.value ->> 'cpf_hash'), 16)
                WHEN length(regexp_replace(COALESCE(elem.value ->> 'cnpj', ''), '\D', '', 'g')) = 14
                  THEN substring(
                    encode(extensions.digest('pj:' || regexp_replace(elem.value ->> 'cnpj', '\D', '', 'g'), 'sha256'), 'hex')
                    FROM 1 FOR 16
                  )
                ELSE NULL
              END
            )
        )
      )
      ORDER BY (elem.value ->> 'valor')::numeric DESC NULLS LAST
    ) FILTER (WHERE elem.value IS NOT NULL),
    '[]'::jsonb
  ) AS maiores_doadores,
  f.fonte,
  f.created_at
FROM public.financiamento f
LEFT JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN f.maiores_doadores IS NOT NULL AND jsonb_typeof(f.maiores_doadores) = 'array' THEN f.maiores_doadores
    ELSE '[]'::jsonb
  END
) AS elem(value) ON true
WHERE public.is_public_candidate(f.candidato_id)
GROUP BY
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.fonte,
  f.created_at;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;
COMMIT;
