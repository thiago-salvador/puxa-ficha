-- Fecha o dominio de `candidatos.situacao_candidatura` com um CHECK.
--
-- Par 2 de 2, e schema puro: nenhum statement de escrita em tabela de conteudo.
-- A normalizacao dos dados esta em
-- 20260903100000_vocabulario_situacao_candidatura.sql, que roda ANTES e e onde
-- mora a evidencia completa (censo das onze grafias, o `#NE` do pacote do TSE e
-- o destino de cada valor).
--
-- A separacao em dois arquivos nao e estilo: `tests/migrations-classificacao.test.ts`
-- reprova migration que mistura DDL persistente com dado de ficha, porque a
-- classe existe para responder "posso replayar isto num banco vazio", e quem
-- quebra e o dado. Junto, este par ficava marcado como mista.
--
-- Sem `NOT VALID`, pela mesma razao registrada em 20260805120633 para
-- `candidatos_status_dominio`: a intencao e provar NA APLICACAO que nao sobrou
-- linha fora do dominio. Se a migration anterior nao tiver limpado tudo, este
-- ALTER TABLE falha, e falhar aqui e o comportamento desejado.
--
-- NULL passa no CHECK por construcao, porque `NULL IN (...)` e NULL e nao falso.
-- Isso e deliberado: NULL e o unico jeito honesto de dizer "nao ha informacao",
-- e 44 linhas nao publicaveis dependem disso. O que NAO pode existir e ficha
-- publicavel com NULL, e essa regra vive em `src/lib/published-consistency.ts`,
-- que e onde ela pode falar em voz alta sem bloquear a escrita.
BEGIN;

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_situacao_candidatura_dominio
  CHECK (situacao_candidatura IN ('aguardando julgamento', 'candidatura declarada', 'incerto'));

COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS
  'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. Acrescentar deferido/indeferido so quando o TSE publicar julgamento de 2026.';

-- ---------------------------------------------------------------------------
-- Conferencia. O ALTER acima ja teria falhado com uma linha fora do dominio;
-- o que este bloco acrescenta e a prova de que a constraint EXISTE e esta
-- validada. Sem ela, um ALTER que nao tivesse tomado efeito deixaria a
-- migration verde sem gate nenhum, que e o modo de falha silencioso.
DO $$
DECLARE
  tem_constraint boolean;
  fora integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'vocabulario_situacao_check: constraint ausente ou NOT VALID';
  END IF;

  SELECT COUNT(*) INTO fora FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN ('aguardando julgamento', 'candidatura declarada', 'incerto');
  IF fora <> 0 THEN
    RAISE EXCEPTION 'vocabulario_situacao_check: % linha(s) fora do dominio com a constraint ativa', fora;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select conname, pg_get_constraintdef(oid), convalidated
--     from pg_constraint
--    where conrelid = 'public.candidatos'::regclass and contype = 'c';
--
-- Prova de que o CHECK morde (deve falhar com SQLSTATE 23514):
--
--   begin;
--     update public.candidatos set situacao_candidatura = 'deferido'
--      where slug = 'ciro-gomes-gov-ce';
--   rollback;
