-- Resultado oficial do TSE, 2º turno de 2026: fase eleitoral de 14 candidatura(s).
--
-- Gerada por `scripts/resultados-tse-fase.ts gerar` a partir do plano
-- sha256 47dd60f72855baeab799c8388034a47811c0afce9d2e5941da4d8e4e103ad6a2 (2026-10-27T13:48:37.462Z). Contagem: mudancas=14, pendentes=0, encerram=14, nao_eleito=7, eleito=7.
-- Fontes (divulgação oficial, totalização final, todas as seções):
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json
--     sha256 7bf1f65f9c1f77ff9e70fbbbf8ce15c4f3bf843f9ed97783340f95d0fbf5fa88 (gerado pelo TSE em 25/10/2026 21:26:35)
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/am/am-c0003-e006260-u.json
--     sha256 ad814f7694d9cf6d5c4847cbdfdf1f23a281991cd7207f068dc9ddebf3db9acb (gerado pelo TSE em 25/10/2026 22:10:45)
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/df/df-c0003-e006260-u.json
--     sha256 362a011c437b2120b66f96314703a2c803eaac81a0ed075790bea1cc4989b901 (gerado pelo TSE em 25/10/2026 21:28:25)
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/es/es-c0003-e006260-u.json
--     sha256 ed715ecbb21d48c5e10dc8dda4e7c738bbeb72ad9bb1963d010dcacf9314da0c (gerado pelo TSE em 25/10/2026 21:32:45)
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/rn/rn-c0003-e006260-u.json
--     sha256 6ba7877cba3837cbccca75c839917fe697fdbf8917a3b8cb4580e5d7d760d869 (gerado pelo TSE em 25/10/2026 21:24:45)
--   https://resultados.tse.jus.br/oficial/ele2026/6260/dados/to/to-c0003-e006260-u.json
--     sha256 6629b897507db1a4f2f861831fd26425e2b00cd2bcdb2701f57b4283db3e0bf5 (gerado pelo TSE em 25/10/2026 21:45:15)
--   https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json
--     sha256 67fae708b0c7977fc9847d36100c63313621bff971178c48f2da99969707c263 (gerado pelo TSE em 25/10/2026 23:27:02)
--
-- Escrita: candidaturas_fase_2026 (atualização com CAS da fase segundo_turno)
-- e recibo em coleta_log com before/after de cada linha. Candidatura com
-- atualizacao_encerrada_em sai da coorte de atualização; a ficha continua no
-- ar e nenhum dado é apagado. Pendências do plano (0) não são tocadas.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-fase-eleitoral-production (conjunto turno-2).
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidaturas_fase_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE MODE;

