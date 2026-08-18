-- Roster de Governador: inclusoes e uma volta a disputa, apuradas em 03/08/2026.
--
-- CONTEXTO. A janela de convencoes vai de 20/07 a 05/08 e o registro no TSE vai
-- ate 15/08. A varredura de 30/07 (docs/varredura-governadores-2026-07-30.md)
-- fechou antes do grosso das convencoes: entre 31/07 e 02/08 sairam as do PT-GO,
-- PSTU-DF, DC-BA, PCB-SP e da federacao PSDB-Cidadania em SE. Este lote e a
-- diferenca entre aquele retrato e o de hoje.
--
-- FONTE NOVA QUE NAO EXISTIA EM 30/07. O pacote consulta_cand_2026.zip do TSE
-- deixou de ser vazio: na versao de 02/08 22:34 ele tem 7.200 linhas, 32 delas
-- de GOVERNADOR/VICE-GOVERNADOR, com nome civil, data de nascimento, naturalidade
-- e SQ_CANDIDATO. Em 30/07 eram 1.828 linhas, 10 de governador e 100% em '#NE'.
-- Onde o registro ja existe, ele e a fonte usada aqui e nao a imprensa.
--
-- REGRA DE IDENTIDADE MANTIDA. Continua valendo o criterio de 30/07: ninguem
-- entra sem nome civil verificado em fonte rastreavel, porque nome_completo e
-- NOT NULL e preencher com nome de urna e inventar nome civil de pessoa real.
-- Cinco candidaturas confirmadas em convencao ficaram FORA deste lote so por
-- isso, e estao listadas no doc da varredura de hoje.

-- ---------------------------------------------------------------------------
-- BLOCO 1: inclusoes com identidade verificada
-- ---------------------------------------------------------------------------

INSERT INTO public.candidatos
  (slug, nome_completo, nome_urna, partido_sigla, partido_atual, cargo_disputado,
   estado, status, situacao_candidatura, publicavel, ultima_atualizacao)
