-- Escopo editorial do lancamento oficial (2026-07-26, decisao do mantenedor).
--
-- O site passa a cobrir apenas Presidente e Governador. Senado e Camara ficam
-- fora por ora: a cobertura atual desses dois cargos e residual (7 senadores e
-- 4 deputados federais, contra 54 cadeiras de Senado e 513 de Camara em
-- disputa numa eleicao geral), e uma amostra desse tamanho nao informa o
-- eleitor, so sugere uma cobertura que o produto nao entrega.
--
-- Vice-Governador FICA publicado: compoe a chapa de Governador, que o site
-- cobre, e nao e uma casa legislativa descoberta.
--
-- Isto e despublicacao, nao delecao: nenhuma linha sai do banco, o dado de
-- cada ficha continua intacto e reverter e um UPDATE com publicavel = true.
-- O gate e a clausula "publicavel = true" da view public.candidatos_publico,
-- de onde derivam todas as superficies publicas (home, /uf, /rankings,
-- /comparar, /quiz, /doadores, sitemap, search-index, candidato-slugs que
-- governa o 404 do middleware, alertas e news). Nenhuma superficie precisa
-- saber deste recorte: elas leem a view.
--
-- Efeito esperado: 195 publicaveis -> 184 (168 Governador, 13 Presidente,
-- 3 Vice-Governador).
--
-- Assinaturas de alerta dos 11 candidatos permanecem no banco e simplesmente
-- param de receber digest, porque /api/alerts/send-digest tambem le a view.
BEGIN;

UPDATE public.candidatos
SET publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug IN (
        -- Senador (7)
        'eduardo-braga',        -- AM, MDB
        'janaina-riva',         -- MT, MDB
        'delegado-eder-mauro',  -- PA, PL
        'guto-silva',           -- PR, PSD
        'dr-fernando-maximo',   -- RO, PL
        'teresa-surita',        -- RR, MDB
        'guilherme-derrite',    -- SP, PP
        -- Deputado Federal (4)
        'andre-kamai',          -- AC, PT
        'tadeu-de-souza',       -- AM, PP
        'anderson-ferreira',    -- PE, PL
        'paulo-serra'           -- SP, PSDB
      )
  AND cargo_disputado IN ('Senador', 'Deputado Federal')
  AND publicavel IS DISTINCT FROM false;

DO $$
DECLARE
  legislativo_visivel integer;
  total_publicado integer;
  por_cargo text;
BEGIN
  SELECT COUNT(*) INTO legislativo_visivel
  FROM public.candidatos_publico
  WHERE cargo_disputado IN ('Senador', 'Deputado Federal');

  IF legislativo_visivel <> 0 THEN
    RAISE EXCEPTION
      'despublicar_senado_camara: ainda ha % candidato(s) de Senado/Camara na view publica',
      legislativo_visivel;
  END IF;

  SELECT COUNT(*) INTO total_publicado FROM public.candidatos_publico;

  IF total_publicado <> 184 THEN
    SELECT string_agg(cargo_disputado || '=' || total, ', ' ORDER BY cargo_disputado)
      INTO por_cargo
    FROM (
      SELECT cargo_disputado, COUNT(*) AS total
      FROM public.candidatos_publico
      GROUP BY cargo_disputado
    ) t;

    RAISE EXCEPTION
      'despublicar_senado_camara: esperado 184 publicados, encontrado % (%)',
      total_publicado, por_cargo;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select cargo_disputado, count(*)
--     from public.candidatos_publico
--    group by cargo_disputado
--    order by 2 desc;
--   -- esperado: Governador 168, Presidente 13, Vice-Governador 3. Total 184.
--
--   select slug, cargo_disputado, publicavel
--     from public.candidatos
--    where cargo_disputado in ('Senador', 'Deputado Federal')
--    order by cargo_disputado, slug;
--   -- esperado: todas as linhas com publicavel = false, nenhuma deletada.
--
-- Reversao (quando a cobertura das duas casas justificar o retorno):
--
--   update public.candidatos
--      set publicavel = true, ultima_atualizacao = now()
--    where slug in (...) and cargo_disputado in ('Senador', 'Deputado Federal');
