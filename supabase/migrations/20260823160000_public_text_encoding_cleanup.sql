-- Correcao forward-only de artefatos de encoding medidos no universo publico.
-- Cada escrita e fechada por UUID, slug e identidade da fonte. Nao existe
-- replace global de U+00BF: o mesmo byte perdido representava aspas, bullets,
-- apostrofo ou separador conforme o registro.

DO $empty_replay_guard$
DECLARE
  coorte_presente integer;
BEGIN
  SELECT count(*) INTO coorte_presente
  FROM public.candidatos
  WHERE slug IN (
    'wilson-grassi-junior', 'luiz-franca', 'soldado-sampaio',
    'cicero-lucena', 'ricardo-ferraco', 'alan-rick',
    'mailza-assis', 'patrus-ananias', 'haddad-gov-sp',
    'delcidio-amaral'
  );
  IF coorte_presente = 0 THEN
    RAISE NOTICE 'public_text_encoding_cleanup: coorte vazia no replay';
    RETURN;
  END IF;
END
$empty_replay_guard$;

-- @write tabela=patrimonio slug=wilson-grassi-junior campos=bens
UPDATE public.patrimonio AS p
SET bens = replace(p.bens::text, ' ¿ PARTICIPAÇÕES', ' - PARTICIPAÇÕES')::jsonb
FROM public.candidatos AS c
WHERE p.id = 'dc897176-d354-4218-94d5-967ddcfd0afa'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'wilson-grassi-junior'
  AND p.ano_eleicao = 2026
  AND p.bens::text LIKE '% ¿ PARTICIPAÇÕES%';

-- @write tabela=patrimonio slug=luiz-franca campos=bens
UPDATE public.patrimonio AS p
SET bens = replace(p.bens::text, 'TORRE ¿B¿', 'TORRE “B”')::jsonb
FROM public.candidatos AS c
WHERE p.id = '6d45c4c3-d7a5-4244-b890-7038c29238ce'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'luiz-franca'
  AND p.ano_eleicao = 2026
  AND p.bens::text LIKE '%TORRE ¿B¿%';

-- @write tabela=patrimonio slug=soldado-sampaio campos=bens
UPDATE public.patrimonio AS p
SET bens = replace(p.bens::text, '663 ¿ Bairro', '663 - Bairro')::jsonb
FROM public.candidatos AS c
WHERE p.id = 'ff4306c7-27a3-4fad-9086-398385ff2341'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'soldado-sampaio'
  AND p.ano_eleicao = 2018
  AND p.bens::text LIKE '%663 ¿ Bairro%';

-- Ementas do Senado: a API oficial ainda devolve U+00BF nestas materias.
-- @write tabela=projetos_lei slug=cicero-lucena campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(replace(p.ementa, '¿debater', '“debater'), 'turismo¿', 'turismo”')
FROM public.candidatos AS c
WHERE p.id = '18f8f586-c150-4b77-a52e-4fc18716abf1'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'cicero-lucena'
  AND p.proposicao_id_api = '100904'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=cicero-lucena campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(p.ementa, E'\n¿ ', E'\n• ')
FROM public.candidatos AS c
WHERE p.id = '715a672c-491c-480d-ad10-39382ce4e86d'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'cicero-lucena'
  AND p.proposicao_id_api = '101351'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=cicero-lucena campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(p.ementa, '¿ Projeto', '• Projeto')
FROM public.candidatos AS c
WHERE p.id = 'e2d35637-b6b7-40f9-8a56-1812ce26f9e3'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'cicero-lucena'
  AND p.proposicao_id_api = '95016'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=cicero-lucena campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(
  replace(
    replace(
      replace(p.ementa,
        'Telecomunicações ¿ ANATEL', 'Telecomunicações - ANATEL'),
      'Assinatura ¿ ABTA', 'Assinatura - ABTA'),
    'Dall¿antonia', 'Dall''Antonia'),
  'Telecomunicações ¿ CPqD', 'Telecomunicações - CPqD')
FROM public.candidatos AS c
WHERE p.id = 'edf11bcb-55ed-4793-86c0-22a3be91d484'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'cicero-lucena'
  AND p.proposicao_id_api = '101425'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=ricardo-ferraco campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(p.ementa, E'\n¿\t', E'\n•\t')
FROM public.candidatos AS c
WHERE p.id = '9369ff09-f7a9-4e7a-8c02-45edfa55377f'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'ricardo-ferraco'
  AND p.proposicao_id_api = '114111'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=ricardo-ferraco campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(p.ementa, 'Duarte ¿ Diretor-Presidente', 'Duarte - Diretor-Presidente')
