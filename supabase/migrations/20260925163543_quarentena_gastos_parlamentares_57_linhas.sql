-- Quarentena reversível de 57 totais em 40 fichas, preflight 2026-09-25T17:34:46Z.
-- Recibo: QA/evidencias/2026-09-25-gastos-quarentena/preflight.json
-- SHA-256: 8423cc0273af0e7720374759d6ed81eec7775ae697b73239b5e3180bd9bfc5d7
-- O app também filtra ficha, API, comparador e ranking. Esta política fecha
-- a leitura direta por anon/authenticated enquanto os totais são conferidos.
BEGIN;

CREATE TEMP TABLE pf_gastos_129_preimage (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ano integer NOT NULL,
  total_cents integer NOT NULL,
  fonte text
) ON COMMIT DROP;

INSERT INTO pf_gastos_129_preimage (id, slug, ano, total_cents, fonte) VALUES
  ('32c3878e-bb0c-4fbe-bc44-187fdf4212b3'::uuid, 'alan-rick', 2023, 43926262, 'Senado'),
  ('a85ede0d-73b8-4ee2-87c9-1bdb41f56ec3'::uuid, 'alan-rick', 2026, 17901910, 'Senado'),
  ('806ce0bb-de6c-4e79-95fa-f23e5d839c25'::uuid, 'cleitinho', 2026, 3500299, 'Senado'),
  ('15b97c77-05bf-4c4e-acf7-a343adba43a3'::uuid, 'efraim-filho', 2023, 40183829, 'Senado'),
  ('a53a3cae-71ca-4ab2-bd8f-80b7ac91e5f1'::uuid, 'efraim-filho', 2026, 14484928, 'Senado'),
  ('5d8d797c-4001-4eb6-81f5-bc6e9e2fb068'::uuid, 'flavio-bolsonaro', 2026, 7602821, 'Senado'),
  ('ce9286c5-8a6d-4444-a9f3-0932acf3fa59'::uuid, 'marcos-rogerio', 2026, 30287465, 'Senado'),
  ('856c6dd5-1626-4788-91d3-80838928a805'::uuid, 'omar-aziz', 2026, 34696169, 'Senado'),
  ('5f51389e-3038-46ce-8b34-7dbcae95b595'::uuid, 'professora-dorinha', 2023, 28702474, 'Senado'),
  ('465729d6-d37e-44a4-b85e-77e292954ecd'::uuid, 'professora-dorinha', 2024, 32849324, 'Senado'),
  ('fb9430ea-e0ea-422e-9e93-80b613782d0a'::uuid, 'professora-dorinha', 2026, 14451150, 'Senado'),
  ('57c31fcd-39c0-4806-b2e9-b29afd74b671'::uuid, 'renan-filho', 2026, 10141243, 'Senado'),
  ('c144ba8a-a55c-417e-8c4f-cd5095a026ad'::uuid, 'sergio-moro-gov-pr', 2023, 25837536, 'Senado'),
  ('7948ea7c-aa81-435b-8601-d192ff79ce80'::uuid, 'sergio-moro-gov-pr', 2024, 31136528, 'Senado'),
  ('57adc33a-45ed-48e8-9f3c-9a0691c501af'::uuid, 'sergio-moro-gov-pr', 2026, 21843413, 'Senado'),
  ('c51d1ef5-6145-4743-a3f2-01b0c26f369a'::uuid, 'tse-2026-100002537338', 2026, 31204043, 'Senado'),
  ('1ff40098-c266-4eeb-8075-5c0feabfbfca'::uuid, 'tse-2026-100002541459', 2023, 46140243, 'Senado'),
  ('d944182e-5576-4e07-8d0e-29b096849ea2'::uuid, 'tse-2026-10002544274', 2026, 37009406, 'https://dadosabertos.camara.leg.br/api/v2/deputados/220589/despesas'),
  ('7c6a1a45-bd0f-434c-bb02-ac22bf642f41'::uuid, 'tse-2026-10002548046', 2015, 38669547, 'Senado'),
  ('56f89ba9-45f7-4f44-b338-c02a8a93408b'::uuid, 'tse-2026-10002548050', 2026, 34245508, 'Senado'),
  ('65028607-f18d-463a-af49-d35fe7f9602a'::uuid, 'tse-2026-110002544986', 2026, 16794374, 'Senado'),
  ('0465fcc0-9974-438b-9359-137a76d6ae27'::uuid, 'tse-2026-120002547434', 2026, 37086293, 'Senado'),
  ('f7de777b-f527-4e78-8a7c-796bea442545'::uuid, 'tse-2026-130002545590', 2023, 35924186, 'Senado'),
  ('3ce77dfe-23aa-474a-9412-e673c39a7279'::uuid, 'tse-2026-130002545590', 2024, 26194797, 'Senado'),
  ('df3bb75d-70d4-4b28-bf65-745c8160c003'::uuid, 'tse-2026-130002545590', 2026, 33579731, 'Senado'),
  ('5bbcace3-ad93-4cc7-bd87-967b025b2edf'::uuid, 'tse-2026-140002542691', 2011, 38987096, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73933/despesas'),
  ('eb056dc6-2b7d-4d13-96e9-f6519da1c61b'::uuid, 'tse-2026-150002544905', 2026, 14150304, 'Senado'),
  ('5a12d7a6-c622-4a6b-a6fd-7b38383cddf0'::uuid, 'tse-2026-180002533967', 2023, 35843256, 'Senado'),
  ('20fd9bcc-760d-4ebc-99cf-3436ada43457'::uuid, 'tse-2026-190002535142', 2026, 32968551, 'Senado'),
  ('06933ad7-a3de-43a4-99c4-3d32a4e0a962'::uuid, 'tse-2026-190002548141', 2015, 40727179, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73701/despesas'),
  ('d1f47768-a8e6-4430-8f17-3582ace84c8f'::uuid, 'tse-2026-190002548141', 2019, 42609837, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73701/despesas'),
  ('58e3ab85-9b18-47f1-9eb9-0b290f9510a8'::uuid, 'tse-2026-190002548141', 2023, 41814403, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73701/despesas'),
  ('8f8beb57-0f09-41fa-8234-9af600a6a253'::uuid, 'tse-2026-190002548141', 2025, 49793546, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73701/despesas'),
  ('acbedbda-ca35-41eb-87c6-4d64da5eec30'::uuid, 'tse-2026-190002548141', 2026, 27120918, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73701/despesas'),
  ('55365325-bbb7-4f24-a8e4-79a4ef64ebbb'::uuid, 'tse-2026-200002535507', 2026, 27160687, 'Senado'),
  ('1abca4f2-9aa3-4f9e-ac1e-175c3b29d650'::uuid, 'tse-2026-20002553727', 2026, 13812000, 'Senado'),
  ('fad1801a-9729-4135-abcd-d69b1e59d188'::uuid, 'tse-2026-230002550794', 2023, 50060344, 'Senado'),
  ('6a6b9c6c-ed18-49c5-8276-34bc5ae67ac1'::uuid, 'tse-2026-230002550794', 2024, 54896609, 'Senado'),
  ('7499629a-cc81-45e1-ae8b-9d126f1f7f13'::uuid, 'tse-2026-230002550794', 2025, 55432435, 'Senado'),
  ('c045d184-3dd7-4cf6-a376-a64837ddb711'::uuid, 'tse-2026-240002548632', 2026, 25295343, 'Senado'),
  ('9a19b52b-bfc8-4334-a973-c1312339be26'::uuid, 'tse-2026-260002533084', 2026, 37917780, 'Senado'),
  ('0b1fc969-adea-43df-afc4-269f30409a95'::uuid, 'tse-2026-260002547285', 2023, 53140181, 'Senado'),
  ('66802c1a-7c7e-4dab-abbf-5908a422f021'::uuid, 'tse-2026-260002547285', 2024, 55972421, 'Senado'),
  ('4cf9dfa9-1ea8-4400-8d83-db3b169a8a63'::uuid, 'tse-2026-270002546333', 2026, 18141544, 'Senado'),
  ('bfda6c97-c557-4b48-a42d-205121d9b41f'::uuid, 'tse-2026-30002530069', 2026, 35585364, 'Senado'),
  ('79d3cbf5-c18b-413c-9897-9e94189a5b02'::uuid, 'tse-2026-30002549909', 2026, 34980490, 'Senado'),
  ('62ccbf1b-be30-4c6b-962c-a3fcc280d745'::uuid, 'tse-2026-40002537344', 2023, 48112821, 'Senado'),
  ('4e970b31-59d6-4fd5-933a-b9c90548a8e4'::uuid, 'tse-2026-40002537344', 2024, 45419038, 'Senado'),
  ('78ba4ac6-3430-4f2f-9018-7c4d0b7bee65'::uuid, 'tse-2026-50002536317', 2026, 29430407, 'Senado'),
  ('087742e3-95ba-4334-9d59-054425b9a492'::uuid, 'tse-2026-60002542479', 2026, 23347230, 'Senado'),
  ('ae85a85c-f7dc-4af8-9752-d3bb75909734'::uuid, 'tse-2026-70002552492', 2026, 15566548, 'Senado'),
  ('3c36e26b-a1a2-4fec-9ee8-c3f095948644'::uuid, 'tse-2026-80002538202', 2024, 18031769, 'Senado'),
  ('4b32e0ea-262b-49a5-ac23-242f1e359a34'::uuid, 'tse-2026-80002538202', 2026, 34549483, 'Senado'),
  ('bb432102-16e2-4d3b-b9ae-16cc00d8a71c'::uuid, 'tse-2026-80002550187', 2026, 26839314, 'Senado'),
  ('c43bc5d6-07d8-43cc-b195-eef8181e1c03'::uuid, 'tse-2026-80002551368', 2011, 32801234, 'https://dadosabertos.camara.leg.br/api/v2/deputados/73507/despesas'),
  ('0dfffa99-999d-4b06-aa0a-9a5311591840'::uuid, 'wellington-fagundes', 2026, 34478877, 'Senado'),
  ('3969d305-5e6a-48c7-bca5-887be31782d2'::uuid, 'wilder-morais', 2026, 8817448, 'Senado');

DO $$
DECLARE
  v_matched integer;
BEGIN
  IF (SELECT count(*) FROM pf_gastos_129_preimage) <> 57
     OR (SELECT count(DISTINCT slug) FROM pf_gastos_129_preimage) <> 40 THEN
    RAISE EXCEPTION 'preimage esperava 57 linhas em 40 fichas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual LIKE '%is_public_candidate(candidato_id)%'
      AND qual LIKE '%despublicado_em IS NULL%'
  ) THEN
    RAISE EXCEPTION 'política pública de gastos divergiu do schema da quarentena';
  END IF;
  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'há outra política que pode expor gastos em quarentena';
  END IF;
  -- O replay sintético não possui as 57 linhas de produção.
  IF current_setting('pf.replay', true) = 'true' THEN RETURN; END IF;
  SELECT count(*) INTO v_matched
  FROM pf_gastos_129_preimage e
  JOIN public.gastos_parlamentares g ON g.id = e.id
  JOIN public.candidatos c ON c.id = g.candidato_id
  WHERE c.slug = e.slug AND g.ano = e.ano
    AND g.total_gasto = e.total_cents::numeric / 100
    AND g.fonte IS NOT DISTINCT FROM e.fonte;
  IF v_matched <> 57 THEN
    RAISE EXCEPTION 'preimage de gastos mudou: %/57 linhas', v_matched;
  END IF;
END $$;

DO $$
DECLARE
  v_updated integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN RETURN; END IF;
  UPDATE public.gastos_parlamentares g
  SET despublicado_em = now(),
      despublicacao_motivo = 'Totais CEAP/CEAPS em conferência com a fonte oficial; triagem 129 casos 2026-09-25'
  FROM pf_gastos_129_preimage e
  WHERE g.id = e.id
    AND g.total_gasto = e.total_cents::numeric / 100
    AND g.fonte IS NOT DISTINCT FROM e.fonte
    AND g.despublicado_em IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 57 THEN
    RAISE EXCEPTION 'quarentena marcou %/57 linhas', v_updated;
  END IF;
END $$;

COMMIT;
