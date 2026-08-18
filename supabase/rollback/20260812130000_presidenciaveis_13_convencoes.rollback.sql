-- Rollback da 20260812130000_presidenciaveis_13_convencoes.sql.
--
-- Desfaz TUDO o que a forward fez: as tres fichas novas, o cargo de cabo-daciolo
-- e a linha do ledger. A guarda fica dentro do proprio SQL, nao em comentario
-- esperando que alguem lembre de descomentar.
--
-- GUARDA: se qualquer uma das tres fichas novas ja tiver recebido dado de ficha
-- (patrimonio, financiamento, historico, processos, votacoes, noticias ou
-- posicoes), o rollback ABORTA. Apagar a ficha levaria junto coleta que nao veio
-- desta migration.

-- GUARDA 0: o estado tem que ser EXATAMENTE o que a forward deixou. O guard de
-- tabelas-filhas sozinho nao prova isso: ele nao distingue "a forward rodou" de
-- "alguem criou fichas com estes slugs por outro caminho", e nao veria uma
-- escrita direta em `candidatos` que tenha mudado o cabo-daciolo depois. Sem
-- esta verificacao, o rollback apagaria linha de terceiro e rebaixaria um estado
-- mais novo do daciolo para Presidente.
DO $$
DECLARE
  ancora int;
  novos int;
  exatos int;
  daciolo_ok int;
  n int;
BEGIN
  SELECT count(*) INTO ancora FROM public.candidatos WHERE slug = 'cabo-daciolo';
  SELECT count(*) INTO novos
  FROM public.candidatos
  WHERE slug IN ('clariana-barao', 'leonardo-avalanche', 'wilson-grassi-junior');

  -- A forward e no-op de DADO quando a ancora nao existe (banco de replay, fork,
  -- banco novo), e mesmo assim grava a versao no ledger. Nesse estado o rollback
  -- correto e remover SO a linha do ledger: abortar aqui deixaria a versao presa
  -- para sempre. O DELETE e o UPDATE abaixo nao casam nada, por slug.
  IF ancora = 0 AND novos = 0 THEN
    RAISE NOTICE 'Forward foi no-op de dado neste banco: rollback remove apenas a versao do ledger';
    RETURN;
  END IF;

  IF novos <> 3 THEN
    RAISE EXCEPTION 'Rollback abortado: estado parcial, % de 3 fichas presentes', novos;
  END IF;

  -- Estado COMPLETO de cada ficha nova, incluindo o array `fonte_dados` inteiro.
  -- Conferir so o marcador deixaria passar linha com nome, partido, status ou
  -- fonte alterados depois da forward, e o DELETE abaixo a destruiria.
  -- `estado` sai da tupla e vira condicao propria. Comparacao de linha que
  -- contem NULL devolve NULL, nao TRUE, entao a versao com `estado` dentro do
  -- `IN` daria `exatos = 0` SEMPRE e o rollback nunca rodaria.
  SELECT count(*) INTO exatos
  FROM public.candidatos c
  WHERE c.estado IS NULL
    AND (c.slug, c.nome_completo, c.nome_urna, c.partido_sigla, c.partido_atual,
         c.cargo_disputado, c.status, c.situacao_candidatura,
         c.publicavel, c.fonte_dados) IN (
    VALUES
      ('clariana-barao', 'Clariana Barão', 'Clariana Barão', 'DC', 'Democracia Cristã',
       'Presidente', 'pre-candidato', 'pre-candidato', true,
       ARRAY['curadoria', 'CNN Brasil 2026-08-05', 'CartaCapital 2026-08-05',
             'Metropoles 2026-08-05',
             'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)']),
      ('leonardo-avalanche', 'Leonardo Avalanche', 'Leonardo Avalanche', 'PRTB',
       'Partido Renovador Trabalhista Brasileiro',
       'Presidente', 'pre-candidato', 'pre-candidato', true,
       ARRAY['curadoria', 'Poder360 2026-07-30', 'O Tempo 2026-07-30',
             'Correio Braziliense 2026-07',
             'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)']),
      ('wilson-grassi-junior', 'Wilson Grassi Júnior', 'Wilson Grassi Júnior', 'D35',
       'Democrata',
       'Presidente', 'pre-candidato', 'pre-candidato', true,
       ARRAY['curadoria', 'Agencia Brasil 2026-08-02', 'Poder360 2026-08-02',
             'Revista Oeste 2026-08-02',
             'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'])
  );

  IF exatos <> 3 THEN
    RAISE EXCEPTION 'Rollback abortado: % de 3 fichas ainda identicas ao que a forward criou; alguma foi alterada depois', exatos;
  END IF;

  -- E o daciolo tem que estar no estado que a forward deixou, com as duas fontes
  -- novas ainda na CAUDA do array: se algo foi acrescentado depois, o estado nao
  -- e mais o da forward e a remocao por valor deixaria de ser exata.
  SELECT count(*) INTO daciolo_ok
  FROM public.candidatos
  WHERE slug = 'cabo-daciolo'
    AND cargo_disputado = 'Governador'
    AND estado = 'AM'
    AND partido_sigla = 'MOBILIZA'
    AND publicavel = true
    AND fonte_dados[array_length(fonte_dados, 1) - 1 : array_length(fonte_dados, 1)]
        = ARRAY['Poder360 2026-08-06 (Mobiliza anuncia Daciolo ao governo do AM)',
                'O POVO 2026-08-07 (candidatura a presidente barrada)'];

  IF daciolo_ok <> 1 THEN
    RAISE EXCEPTION 'Rollback abortado: cabo-daciolo nao esta no estado que a forward deixou';
  END IF;

  -- Nenhuma das duas fontes pode aparecer mais de uma vez, senao a remocao por
  -- valor tiraria copias que a forward nao criou.
  SELECT count(*) INTO n
  FROM public.candidatos c, unnest(c.fonte_dados) AS v
  WHERE c.slug = 'cabo-daciolo'
    AND v IN ('Poder360 2026-08-06 (Mobiliza anuncia Daciolo ao governo do AM)',
              'O POVO 2026-08-07 (candidatura a presidente barrada)');

  IF n <> 2 THEN
    RAISE EXCEPTION 'Rollback abortado: as fontes da forward aparecem % vezes, esperava 2', n;
  END IF;
