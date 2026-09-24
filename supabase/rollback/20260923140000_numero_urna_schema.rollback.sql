BEGIN;

DO $precondition$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE numero_urna IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback numero_urna: há valores preenchidos; remover o backfill separadamente antes do rollback';
  END IF;
END
$precondition$;

CREATE OR REPLACE VIEW public.candidatos_publico
WITH (security_invoker = true) AS
 SELECT id,
    nome_completo,
    nome_urna,
    slug,
    data_nascimento,
    COALESCE(idade, EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, data_nascimento::timestamp with time zone))::integer) AS idade,
    naturalidade,
    formacao,
    profissao_declarada,
    genero,
    estado_civil,
    cor_raca,
    partido_atual,
    partido_sigla,
    cargo_atual,
    cargo_disputado,
    estado,
    status,
    situacao_candidatura,
    biografia,
    foto_url,
    site_campanha,
    redes_sociais,
    ( SELECT array_agg(f.valor ORDER BY f.ord)
        FROM unnest(c.fonte_dados) WITH ORDINALITY AS f(valor, ord)
       WHERE f.valor NOT LIKE 'interno:%') AS fonte_dados,
    ultima_atualizacao,
    verificacao_campos,
    foto_credito,
    formacao_instituicao
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;
REVOKE SELECT (numero_urna) ON TABLE public.candidatos FROM anon, authenticated;
DROP INDEX IF EXISTS public.candidatos_numero_urna_estado_cargo_idx;
ALTER TABLE public.candidatos DROP COLUMN numero_urna;

COMMIT;
