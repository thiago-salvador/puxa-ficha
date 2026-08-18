-- Rollback das 3 migrations da branch data/presidenciaveis-lacunas (2026-08-02).
--
-- NÃO fica em supabase/migrations de propósito: este arquivo não deve entrar no
-- fluxo automático de migração. É o desfazer manual do run de aplicação, escrito
-- ANTES de aplicar, para que reverter não dependa de improviso na hora.
--
-- Alvo exato: as 18 escritas declaradas em
-- scripts/audit/allowlist-presidenciaveis.json. Nada além disso é tocado.
--
-- As 3 migrations são aditivas e guardadas por NOT EXISTS, então este rollback
-- é seguro de rodar mesmo que só parte delas tenha sido aplicada.
--
-- Uso: rodar dentro de UMA transação, conferir as contagens do bloco final
-- ANTES de dar COMMIT.

BEGIN;

-- 1. financiamento 2006 (20260802120000): 2 linhas.
DELETE FROM public.financiamento f
USING public.candidatos c
WHERE c.id = f.candidato_id
  AND f.ano_eleicao = 2006
  AND c.slug IN ('lula', 'rui-costa-pimenta');

-- 2. posicoes_declaradas (20260802130000): 13 linhas.
-- O filtro por url_fonte NOT NULL protege as 14 linhas antigas, que foram
-- gravadas com fonte 'Curadoria Puxa Ficha' e url_fonte NULA e não pertencem a
-- este run.
DELETE FROM public.posicoes_declaradas p
USING public.candidatos c
WHERE c.id = p.candidato_id
  AND p.url_fonte IS NOT NULL
  AND p.verificado = false
  AND c.slug IN (
    'augusto-cury', 'cabo-daciolo', 'edmilson-costa', 'flavio-bolsonaro',
    'hertz-dias', 'renan-santos', 'rui-costa-pimenta', 'samara-martins'
  );

-- 3. destaques (20260802140000): 3 linhas voltam a destaque = false.
-- O destaque pré-existente do ronaldo-caiado não está nesta lista e continua.
UPDATE public.projetos_lei pl
SET destaque = false, destaque_motivo = NULL
FROM public.candidatos c
WHERE c.id = pl.candidato_id
  AND c.slug = 'flavio-bolsonaro'
  AND pl.proposicao_id_api IN ('136918', '148903', '138702');

-- Conferência antes do COMMIT. Valores esperados no estado pré-aplicação:
--   financiamento_2006_coorte = 0
--   posicoes_com_url          = 0
--   destaques_flavio          = 0
--   destaques_total           = 1  (o do ronaldo-caiado, intocado)
SELECT
  (SELECT count(*) FROM public.financiamento f
     JOIN public.candidatos c ON c.id = f.candidato_id
    WHERE f.ano_eleicao = 2006 AND c.slug IN ('lula', 'rui-costa-pimenta')) AS financiamento_2006_coorte,
  (SELECT count(*) FROM public.posicoes_declaradas WHERE url_fonte IS NOT NULL) AS posicoes_com_url,
  (SELECT count(*) FROM public.projetos_lei pl
     JOIN public.candidatos c ON c.id = pl.candidato_id
    WHERE c.slug = 'flavio-bolsonaro' AND pl.destaque) AS destaques_flavio,
  (SELECT count(*) FROM public.projetos_lei WHERE destaque) AS destaques_total;

-- COMMIT;   -- descomentar só depois de conferir os quatro números acima
ROLLBACK;
