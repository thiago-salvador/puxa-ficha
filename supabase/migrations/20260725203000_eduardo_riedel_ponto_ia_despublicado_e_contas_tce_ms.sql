-- =====================================================================
-- eduardo-riedel: despublica o ponto gerado por IA e poe no lugar a decisao
-- do TCE-MS sobre as contas de 2024.
--
-- SITUACAO ATUAL DA FICHA (medida em 2026-07-25)
--
-- Um unico ponto visivel, deb688ca-08e9-498f-bad7-8588060d008e:
--   titulo    'Carreira política: 1 mandato(s) registrado(s)'
--   descricao 'Eduardo Correa Riedel (PP) possui 1 mandato(s) registrado(s):
--              Governador (MS).'
--   categoria feito_positivo | gravidade baixa | visivel true
--   verificado false | gerado_por 'ia'
--   fontes    homepages nuas de camara.leg.br e senado.leg.br
--
-- POR QUE DESPUBLICAR, MESMO DEPOIS DA MIGRATION 20260725120000
--
-- Aquela migration troca as duas homepages nuas por uma URL do MPMS com
-- caminho, que responde HTTP 200 e prova a posse dele como governador. Isso
-- conserta o LINK, nao a CLAIM. Tres coisas continuam de pe:
--   1. A afirmacao publicada e uma tautologia sem valor informativo: diz que o
--      governador tem um mandato de governador. A propria ficha ja exibe
--      cargo_atual = 'Governador do Mato Grosso do Sul'.
--   2. A contagem "1 mandato(s)" continua com verificado = false e nunca foi
--      conferida contra fonte nenhuma. A fonte nova prova a posse, nao o total.
--   3. As duas fontes originais eram Camara dos Deputados e Senado Federal,
--      casas onde ele nunca teve mandato. O texto foi gerado por IA a partir de
--      bases que nao contem o candidato. A origem do erro nao some quando o
--      link e trocado.
--
-- Enquanto esse ponto ocupa sozinho a area de conteudo da ficha, ele ocupa o
-- lugar de informacao de controle publico de verdade. Ele sai e entra a
-- decisao do tribunal de contas, que e verificavel, datada e nominal.
--
-- NADA E DELETADO: visivel = false, com motivo gravado em coluna propria
-- (despublicacao_motivo, criada em 20260725153000) e tambem em
-- dados_relacionados, no mesmo formato das etapas 1A e 1B. Reversivel
-- invertendo visivel.
--
-- ORDEM IMPORTA: timestamp posterior a 20260725120000 (que mexe nas fontes
-- deste id) e a 20260725153000 (que cria a coluna despublicacao_motivo).
--
-- ---------------------------------------------------------------------
-- FONTE DO PONTO NOVO, TESTADA POR MIM COM curl -L --compressed E
-- USER-AGENT DE NAVEGADOR EM 2026-07-25.
--
-- M1  https://www.tce.ms.gov.br/noticias/detalhes/8018/tce-ms-aprova-contas-de-2024-do-governo-do-estado
--     Tribunal de Contas do Estado de Mato Grosso do Sul, noticia
--     institucional de 29/05/2025. HTTP 200, 42400 bytes.
--     Trechos literais:
--       "Os conselheiros acompanharam, por unanimidade, o voto do relator,
--        conselheiro Marcio Monteiro, manifestando a emissão de parecer prévio
--        pela aprovação, com ressalvas e recomendações, das contas apresentadas
--        pelo governador Eduardo Corrêa Riedel."
--       "A avaliação da Corte de Contas servirá de auxílio para o julgamento
--        que será realizado pela Assembleia Legislativa de Mato Grosso do Sul."
--       "As contas do Governo do Estado, referentes ao exercício de 2024, foram
--        aprovadas pelos conselheiros do Tribunal de Contas de Mato Grosso do Sul
--        na Sessão Ordinária Anual Específica do Tribunal Pleno"
--
--     A segunda frase entra na descricao de proposito. Sem ela, "contas
--     aprovadas" vira afirmacao mais forte do que a fonte permite: parecer
--     previo nao encerra o julgamento, quem julga e a Assembleia.
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select p.id, c.slug, p.titulo, p.descricao, p.categoria, p.gravidade,
--          p.visivel, p.verificado, p.gerado_por
--     from pontos_atencao p join candidatos c on c.id = p.candidato_id
--    where c.slug = 'eduardo-riedel';
--   -- 1 linha, exatamente a descrita acima, visivel = true.
--
--   select id, slug, partido_sigla, cargo_atual from candidatos
--    where slug = 'eduardo-riedel';
--   -- 27f37162-6a32-4e9b-8f41-f30a9e569384 | eduardo-riedel | PP |
--   --   Governador do Mato Grosso do Sul
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO:
--     select p.id, p.titulo, p.categoria, p.visivel, p.verificado, p.gerado_por
--       from pontos_atencao p join candidatos c on c.id = p.candidato_id
--      where c.slug = 'eduardo-riedel' order by p.visivel desc;
--     -- 2 linhas:
--     --   7ce00001-... | 'TCE-MS emitiu parecer prévio pela aprovação das contas de 2024'
--     --                | feito_positivo | true  | true  | curadoria
--     --   deb688ca-... | 'Carreira política: 1 mandato(s) registrado(s)'
--     --                | feito_positivo | false | false | ia
--
--     select count(*) from pontos_atencao
--      where despublicacao_motivo is not null
--        and id = 'deb688ca-08e9-498f-bad7-8588060d008e';
--     -- esperado: 1
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Despublicacao do ponto gerado por IA
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set visivel = false,
       despublicacao_motivo = 'Ponto gerado por IA, verificado = false, cuja afirmacao ("possui 1 mandato(s) registrado(s): Governador (MS)") nao acrescenta informacao ao cargo_atual ja exibido na ficha e cuja contagem de mandatos nunca foi conferida. As duas fontes originais eram as homepages nuas da Camara dos Deputados e do Senado Federal, casas onde o candidato nunca teve mandato. Substituido pela decisao do TCE-MS sobre as contas de 2024, com fonte primaria nominal. Auditoria de integridade de 2026-07-25.',
       despublicado_em = coalesce(despublicado_em, timestamptz '2026-07-25 00:00:00-03'),
       dados_relacionados = coalesce(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
         'despublicacao_2026_07_25', jsonb_build_object(
           'motivo', 'claim de IA sem valor informativo e sem verificacao; fontes originais eram homepages nuas de orgaos onde o candidato nunca teve mandato',
           'substituido_por', '7ce00001-0725-4a00-8e01-000000000001',
           'reversivel', true
         )
       )
 where id = 'deb688ca-08e9-498f-bad7-8588060d008e'::uuid
   and visivel = true;

