-- Abre o vocabulario de `candidatos.situacao_candidatura` para os estados de
-- julgamento, agora que o TSE comecou a publicar julgamento de 2026.
--
-- Nao aplicar por `supabase db push` nem por automacao: producao so recebe esta
-- migration pelo workflow apply-vocabulario-situacao-julgamento-production.yml,
-- que exige dispatch manual, `main` e um SHA fechado. E nao aplicar sozinha: `src/lib/situacao-candidatura.ts` e o lado TypeScript do mesmo
-- dominio, e `tests/situacao-candidatura-dominio.test.ts` compara os dois por
-- parse. Mudou aqui, muda la, na MESMA PR. Esta migration existe para que a
-- decisao seja tomada com a evidencia em cima da mesa, nao para ser aplicada de
-- surpresa.
--
-- =====================================================================
-- A PREMISSA QUE CAIU
-- =====================================================================
--
-- Em 03/09/2026, seis horas antes desta leitura, a migration
-- 20260903100000_vocabulario_situacao_candidatura.sql fechou o dominio em tres
-- valores com este argumento, textual:
--
--   "O pacote consulta_cand do TSE para 2026 [...] traz 20.456 candidaturas em
--    28 arquivos por unidade da federacao, e a coluna de situacao da
--    candidatura vale `#NE` em 20.456 de 20.456 linhas. Zero excecoes. [...]
--    para o pleito de 2026 existe UM fato oficial, e nao tres."
--
-- A medicao estava certa e continua certa: a copia local de `consulta_cand` em
-- `.tse-audit-cache/2026/`, lida hoje, ainda traz `#NE` em todas as linhas. O
-- que faltou foi o ARQUIVO. A situacao de julgamento nao vive em
-- `consulta_cand`: vive em `consulta_cand_complementar`, outro pacote dos
-- mesmos dados abertos, na coluna `DS_SITUACAO_JULGAMENTO`. O projeto ja baixa
-- esse pacote em `scripts/audit/gerar-identidade-etapa2.ts` e o usa em
-- `scripts/lib/verificacao-campos-ledger-b2.ts` para profissao e escolaridade;
-- ninguem leu a coluna de julgamento dele.
--
-- Leitura de `consulta_cand_complementar_2026.zip` em 03/09/2026
-- (Last-Modified Thu, 03 Sep 2026 22:35:11 GMT, DT_GERACAO 03/09/2026),
-- cruzada por SQ_CANDIDATO com as 206 fichas publicaveis que tem SQ:
--
--   DEFERIDO                                       (cod 2)    134
--   AGUARDANDO JULGAMENTO                          (cod 8)     66
--   INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO    (cod 4)      3
--   DEFERIDO EM PRAZO RECURSAL OU COM RECURSO      (cod 16)     2
--   INDEFERIDO                                     (cod 14)     1
--
-- Segunda fonte oficial, independente, para a mesma pergunta: DivulgaCandContas,
-- endpoint de listagem por UF, 28 de 28 unidades baixadas no mesmo dia. Ele da
-- 135 / 65 / 3 / 2 / 1. As duas fontes concordam em 205 das 206 fichas; a unica
-- divergencia e `gilberto-vasconcelos`, e ela e compativel com a defasagem de
-- horas entre o pacote gerado e a API ao vivo.
--
-- Ou seja: 140 das 206 fichas pelo pacote de dados abertos, e 141 pelo
-- DivulgaCandContas, publicam hoje "aguardando julgamento" para uma
-- candidatura que a fonte oficial ja julgou, e 4 delas tiveram o registro
-- INDEFERIDO. Conferencia individual do caso mais grave, no endpoint de
-- candidato:
--
--   SQ 270002546368, LUIZ CARLOS FERREIRA DA SILVA, urna SUBTENENTE LUIZ CARLOS,
--   Governador/TO: descricaoSituacao "Indeferido",
--   dataUltimaAtualizacao "2026-09-03 18:55".
--
-- A friccao que o dominio fechado criou funcionou exatamente como projetada:
-- `scripts/lib/ingest-tse-situacao.ts` recusa persistir qualquer codigo fora de
-- `#NE` e registra `situacao-fora-do-vocabulario:<CODIGO>`, entao nenhum valor
-- inventado entrou no banco. O efeito colateral e que o campo congelou numa
-- afirmacao que envelheceu.
--
-- =====================================================================
-- OS VALORES QUE ENTRAM, E POR QUE ESTES
-- =====================================================================
--
-- Cada valor espelha uma `descricaoSituacao` que o DivulgaCandContas realmente
-- emite hoje para esta coorte. Nenhum estado e inventado, e nenhum e agrupado
-- com outro: "deferido" e "deferido com recurso" sao fatos juridicos distintos,
-- e "indeferido" e "indeferido em prazo recursal ou com recurso" tambem.
-- Colapsar os pares seria a mesma distincao inventada que a migration anterior
-- evitou, so que no sentido oposto.
--
--   'deferido'
--     Registro deferido. descricaoSituacao "Deferido".
--   'deferido com recurso'
--     Deferido, com recurso pendente. descricaoSituacao "Deferido com recurso".
--   'indeferido'
--     Registro indeferido. descricaoSituacao "Indeferido". O candidato pode
--     seguir com `descricaoTotalizacao` "Concorrendo": indeferimento nao e
--     sinonimo de fora da urna, e a ficha precisa poder dizer as duas coisas.
--   'indeferido com recurso'
--     descricaoSituacao "Indeferido em prazo recursal ou com recurso".
--
-- Continuam de fora, e cada ausencia segue sendo uma decisao: 'cassado',
-- 'renuncia', 'falecido' e afins entram quando o TSE emitir o codigo para esta
-- coorte, com a mesma friccao de PR deliberada.
--
-- =====================================================================
-- O QUE ESTA MIGRATION NAO FAZ
-- =====================================================================
--
-- Ela NAO grava situacao nenhuma. Nao ha aqui um UPDATE que escreva "deferido"
-- em 135 fichas, e isso e deliberado: a situacao de cada candidatura e dado de
-- fonte, e quem escreve dado de fonte e o ingest, com identidade fechada por
-- SQ e rastro em `coleta_log`. Escrever 140 linhas a mao a partir de uma
-- planilha de auditoria repoe exatamente o defeito que o vocabulario fechado
-- veio corrigir.
--
-- O trabalho de aplicacao, na ordem:
--   1. esta migration mais `src/lib/situacao-candidatura.ts`, na mesma PR;
--   2. `scripts/lib/ingest-tse-situacao.ts` passa a ler `CD_SITUACAO_JULGAMENTO`
--      de `consulta_cand_complementar_2026` alem do `consulta_cand` (que so
--      carrega `#NE`), mantendo a regra de so persistir com
--      `match_method === "sq-preloaded"`. Nao ha dependencia nova de API: e um
--      segundo arquivo de um pacote que o projeto ja baixa;
--   3. rodar o ingest e conferir o resultado contra este mesmo levantamento.
--
-- Sem o passo 2 esta migration nao muda nada no ar: o ingest continua sem ver
-- codigo diferente de `#NE` no arquivo que ele le.

