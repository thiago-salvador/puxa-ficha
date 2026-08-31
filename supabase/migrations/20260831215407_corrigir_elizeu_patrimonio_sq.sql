-- Corrige a ancora eleitoral e o patrimonio 2026 de Elizeu Aguiar.
-- Fonte primaria: pacotes consulta_cand_2026 e bem_candidato_2026 gerados pelo
-- TSE em 31/08/2026. O SQ antigo saiu do pacote; o SQ 180002549920 e a unica
-- candidatura atual de Elizeu Aguiar no PI e traz tres bens, total R$ 1.592.808.
-- NAO aplicar em producao sem autorizacao nomeada do Thiago.

BEGIN;

CREATE TEMP TABLE elizeu_patrimonio_sq_snapshot ON COMMIT DROP AS
SELECT
  (SELECT count(*)::bigint FROM public.candidatos c
   WHERE c.id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid) AS other_candidates_count,
  (SELECT md5(coalesce(string_agg(row_to_json(c)::text, '' ORDER BY c.id), ''))
   FROM public.candidatos c
   WHERE c.id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid) AS other_candidates_digest,
  (SELECT count(*)::bigint FROM public.patrimonio p
   WHERE NOT (p.candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid AND p.ano_eleicao = 2026)) AS other_patrimonio_count,
  (SELECT md5(coalesce(string_agg(row_to_json(p)::text, '' ORDER BY p.candidato_id, p.ano_eleicao), ''))
   FROM public.patrimonio p
   WHERE NOT (p.candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid AND p.ano_eleicao = 2026)) AS other_patrimonio_digest,
  (SELECT count(*)::bigint FROM public.patrimonio_ausencia_oficial a
   WHERE a.id <> '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid) AS other_absences_count,
  (SELECT md5(coalesce(string_agg(row_to_json(a)::text, '' ORDER BY a.id), ''))
   FROM public.patrimonio_ausencia_oficial a
   WHERE a.id <> '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid) AS other_absences_digest;

DO $precondition$
DECLARE
  candidate_identity_count integer;
  candidate_count integer;
  chapa_count integer;
  patrimonio_count integer;
  dr_luisinho_absence_count integer;
  forward_receipt_count integer;
BEGIN
  SELECT count(*) INTO candidate_identity_count
  FROM public.candidatos
  WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND slug = 'elizeu-aguiar';

  -- O replay linear de estrutura não carrega a ficha. Nesse único caso a
  -- curadoria é um no-op. Se a ficha existe, todos os guards exatos abaixo
  -- continuam obrigatórios e qualquer divergência aborta a transação.
  IF candidate_identity_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO candidate_count
  FROM public.candidatos
  WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND slug = 'elizeu-aguiar'
    AND sq_candidato_2026 IS NULL;

  SELECT count(*) INTO chapa_count
  FROM public.chapas_2026
  WHERE titular_candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND chave = '2026:PI:elizeu-morais-de-aguiar'
    AND identidade_status = 'confirmada'
    AND vinculo_titular_status = 'confirmado'
    AND titular_sq_candidato = '180002549920';

  SELECT count(*) INTO patrimonio_count
  FROM public.patrimonio
  WHERE candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND ano_eleicao = 2026
    AND valor_total = 872808.00
    AND bens = '[{"tipo":"Casa","descricao":"RUA TORQUATO NETO, 2400 - SÃO CRISTÓVÃO","valor":750000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808},{"tipo":"Terreno","descricao":"TERRENO RUA ARMANDO CAJUBÁ, BAIRRO SABIAZAL, PARNAÍBA (50 X 80)","valor":40000}]'::jsonb
    AND fonte LIKE '%SQ 180002533958%';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid
    AND candidato_id = 'c9c117e4-ea81-433d-b8c0-a01c8d831bae'::uuid
    AND ano_eleicao = 2026
    AND sq_candidato = '10002533539'
    AND execucao = 'A2B-ausencias-oficiais-20260807';

  SELECT count(*) INTO forward_receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407';

  IF candidate_count <> 1 OR chapa_count <> 1 OR patrimonio_count <> 1
     OR dr_luisinho_absence_count <> 1 OR forward_receipt_count <> 0 THEN
    RAISE EXCEPTION
      'patrimonio 2026: precondicao divergiu (candidato=%, chapa=%, patrimonio=%, ausencia_dr_luisinho=%, receipt=%)',
      candidate_count, chapa_count, patrimonio_count, dr_luisinho_absence_count, forward_receipt_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE sq_candidato_2026 = '180002549920'
      AND id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
  ) THEN
    RAISE EXCEPTION 'elizeu patrimonio sq: novo SQ ja pertence a outra ficha';
  END IF;
END
$precondition$;

-- @write tabela=candidatos slug=elizeu-aguiar campos=sq_candidato_2026
UPDATE public.candidatos
SET sq_candidato_2026 = '180002549920'
WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
  AND slug = 'elizeu-aguiar'
  AND sq_candidato_2026 IS NULL;

-- @write tabela=patrimonio slug=elizeu-aguiar ano=2026 campos=valor_total,bens,fonte
UPDATE public.patrimonio AS p
SET valor_total = 1592808.00,
    bens = '[{"tipo":"Terreno","descricao":"UM TERRENO","valor":40000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":802808},{"tipo":"Casa","descricao":"UMA CASA RESIDENCIAL","valor":750000}]'::jsonb,
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 180002549920 (pacote SHA-256 21a7f4bf799f7784e63c13a152f39bcc554239fa24c11a043cdaf572a944f65c; CSV gerado 31/08/2026 12:31:08; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE p.candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
  AND p.ano_eleicao = 2026
  AND p.valor_total = 872808.00
  AND p.fonte LIKE '%SQ 180002533958%'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = p.candidato_id AND c.slug = 'elizeu-aguiar'
  );

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 campos=remocao_de_ausencia_sem_evidencia
DELETE FROM public.patrimonio_ausencia_oficial AS a
WHERE a.id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid
  AND a.candidato_id = 'c9c117e4-ea81-433d-b8c0-a01c8d831bae'::uuid
  AND a.ano_eleicao = 2026
  AND a.sq_candidato = '10002533539'
  AND a.execucao = 'A2B-ausencias-oficiais-20260807'
  AND EXISTS (
    SELECT 1 FROM public.candidatos c
    WHERE c.id = a.candidato_id AND c.slug = 'dr-luisinho'
  );

-- @write tabela=coleta_log ref=migration:20260831215407 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT
  'tse-patrimonio', 'candidato', 'elizeu-aguiar',
  '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid,
  'encontrado', 3,
  'Migration 20260831215407: Elizeu SQ 2026 atualizado de NULL para 180002549920 e patrimonio corrigido de R$ 872.808 para R$ 1.592.808; ausencia sem evidencia de Dr. Luisinho removida',
  'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
  'migration:20260831215407'
WHERE NOT EXISTS (
  SELECT 1 FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407'
)
AND EXISTS (
  SELECT 1 FROM public.candidatos
  WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND slug = 'elizeu-aguiar'
);

DO $postcondition$
DECLARE
  target_count integer;
  receipt_count integer;
  other_candidates_count bigint;
  other_candidates_digest text;
  other_patrimonio_count bigint;
  other_patrimonio_digest text;
  other_absences_count bigint;
  other_absences_digest text;
  before_candidates_count bigint;
  before_candidates_digest text;
  before_patrimonio_count bigint;
  before_patrimonio_digest text;
  before_absences_count bigint;
  before_absences_digest text;
  dr_luisinho_absence_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
      AND slug = 'elizeu-aguiar'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO target_count
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND c.slug = 'elizeu-aguiar'
    AND c.sq_candidato_2026 = '180002549920'
    AND p.valor_total = 1592808.00
    AND jsonb_array_length(p.bens) = 3
    AND p.bens @> '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":802808}]'::jsonb
    AND p.fonte LIKE '%SQ 180002549920%';

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid;

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(c)::text, '' ORDER BY c.id), ''))
    INTO other_candidates_count, other_candidates_digest
  FROM public.candidatos c
  WHERE c.id <> '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid;

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(p)::text, '' ORDER BY p.candidato_id, p.ano_eleicao), ''))
    INTO other_patrimonio_count, other_patrimonio_digest
  FROM public.patrimonio p
  WHERE NOT (p.candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid AND p.ano_eleicao = 2026);

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(a)::text, '' ORDER BY a.id), ''))
    INTO other_absences_count, other_absences_digest
  FROM public.patrimonio_ausencia_oficial a
  WHERE a.id <> '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid;

  SELECT s.other_candidates_count, s.other_candidates_digest,
         s.other_patrimonio_count, s.other_patrimonio_digest,
         s.other_absences_count, s.other_absences_digest
    INTO before_candidates_count, before_candidates_digest,
         before_patrimonio_count, before_patrimonio_digest,
         before_absences_count, before_absences_digest
  FROM elizeu_patrimonio_sq_snapshot s;

  IF target_count <> 1 OR receipt_count <> 1 OR dr_luisinho_absence_count <> 0
     OR other_candidates_count <> before_candidates_count
     OR other_candidates_digest IS DISTINCT FROM before_candidates_digest
     OR other_patrimonio_count <> before_patrimonio_count
     OR other_patrimonio_digest IS DISTINCT FROM before_patrimonio_digest
     OR other_absences_count <> before_absences_count
     OR other_absences_digest IS DISTINCT FROM before_absences_digest THEN
    RAISE EXCEPTION 'elizeu patrimonio sq: postcondicao falhou';
  END IF;
END
$postcondition$;

COMMIT;
