-- MIGRATION RETIDA: nao aplicar sem decisao registrada.
--
-- Pertence ao gate de completude. Escreve em producao e NAO esta no ledger.
-- O timestamp e anterior ao de migrations ja aplicadas (20260807054000 a
-- 20260808032540), entao um `supabase db push` a aplica FORA DE ORDEM em
-- relacao ao estado real do banco. Antes de liberar: registrar a decisao em
-- Settings/STATUS.md, remover este aviso e atualizar
-- tests/migrations-retidas-gate.test.ts no mesmo commit.
--
BEGIN;

-- A1: identidade 2026 confirmada por SQ_CANDIDATO 170002536575 no pacote TSE.
-- Ledger A1: output/pf-completeness-20260807T022551Z/research-a1/proposals.jsonl.
-- Fill-only: nenhum valor já preenchido é sobrescrito.
-- @write tabela=candidatos slug=guilherme-fonseca campos=data_nascimento,formacao,profissao_declarada,fonte_dados,ultima_atualizacao,verificacao_campos
UPDATE public.candidatos
SET
  data_nascimento = COALESCE(data_nascimento, DATE '1957-08-26'),
  formacao = COALESCE(NULLIF(btrim(formacao), ''), 'SUPERIOR INCOMPLETO'),
  profissao_declarada = CASE
    WHEN COALESCE(btrim(profissao_declarada), '') = '' OR profissao_declarada ~ '^Q[0-9]+$'
      THEN 'TÉCNICO DE ELETRICIDADE, ELETRÔNICA E TELECOMUNICAÇÕES'
    ELSE profissao_declarada
  END,
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      COALESCE(fonte_dados, ARRAY[]::text[]) ||
      ARRAY['TSE consulta_cand 2026 SQ 170002536575']
    ) AS source
  ),
  ultima_atualizacao = now(),
  verificacao_campos = COALESCE(verificacao_campos, '{}'::jsonb) ||
    jsonb_build_object(
      'candidate_registration', '2026-08-06',
      'candidate_complement', '2026-08-06'
    )
WHERE slug = 'guilherme-fonseca';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'guilherme-fonseca'
      AND data_nascimento = DATE '1957-08-26'
      AND 'TSE consulta_cand 2026 SQ 170002536575' = ANY(fonte_dados)
  ) THEN
    RAISE EXCEPTION 'A1 Guilherme Fonseca: identidade nao materializada';
  END IF;
END
$guard$;

COMMIT;
