-- Ausências oficiais de patrimônio confirmadas nos pacotes bem_candidato do
-- TSE (etapa 2b da execucao pf-patrimonio-20260807T170643Z). Cada linha afirma
-- apenas que o pacote oficial daquele ano nao traz bens para o SQ_CANDIDATO;
-- nenhum valor zero e fabricado. As 13 celulas de 2026 ficam de fora ate o TSE
-- publicar snapshot atualizado (registros em andamento).
BEGIN;

-- @write tabela=patrimonio_ausencia_oficial ref=A2B-ausencias-oficiais-20260807 campos=criacao_da_tabela
CREATE TABLE IF NOT EXISTS public.patrimonio_ausencia_oficial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao INTEGER NOT NULL,
  sq_candidato TEXT NOT NULL,
  fonte_url TEXT,
  verificado_em TIMESTAMPTZ,
  detalhe TEXT,
  execucao TEXT NOT NULL DEFAULT 'A2B-ausencias-oficiais-20260807',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidato_id, ano_eleicao)
);

-- @write tabela=patrimonio_ausencia_oficial slug=arthur-henrique campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '230000679861', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'arthur-henrique'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cabo-daciolo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '280000602500', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cabo-daciolo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cintia-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2010, '90000000434', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2010.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2010 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cintia-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2010
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cintia-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '90000012450', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cintia-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2010, '140000000107', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2010.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2010 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2010
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '140000015615', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2014, '140000000102', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2014 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2014
  );

-- @write tabela=patrimonio_ausencia_oficial slug=cleber-rabelo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2016, '140000006431', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2016.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2016 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'cleber-rabelo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2016
  );

-- @write tabela=patrimonio_ausencia_oficial slug=david-almeida campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2010, '40000000404', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2010.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2010 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'david-almeida'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2010
  );

-- @write tabela=patrimonio_ausencia_oficial slug=dr-daniel campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2016, '140000012852', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2016.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2016 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'dr-daniel'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2016
  );

-- @write tabela=patrimonio_ausencia_oficial slug=edilson-damiao campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '230001604254', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'edilson-damiao'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=garotinho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '190001619506', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'garotinho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=gustavo-henrique campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '180000006226', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'gustavo-henrique'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=gustavo-henrique campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2014, '180000000014', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2014 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'gustavo-henrique'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2014
  );

-- @write tabela=patrimonio_ausencia_oficial slug=gustavo-henrique campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '180001643494', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'gustavo-henrique'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=henrique-areas campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2016, '250000077188', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2016.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2016 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'henrique-areas'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2016
  );

-- @write tabela=patrimonio_ausencia_oficial slug=henrique-areas campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '250000615443', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'henrique-areas'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=henrique-areas campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '250001172315', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'henrique-areas'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=hertz-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '100000718146', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'hertz-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=hertz-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '100001600008', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'hertz-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=izadora-dias campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '250001700018', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'izadora-dias'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=jeferson-bezerra campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '120000850578', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'jeferson-bezerra'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=jeferson-bezerra campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '120001611531', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'jeferson-bezerra'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=jeferson-bezerra campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2024, '120002315556', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2024.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2024 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'jeferson-bezerra'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2024
  );

-- @write tabela=patrimonio_ausencia_oficial slug=jeremias-cosmo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '170000735134', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'jeremias-cosmo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=joao-henrique-catan campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '120000624894', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'joao-henrique-catan'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=juliete-pantoja campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '190001128515', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'juliete-pantoja'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=juliete-pantoja campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2024, '190002135108', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2024.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2024 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'juliete-pantoja'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2024
  );

-- @write tabela=patrimonio_ausencia_oficial slug=laudicerio-aguiar campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '110001621192', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'laudicerio-aguiar'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=luan-monteiro campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '190001092078', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'luan-monteiro'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=luan-monteiro campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '190001717287', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'luan-monteiro'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=luan-monteiro campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2024, '190002346684', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2024.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2024 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'luan-monteiro'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2024
  );

-- @write tabela=patrimonio_ausencia_oficial slug=renan-filho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '230000603179', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'renan-filho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=renan-filho campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '230001643506', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'renan-filho'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=robson-raymundo campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2022, '70001611377', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2022 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'robson-raymundo'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2022
  );

-- @write tabela=patrimonio_ausencia_oficial slug=ronaldo-mansur campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '50000600889', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'ronaldo-mansur'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=rui-costa-pimenta campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2014, '280000000081', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2014 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'rui-costa-pimenta'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2014
  );

-- @write tabela=patrimonio_ausencia_oficial slug=samara-martins campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2020, '200000724019', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2020.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2020 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'samara-martins'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2020
  );

-- @write tabela=patrimonio_ausencia_oficial slug=samuel-costa campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '220000000290', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'samuel-costa'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=samuel-costa campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2014, '220000000176', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2014 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'samuel-costa'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2014
  );

-- @write tabela=patrimonio_ausencia_oficial slug=serley-leal campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '60000015399', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'serley-leal'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=tulio-lopes campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2016, '130000083665', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2016.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2016 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'tulio-lopes'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2016
  );

-- @write tabela=patrimonio_ausencia_oficial slug=tulio-lopes campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '130000606639', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'tulio-lopes'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

-- @write tabela=patrimonio_ausencia_oficial slug=vera-lucia campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2010, '260000000021', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2010.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2010 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2010
  );

-- @write tabela=patrimonio_ausencia_oficial slug=vera-lucia campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2012, '260000001384', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2012.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2012 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2012
  );

-- @write tabela=patrimonio_ausencia_oficial slug=vera-lucia campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2014, '260000000024', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2014 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2014
  );

-- @write tabela=patrimonio_ausencia_oficial slug=vera-lucia campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2016, '260000005540', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2016.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2016 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'vera-lucia'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2016
  );

-- @write tabela=patrimonio_ausencia_oficial slug=william-siri campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe
INSERT INTO public.patrimonio_ausencia_oficial (candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe)
SELECT c.id, 2018, '190000602173', 'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip', '2026-08-07T18:27:03.374Z'::timestamptz,
       'Pacote oficial bem_candidato_2018 do TSE lido de ponta a ponta sem bens para este SQ_CANDIDATO.'
FROM public.candidatos c
WHERE c.slug = 'william-siri'
  AND NOT EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial a
    WHERE a.candidato_id = c.id AND a.ano_eleicao = 2018
  );

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.patrimonio_ausencia_oficial;
  IF n <> 48 THEN
    RAISE EXCEPTION 'patrimonio_ausencia_oficial: esperadas 48 linhas, encontradas %', n;
  END IF;
END $$;

COMMIT;