-- ---------------------------------------------------------------------
-- 2. Ponto novo, com fonte primaria de tribunal de contas
-- ---------------------------------------------------------------------
-- gravidade 'baixa': e um feito positivo com ressalvas, nao uma acusacao.
-- categoria 'feito_positivo': a decisao e favoravel ao gestor. As ressalvas e o
-- fato de o julgamento nao estar encerrado estao no corpo da descricao, nao
-- como ponto de atencao separado, porque a fonte nao detalha quais foram as
-- ressalvas. Abrir um ponto negativo generico a partir de "com ressalvas"
-- seria inflar a ficha com o que a fonte nao diz.
insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00001-0725-4a00-8e01-000000000001'::uuid,
  '27f37162-6a32-4e9b-8f41-f30a9e569384'::uuid,
  'feito_positivo',
  'TCE-MS emitiu parecer prévio pela aprovação das contas de 2024',
  'Em 29 de maio de 2025, o Tribunal de Contas do Estado de Mato Grosso do Sul aprovou, por unanimidade, o voto do relator pela emissão de parecer prévio favorável às contas do exercício de 2024 apresentadas pelo governador Eduardo Corrêa Riedel, com ressalvas e recomendações. O parecer prévio não encerra o processo: segundo o próprio tribunal, a avaliação serve de auxílio ao julgamento, que cabe à Assembleia Legislativa de Mato Grosso do Sul.',
  '[{"url":"https://www.tce.ms.gov.br/noticias/detalhes/8018/tce-ms-aprova-contas-de-2024-do-governo-do-estado","data":"2025-05-29","titulo":"TCE-MS aprova contas de 2024 do Governo do Estado"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2025-05-29'
)
on conflict (id) do nothing;

commit;
