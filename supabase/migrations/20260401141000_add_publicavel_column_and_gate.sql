BEGIN;

-- Add publicavel column: fail-closed gate for publication
-- Default true so existing candidates remain visible until audit marks them otherwise
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS publicavel BOOLEAN DEFAULT true;

-- Recreate candidatos_publico with publicavel filter
CREATE OR REPLACE VIEW public.candidatos_publico AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao
FROM public.candidatos c
WHERE c.status != 'removido' AND c.publicavel = true;

-- v_ficha_candidato derives from candidatos_publico so it inherits the filter
DROP VIEW IF EXISTS public.v_ficha_candidato;
CREATE VIEW public.v_ficha_candidato AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id AND p.tipo = 'criminal') AS processos_criminais,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS total_mudancas_partido,
  (SELECT COUNT(*) FROM public.pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.visivel = TRUE) AS total_pontos_atencao,
  (SELECT COUNT(*) FROM public.pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.gravidade = 'critica') AS pontos_criticos,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ultimo_patrimonio,
  (SELECT pat.ano_eleicao FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ano_ultimo_patrimonio
FROM public.candidatos_publico c;

-- v_comparador also derives from candidatos_publico
DROP VIEW IF EXISTS public.v_comparador;
CREATE VIEW public.v_comparador AS
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
  (SELECT COUNT(*) FROM public.pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.gravidade IN ('critica', 'alta')) AS alertas_graves,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS patrimonio_declarado,
  (
    SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id AND pa.visivel = TRUE
  ) AS pontos_atencao
FROM public.candidatos_publico c;

-- Maintain grants
GRANT SELECT ON public.candidatos_publico TO anon, authenticated;
GRANT SELECT ON public.v_ficha_candidato TO anon, authenticated;
GRANT SELECT ON public.v_comparador TO anon, authenticated;

COMMIT;
