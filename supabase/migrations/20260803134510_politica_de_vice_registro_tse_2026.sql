-- POLITICA DE VICE. Decisao do Thiago em 03/08/2026, fechando a pendencia que a
-- varredura de 30/07 deixou aberta: o site passa a cobrir vice em TODAS as
-- chapas, e a fonte unica e o registro de candidatura do TSE.
--
-- O PROBLEMA QUE ISTO RESOLVE. Ate agora o banco tinha 3 vices (Edegar Pretto
-- PT-RS, Felicio Ramuth MDB-SP, Amelio Cayres MDB-TO). No RS, por exemplo, todas
-- as chapas ja tinham vice definido e so o vice petista aparecia. O recorte nao
-- era intencional, mas a aparencia era de recorte politico.
--
-- POR QUE O CRITERIO AGORA E NEUTRO. Entra quem esta no registro do TSE, ponto.
-- Nao ha curadoria de quem merece ficha. O criterio nao depende de cobertura de
-- imprensa, tamanho de partido nem escolha editorial, e completa sozinho a
-- medida que o registro avanca ate 15/08.
--
-- COBERTURA HOJE: 15 vices novos + Roberto Claudio corrigido abaixo = 16, que sao
-- exatamente os 16 registrados no pacote consulta_cand_2026 na versao de 02/08
-- 22h34 (conferido de novo as 10h40 de 03/08, mesmo arquivo). Chapa que ainda
-- nao registrou continua sem vice no site, e isso e estado da fonte, nao recorte.
--
-- Identidade toda oficial: nome civil, data de nascimento, grau de instrucao e
-- ocupacao vem do proprio registro, com o SQ_CANDIDATO em fonte_dados.
--
-- Dois slugs nao derivam do nome de urna, de proposito:
--   larissa-rosado, porque o nome de urna e so 'Larissa' e slug de uma palavra
--     tao generica colide com qualquer homonima futura.
--   'baba' foi mantido, seguindo o precedente de 'mainha' ja no banco.

INSERT INTO public.candidatos
  (slug, nome_completo, nome_urna, partido_sigla, partido_atual, cargo_disputado,
   estado, status, situacao_candidatura, publicavel, data_nascimento, formacao,
   profissao_declarada, fonte_dados, ultima_atualizacao)