BEGIN;

-- Esta migration ALARGA um dominio que ja existe. Se a constraint nao estiver
-- instalada, nao ha dominio para alargar, e recria-la aqui seria a primeira vez
-- que ela e cobrada. Num replay linear em banco vazio e exatamente esse o caso:
-- 20260903100000 (a limpeza dos dados) e 20260903100100 (o CHECK original)
-- estao entre as falhas historicas de replay, entao as linhas chegam aqui com
-- as onze grafias antigas e um ADD CONSTRAINT sem guard reprovaria por dado que
-- esta migration nao escreveu nem deveria limpar. O guard mantem a intencao:
-- alargar quando o dominio existe, no-op quando ele nunca foi instalado.
DO $alargar$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
  ) THEN
    RAISE NOTICE 'vocabulario situacao julgamento: dominio ausente (replay); alargamento ignorado';
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
      'indeferido com recurso'
    ));

  -- O COMMENT vive DENTRO do guard: fora dele, `COMMENT ON CONSTRAINT`
  -- reprova com "constraint does not exist" no caminho de no-op do replay.
  EXECUTE format(
    'COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS %L',
    'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. Os quatro estados de julgamento entraram em 03/09/2026, quando o julgamento de 2026 apareceu em consulta_cand_complementar (134 deferidos, 4 indeferidos e 2 deferidos com recurso entre as 206 fichas publicaveis com SQ).');
END
$alargar$;

-- Conferencia: a constraint existe e esta validada. Sem este bloco, um ALTER
-- que nao tivesse tomado efeito deixaria a migration verde sem gate nenhum.
DO $conferencia$
DECLARE
  tem_constraint boolean;
  aceita_deferido boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;

  -- Sem constraint aqui so pode significar o caminho de no-op acima (replay em
  -- banco onde o dominio nunca foi instalado). Nao ha o que conferir.
  IF NOT tem_constraint THEN
    RAISE NOTICE 'vocabulario situacao julgamento: sem dominio instalado, nada a conferir';
    RETURN;
  END IF;

  -- A constraint existir nao basta: ela tem de ser a NOVA. Sem esta parte, um
  -- DROP/ADD que nao tivesse tomado efeito deixaria a migration verde com o
  -- dominio antigo no lugar, que e o modo de falha silencioso.
  SELECT pg_get_constraintdef(oid) LIKE '%deferido com recurso%'
    INTO aceita_deferido
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio';
  IF NOT aceita_deferido THEN
    RAISE EXCEPTION 'vocabulario situacao julgamento: constraint existe mas nao tem os estados de julgamento';
  END IF;
END
$conferencia$;

COMMIT;
