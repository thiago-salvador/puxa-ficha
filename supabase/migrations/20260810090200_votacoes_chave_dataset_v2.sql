-- Item 7: dataset editorial v2 de votações-chave. 12 matérias da Câmara, cada
-- uma endereçada pela votação exata.
--
-- ## Como as 13 foram escolhidas
--
-- Decisão editorial registrada em `QA/2026-08-10-item7-decisao-editorial-v2.md`.
-- Duas réguas objetivas, aplicadas sem exceção:
--
--   1. Só entra votação cuja MINORIA tenha ao menos 10% dos votos nominais.
--      Abaixo disso a votação não separa candidatos, que é a única função dela
--      numa ficha. Foi por essa régua que saíram a cassação de Eduardo Cunha
--      (450x10, minoria de 2,2%) e a jornada de 36 horas (472x22, 4,5%).
--   2. A rodada é a que decide a matéria que o rótulo anuncia, não a de maior
--      participação. Em PEC de dois turnos, o segundo. Em projeto, a que aprova
--      o texto como um todo.
--
-- Ficaram de fora, em PENDENTE, três matérias em que nenhuma rodada decide o que
-- o rótulo anunciaria: PEC 182/2007, PL 3855/2019 (as 10 Medidas) e PL 5587/2016.
--
-- ## Sobre o texto de `descricao`
--
-- Cada linha diz o que SIM significa, e isso não é enfeite. Em duas delas o
-- rótulo sem o verbo inverteria o sentido do voto para quem lê:
--
--   - Temer (`2143164-138`): o que se aprovou foi o parecer pelo INDEFERIMENTO,
--     então SIM é barrar o processo criminal, não autorizá-lo.
--   - SAP 1/2025 (`2494565-52`): SIM é SUSPENDER a ação penal em curso.
--
-- Nenhuma `descricao` extrapola a ementa oficial. Onde a ementa não diz o
-- conteúdo (o Decreto 12.466/2025 do PDL 214/2025, por exemplo), a linha nomeia
-- o decreto e para aí, em vez de afirmar do que ele trata.
--
-- ## Endereçamento
--
-- `fonte` + `votacao_id_api` é a chave criada em `20260810090000`. Todo
-- `proposicao_id` abaixo foi lido de `proposicoesAfetadas` no endpoint de
-- detalhe da votação, não deduzido do prefixo do id: no PL das Fake News o
-- prefixo era `2310837` e a proposição, `2256735`.
-- SEM `BEGIN;`/`COMMIT;` próprios: o aplicador envolve migration e ledger na
-- mesma transação externa.

-- RETIRADA ANTES DE APLICAR: a denúncia criminal contra Michel Temer
-- (votação 2143164-138, 02/08/2017, 263 a 227) estava entre as 13 aprovadas e
-- saiu no dry-run de 10/08/2026, por medição e não por juízo editorial: o
-- endpoint /votacoes/2143164-138/votos devolve `dados: []`. O placar existe na
-- descrição oficial, mas a Câmara não publicou a lista de votos individuais
-- desse id, então a matéria não atribui voto a candidato nenhum e entraria como
-- linha morta. Fica em PENDENTE em QA/2026-08-10-item7-decisao-editorial-v2.md.
-- Quando voltar, a `descricao` tem de dizer que SIM barra a abertura do
-- processo criminal, porque o que se aprovou foi o parecer pelo indeferimento.

-- @write tabela=votacoes_chave ref=14493-503 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Redução da maioridade penal (1º turno)',
   'SIM é a favor de reduzir a maioridade penal de 18 para 16 anos. A Câmara aprovou a Emenda Aglutinativa nº 16 em primeiro turno, um dia depois de rejeitar o substitutivo da comissão especial. Placar 323 a 155.',
   '2015-07-01', 'Câmara', 'camara', '14493-503', '14493', 'seguranca',
   'Muda a idade a partir da qual um adolescente responde como adulto.');

-- @write tabela=votacoes_chave ref=2123843-93 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Vaquejada e práticas desportivas com animais (2º turno)',
   'SIM é a favor de acrescentar dispositivo à Constituição determinando que práticas desportivas que utilizem animais não são consideradas cruéis. Aprovada em segundo turno. Placar 373 a 50.',
   '2017-05-31', 'Câmara', 'camara', '2123843-93', '2123843', 'meio_ambiente',
   'Retira da proteção contra crueldade práticas como a vaquejada.');

-- @write tabela=votacoes_chave ref=340812-195 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Criação da Comissão da Mulher, do Idoso, da Criança, do Adolescente, da Juventude e Minorias',
   'SIM é a favor de criar a comissão permanente na Câmara. Aprovado o substitutivo adotado pela Mesa Diretora ao Projeto de Resolução nº 8 de 2007. Placar 221 a 167.',
   '2016-04-27', 'Câmara', 'camara', '340812-195', '340812', 'direitos_sociais',
   'Dá estrutura permanente às pautas de mulheres, idosos, crianças e minorias.');

