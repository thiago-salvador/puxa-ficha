-- Quarentena reversível de 68 totais em 42 fichas, preflight 2026-09-25T22:09:55.731Z.
-- Varredura de todas as linhas vivas de gastos parlamentares de fichas públicas
-- contra a fonte oficial (API por deputado somando as legislaturas do ano, CSV
-- anual da Câmara e CEAPS anual do Senado). Tolerância: 1% do oficial ou R$ 50.
-- Recibo: QA/evidencias/2026-09-25-gastos-quarentena-universo/preflight.json
-- SHA-256: 7d98b8f2fff532cc4de1d57b01e8d524f4272002e912cd6bf790c853e1f3f835
-- O app filtra os mesmos anos por src/lib/gastos-parlamentares-em-revisao.ts.
BEGIN;

CREATE TEMP TABLE pf_gastos_universo_preimage (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ano integer NOT NULL,
  total_cents bigint NOT NULL,
  fonte text
) ON COMMIT DROP;

INSERT INTO pf_gastos_universo_preimage (id, slug, ano, total_cents, fonte) VALUES
  ('ee74dc3e-779b-41a6-8912-f4a1163d09fa'::uuid, 'aecio-neves', 2023, 45384528, 'Camara'),
  ('eaa7ac2e-f565-453f-8a01-2a935378a7e3'::uuid, 'daniel-vilela', 2019, 2695, 'Camara'),
  ('1d520fce-04d7-43cf-820f-8460180490b7'::uuid, 'delegado-eder-mauro', 2023, 55774496, 'Camara'),
  ('748893b6-3835-4dc5-b20b-bd1161cc5fd5'::uuid, 'delegado-eder-mauro', 2026, 25814433, 'https://dadosabertos.camara.leg.br/api/v2/deputados/178908/despesas'),
  ('c4c68d0d-a382-45c7-a744-9c5f49a8bbd4'::uuid, 'dr-daniel', 2023, 19056361, 'Camara'),
  ('bc80f64b-682f-4bdf-8fb1-918b318bd26d'::uuid, 'dr-daniel', 2024, 15051155, 'Camara'),
  ('43f2b40f-ddc5-4547-b22a-d6aa1015b4eb'::uuid, 'dr-daniel', 2025, 1896961, 'Camara'),
  ('812e791a-1134-4210-b1b1-f219386ecac4'::uuid, 'dr-fernando-maximo', 2023, 57552541, 'Camara'),
  ('3f0dbe98-b92c-43d4-a753-28a4045c60af'::uuid, 'dr-fernando-maximo', 2024, 57693920, 'Camara'),
  ('eb83c0ff-4695-4dec-ada2-ddd11df34e2e'::uuid, 'dr-fernando-maximo', 2025, 58199399, 'Camara'),
  ('7480240a-e7ee-4bf1-af10-42686b97a9a5'::uuid, 'expedito-netto', 2023, 42502, 'Camara'),
  ('603fa10e-02ae-4dc1-9966-c1148a665651'::uuid, 'guilherme-derrite', 2026, 23078191, 'https://dadosabertos.camara.leg.br/api/v2/deputados/204531/despesas'),
  ('0c2813c3-dff8-4a2a-a165-91368931f041'::uuid, 'helder-salomao', 2023, 29787708, 'Camara'),
  ('75456b06-c5d0-41de-b76e-411746c29fca'::uuid, 'helder-salomao', 2026, 24870957, 'Camara CEAP CSV'),
  ('fd050a4f-9ca7-47bc-a7ae-f41b92c10758'::uuid, 'joao-rodrigues', 2019, 17447, 'Camara'),
  ('93baf44c-5dba-4ca7-a8b8-f82d04d7b1ac'::uuid, 'joao-roma', 2023, 2222216, 'https://dadosabertos.camara.leg.br/api/v2/deputados/204576/despesas'),
  ('1260c5b6-0088-4c4d-9bae-b24baca04623'::uuid, 'jorginho-mello', 2023, 675320, 'Camara'),
  ('f5149443-5146-43b8-8420-e1fee0fcc406'::uuid, 'luciano-zucco', 2023, 26353307, 'Camara'),
  ('4e93de6d-f3c3-4f40-b647-d8d0174ffedd'::uuid, 'luciano-zucco', 2024, 41309307, 'Camara'),
  ('d0bafff0-13fc-4afd-8b1a-ffd9b08c9d42'::uuid, 'luciano-zucco', 2025, 48152928, 'Camara'),
  ('8f2e9f0a-3412-4c1f-9a70-acf71943d09a'::uuid, 'luciano-zucco', 2026, 12341759, 'Camara CEAP CSV'),
  ('98ffd309-1855-47b9-b85b-8549803c17bc'::uuid, 'patrus-ananias', 2025, 49618645, 'Camara CEAP CSV'),
  ('258fa3f6-cf33-40a8-a700-fc5490c0114c'::uuid, 'patrus-ananias', 2026, 26954948, 'Camara CEAP CSV'),
  ('a1238d3f-88c5-490c-88cb-de23dd2858b3'::uuid, 'ronaldo-caiado', 2009, 16958688, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('cf83a4a3-1560-4378-8ad8-1f0311078d4d'::uuid, 'ronaldo-caiado', 2010, 19231125, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('c89eae4a-5d9e-4d32-ab93-c0a14950220b'::uuid, 'ronaldo-caiado', 2011, 25735925, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('da5a8e67-f0d3-40e7-9270-aaada002c83c'::uuid, 'ronaldo-caiado', 2012, 23453967, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('4276ad63-603d-4aa9-9ef2-c582626d01cc'::uuid, 'ronaldo-caiado', 2013, 30832583, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('a107e012-7822-4143-8a6c-8c70f9c1626b'::uuid, 'ronaldo-caiado', 2014, 31204870, 'Cota Parlamentar/Camara dadosabertos (onda-p-20260814)'),
  ('5ddc51b8-285c-4097-aa4e-a28353a94045'::uuid, 'sandro-alex', 2023, 11324870, 'Camara'),
  ('ced8a424-0825-4de4-8ef1-f42d2d913637'::uuid, 'tse-2026-10002533895', 2023, 4366512, 'https://dadosabertos.camara.leg.br/api/v2/deputados/204471/despesas'),
  ('1a8e7d84-bd48-4ea5-a424-f3e83e6162ad'::uuid, 'tse-2026-10002548050', 2015, 698850, 'https://dadosabertos.camara.leg.br/api/v2/deputados/74363/despesas'),
  ('e3d456d3-7870-47c7-8be3-718aa56534ac'::uuid, 'tse-2026-120002547435', 2026, 36912771, 'https://dadosabertos.camara.leg.br/api/v2/deputados/74376/despesas'),
  ('ddb98e05-8078-494a-a751-e3a569f6a9ca'::uuid, 'tse-2026-130002551786', 2026, 32288433, 'https://dadosabertos.camara.leg.br/api/v2/deputados/160758/despesas'),
  ('72df228d-fc7a-4d7d-adb2-fd8092703641'::uuid, 'tse-2026-140002538404', 2023, 25035365, 'Camara'),
  ('3959b9e0-a677-4b09-8ee7-bacc9201f653'::uuid, 'tse-2026-140002538404', 2026, 34268750, 'Camara'),
  ('34bae58f-8b31-4c13-897c-c48daeae2d7d'::uuid, 'tse-2026-160002547660', 2023, 52656478, 'Camara'),
  ('886b2eb3-817a-4b83-9bff-153215e6f52a'::uuid, 'tse-2026-160002547660', 2026, 28697827, 'Camara'),
  ('36fe355e-9eca-4dc7-b0b6-f436c9a79de6'::uuid, 'tse-2026-170002539456', 2019, 3608381, 'https://dadosabertos.camara.leg.br/api/v2/deputados/74428/despesas'),
  ('437f97c0-8060-4fdf-b224-6e28156b703e'::uuid, 'tse-2026-170002539456', 2026, 31722775, 'https://dadosabertos.camara.leg.br/api/v2/deputados/74428/despesas'),
  ('1341b2e0-be04-49b9-b585-cd7ac5834559'::uuid, 'tse-2026-170002552097', 2023, 39003696, 'Camara'),
  ('6de24df4-1186-4ab1-aacc-62376f6de251'::uuid, 'tse-2026-170002552097', 2026, 39480353, 'Camara'),
  ('e92f5805-3f50-4d28-8ea1-794f687f83ca'::uuid, 'tse-2026-170002552102', 2026, 40603213, 'https://dadosabertos.camara.leg.br/api/v2/deputados/141421/despesas'),
  ('6ced6724-fd51-4aa0-a036-131cd0b8fe5a'::uuid, 'tse-2026-180002533964', 2026, 23975343, 'https://dadosabertos.camara.leg.br/api/v2/deputados/74317/despesas'),
  ('50b92330-e2b0-411a-b7da-6d8b57dc205d'::uuid, 'tse-2026-190002542888', 2023, 46292934, 'Camara'),
  ('313b42aa-1a5c-491b-a82e-2d4d377f9558'::uuid, 'tse-2026-190002542888', 2026, 34046324, 'Camara'),
  ('fdbef4be-134e-49b9-b6ef-14f3b59777db'::uuid, 'tse-2026-20002553272', 2025, 37765099, 'https://dadosabertos.camara.leg.br/api/v2/deputados/160541/despesas'),
  ('b8b825ba-f5e9-4907-9516-f827f91b4ad0'::uuid, 'tse-2026-20002553272', 2026, 18330574, 'https://dadosabertos.camara.leg.br/api/v2/deputados/160541/despesas'),
  ('2fddd06b-7930-4b3a-ad78-89f6d6630a65'::uuid, 'tse-2026-210002547816', 2026, 37187206, 'https://dadosabertos.camara.leg.br/api/v2/deputados/204416/despesas'),
  ('7692f1eb-d8e5-454b-9363-53e5e79c723c'::uuid, 'tse-2026-210002547819', 2023, 24214050, 'Camara'),
  ('c28306a4-3770-4502-af8f-d940de0dd617'::uuid, 'tse-2026-210002547819', 2026, 21924871, 'Camara'),
  ('a4656108-ee81-404c-a9a7-b5c4e1e80d6c'::uuid, 'tse-2026-230002534804', 2023, 56553183, 'Camara'),
  ('35bd6e5a-b508-4641-a9ee-10013716c452'::uuid, 'tse-2026-230002534804', 2026, 35281839, 'Camara'),
  ('1a3f44d8-668c-414b-93a1-1b0e88163a78'::uuid, 'tse-2026-250002532794', 2026, 33981133, 'Camara'),
  ('f6583701-0677-493a-b8d8-50caa38fb9c1'::uuid, 'tse-2026-250002551501', 2026, 16634512, 'Camara'),
  ('b65f71ba-f9a1-420f-b5fd-28e85db435fc'::uuid, 'tse-2026-260002551362', 2026, 23995076, 'Camara'),
  ('fb0f3c7a-617a-4dbe-b88f-697e6c350cbb'::uuid, 'tse-2026-270002548344', 2026, 38012961, 'Camara'),
  ('00b7662e-37c6-4639-9505-e1778b1d111b'::uuid, 'tse-2026-270002548409', 2023, 46912686, 'Camara'),
  ('b6d8270a-ce28-4502-a097-e7d421c6daf6'::uuid, 'tse-2026-30002549911', 2025, 56635933, 'Camara'),
  ('0ac73dad-0961-49bd-aa9e-d6ff6a327e91'::uuid, 'tse-2026-30002549911', 2026, 36407631, 'Camara'),
  ('1b041263-2d2c-420b-99f5-602bc2dac932'::uuid, 'tse-2026-40002542686', 2023, 40363516, 'Camara'),
  ('da9a41e1-113a-4674-ac10-443da2cee296'::uuid, 'tse-2026-40002542686', 2026, 26675670, 'Camara'),
  ('b64eb307-9c6d-4b4e-82b6-f9278251faac'::uuid, 'tse-2026-70002552934', 2023, 35511203, 'Camara'),
  ('2b62eb7d-c817-402f-8e4f-8186fe830c92'::uuid, 'tse-2026-70002553751', 2019, 2050000, 'https://dadosabertos.camara.leg.br/api/v2/deputados/160637/despesas'),
  ('2a585243-97d1-467f-b1de-341f6ddd9445'::uuid, 'tse-2026-80002553265', 2026, 35977935, 'https://dadosabertos.camara.leg.br/api/v2/deputados/178871/despesas'),
  ('cc1b74ca-24de-4946-91cd-8cac49db02e8'::uuid, 'tse-2026-90002546974', 2023, 37440648, 'Camara'),
  ('ca615aa5-b8a4-4f27-8db4-d47a783a3adc'::uuid, 'vicentinho-junior', 2023, 49506764, 'Camara'),
  ('ba84a86d-1a0e-4ae9-a23a-ad4034792d3d'::uuid, 'vicentinho-junior', 2025, 23701701, 'Camara');

DO $$
DECLARE
  v_matched integer;
BEGIN
  IF (SELECT count(*) FROM pf_gastos_universo_preimage) <> 68
     OR (SELECT count(DISTINCT slug) FROM pf_gastos_universo_preimage) <> 42 THEN
    RAISE EXCEPTION 'preimage esperava 68 linhas em 42 fichas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual LIKE '%is_public_candidate(candidato_id)%'
      AND qual LIKE '%despublicado_em IS NULL%'
  ) OR (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gastos_parlamentares'
      AND cmd IN ('SELECT', 'ALL')
  ) <> 1 THEN
    RAISE EXCEPTION 'política pública de gastos divergiu do schema da quarentena';
  END IF;
  -- O replay sintético não possui as linhas de produção.
  IF current_setting('pf.replay', true) = 'true' THEN RETURN; END IF;
  SELECT count(*) INTO v_matched
  FROM pf_gastos_universo_preimage e
  JOIN public.gastos_parlamentares g ON g.id = e.id
  JOIN public.candidatos c ON c.id = g.candidato_id
  WHERE c.slug = e.slug AND g.ano = e.ano
    AND g.total_gasto = e.total_cents::numeric / 100
    AND g.fonte IS NOT DISTINCT FROM e.fonte
    AND g.despublicado_em IS NULL;
  IF v_matched <> 68 THEN
    RAISE EXCEPTION 'preimage de gastos mudou: %/68 linhas', v_matched;
  END IF;
END $$;

DO $$
DECLARE
  v_updated integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN RETURN; END IF;
  -- @write tabela=gastos_parlamentares ref=gastos-universo campos=despublicado_em,despublicacao_motivo
  UPDATE public.gastos_parlamentares g
  SET despublicado_em = now(),
      despublicacao_motivo = 'gastos-universo: Total CEAP/CEAPS fora da tolerância da fonte oficial (1% ou R$ 50) ou sem id oficial verificado; varredura 2026-09-25'
  FROM pf_gastos_universo_preimage e
  WHERE g.id = e.id
    AND g.total_gasto = e.total_cents::numeric / 100
    AND g.fonte IS NOT DISTINCT FROM e.fonte
    AND g.despublicado_em IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 68 THEN
    RAISE EXCEPTION 'quarentena marcou %/68 linhas', v_updated;
  END IF;
END $$;

COMMIT;