END $$;

DO $$
DECLARE
  dependentes int;
BEGIN
  SELECT count(*) INTO dependentes
  FROM public.candidatos c
  WHERE c.slug IN ('clariana-barao', 'leonardo-avalanche', 'wilson-grassi-junior')
    AND (
      EXISTS (SELECT 1 FROM public.patrimonio          t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.financiamento       t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.historico_politico  t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.processos           t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.votacoes_chave      t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.noticias_candidato  t WHERE t.candidato_id = c.id) OR
      EXISTS (SELECT 1 FROM public.posicoes_declaradas t WHERE t.candidato_id = c.id)
    );

  IF dependentes <> 0 THEN
    RAISE EXCEPTION 'Rollback abortado: % das 3 fichas novas ja tem dado de ficha coletado', dependentes;
  END IF;
END $$;

DELETE FROM public.candidatos
WHERE slug IN ('clariana-barao', 'leonardo-avalanche', 'wilson-grassi-junior');

UPDATE public.candidatos
SET cargo_disputado = 'Presidente',
    estado = NULL,
    -- Remove SO as duas que a forward acrescentou, preservando a ordem original
    -- das demais. `array_agg` sem ORDER BY tem ordem indefinida, e reordenar 22
    -- entradas seria mudar dado que este rollback nao deveria tocar.
    fonte_dados = (
      SELECT array_agg(v ORDER BY ord)
      FROM unnest(COALESCE(fonte_dados, ARRAY[]::text[])) WITH ORDINALITY AS t(v, ord)
      WHERE v NOT IN (
        'Poder360 2026-08-06 (Mobiliza anuncia Daciolo ao governo do AM)',
        'O POVO 2026-08-07 (candidatura a presidente barrada)'
      )
    ),
    ultima_atualizacao = NOW()
WHERE slug = 'cabo-daciolo';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260812130000';

-- Pos-condicao do rollback: volta a 11 presidenciaveis publicaveis e daciolo
-- volta a Presidente.
DO $$
DECLARE
  presidentes int;
  daciolo_cargo text;
  sobraram int;
BEGIN
  SELECT cargo_disputado INTO daciolo_cargo
  FROM public.candidatos WHERE slug = 'cabo-daciolo';

  SELECT count(*) INTO sobraram
  FROM public.candidatos
  WHERE slug IN ('clariana-barao', 'leonardo-avalanche', 'wilson-grassi-junior');

  IF sobraram <> 0 THEN
    RAISE EXCEPTION 'Rollback: sobraram % das 3 fichas', sobraram;
  END IF;

  -- Caso no-op: a forward nao tinha ancora, entao nao ha estado de dado a cobrar.
  -- O que importava era a linha do ledger, ja removida acima.
  IF daciolo_cargo IS NULL THEN
    RAISE NOTICE 'Rollback de no-op concluido: apenas a versao do ledger foi removida';
    RETURN;
  END IF;

  IF daciolo_cargo <> 'Presidente' THEN
    RAISE EXCEPTION 'Rollback: cabo-daciolo ficou em %, esperava Presidente', daciolo_cargo;
  END IF;

  SELECT count(*) INTO presidentes
  FROM public.candidatos
  WHERE cargo_disputado = 'Presidente' AND publicavel = true AND status <> 'removido';

  IF presidentes <> 11 THEN
    RAISE EXCEPTION 'Rollback: esperava voltar a 11 presidenciaveis, achou %', presidentes;
  END IF;
END $$;