-- @write tabela=votacoes_chave ref=2270800-135 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Prerrogativas parlamentares (PEC 3/2021, 1º turno)',
   'SIM é a favor do texto que altera os arts. 14, 27, 53, 102 e 105 da Constituição para dispor sobre as prerrogativas de deputados e senadores. Substitutivo reformulado aprovado em primeiro turno. Placar 353 a 134.',
   '2025-09-16', 'Câmara', 'camara', '2270800-135', '2270800', 'justica',
   'Muda as regras de proteção jurídica dos próprios parlamentares.');

-- @write tabela=votacoes_chave ref=2515648-44 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Sustação do Decreto 12.466/2025',
   'SIM é a favor de sustar os efeitos do Decreto nº 12.466, de 22 de maio de 2025, nos termos do art. 49, V, da Constituição. Aprovado o substitutivo da CCJ ao projeto de decreto legislativo. Placar 383 a 98.',
   '2025-06-25', 'Câmara', 'camara', '2515648-44', '2515648', 'economia',
   'Derruba um ato do Executivo por decisão do Congresso.');

-- @write tabela=votacoes_chave ref=2351506-122 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Imunidade tributária de templos e entidades (2º turno)',
   'SIM é a favor de acrescentar o § 4º-A ao art. 150 da Constituição, sobre a imunidade tributária de que tratam as alíneas b e c do inciso VI. Aprovada em segundo turno. Placar 368 a 96.',
   '2026-05-28', 'Câmara', 'camara', '2351506-122', '2351506', 'economia',
   'Amplia o alcance da isenção de impostos de templos e entidades.');

-- @write tabela=votacoes_chave ref=2383019-54 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Número de deputados por estado',
   'SIM é a favor do substitutivo que altera a Lei Complementar nº 78, de 1993, que define a distribuição de cadeiras na Câmara entre os estados. Placar 270 a 207.',
   '2025-05-06', 'Câmara', 'camara', '2383019-54', '2383019', 'institucional',
   'Redistribui o peso de cada estado na Câmara dos Deputados.');

-- @write tabela=votacoes_chave ref=2473389-58 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Contenção de despesas e regime fiscal',
   'SIM é a favor do substitutivo que altera a Lei Complementar nº 200, de 2023, do regime fiscal sustentável. Placar 318 a 149.',
   '2024-12-17', 'Câmara', 'camara', '2473389-58', '2473389', 'economia',
   'Define quanto o governo pode gastar e onde precisa cortar.');

-- @write tabela=votacoes_chave ref=2494565-52 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Sustação do andamento de ação penal contra deputado',
   'SIM suspende o andamento da ação penal. A Câmara aprovou o parecer da CCJ à Sustação de Andamento de Ação Penal nº 1, de 2025, pela sustação. Placar 315 a 143.',
   '2025-05-07', 'Câmara', 'camara', '2494565-52', '2494565', 'justica',
   'Trava um processo criminal já em curso contra um parlamentar.');

-- @write tabela=votacoes_chave ref=2430143-140 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Regulamentação da reforma tributária (IBS e CBS)',
   'SIM é a favor dos dispositivos do substitutivo do Senado ao PLP 68/2024, que institui o Imposto sobre Bens e Serviços, a Contribuição Social sobre Bens e Serviços e o Imposto Seletivo, com parecer pela aprovação. Placar 324 a 123.',
   '2024-12-17', 'Câmara', 'camara', '2430143-140', '2430143', 'economia',
   'Define como os novos impostos da reforma tributária vão funcionar.');

-- @write tabela=votacoes_chave ref=2409076-34 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Incentivo à permanência de estudantes no ensino médio',
   'SIM é a favor de aprovar o projeto que dispõe sobre as despesas do programa de incentivo à permanência de estudantes no ensino médio. Placar 370 a 77.',
   '2023-12-13', 'Câmara', 'camara', '2409076-34', '2409076', 'educacao',
   'Cria a base de gasto do programa que paga estudantes para não abandonar a escola.');

-- @write tabela=votacoes_chave ref=2324721-94 campos=titulo,descricao,data_votacao,casa,fonte,votacao_id_api,proposicao_id,tema,impacto_popular
insert into public.votacoes_chave
  (titulo, descricao, data_votacao, casa, fonte, votacao_id_api, proposicao_id, tema, impacto_popular)
values ('Silvicultura fora do rol de atividades poluidoras',
   'SIM é a favor de excluir a silvicultura do rol de atividades potencialmente poluidoras, alterando o Anexo VIII da Lei nº 6.938, de 1981. Placar 309 a 131.',
   '2024-05-08', 'Câmara', 'camara', '2324721-94', '2324721', 'meio_ambiente',
   'Tira o plantio comercial de árvores do controle ambiental que hoje o alcança.');

-- Fail-closed: 12 linhas, nem uma a mais nem a menos, e nenhuma sem chave.
do $$
declare
  n integer;
  sem_chave integer;
begin
  select count(*) into n
    from public.votacoes_chave where fonte = 'camara' and votacao_id_api is not null;
  if n <> 12 then
    raise exception 'dataset v2: esperadas 12 votacoes da camara com chave, encontradas %', n;
  end if;

  select count(*) into sem_chave
    from public.votacoes_chave where fonte = 'camara' and votacao_id_api is null;
  if sem_chave <> 0 then
    raise exception 'dataset v2: % linha(s) de fonte camara sem votacao_id_api', sem_chave;
  end if;
end $$;
