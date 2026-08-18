-- Sanitiza inconsistencias de candidatos publicados (auditoria DB<->UI 2026-06-04).
-- Cada fix foi confirmado contra a realidade (web, ult. 30d) e contra o valor real
-- de candidatos_publico antes de aplicar. Casos suspeitos do sweep que se revelaram
-- falsos positivos (Tadeu de Souza segue Deputado Federal; Breno Barcelar e
-- pre-candidato real do Missao/ES; 12 trocas de partido ja corretas no DB) foram
-- deliberadamente NAO tocados.
BEGIN;

-- 1) Teresa Surita (Senador/RR): situacao_candidatura carregava a string stale
--    "APTO [2022]" (residuo do TSE 2022) numa linha publicada. Normaliza para o
--    valor canonico do recorte. Segue pre-candidata confirmada ao Senado.
UPDATE public.candidatos
SET situacao_candidatura = 'pre-candidato',
    ultima_atualizacao = NOW()
WHERE slug = 'teresa-surita'
  AND situacao_candidatura = 'APTO [2022]';

-- 2) Guilherme Derrite (Senador/SP): status divergente "ativo" (todos os demais
--    publicados usam "pre-candidato"). Normaliza o valor de status.
UPDATE public.candidatos
SET status = 'pre-candidato',
    ultima_atualizacao = NOW()
WHERE slug = 'guilherme-derrite'
  AND status = 'ativo';

-- 3) Andre Kamai (Deputado Federal/AC): situacao_candidatura NULL numa linha ativa
--    e publicada. Cargo correto (confirmado: pre-candidato a deputado federal pelo
--    PT-AC). Preenche a situacao para alinhar com status.
UPDATE public.candidatos
SET situacao_candidatura = 'pre-candidato',
    ultima_atualizacao = NOW()
WHERE slug = 'andre-kamai'
  AND situacao_candidatura IS NULL;

-- 4) Anderson Ferreira (PE): publicado como Senador, mas recuou da disputa ao
--    Senado em mai/2026 e vai disputar a Camara Federal pelo PL (Diario de
--    Pernambuco, 2026-05; FalaNews). Corrige o cargo para Deputado Federal.
UPDATE public.candidatos
SET cargo_disputado = 'Deputado Federal',
    situacao_candidatura = 'pre-candidato',
    ultima_atualizacao = NOW()
WHERE slug = 'anderson-ferreira'
  AND cargo_disputado = 'Senador';

-- 5) Wanderlei Barbosa (TO): linha-lixo publicada com cargo_disputado = 'Nenhum'
--    e status = 'desistente' (governador no 2o mandato, constitucionalmente
--    impedido de reeleicao; Republicanos nao lanca candidato proprio ao governo).
--    Mesmo tratamento dado a jose-carlos-aleluia / pedro-cunha-lima em
--    20260520222500: despublicar a linha sem cargo de disputa.
UPDATE public.candidatos
SET publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug = 'wanderlei-barbosa'
  AND cargo_disputado = 'Nenhum';

-- Pos-condicoes: assercoes contra a superficie publica (candidatos_publico).
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT COUNT(*) INTO bad FROM public.candidatos_publico
    WHERE situacao_candidatura = 'APTO [2022]';
  IF bad <> 0 THEN RAISE EXCEPTION 'sanitize: ainda ha % linha(s) publicada(s) com situacao APTO [2022]', bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.candidatos_publico WHERE status = 'ativo';
  IF bad <> 0 THEN RAISE EXCEPTION 'sanitize: ainda ha % linha(s) publicada(s) com status ativo', bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.candidatos_publico
    WHERE cargo_disputado = 'Nenhum';
  IF bad <> 0 THEN RAISE EXCEPTION 'sanitize: ainda ha % linha(s) publicada(s) com cargo Nenhum', bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.candidatos_publico WHERE slug = 'wanderlei-barbosa';
  IF bad <> 0 THEN RAISE EXCEPTION 'sanitize: wanderlei-barbosa deveria estar oculto da view publica'; END IF;

  SELECT COUNT(*) INTO bad FROM public.candidatos_publico
    WHERE slug = 'anderson-ferreira' AND cargo_disputado = 'Deputado Federal';
  IF bad <> 1 THEN RAISE EXCEPTION 'sanitize: anderson-ferreira deveria estar publicado como Deputado Federal'; END IF;

  SELECT COUNT(*) INTO bad FROM public.candidatos_publico
    WHERE situacao_candidatura IS NULL;
  IF bad <> 0 THEN RAISE EXCEPTION 'sanitize: ainda ha % linha(s) publicada(s) com situacao NULL', bad; END IF;
END $$;

COMMIT;
