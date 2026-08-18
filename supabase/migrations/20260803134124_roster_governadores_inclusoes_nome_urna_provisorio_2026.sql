-- Cinco candidaturas a Governador confirmadas em convencao que estavam fora do
-- site por NAO TER NOME CIVIL EM FONTE ALGUMA. Decisao do Thiago em 03/08/2026,
-- tomada com o custo declarado: entram agora com `nome_completo` = nome de urna,
-- em vez de esperar o registro do TSE de 15/08.
--
-- ISTO E UM PLACEHOLDER, NAO UM DADO. `nome_completo` aqui NAO e nome civil
-- verificado, e o marcador em `fonte_dados` existe para que a proxima migration
-- de identidade encontre estas cinco linhas por query, e nao por memoria:
--
--   SELECT slug FROM public.candidatos
--   WHERE 'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'
--         = ANY(fonte_dados);
--
-- POR QUE NENHUM TEM NOME CIVIL. Os cinco foram procurados em DivulgaCandContas
-- 2014, 2018, 2022 (governo, senado, federal, estadual da UF) e 2024 (vereador e
-- prefeito nas capitais e em Franca/SP), alem de imprensa e pagina de campanha.
-- Nenhum tem registro anterior: sao primeira candidatura. A imprensa so publica
-- nome de urna. O pacote consulta_cand_2026 foi rebaixado as 10h40 de 03/08 e
-- continuava na versao de 02/08 22h34, sem AM, DF, PB, PE nem SP no cargo de
-- governador.
--
-- DESBLOQUEIO. O registro vai ate 15/08 e o pacote e diario. Quando essas UFs
-- entrarem, trocar `nome_completo` pelo NM_CANDIDATO oficial, preencher
-- data_nascimento/naturalidade/formacao/ocupacao e REMOVER o marcador.
--
-- Evidencia de candidatura, que e solida em todos os cinco:
--   gilberto-vasconcelos: convencao 25/07 no CAUA/Ufam, Manaus. G1 AM 25/07 +
--     balanco do Congresso em Foco 27/07. Vice: Juliana Frota.
--   elisson-ferreira: convencao 20/07. G1 DF 20/07 + Congresso em Foco 27/07 +
--     Correio Braziliense. Jornalista e empresario. Senado: Tiago Tarsis.
--   yuri-ezequiel: convencao 29/07. G1 PB 29/07 + JPB2. Advogado, ex-presidente
--     do diretorio municipal da UP em Joao Pessoa.
--   carlos-machado: convencao estadual 01/08 na capital. G1 SP 02/08 +
--     Metropoles. Historiador e professor da rede estadual, natural de Franca.
--     Vice: Felipe de Oliveira Queiroz.
--   guilherme-fonseca: ja era lacuna conhecida em 30/07. Convencao do PSTU-PE no
--     fim de semana de 25-26/07, no balanco do Congresso em Foco 27/07.

INSERT INTO public.candidatos
  (slug, nome_completo, nome_urna, partido_sigla, partido_atual, cargo_disputado,
   estado, status, situacao_candidatura, publicavel, fonte_dados, ultima_atualizacao)
VALUES
  ('gilberto-vasconcelos', 'Gilberto Vasconcelos', 'Gilberto Vasconcelos',
   'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Governador', 'AM',
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria', 'G1 AM 2026-07-25', 'Congresso em Foco 2026-07-27',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'], NOW()),

  ('elisson-ferreira', 'Elisson Ferreira', 'Elisson Ferreira',
   'AGIR', 'Agir', 'Governador', 'DF',
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria', 'G1 DF 2026-07-20', 'Congresso em Foco 2026-07-27',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'], NOW()),

  ('yuri-ezequiel', 'Yuri Ezequiel', 'Yuri Ezequiel',
   'UP', 'Unidade Popular', 'Governador', 'PB',
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria', 'G1 PB 2026-07-29',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'], NOW()),

  ('carlos-machado', 'Carlos Machado', 'Carlos Machado',
   'PCB', 'Partido Comunista Brasileiro', 'Governador', 'SP',
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria', 'G1 SP 2026-08-02', 'Metropoles 2026-08-01',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'], NOW()),

  ('guilherme-fonseca', 'Guilherme Fonseca', 'Guilherme Fonseca',
   'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Governador', 'PE',
   'pre-candidato', 'pre-candidato', true,
   ARRAY['curadoria', 'Congresso em Foco 2026-07-27',
         'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'], NOW())
ON CONFLICT (slug) DO NOTHING;;
