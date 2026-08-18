-- Pontos de atencao editoriais aprovados para a regiao Centro-Oeste.
-- Os tres fatos possuem comprovacao registrada no dossie
-- fonte interna de curadoria
-- Idempotente por candidato_id, categoria e titulo.
BEGIN;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.candidatos
  WHERE (id, slug) IN (
    ('95fc116b-4c1e-4332-9c52-948bc1775a57'::uuid, 'marconi-perillo'),
    ('29dbd8e2-6ebb-4261-bf53-be3b4df63718'::uuid, 'joao-henrique-catan'),
    ('3c628b54-5304-480d-a664-be16409e0322'::uuid, 'mauricio-tonha')
  );

  IF n <> 3 THEN
    RAISE EXCEPTION 'Alertas Centro-Oeste: esperados 3 candidatos com id e slug confirmados, encontrados %', n;
  END IF;
END $$;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '95fc116b-4c1e-4332-9c52-948bc1775a57',
  'processo_grave',
  'STF suspendeu inquérito sobre suspeitas de desvios na saúde de Goiás',
  'Em fevereiro de 2025, o ministro Gilmar Mendes, do STF, suspendeu o inquérito da Polícia Federal que investigava Marconi Perillo por suspeitas de desvios na saúde estadual. A suspensão ocorreu por discussão sobre a competência e o foro aplicável, sem decisão de mérito sobre as suspeitas.',
  '[{"url":"https://noticias.stf.jus.br/postsnoticias/stf-suspende-inquerito-contra-ex-governador-marconi-perillo/","data":"2025-02-12","titulo":"STF suspende inquérito contra ex-governador Marconi Perillo"},{"url":"https://noticias.uol.com.br/ultimas-noticias/agencia-estado/2025/02/12/gilmar-suspende-investigacao-sobre-marconi-perillo.amp.htm","data":"2025-02-12","titulo":"Gilmar suspende investigação sobre Marconi Perillo"}]'::jsonb,
  'media', true, 'curadoria', true, '2025-02-12'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '95fc116b-4c1e-4332-9c52-948bc1775a57'
    AND categoria = 'processo_grave'
    AND titulo = 'STF suspendeu inquérito sobre suspeitas de desvios na saúde de Goiás'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '29dbd8e2-6ebb-4261-bf53-be3b4df63718',
  'justica_eleitoral',
  'TRE-MS mandou remover vídeo com IA sem rotulagem e impulsionamento pago',
  'Em 8 de junho de 2026, o TRE-MS concedeu tutela de urgência para determinar que João Henrique Catan removesse um vídeo gerado por inteligência artificial sem a rotulagem exigida e impulsionado de forma onerosa contra adversário. A decisão fixou multa diária de R$ 1 mil em caso de descumprimento, limitada inicialmente a R$ 30 mil, e deixou o mérito para julgamento posterior.',
  '[{"url":"https://pje.tre-ms.jus.br/pje/Processo/ConsultaProcesso/Detalhe/documentoHTML.seam?ca=06ecf447e625b3a368f46bb8d20bc745a64ccd478","data":"2026-06-08","titulo":"Decisão no processo 0600149-94.2026.6.12.0000"},{"url":"https://static.poder360.com.br/2026/06/DECISAO-1.pdf","data":"2026-06-08","titulo":"Cópia integral da decisão do TRE-MS"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2026-06-08'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '29dbd8e2-6ebb-4261-bf53-be3b4df63718'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TRE-MS mandou remover vídeo com IA sem rotulagem e impulsionamento pago'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '3c628b54-5304-480d-a664-be16409e0322',
  'processo_grave',
  'TCE-MT determinou restituição e multa nas contas de Água Boa de 2011',
  'Em 2012, o TCE-MT julgou regulares, com recomendações e determinações, as contas de gestão de Água Boa de 2011. No mesmo acórdão, determinou que Maurício Cardoso Tonhá restituísse R$ 10.478,61 aos cofres municipais e pagasse multa de 66 UPFs/MT por irregularidades mantidas.',
  '[{"url":"https://iomat.mt.gov.br/portal/edicoes/download/3296","data":"2012-12-17","titulo":"Diário Oficial de Mato Grosso com o Acórdão 724/2012 do TCE-MT"}]'::jsonb,
  'baixa', true, 'curadoria', true, '2012-12-17'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '3c628b54-5304-480d-a664-be16409e0322'
    AND categoria = 'processo_grave'
    AND titulo = 'TCE-MT determinou restituição e multa nas contas de Água Boa de 2011'
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
      ('95fc116b-4c1e-4332-9c52-948bc1775a57'::uuid, 'processo_grave', 'STF suspendeu inquérito sobre suspeitas de desvios na saúde de Goiás'),
      ('29dbd8e2-6ebb-4261-bf53-be3b4df63718'::uuid, 'justica_eleitoral', 'TRE-MS mandou remover vídeo com IA sem rotulagem e impulsionamento pago'),
      ('3c628b54-5304-480d-a664-be16409e0322'::uuid, 'processo_grave', 'TCE-MT determinou restituição e multa nas contas de Água Boa de 2011')
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

  IF n <> 3 THEN
    RAISE EXCEPTION 'Alertas Centro-Oeste: esperados 3 pontos públicos verificados, encontrados %', n;
  END IF;
END $$;

COMMIT;
