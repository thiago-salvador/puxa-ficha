-- A disputa presidencial passa a ter as 13 candidaturas escolhidas em convencao.
-- Decisao do dono em 12/08/2026, depois da conferencia registrada em
-- QA/evidencias/2026-08-12-dado1/R2-disputa-presidencial-fonte-vs-banco.md.
--
-- O QUE ESTAVA ERRADO. A grade de presidenciaveis tinha 11 fichas e errava em 4
-- dos 14 nomes: publicava quem saiu da disputa e omitia tres que entraram.
-- As convencoes correram de 20/07 a 05/08/2026 e 13 partidos definiram candidato
-- proprio a Presidencia. O prazo de registro no TSE vai ate 15/08 as 19h, entao
-- estas 13 sao candidaturas ESCOLHIDAS EM CONVENCAO, com registro pendente, e e
-- por isso que todas seguem com situacao_candidatura = 'pre-candidato', igual ao
-- resto do universo.
--
-- OS TRES QUE ENTRAM, com a convencao e a fonte de cada um:
--   clariana-barao       DC   convencao nacional 05/08 em Sao Paulo, por
--                             unanimidade; vice Fabiana Torquato; primeira vez
--                             desde 1995 que o DC nao lanca Jose Maria Eymael.
--                             CNN Brasil, CartaCapital, Metropoles, O Tempo.
--   leonardo-avalanche   PRTB convencao 29/07 em Goiania; vice Tenente Dalma;
--                             volta do PRTB a candidatura propria depois de 12
--                             anos, na vaga que seria de Pablo Marcal.
--                             Poder360, O Tempo, NSC Total, Correio Braziliense.
--   wilson-grassi-junior D35  convencao 02/08; vaga de vice em aberto; primeira
--                             convencao do partido apos deixar de se chamar PMB
--                             em dezembro de 2025, e primeira candidatura
--                             presidencial dele desde 2008.
--                             Agencia Brasil, Poder360, Revista Oeste.
--
-- NOME CIVIL E PLACEHOLDER NOS TRES, e isto NAO e dado. Mesma decisao e mesmo
-- mecanismo da 20260803134124: `nome_completo` recebe o nome de urna e o marcador
-- em `fonte_dados` existe para a proxima migration de identidade achar estas
-- linhas por query, nao por memoria:
--
--   SELECT slug FROM public.candidatos
--   WHERE 'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'
--         = ANY(fonte_dados);
--
-- A imprensa reporta o nome civil de leonardo-avalanche como "Leonardo Alves de
-- Araujo", e ele NAO foi gravado: a leitura foi de resumo de busca, nao de fonte
-- primaria lida nesta sessao, e nome civil e chave de identidade neste projeto.
-- Quando o pacote consulta_cand_2026 trouxer os tres, trocar `nome_completo` pelo
-- NM_CANDIDATO oficial e REMOVER o marcador.
--
-- CABO DACIOLO SAI DA DISPUTA PRESIDENCIAL. O Mobiliza anunciou em 04/08 que nao
-- lancaria candidato proprio a Presidencia, o que barrou a pre-candidatura dele;
-- em seguida ele anunciou disputa pelo governo do Amazonas, e a convencao do
-- partido formalizou a candidatura, com Igor Oliveira de vice e Xuxa do Amazonas
-- ao Senado. Fontes: Poder360, O POVO 07/08, Revista Oeste, Crusoe, BNC Amazonas.
-- Oito dessas materias ja estavam publicadas na propria ficha dele desde 05/08,
-- contradizendo o cargo que o site exibia.
--
-- Ele vai para Governador/AM, e NAO para despublicado, porque a candidatura ao
-- governo do AM tem evidencia solida e despublicar fabricaria ausencia, que
-- Settings/EXPECTED_BEHAVIOR.md proibe. Consequencia declarada: /uf/am passa de 5
-- para 6 fichas, enquanto o DivulgaCandContas listava 5 registros para o cargo em
-- 12/08. A diferenca e esperada enquanto o registro dele esta em processamento, e
-- e o mesmo criterio que ja vale para as outras 193 fichas, que sao pre-candidatas
-- e nao registros deferidos.

-- AUSENCIA E NO-OP, PRESENCA PARCIAL ABORTA. O replay linear roda esta migration
-- contra um banco que pode nao ter o universo, e uma pre-condicao que estoura ali
-- derruba o replay inteiro. Mas o inverso tambem e defeito: o precedente da B2
-- (Settings/STATUS.md) mostra que guard frouxo transforma presenca PARCIAL em
-- no-op bem-sucedido, e a ficha fica sem correcao para sempre. Entao o criterio e
-- a ancora `cabo-daciolo`: sem ela, nada acontece; com ela em estado inesperado,
-- aborta; com ela no estado esperado, aplica.

-- Pre-condicao 1: os tres slugs novos nao podem existir. Em banco sem universo o
-- count e zero e isto passa, que e o comportamento certo.
DO $$
DECLARE
  ja_existem int;
BEGIN
  SELECT count(*) INTO ja_existem
  FROM public.candidatos
  WHERE slug IN ('clariana-barao', 'leonardo-avalanche', 'wilson-grassi-junior');

  IF ja_existem <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao: % dos 3 slugs novos ja existem; abortando', ja_existem;
  END IF;
END $$;

-- Pre-condicao 2: se a ancora existir, ela tem que estar no estado que esta
-- migration espera corrigir. Se NAO existir, a migration inteira e no-op.
DO $$
DECLARE
  existe int;
  no_estado int;
