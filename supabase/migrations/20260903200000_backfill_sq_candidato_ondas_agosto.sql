-- Preenche `candidatos.sq_candidato_2026` das duas fichas publicaveis que estao
-- no ar sem ancora eleitoral: `well-macedo` (PA) e `rico-pinheiro` (DF).
--
-- Nao aplicar por `supabase db push` nem por automacao: producao so recebe esta
-- migration pelo workflow apply-backfill-sq-ondas-agosto-production.yml, que
-- exige dispatch manual, `main` e um SHA fechado.
--
-- POR QUE ISTO IMPORTA
--
-- O SQ_CANDIDATO e o degrau de maior prioridade do `tse-resolver`. Sem ele a
-- ingestao nao tem por onde ancorar a pessoa, e o degrau seguinte (CPF) tambem
-- esta fechado, porque `scripts/backfill-cpf-tse.ts` resolve o CPF PELO SQ na
-- rota 1 e a rota 2 (nome + nascimento) nao persiste sozinha, por decisao
-- registrada no proprio arquivo. O casamento por nome nunca e aceito
-- (`shouldSkipWeakMatch`). Resultado observado em 03/09/2026: as duas fichas
-- estao publicadas ha seis dias com zero tentativa registrada em `coleta_log`
-- para toda fonte, e com historico, patrimonio, financiamento e processos
-- vazios.
--
-- EVIDENCIA (fonte primaria, lida em 03/09/2026)
--
-- Pacote oficial `consulta_cand_2026` dos dados abertos do TSE
-- (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip),
-- arquivos `consulta_cand_2026_PA.csv` e `consulta_cand_2026_DF.csv`:
--
--   SQ 140002554108 | WELLINGTA JOSYANE SIQUEIRA MACEDO | urna WELL MACEDO
--                   | GOVERNADOR | PA | PSTU | nascimento 23/03/1980
--   SQ 70002553982  | ALDERICO DA SILVA PINHEIRO FILHO  | urna RICO PINHEIRO
--                   | GOVERNADOR | DF | PRTB | nascimento 16/02/1980
--
-- Os quatro campos (nome completo, nome de urna, cargo, UF) e a data de
-- nascimento batem com o que a ficha ja publica, o que fecha a identidade sem
-- depender de nome sozinho.
--
-- Corroboracao independente, dentro do proprio projeto:
--   1. `data/candidate-roster-active-20260829.json`, lido do DivulgaCandContas
--      em 29/08/2026, traz `canonical_registration_sq` igual para os dois slugs;
--   2. `chapas_2026` ja carrega `titular_sq_candidato` igual, com
--      `titular_candidato_id` apontando para estas mesmas linhas;
--   3. a `foto_url` publicada de cada ficha ja e
--      `.../divulga/rest/arquivo/img/20322002026/<SQ>/<UF>` com exatamente
--      estes SQ. O site ja renderiza a foto ancorada num SQ que a coluna diz
--      nao existir.
--
-- ESCOPO. So a coluna `sq_candidato_2026`, so onde ela e NULL, so nestes dois
-- ids. Nao mexe em CPF: o CPF sai depois, pelo caminho normal do
-- `backfill-cpf-tse.ts`, que passa a ter a rota 1 aberta. Nao mexe no seed
-- `data/candidatos.json`, que e arquivo de repo e entra por PR, nao por
-- migration.

BEGIN;

