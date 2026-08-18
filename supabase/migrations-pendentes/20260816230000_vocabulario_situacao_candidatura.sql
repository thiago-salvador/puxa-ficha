-- Normaliza o vocabulario de `candidatos.situacao_candidatura`.
--
-- Par 1 de 2. Este arquivo so mexe em DADO. O CHECK que fecha o dominio vive em
-- 20260816230100_vocabulario_situacao_candidatura_check.sql, e a separacao e
-- obrigatoria: `tests/migrations-classificacao.test.ts` reprova migration que
-- mistura DDL persistente com dado de ficha no mesmo arquivo. A ordem importa,
-- e por isso o dado vem primeiro: o CHECK e criado sem `NOT VALID` e so passa
-- depois que esta migration limpou as linhas.
--
-- O campo e TEXT livre desde 20260331031013, e cada rodada de ingestao inventou
-- a propria redacao. Censo medido no banco de producao em 16/08/2026, sobre as
-- 296 linhas da tabela (175 publicaveis):
--
--   registrada, aguardando julgamento                              108   (108 pub)
--   pre-candidato                                                   79   ( 25 pub)
--   (NULL)                                                          31   (  0 pub)
--   aguardando julgamento                                           26   ( 26 pub)
--   incerto                                                         19   (  3 pub)
--   pedido de registro no TSE; situacao nao informada no snapshot    17   ( 10 pub)
--   APTO [2022]                                                      8   (  0 pub)
--   APTO [2020]                                                      3   (  0 pub)
--   deferido                                                         3   (  3 pub)
--   desistente                                                       1   (  0 pub)
--   INAPTO [2022]                                                    1   (  0 pub)
--
-- Onze estados para tres sentidos. O recorte publicavel sozinho mostra seis
-- deles, e foi por isso que o problema chegou subdimensionado: a limpeza tem de
-- cobrir a tabela inteira, porque e a tabela inteira que o CHECK governa.
--
-- =====================================================================
-- O QUE A FONTE OFICIAL DISTINGUE (a pergunta que decide o vocabulario)
-- =====================================================================
--
-- Nada. O pacote consulta_cand do TSE para 2026, baixado depois do fechamento
-- do prazo de registro (15/08/2026), traz 20.456 candidaturas em 28 arquivos
-- por unidade da federacao, e a coluna de situacao da candidatura vale `#NE`
-- em 20.456 de 20.456 linhas. Zero excecoes. A tabela `chapas_2026`, carregada
-- do mesmo pacote, repete o quadro: `tse_situacao_codigo` e `#NE` em todas as
-- linhas do snapshot vigente.
--
-- Ou seja: para o pleito de 2026 existe UM fato oficial, e nao tres. Consta o
-- pedido de registro, e nenhum julgamento foi publicado ainda. As tres redacoes
-- abaixo descrevem esse mesmo fato unico:
--
--   "registrada, aguardando julgamento"
--   "aguardando julgamento"
--   "pedido de registro no TSE; situacao nao informada no snapshot"
--
-- Mante-las separadas seria afirmar uma distincao que a fonte nao faz. O que
-- separava as duas ultimas era a DATA do snapshot lido, nao o dado: antes de
-- 15/08 o prazo estava aberto e "situacao nao informada" era leitura honesta;
-- depois do fechamento, a presenca do registro no pacote E o pedido protocolado.
-- O proprio `src/lib/candidatura-proveniencia.ts` ja opera assim, tratando o
-- snapshot pos-registro como `registro_tse_pendente` mesmo com codigo `#NE`.
--
-- =====================================================================
-- O VOCABULARIO MINIMO: tres valores mais NULL
-- =====================================================================
--
--   'aguardando julgamento'
--     Consta pedido de registro na base oficial de candidaturas do TSE e nao ha
--     julgamento publicado. E o unico estado que a fonte de 2026 sustenta hoje.
--     Token escolhido por ja existir no banco, ja estar na lista de situacoes
--     aceitas de src/lib/published-consistency.ts e ja ser reconhecido pelo
--     resolvedor de proveniencia. Trocar por um rotulo novo mexeria no selo de
--     175 fichas sem ganho de verdade.
--
--   'candidatura declarada'
--     Candidatura declarada publicamente e apurada pela equipe editorial, sem
--     vinculo com pedido de registro neste snapshot. Substitui 'pre-candidato',
--     que a decisao editorial de 16/08 tirou do vocabulario publico do site.
--     O texto acompanha o rotulo ja no ar em candidatura-proveniencia.ts
--     ("Candidatura declarada"), entao o campo passa a falar a mesma lingua da
--     ficha. Note o que ele NAO afirma: nao nega o registro, so declara que a
--     apuracao aqui e editorial.
--
--   'incerto'
--     A equipe olhou e nao conseguiu estabelecer a situacao, com as fontes
--     divergindo entre si. Estado editorial, ja aceito pelo gate de consistencia
--     como valido no ar. Nao e "ainda nao checado": as tres fichas publicaveis
--     nesse estado tem fonte registrada em `fonte_dados`.
--
--   NULL
--     Ausencia de informacao, e o unico jeito honesto de dizer isso. NULL passa
--     no CHECK por construcao (NULL IN (...) e NULL, nao falso), e isso aqui e
--     deliberado, nao descuido. Nenhuma linha publicavel fica NULL: o gate de
--     `published-consistency.ts` continua avisando se alguma ficar.
--
-- Ficam de FORA de proposito, e cada ausencia e uma decisao:
--
--   'deferido' / 'indeferido'
--     O TSE ainda nao julgou nada de 2026. Deixar o valor disponivel hoje e
--     deixar aberta a porta pela qual entrou o defeito corrigido abaixo. Quando
--     o TSE publicar julgamento, acrescentar o valor e uma linha no CHECK, numa
--     PR deliberada, junto com o mapeamento do codigo oficial que passar a
--     existir. A friccao e o ponto.
--
--   'pre-candidato'
--     Sai do vocabulario deste campo por dois motivos. E valor de `status`, e
--     repeti-lo aqui e a mesma confusao de camada que produziu a linha
--     'desistente' tratada abaixo. E foi retirado do vocabulario publico pela
--     decisao editorial de 16/08.
--
-- =====================================================================
-- PARA ONDE VAI CADA UMA DAS ONZE GRAFIAS
-- =====================================================================
--
--   registrada, aguardando julgamento              -> aguardando julgamento
--   aguardando julgamento                          -> (inalterado)
--   pedido de registro no TSE; situacao nao ...    -> aguardando julgamento
--   deferido                                       -> aguardando julgamento  (correcao, ver abaixo)
--   pre-candidato                                  -> candidatura declarada
--   incerto                                        -> (inalterado)
--   APTO [2022] / APTO [2020] / INAPTO [2022]      -> NULL  (ver abaixo)
--   desistente                                     -> NULL  (ver abaixo)
--   (NULL)                                         -> (inalterado)
--
-- As tres migracoes que NAO sao simples troca de redacao:
--
-- 1. 'deferido' (3 fichas, todas publicaveis) e afirmacao sem lastro.
--    ciro-gomes-gov-ce, robson-raymundo e ronaldo-mansur. As tres tem linha em
--    `chapas_2026` com `tse_situacao_codigo = '#NE'`, ou seja a propria fonte
--    oficial do projeto diz que nao houve julgamento. Nenhuma delas tem, em
--    `fonte_dados`, referencia a deferimento de 2026. As tres seguem com
--    `status = 'pre-candidato'`, que contradiz o campo ao lado. Como as tres
--    tem chapa vinculada, o selo da ficha ja vinha do ramo de chapa e ja dizia
--    "Pedido de registro no TSE": o valor errado nao aparecia na tela, mas
--    saia cru no payload de /api/candidato-profile/[slug]. Ir para
--    'aguardando julgamento' nao inventa nada, apenas alinha o campo ao que a
--    chapa dessas mesmas tres fichas ja registra.
--
-- 2. 'APTO [2022]', 'APTO [2020]', 'INAPTO [2022]' (12 fichas, nenhuma
--    publicavel) sao residuo de ingestao historica que escreveu no campo do
--    ciclo CORRENTE a situacao de um pleito antigo. O defeito ja foi corrigido
--    na origem (ver tests/ingest-tse-situacao-build-payload.test.ts, "ano
--    historico 2022, NUNCA reescreve situacao_candidatura"), mas as linhas
--    ficaram. Sobre a candidatura de 2026, que e o assunto desta coluna, elas
--    nao dizem nada, entao o valor honesto e NULL. Dez das doze tem o ano
--    correspondente preservado em `historico_politico`, o que torna a limpeza
--    sem perda. Duas NAO tem, e ficam anotadas como pendencia no rodape.
--
-- 3. 'desistente' (1 ficha, wilson-witzel, nao publicavel) e valor de `status`
--    gravado na coluna errada. A propria linha ja tem `status = 'desistente'`,
--    entao a informacao nao se perde: ela so deixa de ser afirmada duas vezes,
--    uma delas num campo que nao fala sobre isso.
--
-- `ultima_atualizacao` NAO e tocada em nenhum dos statements, e isso e escolha.
-- O campo alimenta a superficie publica de frescor. Carimbar 220 fichas por uma
-- normalizacao de vocabulario diria ao leitor que o dado foi reapurado hoje,
-- quando o que mudou foi a redacao. Nao ha trigger em `public.candidatos` que
-- o atualize sozinho (conferido em 16/08/2026), entao omitir e suficiente.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. As tres redacoes do mesmo `#NE`, mais a afirmacao de deferimento sem
--    lastro, convergem no unico estado que a fonte de 2026 sustenta.
-- @write tabela=candidatos ref=vocabulario-situacao-20260816 chave="registrada, aguardando julgamento" campos=situacao_candidatura
UPDATE public.candidatos
SET situacao_candidatura = 'aguardando julgamento'
WHERE situacao_candidatura IN (
  'registrada, aguardando julgamento',
  'pedido de registro no TSE; situação não informada no snapshot',
  'deferido'
);

-- ---------------------------------------------------------------------------
-- 2. Declaracao editorial passa a usar o mesmo rotulo que a ficha ja mostra.
-- @write tabela=candidatos ref=vocabulario-situacao-20260816 chave="candidatura declarada" campos=situacao_candidatura
UPDATE public.candidatos
SET situacao_candidatura = 'candidatura declarada'
WHERE situacao_candidatura = 'pre-candidato';

-- ---------------------------------------------------------------------------
-- 3. Residuo de pleito antigo no campo do ciclo corrente. Sobre 2026 essas
--    linhas nao afirmam nada, e o valor honesto de "nada" e NULL.
-- @write tabela=candidatos ref=vocabulario-situacao-20260816 chave="APTO [2022]" campos=situacao_candidatura
UPDATE public.candidatos
SET situacao_candidatura = NULL
WHERE situacao_candidatura IN ('APTO [2022]', 'APTO [2020]', 'INAPTO [2022]');

-- ---------------------------------------------------------------------------
-- 4. Valor de `status` gravado na coluna errada. `status` continua dizendo.
-- @write tabela=candidatos ref=vocabulario-situacao-20260816 chave="desistente" campos=situacao_candidatura
UPDATE public.candidatos
SET situacao_candidatura = NULL
WHERE situacao_candidatura = 'desistente' AND status = 'desistente';

-- ---------------------------------------------------------------------------
-- Conferencia.
--
-- O guard de banco vazio vem PRIMEIRO e retorna sem estourar. Ele nao e
-- cerimonia: no replay linear a partir do zero esta migration roda numa tabela
-- que ainda nao tem linha nenhuma, e sem o guard a classificacao de
-- `scripts/audit/lib/migrations-classificacao.ts` a marcaria como quebra
-- prevista. Depois dele, as invariantes estruturais valem sempre; o censo exato
-- so e cobrado quando a tabela tem a forma medida em producao (296 linhas).
DO $$
DECLARE
  total integer;
  fora_do_dominio integer;
  pub_nulas integer;
  pub_stale integer;
  aposentados integer;
  n_aguardando integer;
  n_declarada integer;
  n_incerto integer;
  n_nulas integer;
  pub_aguardando integer;
  pub_declarada integer;
  pub_incerto integer;
BEGIN
  SELECT COUNT(*) INTO total FROM public.candidatos;
  IF total = 0 THEN
    RAISE NOTICE 'vocabulario_situacao: tabela vazia (replay linear); conferencia ignorada';
    RETURN;
  END IF;

  -- 1. Invariante central: nada fora do vocabulario. O teste deixa NULL passar
  --    de proposito, entao nao pode usar `IS DISTINCT FROM`.
  SELECT COUNT(*) INTO fora_do_dominio FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN ('aguardando julgamento', 'candidatura declarada', 'incerto');
  IF fora_do_dominio <> 0 THEN
    RAISE EXCEPTION 'vocabulario_situacao: % linha(s) ainda fora do dominio', fora_do_dominio;
  END IF;

  -- 2. Nenhuma ficha no ar pode ficar sem situacao. Se a normalizacao anulasse
  --    uma linha publicavel, o gate de published-consistency acusaria depois do
  --    deploy; aqui ele acusa antes do COMMIT.
  SELECT COUNT(*) INTO pub_nulas FROM public.candidatos
   WHERE publicavel = true AND status <> 'removido' AND situacao_candidatura IS NULL;
  IF pub_nulas <> 0 THEN
    RAISE EXCEPTION 'vocabulario_situacao: % ficha(s) publicavel(is) ficaram sem situacao', pub_nulas;
  END IF;

  -- 3. Regressao de 04/06/2026 (20260604135721): situacao com ano ou marcador
  --    do TSE vazando para o ar. E anomalia DURA no gate de consistencia, e
  --    nenhum valor do vocabulario novo pode dispara-la.
  SELECT COUNT(*) INTO pub_stale FROM public.candidatos
   WHERE publicavel = true AND status <> 'removido'
     AND situacao_candidatura ~* '\m(19|20)\d{2}\M|APTO';
  IF pub_stale <> 0 THEN
    RAISE EXCEPTION 'vocabulario_situacao: % ficha(s) publicavel(is) com situacao stale', pub_stale;
  END IF;

  -- 4. As afirmacoes aposentadas nao podem sobreviver em lugar nenhum da tabela.
  SELECT COUNT(*) INTO aposentados FROM public.candidatos
   WHERE situacao_candidatura IN ('deferido', 'deferido com recurso', 'pre-candidato');
  IF aposentados <> 0 THEN
    RAISE EXCEPTION 'vocabulario_situacao: % linha(s) com valor aposentado (deferido/pre-candidato)', aposentados;
  END IF;

  -- 5. Censo exato, so na forma medida em producao.
  IF total <> 296 THEN
    RAISE NOTICE 'vocabulario_situacao: tabela com % linha(s), diferente das 296 medidas em 16/08/2026; censo exato ignorado', total;
    RETURN;
  END IF;

  SELECT COUNT(*) FILTER (WHERE situacao_candidatura = 'aguardando julgamento'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'candidatura declarada'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'incerto'),
         COUNT(*) FILTER (WHERE situacao_candidatura IS NULL)
    INTO n_aguardando, n_declarada, n_incerto, n_nulas
    FROM public.candidatos;

  IF n_aguardando <> 154 OR n_declarada <> 79 OR n_incerto <> 19 OR n_nulas <> 44 THEN
    RAISE EXCEPTION 'vocabulario_situacao: censo da tabela esperado 154/79/19/44, encontrado %/%/%/%',
      n_aguardando, n_declarada, n_incerto, n_nulas;
  END IF;

  SELECT COUNT(*) FILTER (WHERE situacao_candidatura = 'aguardando julgamento'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'candidatura declarada'),
         COUNT(*) FILTER (WHERE situacao_candidatura = 'incerto')
    INTO pub_aguardando, pub_declarada, pub_incerto
    FROM public.candidatos
   WHERE publicavel = true AND status <> 'removido';

  IF pub_aguardando <> 147 OR pub_declarada <> 25 OR pub_incerto <> 3 THEN
    RAISE EXCEPTION 'vocabulario_situacao: censo publicavel esperado 147/25/3, encontrado %/%/%',
      pub_aguardando, pub_declarada, pub_incerto;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select coalesce(situacao_candidatura,'(NULL)') as situacao,
--          count(*) as total,
--          count(*) filter (where publicavel and status <> 'removido') as publicaveis
--     from candidatos group by 1 order by 2 desc;
--
--   select slug, status, situacao_candidatura from candidatos
--    where slug in ('ciro-gomes-gov-ce','robson-raymundo','ronaldo-mansur');
--
-- PENDENTE, fora do escopo desta migration:
--   - rodrigo-pacheco carregava 'APTO [2020]' e washington-reis 'INAPTO [2022]',
--     e sao as duas unicas das doze SEM o ano correspondente em
--     `historico_politico`. O valor sai daqui porque descreve outro pleito, mas
--     o fato precisa ser reverificado no pacote do ano certo (o pacote local
--     desta rodada so tem 2026) e, se confirmado, registrado em
--     `historico_politico`, que e a casa dele. O caso de washington-reis merece
--     atencao: indeferimento e informacao de interesse publico, e sumir com ela
--     sem reancorar seria perda real.
--   - as 3 fichas ex-'deferido' seguem com `status = 'pre-candidato'` e chapa
--     oficial vinculada. Decidir se `status` vira 'candidato' e decisao
--     editorial separada, e mexeria no dominio do outro campo.
--   - 25 fichas publicaveis ficam em 'candidatura declarada' e 3 em 'incerto'.
--     Com o prazo de registro fechado e o pacote de 2026 em maos, da para
--     conferir uma a uma se ha pedido de registro protocolado. Isso e apuracao,
--     nao normalizacao, e por isso nao acontece aqui.
