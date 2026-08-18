BEGIN;

-- Publicacao editorial do lote 3 de pre-candidatos 2026.
-- Fontes operacionais:
-- - fonte interna de curadoria
-- - fonte interna de curadoria
-- - fonte interna de curadoria

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
    ('jenilson-leite', 'Janilson Lopes Leite', 'Jenilson Leite', 'Partido Socialista Brasileiro', 'PSB', NULL, 'Governador', 'AC', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('isael-munduruku', 'Isael Munduruku', 'Isael Munduruku', 'Rede Sustentabilidade', 'REDE', NULL, 'Governador', 'AM', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['curadoria', 'g1']::text[]),
    ('jose-roberto-arruda', 'Jose Roberto Arruda', 'Jose Roberto Arruda', 'Partido Liberal', 'PL', NULL, 'Governador', 'DF', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('breno-barcelar', 'Breno Barcelar', 'Breno Barcelar', 'Partido Missao', 'MISSAO', NULL, 'Governador', 'ES', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['curadoria']::text[]),
    ('magno-malta', 'Magno Pereira Malta', 'Magno Malta', 'Partido Liberal', 'PL', NULL, 'Governador', 'ES', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['Senado', 'TSE', 'curadoria']::text[]),
    ('alex-pucineli', 'Alex Pedde Pucineli', 'Alex Pucineli', 'Democrata 35', 'D35', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('caiubi-kuhn', 'Caiubi Emanuel Souza Kuhn', 'Caiubi Kuhn', 'Partido Democratico Trabalhista', 'PDT', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('jayme-campos', 'Jayme Verissimo de Campos', 'Jayme Campos', 'Uniao Brasil', 'UNIAO', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['Senado', 'TSE', 'curadoria']::text[]),
    ('laudicerio-aguiar', 'Laudicerio Aguiar Machado', 'Laudicerio Aguiar', 'Uniao Brasil', 'UNIAO', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('marcelo-maluf', 'Marcelo Benedito Maluf', 'Marcelo Maluf', 'Novo', 'NOVO', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('mauricio-coelho', 'Mauricio Coelho Ribeiro da Silva', 'Mauricio Coelho', 'Mobiliza', 'MOBILIZA', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('mauricio-tonha', 'Mauricio Cardoso Tonha', 'Mauricio Tonha', 'Democracia Crista', 'DC', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('rafaell-milas', 'Rafaell Milas', 'Rafaell Milas', 'Partido Missao', 'MISSAO', NULL, 'Governador', 'MT', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['curadoria']::text[]),
    ('lucio-flavio', 'Lucio Flavio', 'Lucio Flavio', 'Partido Socialismo e Liberdade', 'PSOL', NULL, 'Governador', 'PB', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['curadoria']::text[]),
    ('lourdes-melo', 'Maria de Lourdes Soares Melo', 'Lourdes Melo', 'Partido da Causa Operaria', 'PCO', NULL, 'Governador', 'PI', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('lucia-santos', 'Lucia Maria de Sousa Aguiar dos Santos', 'Lucia Santos', 'Partido da Social Democracia Brasileira', 'PSDB', NULL, 'Governador', 'PI', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('mainha', 'Jose de Andrade Maia Filho', 'Mainha', 'Podemos', 'PODE', NULL, 'Governador', 'PI', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('toni-rodrigues', 'Antonio Francisco Rodrigues', 'Toni Rodrigues', 'Partido Liberal', 'PL', NULL, 'Governador', 'PI', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('tonny-kerley', 'Tonny Kerley de Alencar Rodrigues', 'Tonny Kerley', 'Novo', 'NOVO', NULL, 'Governador', 'PI', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('luiz-carlos-teodoro', 'Luiz Carlos Teodoro', 'Luiz Carlos Teodoro', 'Partido Socialismo e Liberdade', 'PSOL', NULL, 'Governador', 'RO', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('samuel-costa', 'Samuel Costa Menezes', 'Samuel Costa', 'Partido Socialista Brasileiro', 'PSB', NULL, 'Governador', 'RO', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('gelson-merisio', 'Gelson Luiz Merisio', 'Gelson Merisio', 'Partido Socialista Brasileiro', 'PSB', NULL, 'Governador', 'SC', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('lais-chaud', 'Lais Chaud', 'Lais Chaud', 'Unidade Popular', 'UP', NULL, 'Governador', 'SC', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['curadoria']::text[]),
    ('ralf-zimmer', 'Ralf Guimaraes Zimmer Junior', 'Ralf Zimmer', 'Partido Renovacao Democratica', 'PRD', NULL, 'Governador', 'SC', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[]),
    ('wanderlei-barbosa', 'Wanderlei Barbosa Castro', 'Wanderlei Barbosa', 'Republicanos', 'REPUBLICANOS', NULL, 'Governador', 'TO', 'pre-candidato', 'pre-candidato', NULL, NULL, true, ARRAY['TSE', 'curadoria']::text[])
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
    ('acm-neto', 'Governador', 'BA'),
    ('adailton-furia', 'Governador', 'RO'),
    ('alan-rick', 'Governador', 'AC'),
    ('alex-pucineli', 'Governador', 'MT'),
    ('alexandre-kalil', 'Governador', 'MG'),
    ('alvaro-dias-rn', 'Governador', 'RN'),
    ('alysson-bezerra', 'Governador', 'RN'),
    ('andre-marinho', 'Governador', 'RJ'),
    ('andre-portugues', 'Governador', 'RJ'),
    ('araceli-lemos', 'Governador', 'PA'),
    ('augusto-cury', 'Presidente', NULL),
    ('ben-mendes', 'Governador', 'MG'),
    ('breno-barcelar', 'Governador', 'ES'),
    ('cabo-daciolo', 'Presidente', NULL),
    ('cadu-xavier', 'Governador', 'RN'),
    ('caiubi-kuhn', 'Governador', 'MT'),
    ('celina-leao', 'Governador', 'DF'),
    ('cicero-lucena', 'Governador', 'PB'),
    ('cintia-dias', 'Governador', 'GO'),
    ('ciro-gomes-gov-ce', 'Governador', 'CE'),
    ('cleber-rabelo', 'Governador', 'PA'),
    ('clecio-luis', 'Governador', 'AP'),
    ('cleitinho', 'Governador', 'MG'),
    ('cyro-garcia', 'Governador', 'RJ'),
    ('daniel-vilela', 'Governador', 'GO'),
    ('david-almeida', 'Governador', 'AM'),
    ('douglas-ruas', 'Governador', 'RJ'),
    ('dr-daniel', 'Governador', 'PA'),
    ('dr-furlan', 'Governador', 'AP'),
    ('edmilson-costa', 'Presidente', NULL),
    ('eduardo-braide', 'Governador', 'MA'),
    ('eduardo-paes', 'Governador', 'RJ'),
    ('eduardo-riedel', 'Governador', 'MS'),
    ('efraim-filho', 'Governador', 'PB'),
    ('elmano-de-freitas', 'Governador', 'CE'),
    ('enilton-rodrigues', 'Governador', 'MA'),
    ('expedito-netto', 'Governador', 'RO'),
    ('fabio-mitidieri', 'Governador', 'SE'),
    ('felipe-camarao', 'Governador', 'MA'),
    ('flavio-bolsonaro', 'Presidente', NULL),
    ('gabriel-azevedo', 'Governador', 'MG'),
    ('gabriel-souza', 'Governador', 'RS'),
    ('garotinho', 'Governador', 'RJ'),
    ('gelson-merisio', 'Governador', 'SC'),
    ('haddad-gov-sp', 'Governador', 'SP'),
    ('hana-ghassan', 'Governador', 'PA'),
    ('helder-salomao', 'Governador', 'ES'),
    ('hertz-dias', 'Presidente', NULL),
    ('hildon-chaves', 'Governador', 'RO'),
    ('isael-munduruku', 'Governador', 'AM'),
    ('ivan-moraes', 'Governador', 'PE'),
    ('jayme-campos', 'Governador', 'MT'),
    ('jenilson-leite', 'Governador', 'AC'),
    ('jeronimo', 'Governador', 'BA'),
    ('jhc', 'Governador', 'AL'),
    ('joao-campos', 'Governador', 'PE'),
    ('joao-rodrigues', 'Governador', 'SC'),
    ('joaquim-barbosa', 'Presidente', NULL),
    ('joel-rodrigues', 'Governador', 'PI'),
    ('jorginho-mello', 'Governador', 'SC'),
    ('jose-roberto-arruda', 'Governador', 'DF'),
    ('juliana-brizola', 'Governador', 'RS'),
    ('juliete-pantoja', 'Governador', 'RJ'),
    ('lahesio-bonfim', 'Governador', 'MA'),
    ('lais-chaud', 'Governador', 'SC'),
    ('laudicerio-aguiar', 'Governador', 'MT'),
    ('laurez-moreira', 'Governador', 'TO'),
    ('leandro-grass', 'Governador', 'DF'),
    ('lourdes-melo', 'Governador', 'PI'),
    ('luan-monteiro', 'Governador', 'RJ'),
    ('lucas-ribeiro', 'Governador', 'PB'),
    ('lucia-santos', 'Governador', 'PI'),
    ('luciano-zucco', 'Governador', 'RS'),
    ('lucio-flavio', 'Governador', 'PB'),
    ('luiz-carlos-teodoro', 'Governador', 'RO'),
    ('luiz-franca', 'Governador', 'PR'),
    ('lula', 'Presidente', NULL),
    ('magno-malta', 'Governador', 'ES'),
    ('mailza-assis', 'Governador', 'AC'),
    ('mainha', 'Governador', 'PI'),
    ('marcelo-brigadeiro', 'Governador', 'SC'),
    ('marcelo-maluf', 'Governador', 'MT'),
    ('marcelo-maranata', 'Governador', 'RS'),
    ('marconi-perillo', 'Governador', 'GO'),
    ('marcos-rogerio', 'Governador', 'RO'),
    ('maria-da-consolacao', 'Governador', 'MG'),
    ('maria-do-carmo', 'Governador', 'AM'),
    ('mateus-simoes', 'Governador', 'MG'),
    ('mauricio-coelho', 'Governador', 'MT'),
    ('mauricio-tonha', 'Governador', 'MT'),
    ('natasha-slhessarenko', 'Governador', 'MT'),
    ('omar-aziz', 'Governador', 'AM'),
    ('orleans-brandao', 'Governador', 'MA'),
    ('otaviano-pivetta', 'Governador', 'MT'),
    ('paula-belmonte', 'Governador', 'DF'),
    ('pazolini', 'Governador', 'ES'),
    ('priscila-voigt', 'Governador', 'RS'),
    ('professora-dorinha', 'Governador', 'TO'),
    ('rafael-fonteles', 'Governador', 'PI'),
    ('rafaell-milas', 'Governador', 'MT'),
    ('ralf-zimmer', 'Governador', 'SC'),
    ('raquel-lyra', 'Governador', 'PE'),
    ('rejane-oliveira', 'Governador', 'RS'),
    ('renan-filho', 'Governador', 'AL'),
    ('renan-santos', 'Presidente', NULL),
    ('requiao-filho', 'Governador', 'PR'),
    ('ricardo-cappelli', 'Governador', 'DF'),
    ('ricardo-ferraco', 'Governador', 'ES'),
    ('romeu-zema', 'Presidente', NULL),
    ('ronaldo-caiado', 'Presidente', NULL),
    ('ronaldo-mansur', 'Governador', 'BA'),
    ('rui-costa-pimenta', 'Presidente', NULL),
    ('samara-martins', 'Presidente', NULL),
    ('samuel-costa', 'Governador', 'RO'),
    ('sandro-alex', 'Governador', 'PR'),
    ('sergio-moro-gov-pr', 'Governador', 'PR'),
    ('tarcisio-gov-sp', 'Governador', 'SP'),
    ('tiao-bocalom', 'Governador', 'AC'),
    ('toni-rodrigues', 'Governador', 'PI'),
    ('tonny-kerley', 'Governador', 'PI'),
    ('tulio-lopes', 'Governador', 'MG'),
    ('valmir-de-francisquinho', 'Governador', 'SE'),
    ('vicentinho-junior', 'Governador', 'TO'),
    ('wanderlei-barbosa', 'Governador', 'TO'),
    ('wellington-fagundes', 'Governador', 'MT'),
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
WHERE c.slug = m.slug;

WITH hold_public (slug, cargo_disputado, estado) AS (
  VALUES
    ('adriana-accorsi', 'Governador', 'GO'),
    ('aldo-rebelo', 'Presidente', NULL),
    ('alexandre-curi', 'Governador', 'PR'),
    ('andre-do-prado', 'Governador', 'SP'),
    ('arnaldinho-borgo', 'Governador', 'ES'),
    ('arthur-henrique', 'Governador', 'RR'),
    ('ataides-oliveira', 'Governador', 'TO'),
    ('beto-faro', 'Governador', 'PA'),
    ('capitao-wagner', 'Governador', 'CE'),
    ('ciro-gomes', 'Presidente', NULL),
    ('confucio-moura', 'Governador', 'RO'),
    ('da-vitoria', 'Governador', 'ES'),
    ('decio-lima', 'Governador', 'SC'),
    ('edegar-pretto', 'Governador', 'RS'),
    ('edilson-damiao', 'Governador', 'RR'),
    ('eduardo-girao', 'Governador', 'CE'),
    ('erika-hilton', 'Governador', 'SP'),
    ('evandro-augusto', 'Governador', 'RS'),
    ('fabio-trad', 'Governador', 'MS'),
    ('geraldo-alckmin', 'Governador', 'SP'),
    ('gilberto-kassab', 'Governador', 'SP'),
    ('gilson-machado', 'Governador', 'PE'),
    ('joao-capiberibe', 'Governador', 'AP'),
    ('joao-henrique-catan', 'Governador', 'MS'),
    ('joao-roma', 'Governador', 'BA'),
    ('jose-eliton', 'Governador', 'GO'),
    ('lucien-rezende', 'Governador', 'MS'),
    ('marcio-franca', 'Governador', 'SP'),
    ('marcos-vieira', 'Governador', 'SC'),
    ('margarete-coelho', 'Governador', 'PI'),
    ('nikolas-ferreira', 'Governador', 'MG'),
    ('paulo-hartung', 'Governador', 'ES'),
    ('paulo-martins-gov-pr', 'Governador', 'PR'),
    ('rafael-greca', 'Governador', 'PR'),
    ('ratinho-junior', 'Presidente', NULL),
    ('ricardo-nunes', 'Governador', 'SP'),
    ('roberto-claudio', 'Governador', 'CE'),
    ('rodrigo-bacellar', 'Governador', 'RJ'),
    ('rodrigo-pacheco', 'Governador', 'MG'),
    ('sergio-vidigal', 'Governador', 'ES'),
    ('silvio-mendes', 'Governador', 'PI'),
    ('simao-jatene', 'Governador', 'PA'),
    ('soldado-sampaio', 'Governador', 'RR'),
    ('tarcisio-motta', 'Governador', 'RJ'),
    ('thiago-de-joaldo', 'Governador', 'SE'),
    ('washington-reis', 'Governador', 'RJ')
)
UPDATE public.candidatos c
SET
  publicavel = false,
  ultima_atualizacao = NOW()
FROM hold_public h
WHERE c.slug = h.slug;

DO $$
DECLARE
  mismatch text;
  visible_hold text[];
BEGIN
  WITH expected (cargo_disputado, estado, expected_slugs) AS (
    VALUES
      ('Governador', 'AC', ARRAY['alan-rick', 'jenilson-leite', 'mailza-assis', 'tiao-bocalom']::text[]),
      ('Governador', 'AL', ARRAY['jhc', 'renan-filho']::text[]),
      ('Governador', 'AM', ARRAY['david-almeida', 'isael-munduruku', 'maria-do-carmo', 'omar-aziz']::text[]),
      ('Governador', 'AP', ARRAY['clecio-luis', 'dr-furlan']::text[]),
      ('Governador', 'BA', ARRAY['acm-neto', 'jeronimo', 'ronaldo-mansur']::text[]),
      ('Governador', 'CE', ARRAY['ciro-gomes-gov-ce', 'elmano-de-freitas']::text[]),
      ('Governador', 'DF', ARRAY['celina-leao', 'jose-roberto-arruda', 'leandro-grass', 'paula-belmonte', 'ricardo-cappelli']::text[]),
      ('Governador', 'ES', ARRAY['breno-barcelar', 'helder-salomao', 'magno-malta', 'pazolini', 'ricardo-ferraco']::text[]),
      ('Governador', 'GO', ARRAY['cintia-dias', 'daniel-vilela', 'marconi-perillo', 'wilder-morais']::text[]),
      ('Governador', 'MA', ARRAY['eduardo-braide', 'enilton-rodrigues', 'felipe-camarao', 'lahesio-bonfim', 'orleans-brandao']::text[]),
      ('Governador', 'MG', ARRAY['alexandre-kalil', 'ben-mendes', 'cleitinho', 'gabriel-azevedo', 'maria-da-consolacao', 'mateus-simoes', 'tulio-lopes']::text[]),
      ('Governador', 'MS', ARRAY['eduardo-riedel']::text[]),
      ('Governador', 'MT', ARRAY['alex-pucineli', 'caiubi-kuhn', 'jayme-campos', 'laudicerio-aguiar', 'marcelo-maluf', 'mauricio-coelho', 'mauricio-tonha', 'natasha-slhessarenko', 'otaviano-pivetta', 'rafaell-milas', 'wellington-fagundes']::text[]),
      ('Governador', 'PA', ARRAY['araceli-lemos', 'cleber-rabelo', 'dr-daniel', 'hana-ghassan']::text[]),
      ('Governador', 'PB', ARRAY['cicero-lucena', 'efraim-filho', 'lucas-ribeiro', 'lucio-flavio']::text[]),
      ('Governador', 'PE', ARRAY['ivan-moraes', 'joao-campos', 'raquel-lyra']::text[]),
      ('Governador', 'PI', ARRAY['joel-rodrigues', 'lourdes-melo', 'lucia-santos', 'mainha', 'rafael-fonteles', 'toni-rodrigues', 'tonny-kerley']::text[]),
      ('Governador', 'PR', ARRAY['luiz-franca', 'requiao-filho', 'sandro-alex', 'sergio-moro-gov-pr']::text[]),
      ('Governador', 'RJ', ARRAY['andre-marinho', 'andre-portugues', 'cyro-garcia', 'douglas-ruas', 'eduardo-paes', 'garotinho', 'juliete-pantoja', 'luan-monteiro', 'william-siri']::text[]),
      ('Governador', 'RN', ARRAY['alvaro-dias-rn', 'alysson-bezerra', 'cadu-xavier']::text[]),
      ('Governador', 'RO', ARRAY['adailton-furia', 'expedito-netto', 'hildon-chaves', 'luiz-carlos-teodoro', 'marcos-rogerio', 'samuel-costa']::text[]),
      ('Governador', 'RR', ARRAY[]::text[]),
      ('Governador', 'RS', ARRAY['gabriel-souza', 'juliana-brizola', 'luciano-zucco', 'marcelo-maranata', 'priscila-voigt', 'rejane-oliveira']::text[]),
      ('Governador', 'SC', ARRAY['gelson-merisio', 'joao-rodrigues', 'jorginho-mello', 'lais-chaud', 'marcelo-brigadeiro', 'ralf-zimmer']::text[]),
      ('Governador', 'SE', ARRAY['fabio-mitidieri', 'valmir-de-francisquinho']::text[]),
      ('Governador', 'SP', ARRAY['haddad-gov-sp', 'tarcisio-gov-sp']::text[]),
      ('Governador', 'TO', ARRAY['laurez-moreira', 'professora-dorinha', 'vicentinho-junior', 'wanderlei-barbosa']::text[]),
      ('Presidente', NULL, ARRAY['augusto-cury', 'cabo-daciolo', 'edmilson-costa', 'flavio-bolsonaro', 'hertz-dias', 'joaquim-barbosa', 'lula', 'renan-santos', 'romeu-zema', 'ronaldo-caiado', 'rui-costa-pimenta', 'samara-martins']::text[])
  ), actual AS (
    SELECT
      e.cargo_disputado,
      e.estado,
      e.expected_slugs,
      COALESCE(array_agg(c.slug ORDER BY c.slug) FILTER (WHERE c.slug IS NOT NULL), ARRAY[]::text[]) AS actual_slugs
    FROM expected e
    LEFT JOIN public.candidatos_publico c
      ON c.cargo_disputado = e.cargo_disputado
     AND (
       (e.estado IS NULL AND c.estado IS NULL)
       OR c.estado = e.estado
     )
    GROUP BY e.cargo_disputado, e.estado, e.expected_slugs
  )
  SELECT string_agg(
    cargo_disputado || '/' || COALESCE(estado, 'BR') || ': esperado ' || expected_slugs::text || ', encontrado ' || actual_slugs::text,
    '; '
    ORDER BY cargo_disputado, estado NULLS FIRST
  )
    INTO mismatch
  FROM actual
  WHERE actual_slugs <> expected_slugs;

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'pre-candidatos publicos divergentes: %', mismatch;
  END IF;

  WITH hold_public (slug, cargo_disputado, estado) AS (
    VALUES
      ('adriana-accorsi', 'Governador', 'GO'),
      ('aldo-rebelo', 'Presidente', NULL),
      ('alexandre-curi', 'Governador', 'PR'),
      ('andre-do-prado', 'Governador', 'SP'),
      ('arnaldinho-borgo', 'Governador', 'ES'),
      ('arthur-henrique', 'Governador', 'RR'),
      ('ataides-oliveira', 'Governador', 'TO'),
      ('beto-faro', 'Governador', 'PA'),
      ('capitao-wagner', 'Governador', 'CE'),
      ('ciro-gomes', 'Presidente', NULL),
      ('confucio-moura', 'Governador', 'RO'),
      ('da-vitoria', 'Governador', 'ES'),
      ('decio-lima', 'Governador', 'SC'),
      ('edegar-pretto', 'Governador', 'RS'),
      ('edilson-damiao', 'Governador', 'RR'),
      ('eduardo-girao', 'Governador', 'CE'),
      ('erika-hilton', 'Governador', 'SP'),
      ('evandro-augusto', 'Governador', 'RS'),
      ('fabio-trad', 'Governador', 'MS'),
      ('geraldo-alckmin', 'Governador', 'SP'),
      ('gilberto-kassab', 'Governador', 'SP'),
      ('gilson-machado', 'Governador', 'PE'),
      ('joao-capiberibe', 'Governador', 'AP'),
      ('joao-henrique-catan', 'Governador', 'MS'),
      ('joao-roma', 'Governador', 'BA'),
      ('jose-eliton', 'Governador', 'GO'),
      ('lucien-rezende', 'Governador', 'MS'),
      ('marcio-franca', 'Governador', 'SP'),
      ('marcos-vieira', 'Governador', 'SC'),
      ('margarete-coelho', 'Governador', 'PI'),
      ('nikolas-ferreira', 'Governador', 'MG'),
      ('paulo-hartung', 'Governador', 'ES'),
      ('paulo-martins-gov-pr', 'Governador', 'PR'),
      ('rafael-greca', 'Governador', 'PR'),
      ('ratinho-junior', 'Presidente', NULL),
      ('ricardo-nunes', 'Governador', 'SP'),
      ('roberto-claudio', 'Governador', 'CE'),
      ('rodrigo-bacellar', 'Governador', 'RJ'),
      ('rodrigo-pacheco', 'Governador', 'MG'),
      ('sergio-vidigal', 'Governador', 'ES'),
      ('silvio-mendes', 'Governador', 'PI'),
      ('simao-jatene', 'Governador', 'PA'),
      ('soldado-sampaio', 'Governador', 'RR'),
      ('tarcisio-motta', 'Governador', 'RJ'),
      ('thiago-de-joaldo', 'Governador', 'SE'),
      ('washington-reis', 'Governador', 'RJ')
  )
  SELECT COALESCE(array_agg(c.slug ORDER BY c.slug), ARRAY[]::text[])
    INTO visible_hold
  FROM public.candidatos_publico c
  JOIN hold_public h
    ON h.slug = c.slug;

  IF array_length(visible_hold, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'slugs fora da lista principal ainda publicos: %', visible_hold;
  END IF;
END $$;

COMMIT;