FROM public.candidatos AS c
WHERE p.id = 'f06f111c-e6ce-45a6-91d9-09c48be7d9fd'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'ricardo-ferraco'
  AND p.proposicao_id_api = '102583'
  AND p.ementa LIKE '%¿%';

-- @write tabela=projetos_lei slug=ricardo-ferraco campos=ementa
UPDATE public.projetos_lei AS p
SET ementa = replace(p.ementa, '2011 ¿ Substitutivo', '2011 - Substitutivo')
FROM public.candidatos AS c
WHERE p.id = '637758ae-6aea-4e04-a362-cc8363574160'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'ricardo-ferraco'
  AND p.proposicao_id_api = '103031'
  AND p.ementa LIKE '%¿%';

-- Fornecedores CEAPS reconstruidos a partir dos CSVs oficiais Latin-1.
-- @write tabela=gastos_parlamentares slug=alan-rick campos=gastos_destaque
UPDATE public.gastos_parlamentares AS g
SET gastos_destaque = replace(
  g.gastos_destaque::text,
  'EXATA COMUNICA��O EIRELI',
  'EXATA COMUNICAÇÃO EIRELI'
)::jsonb
FROM public.candidatos AS c
WHERE g.id = '32c3878e-bb0c-4fbe-bc44-187fdf4212b3'::uuid
  AND g.candidato_id = c.id
  AND c.slug = 'alan-rick'
  AND g.ano = 2023
  AND g.fonte = 'Senado CEAPS'
  AND g.gastos_destaque::text LIKE '%�%';

-- @write tabela=gastos_parlamentares slug=alan-rick campos=gastos_destaque
UPDATE public.gastos_parlamentares AS g
SET gastos_destaque = replace(
  g.gastos_destaque::text,
  'AMAZ�NIA 7 PRODU��ES LTDA',
  'AMAZÔNIA 7 PRODUÇÕES LTDA'
)::jsonb
FROM public.candidatos AS c
WHERE g.id = 'a85ede0d-73b8-4ee2-87c9-1bdb41f56ec3'::uuid
  AND g.candidato_id = c.id
  AND c.slug = 'alan-rick'
  AND g.ano = 2026
  AND g.fonte = 'Senado CEAPS'
  AND g.gastos_destaque::text LIKE '%�%';

-- @write tabela=gastos_parlamentares slug=mailza-assis campos=gastos_destaque
UPDATE public.gastos_parlamentares AS g
SET gastos_destaque = replace(
  g.gastos_destaque::text,
  'Aerobran Taxi A�reo Ltda',
  'Aerobran Taxi Aéreo Ltda'
)::jsonb
FROM public.candidatos AS c
WHERE g.id = '32aaf398-46dc-4367-82d7-4cdb40ea3c38'::uuid
  AND g.candidato_id = c.id
  AND c.slug = 'mailza-assis'
  AND g.ano = 2019
  AND g.fonte = 'Senado CEAPS'
  AND g.gastos_destaque::text LIKE '%�%';

-- @write tabela=gastos_parlamentares slug=mailza-assis campos=gastos_destaque
UPDATE public.gastos_parlamentares AS g
SET gastos_destaque = replace(
  g.gastos_destaque::text,
  'MULT GRAF IND�STRIA GR�FICA EDITORA E COMERCIO EIRELI',
  'MULT GRAF INDÚSTRIA GRÁFICA EDITORA E COMERCIO EIRELI'
)::jsonb
FROM public.candidatos AS c
WHERE g.id = '337825fb-6cf9-43e0-8d93-548ed2f0f8b8'::uuid
  AND g.candidato_id = c.id
  AND c.slug = 'mailza-assis'
  AND g.ano = 2021
  AND g.fonte = 'Senado CEAPS'
  AND g.gastos_destaque::text LIKE '%�%';

-- O lote da Camara foi UTF-8 interpretado como Latin-1. Aqui a reversao e
-- deterministica e fechada pelo UUID, slug, ano e rotulo de fonte.
-- @write tabela=gastos_parlamentares slug=patrus-ananias campos=detalhamento,gastos_destaque
UPDATE public.gastos_parlamentares AS g
SET detalhamento = replace(replace(replace(replace(replace(replace(replace(
      g.detalhamento::text,
      'Ã', 'Ç'), 'Ã', 'Ã'), 'Ã', 'Ó'), 'Ã', 'À'),
      'Ã', 'Í'), 'Ã', 'É'), 'Ã', 'Á')::jsonb,
    gastos_destaque = replace(replace(replace(replace(replace(replace(replace(
      g.gastos_destaque::text,
      'Ã', 'Ç'), 'Ã', 'Ã'), 'Ã', 'Ó'), 'Ã', 'À'),
      'Ã', 'Í'), 'Ã', 'É'), 'Ã', 'Á')::jsonb