DO $apply$
DECLARE
  quantidade integer;
  encerrada date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'fase-turno-2-20261027134837: coorte ausente; resultado ignorado (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'fase-turno-2-20261027134837: resultado ignorado apenas no replay descartável';
    RETURN;
  END IF;

  CREATE TEMP TABLE pf_fase_plano_20261027134837 (
    candidato_id uuid PRIMARY KEY, slug text NOT NULL, sq text, sq_antes text, cargo text NOT NULL,
    fase_antes text NOT NULL, fase_depois text NOT NULL, turno smallint NOT NULL, encerra boolean NOT NULL,
    situacao_tse text, fonte_url text, fonte_sha256 text
  ) ON COMMIT DROP;
  INSERT INTO pf_fase_plano_20261027134837 VALUES
    ('c7e3a004-99ba-426b-af65-206e3066c496'::uuid, 'alan-rick', '10002532492', '10002532492', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json', '7bf1f65f9c1f77ff9e70fbbbf8ce15c4f3bf843f9ed97783340f95d0fbf5fa88'),
    ('71129af6-3c6d-4b0a-9030-b97984fc1e0b'::uuid, 'alysson-bezerra', '200002535255', '200002535255', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/rn/rn-c0003-e006260-u.json', '6ba7877cba3837cbccca75c839917fe697fdbf8917a3b8cb4580e5d7d760d869'),
    ('afb87309-0aee-4ecc-9ac6-e8402902321a'::uuid, 'cadu-xavier', '200002534001', '200002534001', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/rn/rn-c0003-e006260-u.json', '6ba7877cba3837cbccca75c839917fe697fdbf8917a3b8cb4580e5d7d760d869'),
    ('91dc9c87-6811-494c-8c51-1bccfdf08c29'::uuid, 'celina-leao', '70002553055', '70002553055', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/df/df-c0003-e006260-u.json', '362a011c437b2120b66f96314703a2c803eaac81a0ed075790bea1cc4989b901'),
    ('538fb04d-8fb4-486f-a7dd-9c78399a6353'::uuid, 'flavio-bolsonaro', '280002551544', '280002551544', 'Presidente', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json', '67fae708b0c7977fc9847d36100c63313621bff971178c48f2da99969707c263'),
    ('3b724874-8769-44f3-aab3-06c0155dc155'::uuid, 'leandro-grass', '70002552496', '70002552496', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/df/df-c0003-e006260-u.json', '362a011c437b2120b66f96314703a2c803eaac81a0ed075790bea1cc4989b901'),
    ('d6740de5-c7d9-4978-ab49-b51a22481aa2'::uuid, 'lula', '280002542548', '280002542548', 'Presidente', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json', '67fae708b0c7977fc9847d36100c63313621bff971178c48f2da99969707c263'),
    ('4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid, 'mailza-assis', '10002544107', '10002544107', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json', '7bf1f65f9c1f77ff9e70fbbbf8ce15c4f3bf843f9ed97783340f95d0fbf5fa88'),
    ('9ea4f811-3d51-48b2-a297-e4fccb0ddc14'::uuid, 'maria-do-carmo', '40002541626', '40002541626', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/am/am-c0003-e006260-u.json', 'ad814f7694d9cf6d5c4847cbdfdf1f23a281991cd7207f068dc9ddebf3db9acb'),
    ('9fe469dc-058f-487d-b888-ba113f5535ae'::uuid, 'omar-aziz', '40002532272', '40002532272', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/am/am-c0003-e006260-u.json', 'ad814f7694d9cf6d5c4847cbdfdf1f23a281991cd7207f068dc9ddebf3db9acb'),
    ('8d4eb423-5fa3-401f-883d-d70f4c0c64d8'::uuid, 'pazolini', '80002552682', '80002552682', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/es/es-c0003-e006260-u.json', 'ed715ecbb21d48c5e10dc8dda4e7c738bbeb72ad9bb1963d010dcacf9314da0c'),
    ('00c6fd60-9151-43d2-b1e4-ea45371511a8'::uuid, 'professora-dorinha', '270002544599', '270002544599', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/to/to-c0003-e006260-u.json', '6629b897507db1a4f2f861831fd26425e2b00cd2bcdb2701f57b4283db3e0bf5'),
    ('e79ddaf5-f86c-40c6-a54c-10535cb5514d'::uuid, 'ricardo-ferraco', '80002552172', '80002552172', 'Governador', 'segundo_turno', 'nao_eleito', 2, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/es/es-c0003-e006260-u.json', 'ed715ecbb21d48c5e10dc8dda4e7c738bbeb72ad9bb1963d010dcacf9314da0c'),
    ('3e0885c9-ae59-424a-8a99-9367801c5740'::uuid, 'vicentinho-junior', '270002544544', '270002544544', 'Governador', 'segundo_turno', 'eleito', 2, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/to/to-c0003-e006260-u.json', '6629b897507db1a4f2f861831fd26425e2b00cd2bcdb2701f57b4283db3e0bf5');

  -- Preimagem: cada candidatura existe, está no ar, com o SQ e o cargo do plano.
  IF (SELECT count(*) FROM pf_fase_plano_20261027134837 p
       JOIN public.candidatos c ON c.id = p.candidato_id
      WHERE c.slug = p.slug AND c.sq_candidato_2026 IS NOT DISTINCT FROM p.sq_antes AND c.cargo_disputado = p.cargo
        AND c.publicavel IS TRUE AND c.status <> 'removido') <> 14 THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837: preimagem de candidatos divergiu';
  END IF;
  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261027134837 p ON p.candidato_id = f.candidato_id
       WHERE f.fase_eleitoral = 'segundo_turno' AND f.fase_turno = 1 AND f.atualizacao_encerrada_em IS NULL) <> 14 THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837: preimagem de segundo turno divergiu';
  END IF;

  -- Preimagem integral de cada linha (nula no 1º turno), para o recibo e o rollback.
  CREATE TEMP TABLE pf_fase_plano_20261027134837_antes ON COMMIT DROP AS
    SELECT f.candidato_id, to_jsonb(f) AS antes
    FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261027134837 p ON p.candidato_id = f.candidato_id;

  -- @write tabela=candidaturas_fase_2026 ref=fase-turno-2-20261027134837 campos=candidato_id,sq_candidato_2026,cargo_disputado,fase_eleitoral,fase_turno,atualizacao_encerrada_em,situacao_tse,fonte_url,fonte_sha256,migration_version,registrado_em
  INSERT INTO public.candidaturas_fase_2026 AS f
    (candidato_id, sq_candidato_2026, cargo_disputado, fase_eleitoral, fase_turno, atualizacao_encerrada_em,
     situacao_tse, fonte_url, fonte_sha256, migration_version, registrado_em)
  SELECT p.candidato_id, p.sq, p.cargo, p.fase_depois, p.turno,
         CASE WHEN p.encerra THEN encerrada END,
         p.situacao_tse, p.fonte_url, p.fonte_sha256, '20261027134837', now()
  FROM pf_fase_plano_20261027134837 p
  -- Predicado sempre verdadeiro: põe o ref do lote no statement, como o gate de escrita auditada exige.
  WHERE 'fase-turno-2-20261027134837' IS NOT NULL
  ON CONFLICT (candidato_id) DO UPDATE
    SET fase_eleitoral = EXCLUDED.fase_eleitoral,
        fase_turno = EXCLUDED.fase_turno,
        atualizacao_encerrada_em = EXCLUDED.atualizacao_encerrada_em,
        situacao_tse = EXCLUDED.situacao_tse,
        fonte_url = EXCLUDED.fonte_url,
        fonte_sha256 = EXCLUDED.fonte_sha256,
        migration_version = EXCLUDED.migration_version,
        registrado_em = EXCLUDED.registrado_em
    WHERE f.fase_eleitoral = 'segundo_turno' AND f.atualizacao_encerrada_em IS NULL;
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 14 THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837: escrita esperada=14 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20261027134837 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', 14,
         jsonb_build_object(
           'resumo', 'Resultado oficial do 2º turno de 2026 gravado para 14 candidatura(s): mudancas=14, pendentes=0, encerram=14, nao_eleito=7, eleito=7.',
           'plano_sha256', '47dd60f72855baeab799c8388034a47811c0afce9d2e5941da4d8e4e103ad6a2',
           'turno', 2,
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', p.slug,
             'candidato_id', p.candidato_id,
             'before', (SELECT a.antes FROM pf_fase_plano_20261027134837_antes a WHERE a.candidato_id = p.candidato_id),
             'after', to_jsonb(f)) ORDER BY p.slug)
         )::text,
         'https://resultados.tse.jus.br/oficial/ele2026/6260/dados/ac/ac-c0003-e006260-u.json',
         'migration:20261027134837', 'escrita'
  FROM pf_fase_plano_20261027134837 p
  JOIN public.candidaturas_fase_2026 f ON f.candidato_id = p.candidato_id;

  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261027134837 p ON p.candidato_id = f.candidato_id
       WHERE f.migration_version = '20261027134837' AND f.fase_eleitoral = p.fase_depois AND f.fase_turno = p.turno
         AND (f.atualizacao_encerrada_em IS NOT NULL) = p.encerra) <> 14 THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837: pós-condição falhou';
  END IF;
END
$apply$;

COMMIT;
