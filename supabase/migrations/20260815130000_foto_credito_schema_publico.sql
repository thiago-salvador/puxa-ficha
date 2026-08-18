-- Crédito estruturado de foto para atribuição verificável na ficha pública.
-- O backfill vive na migration imediatamente posterior para preservar o gate
-- que proíbe DDL e curadoria no mesmo arquivo.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS foto_credito jsonb;

COMMENT ON COLUMN public.candidatos.foto_credito IS
  'Crédito da foto. Shape: {origem: "tse"|"wikimedia_commons"|..., autor, licenca, licenca_url, fonte_url}. Null significa crédito ainda não comprovado; nunca preencher por inferência.';

-- candidatos teve SELECT geral revogado. A view é security_invoker e precisa
-- de privilégio explícito para cada coluna pública acrescentada.
GRANT SELECT (foto_credito) ON TABLE public.candidatos TO anon, authenticated;

-- Definição de 20260809060000 mais foto_credito no fim. CREATE OR REPLACE
-- só permite acrescentar colunas no fim sem derrubar a view e dependentes.
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
    foto_credito
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;