FROM public.candidatos AS c
WHERE g.id = '98ffd309-1855-47b9-b85b-8549803c17bc'::uuid
  AND g.candidato_id = c.id
  AND c.slug = 'patrus-ananias'
  AND g.ano = 2025
  AND g.fonte = 'Camara CEAP CSV'
  AND g.detalhamento::text LIKE '%Ã%';

-- O catalogo municipal e uma noticia antiga chegaram com pontuacao
-- Windows-1252 exposta como controles C1. A conversao abaixo e bijetiva para
-- os bytes observados e fica fechada pelos UUIDs e pela fonte medida.
-- @write tabela=legislacao_mandato_executivo slug=haddad-gov-sp campos=ementa,metadata
UPDATE public.legislacao_mandato_executivo AS l
SET ementa = translate(
      l.ementa,
      U&'\0091\0092\0093\0094\0095\0096\0097',
      '‘’“”•–—'
    ),
    metadata = jsonb_set(
      l.metadata,
      '{source_title}',
      to_jsonb(translate(
        l.metadata->>'source_title',
        U&'\0091\0092\0093\0094\0095\0096\0097',
        '‘’“”•–—'
      )),
      false
    )
FROM public.candidatos AS c
WHERE l.candidato_id = c.id
  AND c.slug = 'haddad-gov-sp'
  AND l.metadata->>'coverage_id' = 'haddad-sp-prefeitura-completo-leis-municipais-2013-2016-cutoff-20260512'
  AND l.id IN (
    '01af908c-c681-4e0b-a676-8b3e585df9b9'::uuid,
    '03300e85-756d-4c49-a591-bc6adfff9516'::uuid,
    '19aeda85-e128-483a-a503-eb40a4ee8d64'::uuid,
    '248f8034-0839-4cb6-9d95-733eb564b59e'::uuid,
    '2f67fe2f-5f19-4be8-b133-92a4e473bfef'::uuid,
    '2f7c5b34-5ee6-4070-825c-a69e930fe3a7'::uuid,
    '300343fe-b9c7-4a78-aaf8-402e87de425d'::uuid,
    '340ac491-544a-4e7c-8a9e-484379c910fb'::uuid,
    '34d1a8dd-ddcb-4f67-98f3-6022de30600e'::uuid,
    '39fe8b6d-45eb-4f9b-bbc0-4524c21113ea'::uuid,
    '4c376ca8-040f-4500-a905-efe9066a22c0'::uuid,
    '50aeddc7-368d-4260-81df-c51e42e50dbb'::uuid,
    '585d44e4-214a-4b95-b8b0-6e7a8b2d4b68'::uuid,
    '5968964d-0022-4690-a6ce-6140a3ac5893'::uuid,
    '5ace7b5b-14c9-4eb2-8af0-552a226b30fb'::uuid,
    '6b34614b-7fa5-44c8-a5ac-5f074b86b1db'::uuid,
    '6ed3b952-0610-4f02-a59e-7da2ab4ce5a5'::uuid,
    '72becc89-b1ee-4931-8f5f-eeed12bdcf24'::uuid,
    '88027c1a-faaa-4bbf-a49a-981052e8b9b5'::uuid,
    '90a90463-c5a2-45f9-85b6-d9a12a08519c'::uuid,
    '923c54d8-eaa0-47db-965b-d7817ff31c1a'::uuid,
    'a4bfd4e6-75cb-49c4-bc8e-dc04c27df33c'::uuid,
    'aed3265d-eb01-4f9f-a80a-0afc1e19c776'::uuid,
    'b1c296da-2b62-4d65-8ad5-4a7043bf3b8e'::uuid,
    'b348e6f8-7202-481e-957a-ea8150dc737b'::uuid,
    'b4858a0b-ea8a-461f-a6ac-6099cb263429'::uuid,
    'b655af9d-3b8d-4e23-a9e6-005571e8a606'::uuid,
    'bbcf25a4-bea1-4f1a-ac0d-6714732e0ef8'::uuid,
    'c7ae304f-c44f-4fd6-aedf-a8eed249e063'::uuid,
    'ca614612-483f-4cf2-a997-a33e124d7945'::uuid,
    'cca2465c-56e8-436e-840e-17402e550150'::uuid,
    'cfa82d79-8506-48d5-b204-53870a95335c'::uuid,
    'd7b9b132-766c-4112-ac72-dd08764b53b2'::uuid,
    'e0bdb452-4816-42ee-96c6-5cc9fc7709c7'::uuid,
    'eab6fa89-53fa-457b-a03b-bd8210196148'::uuid,
    'f3d904b4-a5cd-48e4-a053-009ea2145d33'::uuid,
    'f58b8b28-a8bd-4ed9-819e-5fa174cbd820'::uuid
  )
  AND (
    l.ementa ~ U&'[\0080-\009F]'
    OR l.metadata->>'source_title' ~ U&'[\0080-\009F]'
  );

