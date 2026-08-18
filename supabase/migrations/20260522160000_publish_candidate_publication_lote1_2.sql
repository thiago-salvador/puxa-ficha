BEGIN;

-- Publicacao editorial dos lotes 1 e 2 de pre-candidatos 2026.
-- Fonte operacional: fonte interna de curadoria

WITH candidate_payload (
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  publicavel,
  fonte_dados
) AS (
  VALUES
    ('alexandre-kalil', 'Alexandre Kalil', 'Alexandre Kalil', 'Partido Democratico Trabalhista', 'PDT', 'Ex-prefeito de Belo Horizonte', 'Governador', 'MG', 'pre-candidato', 'pre-candidato', NULL, 'Empresario', true, ARRAY['curadoria', 'TSE', 'g1', 'Estado de Minas']::text[]),
    ('andre-marinho', 'Andre Bourguignon Marinho', 'Andre Marinho', 'Novo', 'NOVO', NULL, 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Comunicador', true, ARRAY['curadoria', 'Veja Rio']::text[]),
    ('andre-portugues', 'Andre Pinto de Afonseca', 'Andre Portugues', 'Republicanos', 'REPUBLICANOS', 'Ex-prefeito de Miguel Pereira', 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Empresario e ex-prefeito', true, ARRAY['curadoria', 'Folha1']::text[]),
    ('araceli-lemos', 'Araceli Maria Pereira Lemos', 'Araceli Lemos', 'Partido Socialismo e Liberdade', 'PSOL', NULL, 'Governador', 'PA', 'pre-candidato', 'pre-candidato', NULL, 'Dirigente partidaria', true, ARRAY['curadoria', 'TSE', 'Ponto de Pauta', 'O Povo']::text[]),
    ('ben-mendes', 'Benoni Benjamin Cardoso Mendes', 'Ben Mendes', 'Partido Missao', 'MISSAO', NULL, 'Governador', 'MG', 'pre-candidato', 'pre-candidato', NULL, 'Empreendedor', true, ARRAY['curadoria', 'TSE', 'g1', 'Estado de Minas']::text[]),
    ('cintia-dias', 'Cintia Aparecida Dias', 'Cintia Dias', 'Partido Socialismo e Liberdade', 'PSOL', NULL, 'Governador', 'GO', 'pre-candidato', 'pre-candidato', NULL, 'Cientista social', true, ARRAY['curadoria', 'TSE', 'CBN Goiania']::text[]),
    ('cleber-rabelo', 'Jose Cleber Barros Rabelo', 'Cleber Rabelo', 'Partido Socialista dos Trabalhadores Unificado', 'PSTU', NULL, 'Governador', 'PA', 'pre-candidato', 'pre-candidato', NULL, 'Sindicalista', true, ARRAY['curadoria', 'TSE', 'Estado do Para Online', 'O Povo']::text[]),
    ('cyro-garcia', 'Cyro Garcia', 'Cyro Garcia', 'Partido Socialista dos Trabalhadores Unificado', 'PSTU', NULL, 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Professor e historiador', true, ARRAY['curadoria', 'TSE', 'Veja Rio']::text[]),
    ('joaquim-barbosa', 'Joaquim Benedito Barbosa Gomes', 'Joaquim Barbosa', 'Democracia Crista', 'DC', 'Ex-ministro do Supremo Tribunal Federal', 'Presidente', NULL, 'pre-candidato', 'pre-candidato', 'Direito', 'Jurista', true, ARRAY['curadoria', 'DC', 'UOL']::text[]),
    ('juliete-pantoja', 'Juliete Pantoja Alves', 'Juliete Pantoja', 'Unidade Popular', 'UP', NULL, 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Educadora popular', true, ARRAY['curadoria', 'TSE', 'Veja Rio', 'Tempo Real RJ']::text[]),
    ('luan-monteiro', 'Luan Monteiro Paschoal Pires', 'Luan Monteiro', 'Partido da Causa Operaria', 'PCO', NULL, 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Estudante e dirigente partidario', true, ARRAY['curadoria', 'TSE', 'Veja Rio']::text[]),
    ('luiz-franca', 'Luiz Felipe Franca', 'Luiz Franca', 'Partido Missao', 'MISSAO', NULL, 'Governador', 'PR', 'pre-candidato', 'pre-candidato', NULL, 'Empreendedor', true, ARRAY['curadoria', 'TSE', 'O Presente']::text[]),
    ('priscila-voigt', 'Priscila Voigt Severiano', 'Priscila Voigt', 'Unidade Popular', 'UP', NULL, 'Governador', 'RS', 'pre-candidato', 'pre-candidato', NULL, 'Nutricionista', true, ARRAY['curadoria', 'TSE', 'Informativo Regional', 'Jornal do Comercio']::text[]),
    ('rejane-oliveira', 'Rejane Silva de Oliveira', 'Rejane de Oliveira', 'Partido Socialista dos Trabalhadores Unificado', 'PSTU', NULL, 'Governador', 'RS', 'pre-candidato', 'pre-candidato', NULL, 'Professora', true, ARRAY['curadoria', 'TSE', 'Informativo Regional', 'Jornal do Comercio']::text[]),
    ('sandro-alex', 'Sandro Alex Cruz de Oliveira', 'Sandro Alex', 'Partido Social Democratico', 'PSD', 'Ex-secretario de Infraestrutura e Logistica do Parana', 'Governador', 'PR', 'pre-candidato', 'pre-candidato', NULL, 'Comunicador e ex-deputado federal', true, ARRAY['curadoria', 'TSE', 'TNOnline']::text[]),
    ('tulio-lopes', 'Tulio Cesar Dias Lopes', 'Tulio Lopes', 'Partido Comunista Brasileiro', 'PCB', NULL, 'Governador', 'MG', 'pre-candidato', 'pre-candidato', NULL, 'Professor', true, ARRAY['curadoria', 'TSE', 'g1', 'Estado de Minas']::text[]),
    ('william-siri', 'William Carlos Brum Bispo', 'William Siri', 'Partido Socialismo e Liberdade', 'PSOL', 'Vereador do Rio de Janeiro', 'Governador', 'RJ', 'pre-candidato', 'pre-candidato', NULL, 'Vereador', true, ARRAY['curadoria', 'TSE', 'Veja Rio']::text[])
)
INSERT INTO public.candidatos (
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  publicavel,
  fonte_dados,
  ultima_atualizacao
)
SELECT
  slug,
  nome_completo,
  nome_urna,
  partido_atual,
  partido_sigla,
  cargo_atual,
  cargo_disputado,
  estado,
  status,
  situacao_candidatura,
  formacao,
  profissao_declarada,
  publicavel,
  fonte_dados,
  NOW()
FROM candidate_payload
ON CONFLICT (slug) DO UPDATE
SET
  nome_completo = EXCLUDED.nome_completo,
  nome_urna = EXCLUDED.nome_urna,
  partido_atual = EXCLUDED.partido_atual,
  partido_sigla = EXCLUDED.partido_sigla,
  cargo_atual = EXCLUDED.cargo_atual,
  cargo_disputado = EXCLUDED.cargo_disputado,
  estado = EXCLUDED.estado,
  status = EXCLUDED.status,
  situacao_candidatura = EXCLUDED.situacao_candidatura,
  formacao = EXCLUDED.formacao,
  profissao_declarada = EXCLUDED.profissao_declarada,
  publicavel = EXCLUDED.publicavel,
  fonte_dados = EXCLUDED.fonte_dados,
  ultima_atualizacao = EXCLUDED.ultima_atualizacao;

WITH main_public (slug, cargo_disputado, estado) AS (
  VALUES
    ('alexandre-kalil', 'Governador', 'MG'),
    ('andre-marinho', 'Governador', 'RJ'),
    ('andre-portugues', 'Governador', 'RJ'),
    ('araceli-lemos', 'Governador', 'PA'),
    ('augusto-cury', 'Presidente', NULL),
    ('ben-mendes', 'Governador', 'MG'),
    ('cabo-daciolo', 'Presidente', NULL),
    ('cintia-dias', 'Governador', 'GO'),
    ('cleber-rabelo', 'Governador', 'PA'),
    ('cleitinho', 'Governador', 'MG'),
    ('cyro-garcia', 'Governador', 'RJ'),
    ('daniel-vilela', 'Governador', 'GO'),
    ('douglas-ruas', 'Governador', 'RJ'),
    ('dr-daniel', 'Governador', 'PA'),
    ('edmilson-costa', 'Presidente', NULL),
    ('eduardo-paes', 'Governador', 'RJ'),
    ('flavio-bolsonaro', 'Presidente', NULL),
    ('gabriel-azevedo', 'Governador', 'MG'),
    ('gabriel-souza', 'Governador', 'RS'),
    ('garotinho', 'Governador', 'RJ'),
    ('haddad-gov-sp', 'Governador', 'SP'),
    ('hana-ghassan', 'Governador', 'PA'),
    ('hertz-dias', 'Presidente', NULL),
    ('joaquim-barbosa', 'Presidente', NULL),
    ('juliana-brizola', 'Governador', 'RS'),
    ('juliete-pantoja', 'Governador', 'RJ'),
    ('luan-monteiro', 'Governador', 'RJ'),
    ('luiz-franca', 'Governador', 'PR'),
    ('lula', 'Presidente', NULL),
    ('luciano-zucco', 'Governador', 'RS'),
    ('marcelo-maranata', 'Governador', 'RS'),
    ('marconi-perillo', 'Governador', 'GO'),
    ('maria-da-consolacao', 'Governador', 'MG'),
    ('mateus-simoes', 'Governador', 'MG'),
    ('priscila-voigt', 'Governador', 'RS'),
    ('renan-santos', 'Presidente', NULL),
    ('rejane-oliveira', 'Governador', 'RS'),
    ('requiao-filho', 'Governador', 'PR'),
    ('romeu-zema', 'Presidente', NULL),
    ('ronaldo-caiado', 'Presidente', NULL),
    ('rui-costa-pimenta', 'Presidente', NULL),
    ('samara-martins', 'Presidente', NULL),
    ('sandro-alex', 'Governador', 'PR'),
    ('sergio-moro-gov-pr', 'Governador', 'PR'),
    ('tarcisio-gov-sp', 'Governador', 'SP'),
    ('tulio-lopes', 'Governador', 'MG'),
    ('wilder-morais', 'Governador', 'GO'),
    ('william-siri', 'Governador', 'RJ')
)
UPDATE public.candidatos c
SET
  publicavel = true,
  status = 'pre-candidato',
  situacao_candidatura = 'pre-candidato',
  cargo_disputado = m.cargo_disputado,
  estado = m.estado,
  ultima_atualizacao = NOW()
FROM main_public m
WHERE c.slug = m.slug
  AND c.cargo_disputado = m.cargo_disputado;

WITH hold_public (slug, cargo_disputado, estado) AS (
  VALUES
    ('adriana-accorsi', 'Governador', 'GO'),
    ('aldo-rebelo', 'Presidente', NULL),
    ('alexandre-curi', 'Governador', 'PR'),
    ('andre-do-prado', 'Governador', 'SP'),
    ('beto-faro', 'Governador', 'PA'),
    ('ciro-gomes', 'Presidente', NULL),
    ('edegar-pretto', 'Governador', 'RS'),
    ('eder-mauro', 'Governador', 'PA'),
    ('erika-hilton', 'Governador', 'SP'),
    ('evandro-augusto', 'Governador', 'RS'),
    ('geraldo-alckmin', 'Governador', 'SP'),
    ('gilberto-kassab', 'Governador', 'SP'),
    ('jose-eliton', 'Governador', 'GO'),
    ('kim-kataguiri', 'Governador', 'SP'),
    ('marcio-franca', 'Governador', 'SP'),
    ('mario-couto', 'Governador', 'PA'),
    ('nikolas-ferreira', 'Governador', 'MG'),
    ('paulo-martins-gov-pr', 'Governador', 'PR'),
    ('paulo-serra', 'Governador', 'SP'),
    ('rafael-greca', 'Governador', 'PR'),
    ('ratinho-junior', 'Presidente', NULL),
    ('ricardo-nunes', 'Governador', 'SP'),
    ('rodrigo-bacellar', 'Governador', 'RJ'),
    ('rodrigo-pacheco', 'Governador', 'MG'),
    ('simao-jatene', 'Governador', 'PA'),
    ('tarcisio-motta', 'Governador', 'RJ'),
    ('tony-garcia', 'Governador', 'PR'),
    ('washington-reis', 'Governador', 'RJ')
)
UPDATE public.candidatos c
SET
  publicavel = false,
  ultima_atualizacao = NOW()
FROM hold_public h
WHERE c.slug = h.slug
  AND c.cargo_disputado = h.cargo_disputado;

DO $$
DECLARE
  expected_president text[] := ARRAY[
    'augusto-cury',
    'cabo-daciolo',
    'edmilson-costa',
    'flavio-bolsonaro',
    'hertz-dias',
    'joaquim-barbosa',
    'lula',
    'renan-santos',
    'romeu-zema',
    'ronaldo-caiado',
    'rui-costa-pimenta',
    'samara-martins'
  ];
  actual_president text[];
  expected_go text[] := ARRAY['cintia-dias', 'daniel-vilela', 'marconi-perillo', 'wilder-morais'];
  expected_mg text[] := ARRAY['alexandre-kalil', 'ben-mendes', 'cleitinho', 'gabriel-azevedo', 'maria-da-consolacao', 'mateus-simoes', 'tulio-lopes'];
  expected_pa text[] := ARRAY['araceli-lemos', 'cleber-rabelo', 'dr-daniel', 'hana-ghassan'];
  expected_pr text[] := ARRAY['luiz-franca', 'requiao-filho', 'sandro-alex', 'sergio-moro-gov-pr'];
  expected_rj text[] := ARRAY['andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas', 'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro', 'william-siri'];
  expected_rs text[] := ARRAY['gabriel-souza', 'juliana-brizola', 'luciano-zucco', 'marcelo-maranata', 'priscila-voigt', 'rejane-oliveira'];
  expected_sp text[] := ARRAY['haddad-gov-sp', 'tarcisio-gov-sp'];
  actual_go text[];
  actual_mg text[];
  actual_pa text[];
  actual_pr text[];
  actual_rj text[];
  actual_rs text[];
  actual_sp text[];
  visible_hold text[];
BEGIN
  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_president
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Presidente';

  IF actual_president <> expected_president THEN
    RAISE EXCEPTION 'pre-candidatos presidente: esperado %, encontrado %', expected_president, actual_president;
  END IF;

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_go
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'GO';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_mg
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'MG';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_pa
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'PA';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_pr
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'PR';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_rj
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'RJ';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_rs
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'RS';

  SELECT COALESCE(array_agg(slug ORDER BY slug), ARRAY[]::text[])
    INTO actual_sp
  FROM public.candidatos_publico
  WHERE cargo_disputado = 'Governador' AND estado = 'SP';

  IF actual_go <> expected_go THEN
    RAISE EXCEPTION 'pre-candidatos GO: esperado %, encontrado %', expected_go, actual_go;
  END IF;
  IF actual_mg <> expected_mg THEN
    RAISE EXCEPTION 'pre-candidatos MG: esperado %, encontrado %', expected_mg, actual_mg;
  END IF;
  IF actual_pa <> expected_pa THEN
    RAISE EXCEPTION 'pre-candidatos PA: esperado %, encontrado %', expected_pa, actual_pa;
  END IF;
  IF actual_pr <> expected_pr THEN
    RAISE EXCEPTION 'pre-candidatos PR: esperado %, encontrado %', expected_pr, actual_pr;
  END IF;
  IF actual_rj <> expected_rj THEN
    RAISE EXCEPTION 'pre-candidatos RJ: esperado %, encontrado %', expected_rj, actual_rj;
  END IF;
  IF actual_rs <> expected_rs THEN
    RAISE EXCEPTION 'pre-candidatos RS: esperado %, encontrado %', expected_rs, actual_rs;
  END IF;
  IF actual_sp <> expected_sp THEN
    RAISE EXCEPTION 'pre-candidatos SP: esperado %, encontrado %', expected_sp, actual_sp;
  END IF;

  WITH hold_public (slug, cargo_disputado, estado) AS (
    VALUES
      ('adriana-accorsi', 'Governador', 'GO'),
      ('aldo-rebelo', 'Presidente', NULL),
      ('alexandre-curi', 'Governador', 'PR'),
      ('andre-do-prado', 'Governador', 'SP'),
      ('beto-faro', 'Governador', 'PA'),
      ('ciro-gomes', 'Presidente', NULL),
      ('edegar-pretto', 'Governador', 'RS'),
      ('eder-mauro', 'Governador', 'PA'),
      ('erika-hilton', 'Governador', 'SP'),
      ('evandro-augusto', 'Governador', 'RS'),
      ('geraldo-alckmin', 'Governador', 'SP'),
      ('gilberto-kassab', 'Governador', 'SP'),
      ('jose-eliton', 'Governador', 'GO'),
      ('kim-kataguiri', 'Governador', 'SP'),
      ('marcio-franca', 'Governador', 'SP'),
      ('mario-couto', 'Governador', 'PA'),
      ('nikolas-ferreira', 'Governador', 'MG'),
      ('paulo-martins-gov-pr', 'Governador', 'PR'),
      ('paulo-serra', 'Governador', 'SP'),
      ('rafael-greca', 'Governador', 'PR'),
      ('ratinho-junior', 'Presidente', NULL),
      ('ricardo-nunes', 'Governador', 'SP'),
      ('rodrigo-bacellar', 'Governador', 'RJ'),
      ('rodrigo-pacheco', 'Governador', 'MG'),
      ('simao-jatene', 'Governador', 'PA'),
      ('tarcisio-motta', 'Governador', 'RJ'),
      ('tony-garcia', 'Governador', 'PR'),
      ('washington-reis', 'Governador', 'RJ')
  )
  SELECT COALESCE(array_agg(c.slug ORDER BY c.slug), ARRAY[]::text[])
    INTO visible_hold
  FROM public.candidatos_publico c
  JOIN hold_public h
    ON h.slug = c.slug
   AND h.cargo_disputado = c.cargo_disputado;

  IF array_length(visible_hold, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'slugs fora da lista principal ainda publicos: %', visible_hold;
  END IF;
END $$;

COMMIT;
