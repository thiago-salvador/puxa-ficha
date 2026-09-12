-- Situação da vice no domínio DivulgaCand, independente dos códigos do CSV.
BEGIN;
LOCK TABLE public.chapas_2026 IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.chapas_2026 ADD COLUMN vice_situacao_divulgacand jsonb;
ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_vice_situacao_divulgacand_check CHECK (
  vice_situacao_divulgacand IS NULL OR (
    identidade_status='confirmada' AND vinculo_titular_status='confirmado'
    AND eleicao_codigo='6259' AND eleicao_data='2026-10-04'::date
    AND titular_sq_candidato IS NOT NULL AND vice_sq_candidato IS NOT NULL
    AND vice_situacao_divulgacand - ARRAY['domain','situacao_vice','status','titular_sq_candidato','vice_sq_candidato','vice_nome_urna','vice_partido_sigla','uf','source_url','source_sha256','checked_at'] = '{}'::jsonb
    AND vice_situacao_divulgacand @> jsonb_build_object(
      'domain','divulgacand_vices','situacao_vice',3,'status','inapto',
      'titular_sq_candidato',titular_sq_candidato,'vice_sq_candidato',vice_sq_candidato,
      'vice_nome_urna',vice_nome_urna,'vice_partido_sigla',vice_partido_sigla,'uf',coalesce(uf,'BR'),
      'source_url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || coalesce(uf,'BR') || '/20322002026/candidato/' || titular_sq_candidato)
    AND jsonb_typeof(vice_situacao_divulgacand->'source_sha256')='string'
    AND (vice_situacao_divulgacand->>'source_sha256') ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(vice_situacao_divulgacand->'checked_at')='string'
    AND isfinite((vice_situacao_divulgacand->>'checked_at')::timestamptz)
  ) IS TRUE
);
-- Append only: mantém ordem, segurança, owner, grants e dependências da view.
CREATE OR REPLACE VIEW public.chapas_2026_publico WITH (security_invoker=true) AS
SELECT ch.chave, ch.eleicao_codigo, ch.eleicao_data, ch.uf, ch.cargo_titular,
ch.identidade_status, ch.vinculo_titular_status, ch.tse_situacao_codigo,
ch.titular_candidato_id, titular.slug AS titular_slug, ch.titular_nome_completo,
ch.titular_nome_urna, ch.titular_partido_sigla, ch.vice_candidato_id, vice.slug AS vice_slug,
ch.vice_nome_completo, ch.vice_nome_urna, ch.vice_partido_sigla, ch.fonte_url,
ch.fonte_sha256, ch.snapshot_em, ch.titular_sq_candidato, ch.vice_sq_candidato, ch.vice_situacao_divulgacand
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id
WHERE ch.identidade_status='confirmada' AND titular.id IS NOT NULL;
COMMIT;