CREATE TEMP TABLE backfill_sq_ondas_agosto_snapshot ON COMMIT DROP AS
SELECT
  (SELECT count(*)::bigint FROM public.candidatos c
    WHERE c.id NOT IN ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid,
                       '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid)) AS other_candidates_count,
  (SELECT md5(coalesce(string_agg(row_to_json(c)::text, '' ORDER BY c.id), ''))
     FROM public.candidatos c
    WHERE c.id NOT IN ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid,
                       '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid)) AS other_candidates_digest;

-- Pre-imagem, capturada ANTES da escrita: e o que o rollback le para devolver a
-- coluna byte a byte, e o que prova, depois, que a migration mexeu em duas
-- linhas e nao em tres. Sem ela o rollback so poderia assumir NULL, que e
-- adivinhacao com cara de certeza.
CREATE TEMP TABLE backfill_sq_ondas_agosto_preimagem ON COMMIT DROP AS
SELECT c.id, c.slug, c.sq_candidato_2026 AS sq_anterior
  FROM public.candidatos c
 WHERE c.id IN ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid,
                '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid);

DO $precondition$
DECLARE
  alvo_count integer;
  colisao_count integer;
  chapa_count integer;
  ficha_existe boolean;
BEGIN
  -- Replay linear em banco vazio: as fichas destas duas ondas nao existem, e a
  -- correcao e no-op. Fora desse caso, todo guard abaixo e obrigatorio.
  SELECT EXISTS (
    SELECT 1 FROM public.candidatos
     WHERE slug IN ('well-macedo', 'rico-pinheiro')
  ) INTO ficha_existe;
  IF NOT ficha_existe THEN
    RAISE NOTICE 'backfill sq ondas agosto: fichas ausentes (replay); correcao ignorada';
    RETURN;
  END IF;

  -- As duas linhas existem, com o slug esperado, e a coluna ainda esta NULL.
  SELECT count(*) INTO alvo_count
    FROM public.candidatos
   WHERE (id, slug) IN (
           ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid, 'well-macedo'),
           ('4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid, 'rico-pinheiro'))
     AND sq_candidato_2026 IS NULL;
  IF alvo_count <> 2 THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: esperava 2 alvos com sq NULL, encontrei %', alvo_count;
  END IF;

  -- Nenhum dos dois SQ pode ja pertencer a outra ficha: SQ errado sequestra a
  -- ficha E bloqueia o CPF, porque tem prioridade maior no resolver.
  SELECT count(*) INTO colisao_count
    FROM public.candidatos
   WHERE sq_candidato_2026 IN ('140002554108', '70002553982');
  IF colisao_count <> 0 THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: SQ ja pertence a outra ficha (% linhas)', colisao_count;
  END IF;

  -- `chapas_2026` tem de concordar com o numero que estamos gravando. Se a
  -- quarentena de chapas discordar, a evidencia nao esta fechada e o certo e
  -- falhar aqui.
  SELECT count(*) INTO chapa_count
    FROM public.chapas_2026 ch
   WHERE (ch.titular_candidato_id, ch.titular_sq_candidato) IN (
           ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid, '140002554108'),
           ('4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid, '70002553982'));
  IF chapa_count < 2 THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: chapas_2026 nao confirma o SQ (% linhas)', chapa_count;
  END IF;
END
$precondition$;

-- @write tabela=candidatos slug=well-macedo campos=sq_candidato_2026
UPDATE public.candidatos
   SET sq_candidato_2026 = '140002554108'
 WHERE id = 'fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid
   AND slug = 'well-macedo'
   AND sq_candidato_2026 IS NULL;

-- @write tabela=candidatos slug=rico-pinheiro campos=sq_candidato_2026
UPDATE public.candidatos
   SET sq_candidato_2026 = '70002553982'
 WHERE id = '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid
   AND slug = 'rico-pinheiro'
   AND sq_candidato_2026 IS NULL;

-- Recibo de pre-imagem. `HAVING count(*) > 0` mantem o replay em banco vazio
-- honesto: sem alvo nao ha recibo, em vez de um recibo de volume zero que o
-- CHECK `coleta_log_volume_coerente` recusaria de qualquer forma.
-- @write tabela=coleta_log ref=migration:20260903200000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'backfill-sq-ondas-agosto',
       'global',
       'candidatos.sq_candidato_2026',
       'encontrado',
       count(*)::integer,
       jsonb_object_agg(pre.id::text, to_jsonb(pre.sq_anterior))::text,
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2026',
       'migration:20260903200000',
       'escrita'
  FROM backfill_sq_ondas_agosto_preimagem pre
HAVING count(*) > 0;

DO $posdicao$
DECLARE
  gravados integer;
  outros_count bigint;
  outros_digest text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug IN ('well-macedo', 'rico-pinheiro')) THEN
    RETURN;  -- replay em banco vazio: nada a conferir
  END IF;

  SELECT count(*) INTO gravados
    FROM public.candidatos
   WHERE (slug, sq_candidato_2026) IN (
           ('well-macedo', '140002554108'),
           ('rico-pinheiro', '70002553982'));
  IF gravados <> 2 THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: esperava 2 linhas gravadas, encontrei %', gravados;
  END IF;

  -- Nada fora dos dois alvos pode ter mudado.
  SELECT s.other_candidates_count, s.other_candidates_digest
    INTO outros_count, outros_digest
    FROM backfill_sq_ondas_agosto_snapshot s;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260903200000') <> 1 THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: recibo de pre-imagem ausente ou duplicado';
  END IF;

  IF outros_count <> (SELECT count(*)::bigint FROM public.candidatos c
                       WHERE c.id NOT IN ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid,
                                          '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid))
     OR outros_digest <> (SELECT md5(coalesce(string_agg(row_to_json(c)::text, '' ORDER BY c.id), ''))
                            FROM public.candidatos c
                           WHERE c.id NOT IN ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid,
                                              '4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid)) THEN
    RAISE EXCEPTION 'backfill sq ondas agosto: linhas fora do escopo foram alteradas';
  END IF;
END
$posdicao$;

COMMIT;
