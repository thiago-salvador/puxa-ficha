-- Resultado oficial do TSE, 1º turno de 2026: correção da fase eleitoral de 2
-- candidatura(s) ao governo do RJ depois da retotalização.
--
-- O TSE confirmou o indeferimento do registro de Garotinho e anulou os 274.411
-- votos dele. O TRE-RJ retotalizou a eleição em 10/10/2026 e proclamou o
-- resultado em 15/10/2026: Douglas Ruas eleito no 1º turno com 50,88% dos
-- válidos. A migration 20261005180206 gravou Ruas e Paes como segundo_turno a
-- partir do arquivo de 04/10; esta migration corrige as duas linhas.
--
-- Plano (2 mudanças, turno 1) sha256 fc1899924e6bf8d8026a4a89aab7b7d16b7085602717bb8bcc6e664608a1b2f1.
-- Contagem: mudancas=2, encerram=2, eleito=1, nao_eleito=1.
-- Fonte (divulgação oficial, totalização final, todas as seções):
--   https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rj/rj-c0003-e006259-u.json
--     sha256 85822afa330c4b85eaf3f517bced5c2f0f32395da564a9baf10b2c582255924e (gerado pelo TSE em 10/10/2026 15:09:50)
-- Retotalização: https://www.tre-rj.jus.br/comunicacao/noticias/2026/Outubro/retotalizacao-de-votos-aponta-douglas-ruas-como-vencedor-no-primeiro-turno-para-o-governo-do-rj
-- Proclamação: https://www.tre-rj.jus.br/comunicacao/noticias/2026/Outubro/tre-rj-proclama-douglas-ruas-pl-governador-eleito
--
-- Escrita: candidaturas_fase_2026 (atualização com CAS da fase segundo_turno
-- gravada pela 20261005180206) e recibo em coleta_log com before/after de cada
-- linha. As duas candidaturas saem da coorte de atualização; a ficha continua
-- no ar e nenhum dado é apagado.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-fase-eleitoral-production (conjunto turno-1).
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
    RAISE NOTICE 'fase-turno-1-rj-20261015221500: coorte ausente; resultado ignorado (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'fase-turno-1-rj-20261015221500: resultado ignorado apenas no replay descartável';
    RETURN;
  END IF;

  CREATE TEMP TABLE pf_fase_plano_20261015221500 (
    candidato_id uuid PRIMARY KEY, slug text NOT NULL, sq text, sq_antes text, cargo text NOT NULL,
    fase_antes text NOT NULL, fase_depois text NOT NULL, turno smallint NOT NULL, encerra boolean NOT NULL,
    situacao_tse text, fonte_url text, fonte_sha256 text
  ) ON COMMIT DROP;
  INSERT INTO pf_fase_plano_20261015221500 VALUES
    ('097dc8d0-d05d-42cb-91a0-0582dd561f76'::uuid, 'douglas-ruas', '190002542887', '190002542887', 'Governador', 'segundo_turno', 'eleito', 1, true, 'Eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rj/rj-c0003-e006259-u.json', '85822afa330c4b85eaf3f517bced5c2f0f32395da564a9baf10b2c582255924e'),
    ('242af65c-dae1-447c-b4b0-c26095f7384d'::uuid, 'eduardo-paes', '190002543380', '190002543380', 'Governador', 'segundo_turno', 'nao_eleito', 1, true, 'Não eleito (Válido)', 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rj/rj-c0003-e006259-u.json', '85822afa330c4b85eaf3f517bced5c2f0f32395da564a9baf10b2c582255924e');

  -- Preimagem: cada candidatura existe, está no ar, com o SQ e o cargo do plano.
  IF (SELECT count(*) FROM pf_fase_plano_20261015221500 p
       JOIN public.candidatos c ON c.id = p.candidato_id
      WHERE c.slug = p.slug AND c.sq_candidato_2026 IS NOT DISTINCT FROM p.sq_antes AND c.cargo_disputado = p.cargo
        AND c.publicavel IS TRUE AND c.status <> 'removido') <> 2 THEN
    RAISE EXCEPTION 'fase-turno-1-rj-20261015221500: preimagem de candidatos divergiu';
  END IF;
  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261015221500 p ON p.candidato_id = f.candidato_id
       WHERE f.fase_eleitoral = 'segundo_turno' AND f.fase_turno = 1 AND f.atualizacao_encerrada_em IS NULL
         AND f.migration_version = '20261005180206') <> 2 THEN
    RAISE EXCEPTION 'fase-turno-1-rj-20261015221500: preimagem de segundo turno divergiu';
  END IF;

  -- Preimagem integral de cada linha, para o recibo e o rollback.
  CREATE TEMP TABLE pf_fase_plano_20261015221500_antes ON COMMIT DROP AS
    SELECT f.candidato_id, to_jsonb(f) AS antes
    FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261015221500 p ON p.candidato_id = f.candidato_id;

  -- @write tabela=candidaturas_fase_2026 ref=fase-turno-1-rj-20261015221500 campos=candidato_id,sq_candidato_2026,cargo_disputado,fase_eleitoral,fase_turno,atualizacao_encerrada_em,situacao_tse,fonte_url,fonte_sha256,migration_version,registrado_em
  INSERT INTO public.candidaturas_fase_2026 AS f
    (candidato_id, sq_candidato_2026, cargo_disputado, fase_eleitoral, fase_turno, atualizacao_encerrada_em,
     situacao_tse, fonte_url, fonte_sha256, migration_version, registrado_em)
  SELECT p.candidato_id, p.sq, p.cargo, p.fase_depois, p.turno,
         CASE WHEN p.encerra THEN encerrada END,
         p.situacao_tse, p.fonte_url, p.fonte_sha256, '20261015221500', now()
  FROM pf_fase_plano_20261015221500 p
  -- Predicado sempre verdadeiro: põe o ref do lote no statement, como o gate de escrita auditada exige.
  WHERE 'fase-turno-1-rj-20261015221500' IS NOT NULL
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
  IF quantidade <> 2 THEN
    RAISE EXCEPTION 'fase-turno-1-rj-20261015221500: escrita esperada=2 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20261015221500 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', 2,
         jsonb_build_object(
           'resumo', 'Retotalização do governo do RJ no 1º turno de 2026 gravada para 2 candidatura(s): mudancas=2, encerram=2, eleito=1, nao_eleito=1.',
           'plano_sha256', 'fc1899924e6bf8d8026a4a89aab7b7d16b7085602717bb8bcc6e664608a1b2f1',
           'turno', 1,
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', p.slug,
             'candidato_id', p.candidato_id,
             'before', (SELECT a.antes FROM pf_fase_plano_20261015221500_antes a WHERE a.candidato_id = p.candidato_id),
             'after', to_jsonb(f)) ORDER BY p.slug)
         )::text,
         'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rj/rj-c0003-e006259-u.json',
         'migration:20261015221500', 'escrita'
  FROM pf_fase_plano_20261015221500 p
  JOIN public.candidaturas_fase_2026 f ON f.candidato_id = p.candidato_id;

  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN pf_fase_plano_20261015221500 p ON p.candidato_id = f.candidato_id
       WHERE f.migration_version = '20261015221500' AND f.fase_eleitoral = p.fase_depois AND f.fase_turno = p.turno
         AND (f.atualizacao_encerrada_em IS NOT NULL) = p.encerra) <> 2 THEN
    RAISE EXCEPTION 'fase-turno-1-rj-20261015221500: pós-condição falhou';
  END IF;
END
$apply$;

COMMIT;