-- @write tabela=noticias_candidato slug=delcidio-amaral campos=titulo
UPDATE public.noticias_candidato AS n
SET titulo = translate(
  n.titulo,
  U&'\0091\0092\0093\0094\0095\0096\0097',
  '‘’“”•–—'
)
FROM public.candidatos AS c
WHERE n.id = '500db544-e3fa-4db9-9ee1-077d4b4857b9'::uuid
  AND n.candidato_id = c.id
  AND c.slug = 'delcidio-amaral'
  AND n.fonte = 'Cassilândia Notícias'
  AND n.titulo ~ U&'[\0080-\009F]';

DO $verify$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM public.patrimonio
  WHERE id IN (
    'dc897176-d354-4218-94d5-967ddcfd0afa'::uuid,
    '6d45c4c3-d7a5-4244-b890-7038c29238ce'::uuid,
    'ff4306c7-27a3-4fad-9086-398385ff2341'::uuid
  )
    AND bens::text LIKE '%¿%';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'public_text_encoding_cleanup: patrimonio ainda contem U+00BF (% linhas)', remaining;
  END IF;

  SELECT count(*) INTO remaining
  FROM public.projetos_lei
  WHERE id IN (
    '18f8f586-c150-4b77-a52e-4fc18716abf1'::uuid,
    '715a672c-491c-480d-ad10-39382ce4e86d'::uuid,
    'e2d35637-b6b7-40f9-8a56-1812ce26f9e3'::uuid,
    'edf11bcb-55ed-4793-86c0-22a3be91d484'::uuid,
    '9369ff09-f7a9-4e7a-8c02-45edfa55377f'::uuid,
    'f06f111c-e6ce-45a6-91d9-09c48be7d9fd'::uuid,
    '637758ae-6aea-4e04-a362-cc8363574160'::uuid
  )
    AND ementa LIKE '%¿%';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'public_text_encoding_cleanup: ementas ainda contem U+00BF (% linhas)', remaining;
  END IF;

  SELECT count(*) INTO remaining
  FROM public.gastos_parlamentares
  WHERE id IN (
    '32c3878e-bb0c-4fbe-bc44-187fdf4212b3'::uuid,
    'a85ede0d-73b8-4ee2-87c9-1bdb41f56ec3'::uuid,
    '32aaf398-46dc-4367-82d7-4cdb40ea3c38'::uuid,
    '337825fb-6cf9-43e0-8d93-548ed2f0f8b8'::uuid,
    '98ffd309-1855-47b9-b85b-8549803c17bc'::uuid
  )
    AND (
      detalhamento::text LIKE '%�%'
      OR gastos_destaque::text LIKE '%�%'
      OR detalhamento::text ~ U&'[\0080-\009F]'
      OR gastos_destaque::text ~ U&'[\0080-\009F]'
    );
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'public_text_encoding_cleanup: gastos ainda contem artefatos (% linhas)', remaining;
  END IF;

  SELECT count(*) INTO remaining
  FROM public.legislacao_mandato_executivo AS l
  JOIN public.candidatos AS c ON c.id = l.candidato_id
  WHERE c.slug = 'haddad-gov-sp'
    AND l.metadata->>'coverage_id' = 'haddad-sp-prefeitura-completo-leis-municipais-2013-2016-cutoff-20260512'
    AND (
      l.ementa ~ U&'[\0080-\009F]'
      OR l.metadata->>'source_title' ~ U&'[\0080-\009F]'
    );
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'public_text_encoding_cleanup: legislacao ainda contem controles C1 (% linhas)', remaining;
  END IF;

  SELECT count(*) INTO remaining
  FROM public.noticias_candidato
  WHERE id = '500db544-e3fa-4db9-9ee1-077d4b4857b9'::uuid
    AND titulo ~ U&'[\0080-\009F]';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'public_text_encoding_cleanup: noticia ainda contem controles C1';
  END IF;
END
$verify$;
