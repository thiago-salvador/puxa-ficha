-- Alarga o vocabulario de `candidatos.situacao_candidatura` para o oitavo
-- estado: julgamento pendente sem deferimento nem indeferimento.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-vocabulario-pendente-julgamento-production.yml,
-- que exige dispatch manual, `main` e um SHA fechado. E nao aplicar sozinha:
-- `src/lib/situacao-candidatura.ts` e o lado TypeScript do mesmo dominio, e
-- `tests/situacao-candidatura-dominio.test.ts` compara os dois por parse.
-- Mudou aqui, muda la, na MESMA PR.
--
-- =====================================================================
-- O FATO NOVO, MEDIDO
-- =====================================================================
--
-- Issue #340. `consulta_cand_complementar_2026_BRASIL.csv` (censo nacional,
-- DT_GERACAO 16/09/2026 19:31:04, 20.984 linhas) traz `DS_SITUACAO_JULGAMENTO`
-- = "PENDENTE DE JULGAMENTO", `CD_SITUACAO_JULGAMENTO` = 17, em 91 linhas
-- nacionais e 11 delas em cargos que este catalogo cobre (Presidente,
-- Vice-Presidente, Governador, Vice-Governador, Senador). Confirmado tambem no
-- `descricaoSituacao` ao vivo do DivulgaCandContas para os mesmos SQ.
--
-- Esse codigo e OUTRO fato juridico que "aguardando julgamento" (codigo 8):
-- os dois coexistem no mesmo censo do mesmo dia, 91 ocorrencias de um e 32 do
-- outro. Nao ha base para reusar o valor existente; o CHECK de
-- 20260903210000 nao previu este codigo porque ele nao aparecia no censo de
-- 03/09/2026 (0 ocorrencias medidas naquele dia).
--
-- Nota de correcao: um levantamento preliminar desta issue citou "codigo TSE
-- 12", lendo o campo `situacaoVice` (espaco de codigo da situacao do VICE
-- dentro do detalhe do titular no DivulgaCandContas ao vivo), nao
-- `CD_SITUACAO_JULGAMENTO` de `consulta_cand_complementar` (o campo que
-- `scripts/lib/tse-situacao-julgamento.ts` realmente le). Recontado no censo
-- nacional de 16/09/2026: zero linhas com codigo 12; o codigo real e 17.
--
-- =====================================================================
-- O QUE ESTA MIGRATION NAO FAZ
-- =====================================================================
--
-- Nao grava situacao nenhuma: e alargamento de dominio, schema puro, sem
-- DML de conteudo. A escrita das duas fichas hoje bloqueadas (ruth-reis,
-- leonardo-avalanche) e uma migration de dado separada, que so pode rodar
-- depois desta.
BEGIN;

-- Guard de replay linear: mesma razao da 20260903210000. Alargar um dominio
-- que nunca foi instalado (banco sintetico onde 20260903100100 e 20260903210000
-- tambem falham por guard) nao e o caso que esta migration precisa cobrir.
DO $alargar$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
  ) THEN
    RAISE NOTICE 'vocabulario pendente de julgamento: dominio ausente (replay); alargamento ignorado';
    RETURN;
  END IF;

  ALTER TABLE public.candidatos
    DROP CONSTRAINT IF EXISTS candidatos_situacao_candidatura_dominio;

  ALTER TABLE public.candidatos
    ADD CONSTRAINT candidatos_situacao_candidatura_dominio
    CHECK (situacao_candidatura IN (
      'aguardando julgamento',
      'candidatura declarada',
      'incerto',
      'deferido',
      'deferido com recurso',
      'indeferido',
      'indeferido com recurso',
      'pendente de julgamento'
    ));

  EXECUTE format(
    'COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS %L',
    'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. "pendente de julgamento" entrou em 16/09/2026 (issue #340), DS_SITUACAO_JULGAMENTO codigo 17 de consulta_cand_complementar, distinto de "aguardando julgamento" (codigo 8) e de proposito fora de SITUACAO_JULGAMENTO_PUBLICADO: nao e deferimento nem indeferimento.');
END
$alargar$;

DO $conferencia$
DECLARE
  tem_constraint boolean;
  aceita_pendente boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;

  IF NOT tem_constraint THEN
    RAISE NOTICE 'vocabulario pendente de julgamento: sem dominio instalado, nada a conferir';
    RETURN;
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%pendente de julgamento%'
    INTO aceita_pendente
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio';
  IF NOT aceita_pendente THEN
    RAISE EXCEPTION 'vocabulario pendente de julgamento: constraint existe mas nao tem o oitavo estado';
  END IF;
END
$conferencia$;

COMMIT;
