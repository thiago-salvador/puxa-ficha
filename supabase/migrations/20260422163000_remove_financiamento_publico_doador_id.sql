BEGIN;
-- Fluxo 3 / Dinheiro:
-- Restaura o contrato anon de financiamento_publico removendo qualquer `id`
-- derivado de cpf_hash/cnpj/hash do payload publico de maiores_doadores.
-- Mantem compatibilidade com a RPC de doadores, que consome apenas nome/valor/tipo.

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
      jsonb_build_object(
        'nome', elem.value ->> 'nome',
        'valor', elem.value ->> 'valor',
        'tipo', elem.value ->> 'tipo'
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