BEGIN
  SELECT count(*) INTO existe
  FROM public.candidatos WHERE slug = 'cabo-daciolo';

  IF existe = 0 THEN
    RAISE NOTICE 'Ancora cabo-daciolo ausente: migration e no-op neste banco';
    RETURN;
  END IF;

  SELECT count(*) INTO no_estado
  FROM public.candidatos
  WHERE slug = 'cabo-daciolo'
    AND cargo_disputado = 'Presidente'
    AND estado IS NULL
    AND partido_sigla = 'MOBILIZA'
    AND publicavel = true;

  IF no_estado <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao: cabo-daciolo existe mas nao esta no estado esperado (Presidente/NULL/MOBILIZA/publicavel)';
  END IF;

  -- As duas fontes que esta migration acrescenta tem que estar AUSENTES. Sem
  -- isto, rodar de novo duplicaria entradas em `fonte_dados` e o rollback
  -- deixaria de ser exato: ele remove por valor, e removeria as duas copias.
  IF EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'cabo-daciolo'
      AND ('Poder360 2026-08-06 (Mobiliza anuncia Daciolo ao governo do AM)' = ANY(fonte_dados)
        OR 'O POVO 2026-08-07 (candidatura a presidente barrada)' = ANY(fonte_dados))
  ) THEN
    RAISE EXCEPTION 'Pre-condicao: cabo-daciolo ja tem alguma das fontes que esta migration acrescenta';
  END IF;
END $$;

-- @write tabela=candidatos slug=clariana-barao campos=slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,status,situacao_candidatura,publicavel,fonte_dados,ultima_atualizacao
-- @write tabela=candidatos slug=leonardo-avalanche campos=slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,status,situacao_candidatura,publicavel,fonte_dados,ultima_atualizacao
-- @write tabela=candidatos slug=wilson-grassi-junior campos=slug,nome_completo,nome_urna,partido_sigla,partido_atual,cargo_disputado,estado,status,situacao_candidatura,publicavel,fonte_dados,ultima_atualizacao
INSERT INTO public.candidatos
  (slug, nome_completo, nome_urna, partido_sigla, partido_atual, cargo_disputado,
   estado, status, situacao_candidatura, publicavel, fonte_dados, ultima_atualizacao)
SELECT v.slug, v.nome_completo, v.nome_urna, v.partido_sigla, v.partido_atual,
       v.cargo_disputado, v.estado, v.status, v.situacao_candidatura,
       v.publicavel, v.fonte_dados, NOW()
FROM (VALUES
  ('clariana-barao', 'Clariana Barão', 'Clariana Barão',
   'DC', 'Democracia Cristã', 'Presidente', NULL::text,
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria',
         'CNN Brasil 2026-08-05',
         'CartaCapital 2026-08-05',
         'Metropoles 2026-08-05',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)']),

  ('leonardo-avalanche', 'Leonardo Avalanche', 'Leonardo Avalanche',
   'PRTB', 'Partido Renovador Trabalhista Brasileiro', 'Presidente', NULL::text,
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria',
         'Poder360 2026-07-30',
         'O Tempo 2026-07-30',
         'Correio Braziliense 2026-07',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)']),

  ('wilson-grassi-junior', 'Wilson Grassi Júnior', 'Wilson Grassi Júnior',
   'D35', 'Democrata', 'Presidente', NULL::text,
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria',
         'Agencia Brasil 2026-08-02',
         'Poder360 2026-08-02',
         'Revista Oeste 2026-08-02',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'])
) AS v(slug, nome_completo, nome_urna, partido_sigla, partido_atual,
       cargo_disputado, estado, status, situacao_candidatura, publicavel, fonte_dados)
-- Ancora: sem cabo-daciolo no banco, nada entra. E o mesmo criterio do guard.
WHERE EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'cabo-daciolo');

-- @write tabela=candidatos slug=cabo-daciolo campos=cargo_disputado,estado,fonte_dados,ultima_atualizacao
-- Acrescenta EXATAMENTE as duas fontes novas, por concatenacao simples. A versao
-- anterior usava `array_agg(DISTINCT ...)`, que deduplica e tem ordem
-- indefinida: ela teria reordenado as 22 entradas que ja existiam e colapsado
-- eventuais repetidas, alem de tornar o rollback inexato. `curadoria` NAO entra
-- porque ja esta la.
UPDATE public.candidatos
SET cargo_disputado = 'Governador',
    estado = 'AM',
    fonte_dados = COALESCE(fonte_dados, ARRAY[]::text[]) || ARRAY[
      'Poder360 2026-08-06 (Mobiliza anuncia Daciolo ao governo do AM)',
      'O POVO 2026-08-07 (candidatura a presidente barrada)'
    ],
    ultima_atualizacao = NOW()
WHERE slug = 'cabo-daciolo';

-- Pos-condicao: a disputa presidencial publicavel tem que ficar com exatamente 13
-- fichas, e cabo-daciolo tem que ter saido dela.
DO $$
DECLARE
  presidentes int;
  daciolo_cargo text;
BEGIN
  SELECT cargo_disputado INTO daciolo_cargo
  FROM public.candidatos WHERE slug = 'cabo-daciolo';

  -- Sem ancora, a migration foi no-op e nao ha pos-condicao a cobrar.
  IF daciolo_cargo IS NULL THEN
    RAISE NOTICE 'Ancora ausente: nada foi escrito, pos-condicao dispensada';
    RETURN;
  END IF;

  IF daciolo_cargo <> 'Governador' THEN
    RAISE EXCEPTION 'Pos-condicao: cabo-daciolo continua em %, esperava Governador', daciolo_cargo;
  END IF;

  SELECT count(*) INTO presidentes
  FROM public.candidatos
  WHERE cargo_disputado = 'Presidente' AND publicavel = true AND status <> 'removido';

  IF presidentes <> 13 THEN
    RAISE EXCEPTION 'Pos-condicao: esperava 13 presidenciaveis publicaveis, achou %', presidentes;
  END IF;
END $$;
