-- Instituição de formação como satélite opcional do grau TSE.
-- `candidatos.formacao` continua sendo só o grau. A instituição nunca implica diploma.
-- O backfill vive nas migrations imediatamente posteriores para preservar o gate
-- que proíbe DDL e curadoria no mesmo arquivo.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS formacao_instituicao text;

COMMENT ON COLUMN public.candidatos.formacao_instituicao IS
  'Instituição de formação com fonte, complementar a formacao (grau TSE). Null é ausência comprovada ou ainda não curada; nunca preencher por inferência nem tratar como diploma.';

GRANT SELECT (formacao_instituicao) ON TABLE public.candidatos TO anon, authenticated;

-- Definição de 20260815130000 mais formacao_instituicao no fim. CREATE OR REPLACE
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
    foto_credito,
    formacao_instituicao
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;

-- Mesma regra: coluna nova só no fim. Sem DROP: v_comparador tem consumidores.
CREATE OR REPLACE VIEW public.v_comparador
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.nome_urna,
  c.slug,
  c.partido_sigla,
  c.cargo_disputado,
  c.estado,
  c.foto_url,
  COALESCE(c.idade, EXTRACT(YEAR FROM age(CURRENT_DATE, c.data_nascimento))::INTEGER) AS idade,
  c.formacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS mudancas_partido,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
      AND pa.categoria <> 'feito_positivo'
      AND pa.gravidade IN ('critica', 'alta')
  ) AS alertas_graves,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS patrimonio_declarado,
  (
    SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
  ) AS pontos_atencao,
  c.formacao_instituicao
FROM public.candidatos_publico c;

GRANT SELECT ON public.v_comparador TO anon, authenticated;