VALUES
  -- Convencao da UP em Maceio, 21/07/2026 (G1 AL). Vice: Jardel Queiroz.
  -- Confirmada tambem no balanco do Congresso em Foco de 27/07.
  -- Nome civil do registro dela no TSE de 2022 (deputada federal AL, UP,
  -- SQ 20001653097): LENILDA LUNA DE ALMEIDA. Nome de urna identico ao de hoje.
  ('lenilda-luna', 'Lenilda Luna de Almeida', 'Lenilda Luna',
   'UP', 'Unidade Popular', 'Governador', 'AL',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao estadual da UP na Bahia, 25/07/2026 (G1 BA, Poder360).
  -- Vice: Marilia Regina. Confirmado no balanco do Congresso em Foco de 27/07.
  -- Nome civil do registro dele no TSE de 2022, quando disputou o governo de
  -- SERGIPE pela UP (SQ 260001617899): AROLDO FELIX DE AZEVEDO JUNIOR, nome de
  -- urna 'PROF AROLDO FELIX'. O vinculo nao e so homonimia: mesmo partido, mesmo
  -- cargo, e a JOTA descreve o pre-candidato de 2026 como o mesmo professor
  -- doutor da UFRB que ficou em setimo em SE em 2022.
  ('aroldo-felix', 'Aroldo Felix de Azevedo Junior', 'Aroldo Félix',
   'UP', 'Unidade Popular', 'Governador', 'BA',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao do DC em Salvador, 02/08/2026 (G1 BA). Nome civil publicado pela
  -- JOTA no perfil dos pre-candidatos da Bahia: Jose Estevao dos Santos Barbosa,
  -- empresario e presidente do diretorio estadual do DC-BA. Sem registro no TSE
  -- em 2014/2018/2022 na Bahia; provavel primeira candidatura.
  ('jose-estevao', 'José Estêvão dos Santos Barbosa', 'José Estêvão',
   'DC', 'Democracia Cristã', 'Governador', 'BA',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- PSTU-DF, anunciado em 01/08/2026 (G1 DF, Metropoles). Vice na chapa: Zanata
  -- ao Senado. Nome civil batido com o registro dele no TSE de 2022, quando ja
  -- disputou o governo do DF pelo PSTU (SQ 70001611377): ROBSON RAYMUNDO DA
  -- SILVA. Mesmo partido, mesma UF, mesmo cargo, e a Metropoles publica o mesmo
  -- nome civil de forma independente.
  ('robson-raymundo', 'Robson Raymundo da Silva', 'Professor Robson Raymundo',
   'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Governador', 'DF',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao da Federacao Brasil da Esperanca (PT/PCdoB/PV) em Goiania,
  -- 01/08/2026 (G1 GO). Vice: Carlos Mundim (PDT). Isto fecha a pendencia que a
  -- varredura de 30/07 deixou explicita: naquela data a convencao dele ainda era
  -- FUTURA, e por isso ele foi barrado. Nome civil do registro no TSE de 2022
  -- (deputado estadual GO, PT, SQ 90001649536): LUIS CESAR BUENO E FREITAS.
  ('luis-cesar-bueno', 'Luis Cesar Bueno e Freitas', 'Luis Cesar Bueno',
   'PT', 'Partido dos Trabalhadores', 'Governador', 'GO',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao do PSTU no Maranhao, 29/07/2026 (G1 MA, Imirante). Vice: Preta Lu.
  -- Este e o unico do lote que JA TEM REGISTRO NO TSE PARA 2026: consulta_cand
  -- 2026 MA, cargo GOVERNADOR, SQ 100002534190, SAULO COSTA ARCANGELI, PSTU,
  -- nascido em 25/10/1971 no MA, superior completo, professor de ensino superior.
  -- Era um dos 4 nomes barrados em 30/07 por falta de nome civil; o registro
  -- oficial resolveu.
  ('saulo-arcangeli', 'Saulo Costa Arcangeli', 'Saulo Arcangeli',
   'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Governador', 'MA',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- ACHADO FORA DA LISTA PEDIDA. O Agir-AC ja REGISTROU candidatura no TSE e o
  -- site nao tinha a ficha: consulta_cand 2026 AC, cargo GOVERNADOR,
  -- SQ 10002533539, FRANCISCO DAS CHAGAS CONCEICAO DA SILVA, nome de urna
  -- 'DR.LUISINHO', AGIR, nascido em 16/01/1975 no AC, superior completo,
  -- empresario. Vice registrada: Daniela Paiva (Agir). Confirmado tambem no
  -- balanco do Congresso em Foco de 27/07 entre os homologados do Acre.
  ('dr-luisinho', 'Francisco das Chagas Conceição da Silva', 'Dr. Luisinho',
   'AGIR', 'Agir', 'Governador', 'AC',
   'pre-candidato', 'pre-candidato', true, NOW())
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- BLOCO 2: volta a disputa
--
-- emanuel-cacho saiu como 'desistente' na migration 20260730120000, com base em
-- fonte de 22/07 na qual ele desistia citando custo de campanha. A federacao
-- PSDB-Cidadania mudou de rota e o oficializou em convencao no domingo 02/08,
-- com Suely Barreto como vice (G1 SE, 02/08). O caso valida o desenho da saida:
-- nada foi deletado em 30/07, entao a volta e um UPDATE, nao um re-cadastro.
--
-- ATENCAO OPERACIONAL. As claims dele nunca passaram pelo link-check enquanto
-- estava fora da coorte. Antes de considerar esta ficha publicada de verdade,
-- rodar o gate introduzido no PR #42:
--   npx tsx scripts/link-check-pontos-atencao.ts --revalidar=emanuel-cacho
-- ---------------------------------------------------------------------------

UPDATE public.candidatos
SET status = 'pre-candidato',
    situacao_candidatura = 'pre-candidato',
    cargo_disputado = 'Governador',
    publicavel = true,
    ultima_atualizacao = NOW()
WHERE slug = 'emanuel-cacho';