VALUES
  ('daniela-paiva', 'Daniela Paiva de Oliveira', 'Daniela Paiva', 'AGIR', 'Agir', 'Vice-Governador', 'AC',
   'pre-candidato', 'pre-candidato', true, DATE '1982-12-23', 'Superior completo', 'Ocupante de Cargo em Comissão',
   ARRAY['TSE consulta_cand 2026, SQ 10002533538'], NOW()),
  ('ricardo-leite', 'Fabio Ricardo Leite', 'Ricardo Leite', 'REPUBLICANOS', 'Republicanos', 'Vice-Governador', 'AC',
   'pre-candidato', 'pre-candidato', true, DATE '1967-05-10', 'Superior incompleto', 'Empresário',
   ARRAY['TSE consulta_cand 2026, SQ 10002532493'], NOW()),
  ('alessandra-campelo', 'Alessandra Campelo da Silva', 'Alessandra Campelo', 'PSD', 'Partido Social Democrático', 'Vice-Governador', 'AM',
   'pre-candidato', 'pre-candidato', true, DATE '1974-11-01', 'Superior completo', 'Deputado',
   ARRAY['TSE consulta_cand 2026, SQ 40002532271'], NOW()),
  ('luciana-gurgel', 'Luciana Araujo Goes Gurgel', 'Luciana Gurgel', 'PL', 'Partido Liberal', 'Vice-Governador', 'AP',
   'pre-candidato', 'pre-candidato', true, DATE '1982-10-22', 'Superior completo', 'Empresário',
   ARRAY['TSE consulta_cand 2026, SQ 30002530015'], NOW()),
  ('prof-meire-reis', 'Meire Lucia Alves dos Reis', 'Prof. Meire Reis', 'PSOL', 'Partido Socialismo e Liberdade', 'Vice-Governador', 'BA',
   'pre-candidato', 'pre-candidato', true, DATE '1970-11-09', 'Superior completo', 'Servidor Público Estadual',
   ARRAY['TSE consulta_cand 2026, SQ 50002532270'], NOW()),
  ('ze-coca', 'Zenildo Brandão Santana', 'Zé Cocá', 'PP', 'Progressistas', 'Vice-Governador', 'BA',
   'pre-candidato', 'pre-candidato', true, DATE '1976-04-24', 'Superior completo', 'Produtor Agropecuário',
   ARRAY['TSE consulta_cand 2026, SQ 50002533189'], NOW()),
  ('catherine-teles', 'Catherine Morais Teles', 'Catherine Teles', 'UP', 'Unidade Popular', 'Vice-Governador', 'CE',
   'pre-candidato', 'pre-candidato', true, DATE '1992-07-12', 'Superior completo', NULL,
   ARRAY['TSE consulta_cand 2026, SQ 60002533730'], NOW()),
  ('preta-lu', 'Luciana Costa Correa', 'Preta Lu', 'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Vice-Governador', 'MA',
   'pre-candidato', 'pre-candidato', true, DATE '1981-07-05', 'Ensino médio completo', 'Artesão',
   ARRAY['TSE consulta_cand 2026, SQ 100002534191'], NOW()),
  ('prof-enfermeira-kaelly', 'Kaelly Virginia de Oliveira Saraiva', 'Prof. Enfermeira Kaelly', 'PSOL', 'Partido Socialismo e Liberdade', 'Vice-Governador', 'MS',
   'pre-candidato', 'pre-candidato', true, DATE '1970-01-05', 'Superior completo', 'Professor de Ensino Superior',
   ARRAY['TSE consulta_cand 2026, SQ 120002532256'], NOW()),
  ('ismar-marques', 'Ismar Aguiar Marques', 'Ismar Marques', 'NOVO', 'Partido Novo', 'Vice-Governador', 'PI',
   'pre-candidato', 'pre-candidato', true, DATE '1951-09-27', 'Superior completo', 'Servidor Público Civil Aposentado',
   ARRAY['TSE consulta_cand 2026, SQ 180002533957'], NOW()),
  ('washington-bandeira', 'Francisco Washington Bandeira Santos Filho', 'Washington Bandeira', 'PT', 'Partido dos Trabalhadores', 'Vice-Governador', 'PI',
   'pre-candidato', 'pre-candidato', true, DATE '1984-10-23', 'Superior completo', 'Advogado',
   ARRAY['TSE consulta_cand 2026, SQ 180002532986'], NOW()),
  ('baba', 'Anteomar Pereira da Silva', 'Babá', 'PL', 'Partido Liberal', 'Vice-Governador', 'RN',
   'pre-candidato', 'pre-candidato', true, DATE '1973-04-06', 'Superior completo', 'Agente Administrativo',
   ARRAY['TSE consulta_cand 2026, SQ 200002534441'], NOW()),
  ('larissa-rosado', 'Larissa Daniela Escossia Rosado', 'Larissa', 'PSB', 'Partido Socialista Brasileiro', 'Vice-Governador', 'RN',
   'pre-candidato', 'pre-candidato', true, DATE '1974-07-22', 'Superior completo', 'Administrador',
   ARRAY['TSE consulta_cand 2026, SQ 200002534002'], NOW()),
  ('naf-nascimento', 'Naftaly Pereira do Nascimento', 'Naf Nascimento', 'UP', 'Unidade Popular', 'Vice-Governador', 'RS',
   'pre-candidato', 'pre-candidato', true, DATE '1994-03-03', 'Ensino médio completo', 'Jornalista e Redator',
   ARRAY['TSE consulta_cand 2026, SQ 210002533354'], NOW()),
  ('priscila-felizola', 'Priscila Dias Silva Felizola', 'Priscila Felizola', 'REPUBLICANOS', 'Republicanos', 'Vice-Governador', 'SE',
   'pre-candidato', 'pre-candidato', true, DATE '1982-01-18', 'Superior completo', 'Advogado',
   ARRAY['TSE consulta_cand 2026, SQ 260002532011'], NOW())
ON CONFLICT (slug) DO NOTHING;

-- CORRECAO DE CARGO. roberto-claudio estava como 'Governador' e despublicado.
-- O registro de 2026 do Ceara o traz como VICE-GOVERNADOR na chapa de Ciro
-- Gomes, pelo Uniao Brasil (SQ 60002531352). Era dado errado, nao so ausencia:
-- com a politica de vice ligada, ele entra na superficie publica no cargo certo.
UPDATE public.candidatos
SET cargo_disputado = 'Vice-Governador',
    status = 'pre-candidato',
    situacao_candidatura = 'pre-candidato',
    publicavel = true,
    data_nascimento = COALESCE(data_nascimento, DATE '1975-08-15'),
    formacao = COALESCE(formacao, 'Superior completo'),
    profissao_declarada = COALESCE(profissao_declarada, 'Médico'),
    fonte_dados = (COALESCE(fonte_dados, ARRAY[]::text[]) || ARRAY['TSE consulta_cand 2026, SQ 60002531352']),
    ultima_atualizacao = NOW()
WHERE slug = 'roberto-claudio';;
