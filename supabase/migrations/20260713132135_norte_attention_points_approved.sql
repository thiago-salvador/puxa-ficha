-- Pontos de atencao editoriais aprovados para a regiao Norte.
-- Os seis fatos possuem comprovacao registrada no dossie
-- data/operations/alert-coverage-norte-20260713/research.json.
-- Idempotente por candidato_id, categoria e titulo.
--
-- NOTA DE RESTAURACAO (2026-07-25, auditoria de integridade):
-- Esta migration havia sido aplicada no banco de producao sem que o arquivo
-- fosse versionado no repo, o que deixava `supabase migration list` com uma
-- versao remota sem correspondente local e travava `supabase db push`.
-- O conteudo abaixo foi restaurado a partir de
-- `supabase_migrations.schema_migrations.statements` da propria producao
-- (version 20260713132135, name norte_attention_points_approved).
-- Preferiu-se restaurar o arquivo a marcar a migration como revertida: ela foi
-- de fato aplicada, e um `migration repair --status reverted` deixaria o
-- historico mentindo e poderia reaplicar os inserts num banco novo.
BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.candidatos
  WHERE (id, slug) IN (
    ('9ea4f811-3d51-48b2-a297-e4fccb0ddc14'::uuid, 'maria-do-carmo'),
    ('6d89f284-e148-454e-85e1-c77996c132b5'::uuid, 'delegado-eder-mauro'),
    ('e9cf3bd3-4ab9-4928-b652-558c5e8d8ce4'::uuid, 'adailton-furia'),
    ('049a5051-e7c9-4729-8853-14753d2993e1'::uuid, 'arthur-henrique'),
    ('9f72e526-c72d-4fc5-8e08-0a965c03b712'::uuid, 'edilson-damiao'),
    ('131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid, 'ataides-oliveira')
  );

  IF n <> 6 THEN
    RAISE EXCEPTION 'Alertas Norte: esperados 6 candidatos com id e slug confirmados, encontrados %', n;
  END IF;
END $$;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '9ea4f811-3d51-48b2-a297-e4fccb0ddc14',
  'justica_eleitoral',
  'TRE-AM manteve multa de R$ 5 mil por desinformação eleitoral',
  'Em 22 de janeiro de 2025, o TRE-AM negou recurso e manteve multa de R$ 5 mil aplicada a Maria do Carmo Seffair por divulgação de informação considerada desinformação, em violação ao art. 57-D da Lei das Eleições.',
  '[{"url":"https://amazonas1.com.br/wp-content/uploads/2025/01/TRE-Maria-do-Carmo-Seffair.pdf","data":"2025-01-22","titulo":"DJE/TRE-AM com o acórdão"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2025-01-22'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '9ea4f811-3d51-48b2-a297-e4fccb0ddc14'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TRE-AM manteve multa de R$ 5 mil por desinformação eleitoral'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '6d89f284-e148-454e-85e1-c77996c132b5',
  'processo_grave',
  'Condenado pelo STF por difamação após divulgar vídeo adulterado',
  'Em 18 de agosto de 2020, o STF condenou Eder Mauro por difamação majorada contra Jean Wyllys após a divulgação de vídeo adulterado. A pena privativa de liberdade foi substituída por prestação pecuniária à vítima.',
  '[{"url":"https://noticias.stf.jus.br/postsnoticias/deputado-eder-mauro-psd-pa-e-condenado-por-difamacao-contra-ex-deputado-jean-wyllys/","data":"2020-08-18","titulo":"STF condena Eder Mauro por difamação contra Jean Wyllys"},{"url":"https://processo.stj.jus.br/SCON/GetInteiroTeorDoAcordao?dt_publicacao=05%2F02%2F2021&num_registro=201901914238","data":"2021-02-05","titulo":"Inteiro teor oficial publicado pelo STJ"}]'::jsonb,
  'media', true, 'curadoria', true, '2020-08-18'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '6d89f284-e148-454e-85e1-c77996c132b5'
    AND categoria = 'processo_grave'
    AND titulo = 'Condenado pelo STF por difamação após divulgar vídeo adulterado'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'e9cf3bd3-4ab9-4928-b652-558c5e8d8ce4',
  'processo_grave',
  'TCE-RO manteve multa por irregularidades em contratações diretas',
  'Em setembro de 2025, o Pleno do TCE-RO negou o pedido de reexame de Adailton Fúria e manteve a multa de R$ 3.240 aplicada por dispensa e inexigibilidade de licitação sem pesquisa de preços e comprovação mínima de exclusividade. Trata-se de sanção administrativa do tribunal de contas.',
  '[{"url":"https://tce.ro.gov.br/doe/arquivos/Diario_03403_2025-9-16-15-18-55.pdf","data":"2025-09-16","titulo":"Acórdão final do TCE-RO"},{"url":"https://www.tce.ro.gov.br/doe/arquivos/Diario_03309_2025-5-5-16-53-41.pdf","data":"2025-05-05","titulo":"Decisão de admissibilidade com o acórdão recorrido"}]'::jsonb,
  'media', true, 'curadoria', true, '2025-09-05'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = 'e9cf3bd3-4ab9-4928-b652-558c5e8d8ce4'
    AND categoria = 'processo_grave'
    AND titulo = 'TCE-RO manteve multa por irregularidades em contratações diretas'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '049a5051-e7c9-4729-8853-14753d2993e1',
  'justica_eleitoral',
  'Candidatura permanece sub judice e diplomação está suspensa',
  'Arthur Henrique foi o mais votado na eleição suplementar de Roraima em junho de 2026, mas o TRE-RR rejeitou seu registro. O TSE informa que os votos permanecem sub judice e que a diplomação foi suspensa até manifestação do STF; o resultado ainda não foi proclamado.',
  '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2026/Junho/arthur-henrique-e-o-mais-votado-para-o-cargo-de-governador-na-eleicao-suplementar-de-roraima","data":"2026-06-21","titulo":"Arthur Henrique é o mais votado na eleição suplementar de Roraima"},{"url":"https://www.tse.jus.br/comunicacao/noticias/2026/Junho/tse-suspende-prazo-sobre-diplomacao-para-governador-na-eleicao-suplementar-de-roraima","data":"2026-06-30","titulo":"TSE suspende prazo sobre diplomação na eleição suplementar de Roraima"}]'::jsonb,
  'alta', true, 'curadoria', true, '2026-06-30'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '049a5051-e7c9-4729-8853-14753d2993e1'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Candidatura permanece sub judice e diplomação está suspensa'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '9f72e526-c72d-4fc5-8e08-0a965c03b712',
  'justica_eleitoral',
  'Mandato cassado pelo TSE na chapa eleita em 2022',
  'Em 30 de abril de 2026, o TSE cassou os mandatos de Antonio Denarium e do vice Edilson Damião e determinou nova eleição direta em Roraima. A decisão decorreu de AIJE por abuso de poder político e econômico; esta redação não afirma inelegibilidade pessoal de Edilson Damião.',
  '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2026/Abril/tse-cassa-mandato-do-governador-e-determina-eleicoes-diretas-em-roraima","data":"2026-04-30","titulo":"TSE cassa mandato do governador e determina eleições diretas em Roraima"},{"url":"https://www.tre-rr.jus.br/legislacao/resolucoes-tre-rr/2026/resolucao-no-584-2026-de-02-de-maio-de-2026","data":"2026-05-02","titulo":"Resolução TRE-RR nº 584/2026"}]'::jsonb,
  'alta', true, 'curadoria', true, '2026-04-30'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '9f72e526-c72d-4fc5-8e08-0a965c03b712'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Mandato cassado pelo TSE na chapa eleita em 2022'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd',
  'justica_eleitoral',
  'Justiça Eleitoral aplicou multa de R$ 5 mil por propaganda antecipada negativa',
  'Em 30 de março de 2026, decisão da Justiça Eleitoral julgou parcialmente procedente representação contra Ataídes Oliveira, determinou a remoção definitiva das publicações e aplicou multa de R$ 5 mil por propaganda antecipada negativa. A proposta não afirma trânsito em julgado.',
  '[{"url":"https://clebertoledo.com.br/wp-content/uploads/2026/03/Decisao-Justica-Eleitoral-Dorinha-Ataides.pdf","data":"2026-03-30","titulo":"Decisão do PJe reproduzida integralmente"},{"url":"https://www.mpf.mp.br/o-mpf/unidades/pr-to/noticias/mp-eleitoral-obtem-liminar-para-remocao-de-propaganda-antecipada-de-pre-candidato-a-governador-do-to","data":"2026-05-05","titulo":"MP Eleitoral obtém liminar para remoção de propaganda antecipada"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2026-03-30'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Justiça Eleitoral aplicou multa de R$ 5 mil por propaganda antecipada negativa'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM (
    SELECT candidato_id, categoria, titulo
    FROM public.pontos_atencao
    WHERE (candidato_id, categoria, titulo) IN (
      ('9ea4f811-3d51-48b2-a297-e4fccb0ddc14'::uuid, 'justica_eleitoral', 'TRE-AM manteve multa de R$ 5 mil por desinformação eleitoral'),
      ('6d89f284-e148-454e-85e1-c77996c132b5'::uuid, 'processo_grave', 'Condenado pelo STF por difamação após divulgar vídeo adulterado'),
      ('e9cf3bd3-4ab9-4928-b652-558c5e8d8ce4'::uuid, 'processo_grave', 'TCE-RO manteve multa por irregularidades em contratações diretas'),
      ('049a5051-e7c9-4729-8853-14753d2993e1'::uuid, 'justica_eleitoral', 'Candidatura permanece sub judice e diplomação está suspensa'),
      ('9f72e526-c72d-4fc5-8e08-0a965c03b712'::uuid, 'justica_eleitoral', 'Mandato cassado pelo TSE na chapa eleita em 2022'),
      ('131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid, 'justica_eleitoral', 'Justiça Eleitoral aplicou multa de R$ 5 mil por propaganda antecipada negativa')
    )
      AND verificado = true
      AND gerado_por = 'curadoria'
      AND visivel = true
      AND jsonb_typeof(fontes) = 'array'
      AND jsonb_array_length(fontes) >= 1
      AND data_referencia IS NOT NULL
    GROUP BY candidato_id, categoria, titulo
    HAVING COUNT(*) = 1
  ) AS verified_semantic_rows;

  IF n <> 6 THEN
    RAISE EXCEPTION 'Alertas Norte: esperados 6 pontos públicos verificados, encontrados %', n;
  END IF;
END $$;

COMMIT;
