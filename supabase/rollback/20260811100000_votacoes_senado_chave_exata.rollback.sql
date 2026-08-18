-- Rollback exato da migration 20260811100000. Restaura o snapshot read-only de produção.
-- PRE-CONDICAO: execute antes o rollback 20260811100100, porque o snapshot
-- restaurado contem linhas do Senado com fonte e votacao_id_api nulos.
do $$
declare
  v_linhas integer;
  v_pares integer;
  v_assinatura_linhas text;
  v_assinatura_pares text;
begin
  if exists (
    select 1 from supabase_migrations.schema_migrations
     where version = '20260811100100'
  ) then
    raise exception 'rollback Senado recusado: execute antes o rollback 20260811100100';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
       where version = '20260811100000') <> 1 then
    raise exception 'rollback Senado recusado: ledger 20260811100000 ausente ou duplicado';
  end if;

  select count(*),
         md5(string_agg(
           concat_ws(chr(30), id::text, titulo, coalesce(descricao,'<null>'),
             coalesce(data_votacao::text,'<null>'), casa,
             coalesce(proposicao_id,'<null>'), coalesce(tema,'<null>'),
             coalesce(impacto_popular,'<null>'),
             to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),
             coalesce(fonte,'<null>'), coalesce(votacao_id_api,'<null>')),
           chr(31) order by id::text))
    into v_linhas, v_assinatura_linhas
    from public.votacoes_chave where casa='Senado';

  select count(*),
         md5(string_agg(
           concat_ws(chr(30), c.slug, v.votacao_id::text, v.voto,
             v.contradicao::text, coalesce(v.contradicao_descricao,'<null>')),
           chr(31) order by c.slug, v.votacao_id::text))
    into v_pares, v_assinatura_pares
    from public.votos_candidato v
    join public.votacoes_chave k on k.id=v.votacao_id
    join public.candidatos c on c.id=v.candidato_id
   where k.casa='Senado';

  if v_linhas <> 6 or v_pares <> 75
     or v_assinatura_linhas <> 'db7785f89d8a3ebe8796503141fa89d0'
     or v_assinatura_pares <> 'cbd5058dba59cb878be302826ce3ac7f' then
    raise exception
      'rollback Senado recusado: payload atual diverge da forward (linhas=%, pares=%, assinatura_linhas=%, assinatura_pares=%)',
      v_linhas, v_pares, v_assinatura_linhas, v_assinatura_pares;
  end if;
end $$;

delete from public.votos_candidato
where votacao_id in (select id from public.votacoes_chave where casa='Senado');
delete from public.votacoes_chave where casa='Senado';

insert into public.votacoes_chave
  (id,titulo,descricao,data_votacao,casa,proposicao_id,tema,impacto_popular,created_at,fonte,votacao_id_api)
values
  ('7e1bef47-3d91-4c7a-8f94-fa323c6bd5f1'::uuid, 'Codigo Florestal (2012)', 'Novo codigo florestal brasileiro', '2012-05-25'::date, 'Senado', null, 'Meio Ambiente', 'Define regras de preservacao em propriedades rurais', '2026-04-01T19:04:34.951424+00:00'::timestamptz, null, null),
  ('539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'Impeachment de Dilma', 'Votacao final do impeachment de Dilma Rousseff no Senado', '2016-08-31'::date, 'Senado', '126084', null, null, '2026-03-31T19:03:00.917203+00:00'::timestamptz, null, null),
  ('8d470dc1-3215-4af0-86b1-8405e31ae903'::uuid, 'Teto de Gastos (PEC 55)', 'Congelou investimentos em saude e educacao por 20 anos', '2016-12-13'::date, 'Senado', '127337', 'economia', 'Limitou gastos publicos em saude e educacao ate 2036', '2026-03-29T22:40:39.093628+00:00'::timestamptz, null, null),
  ('8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'Reforma da Previdencia', 'Aumentou idade minima de aposentadoria e tempo de contribuicao', '2019-10-22'::date, 'Senado', '137999', 'previdencia', 'Dificultou aposentadoria pra trabalhadores de baixa renda', '2026-03-29T22:40:39.093628+00:00'::timestamptz, null, null),
  ('a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'Autonomia do Banco Central', 'Deu mandato fixo ao presidente do BC, independente do presidente eleito', '2021-02-04'::date, 'Senado', '135147', 'economia', 'Politica monetaria fica blindada de decisoes democraticas', '2026-03-29T22:40:39.093628+00:00'::timestamptz, null, null),
  ('e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'Privatização da Eletrobras (Senado)', 'Aprovacao da MP que viabilizou a privatizacao da Eletrobras no Senado', '2021-06-17'::date, 'Senado', '146740', null, null, '2026-03-31T19:03:00.917203+00:00'::timestamptz, null, null),
  ('a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'Arcabouco Fiscal', 'Novo regime fiscal com metas de resultado primario e limite de gastos', '2023-08-22'::date, 'Senado', '157826', 'economia', 'Substitui Teto de Gastos por regra menos rigida mas ainda limita investimento social', '2026-03-29T22:40:39.093628+00:00'::timestamptz, null, null),
  ('b3dce7a7-bb51-4d96-8aa2-ee0240f76cf0'::uuid, 'Marco Temporal Terras Indigenas', 'Tese que limita demarcacao de terras indigenas', '2023-09-27'::date, 'Senado', null, 'Meio Ambiente', 'Afeta diretamente comunidades indigenas e politica ambiental', '2026-04-01T19:04:32.949538+00:00'::timestamptz, null, null),
  ('7fa2b07b-f390-4d0f-87d5-354a68b1c593'::uuid, 'Marco Temporal Indigena (Senado)', 'PL 490 - Marco temporal para demarcacao de terras indigenas', '2023-09-27'::date, 'Senado', '153517', null, null, '2026-03-31T19:03:00.917203+00:00'::timestamptz, null, null),
  ('05104fa6-e50a-46ed-9847-7f20d1637dab'::uuid, 'Reforma Tributaria (PEC 45/2019)', 'Reforma do sistema tributario nacional', '2023-11-08'::date, 'Senado', null, 'Economia', 'Alto impacto na carga tributaria de consumo', '2026-04-01T19:04:32.819503+00:00'::timestamptz, null, null),
  ('baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'Ofício "S" nº 25, de 2023 - Guilherme Augusto Caputo Bastos (CNJ)', 'Votação nominal do Ofício nº 25, de 2023, indicação de membro do Conselho Nacional de Justiça. Página oficial do Senado registra Renan Filho como presente/votante em 13/12/2023.', '2023-12-13'::date, 'Senado', '160914', 'indicação_autoridade', 'alto', '2026-04-11T17:45:21.222637+00:00'::timestamptz, null, null),
  ('e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'Reforma Tributaria', 'Unificou impostos (IBS+CBS), cashback pra baixa renda, transicao ate 2032', '2023-12-15'::date, 'Senado', '158930', 'economia', 'Simplifica impostos, potencial reducao de carga sobre pobres', '2026-03-29T22:40:39.093628+00:00'::timestamptz, null, null),
  ('6f1e4c1e-bf51-4a52-a2c1-98722dd6fe5d'::uuid, 'Marco Legal da IA (PL 2338/2023)', 'Regulamentação do uso de inteligência artificial no Brasil', '2024-12-10'::date, 'Senado', '157233', 'tecnologia', 'Primeiro marco legal para regular o uso de IA, com regras sobre transparência algorítmica e proteção de dados.', '2026-03-29T22:30:42.584795+00:00'::timestamptz, null, null);

with antigos(id,slug,votacao_id,voto,contradicao,contradicao_descricao,created_at) as (values
  ('2d96f570-d950-49f3-9fa7-332590c69a1f'::uuid, 'flavio-bolsonaro', '05104fa6-e50a-46ed-9847-7f20d1637dab'::uuid, 'não', true, 'Votou contra mesmo tendo defendido publicamente a medida', '2026-04-01T19:04:32.86142+00:00'::timestamptz),
  ('19c20ce8-a532-427e-92a4-bba15360b281'::uuid, 'magno-malta', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'ausente', false, null, '2026-05-30T20:42:01.179601+00:00'::timestamptz),
  ('7603cdbd-d742-4a69-a78d-59e28b207f02'::uuid, 'ronaldo-caiado', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'sim', false, null, '2026-04-01T01:31:09.476831+00:00'::timestamptz),
  ('3cb4aaef-0656-4410-b906-149f856a07ac'::uuid, 'ricardo-ferraco', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'não', false, null, '2026-04-01T01:32:15.031084+00:00'::timestamptz),
  ('5680c4db-02d5-4c5b-aeb7-ce6cb56be7fa'::uuid, 'omar-aziz', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'ausente', false, null, '2026-04-01T01:33:25.236489+00:00'::timestamptz),
  ('b913787e-736b-4028-be33-fbf80ad26c4c'::uuid, 'eduardo-braga', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'sim', false, null, '2026-04-01T01:33:43.07226+00:00'::timestamptz),
  ('fd45836d-fa5c-4ade-9ed6-01426bf11ba8'::uuid, 'joao-capiberibe', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'ausente', false, null, '2026-04-01T01:34:00.029991+00:00'::timestamptz),
  ('04f772c0-7353-4a75-9612-c94a9e92a2f0'::uuid, 'ataides-oliveira', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'sim', false, null, '2026-04-01T01:35:08.192245+00:00'::timestamptz),
  ('dc898137-b540-4389-92f3-8e4f1cda0f3c'::uuid, 'wilder-morais', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'não', false, null, '2026-04-01T01:35:32.673494+00:00'::timestamptz),
  ('08c5066c-8b4a-485e-86c7-978a870bf936'::uuid, 'wellington-fagundes', '539f836a-197b-4176-9861-d58759a5c73b'::uuid, 'sim', false, null, '2026-04-01T01:35:46.867354+00:00'::timestamptz),
  ('82831a08-b9d5-41c0-b2dd-325a1fa8a658'::uuid, 'ronaldo-caiado', '7e1bef47-3d91-4c7a-8f94-fa323c6bd5f1'::uuid, 'sim', true, 'Lider ruralista votou a favor de restricao ambiental por pressao da base', '2026-04-01T19:04:34.990157+00:00'::timestamptz),
  ('0dddb4d4-0247-4493-85e3-6a29fabcea3f'::uuid, 'simone-tebet', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-29T22:55:00.998065+00:00'::timestamptz),
  ('5c5aa351-b9fa-421e-aa2e-cb6d0ac294ed'::uuid, 'flavio-bolsonaro', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-29T22:55:14.639722+00:00'::timestamptz),
  ('5b0f2e81-c348-4260-9a8c-7bb050ebf598'::uuid, 'jorginho-mello', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'não', false, null, '2026-03-31T03:42:50.182926+00:00'::timestamptz),
  ('065b94f5-e232-4496-9ee5-74347b84fd84'::uuid, 'rodrigo-pacheco', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'ausente', false, null, '2026-03-31T15:37:09.0594+00:00'::timestamptz),
  ('96bec449-b096-426e-8c2e-0507d3f971ed'::uuid, 'eduardo-girao', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:37:36.51391+00:00'::timestamptz),
  ('9358e3b5-6b0c-42b2-8aac-be3e8bdea72f'::uuid, 'wellington-fagundes', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:41:26.377631+00:00'::timestamptz),
  ('a22fc763-ebba-4351-a728-65af577bb81d'::uuid, 'eduardo-braga', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:39:18.956502+00:00'::timestamptz),
  ('b9bd61bb-9aa7-4618-84ae-0160eb9a2bad'::uuid, 'confucio-moura', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:40:13.50013+00:00'::timestamptz),
  ('a8ba9f49-60ac-470e-8fae-db8abf74a577'::uuid, 'jayme-campos', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-05-30T20:41:54.201009+00:00'::timestamptz),
  ('bb29b4a9-8524-4270-9701-3e8d1a9e002c'::uuid, 'omar-aziz', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:38:50.490277+00:00'::timestamptz),
  ('272e1885-a6da-449d-8609-2123c9390802'::uuid, 'mailza-assis', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-08-03T16:12:28.549275+00:00'::timestamptz),
  ('af0d1e39-2267-4b27-ab2e-e6d74d3f5106'::uuid, 'marcos-rogerio', '8ccbfe61-0ede-409e-83a1-1c2cbdd0421d'::uuid, 'sim', false, null, '2026-03-31T15:39:59.311791+00:00'::timestamptz),
  ('00ea408f-9c4b-47d7-bb13-064919ad5700'::uuid, 'jayme-campos', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-05-30T20:41:53.272839+00:00'::timestamptz),
  ('c7076665-7c05-4864-8bc8-fb0a0a1e0d62'::uuid, 'jorginho-mello', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T03:42:50.922169+00:00'::timestamptz),
  ('e546d261-b140-449f-a3f6-837217e316ee'::uuid, 'flavio-bolsonaro', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-29T22:55:14.411782+00:00'::timestamptz),
  ('df7c608f-72b5-4d2c-aca0-b489b908cc08'::uuid, 'magno-malta', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-05-30T20:42:01.025348+00:00'::timestamptz),
  ('e3aabf1a-8289-4022-90a3-fd3ac24daaa2'::uuid, 'cleitinho', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:36:53.707276+00:00'::timestamptz),
  ('6b3941fb-128a-4264-a7a9-e4d2ad293c0f'::uuid, 'wilder-morais', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:41:13.550605+00:00'::timestamptz),
  ('ba16cb76-be8f-437e-9eae-0c649d91c6a5'::uuid, 'rodrigo-pacheco', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'ausente', false, null, '2026-03-31T15:37:09.949498+00:00'::timestamptz),
  ('c8fe4b0c-98eb-4e5c-9411-c30a96bea26e'::uuid, 'omar-aziz', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:38:51.329968+00:00'::timestamptz),
  ('b66f9199-ff9a-418b-8061-fbde08de2e0b'::uuid, 'marcos-rogerio', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:40:00.091441+00:00'::timestamptz),
  ('b6369876-1e82-46e1-bf69-3b4b37906be6'::uuid, 'eduardo-girao', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:37:37.313423+00:00'::timestamptz),
  ('c319b661-c7d6-43f0-bd18-dc331ae255b6'::uuid, 'efraim-filho', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'sim', false, null, '2026-03-31T15:38:02.721037+00:00'::timestamptz),
  ('dff8491d-ca91-4255-80bc-11d70a737025'::uuid, 'wellington-fagundes', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:41:26.878495+00:00'::timestamptz),
  ('ae155e7f-9735-4608-93c1-880894024e6c'::uuid, 'alan-rick', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'sim', false, null, '2026-03-31T15:38:37.701991+00:00'::timestamptz),
  ('1f464e20-c0c2-47a7-ab47-67f6e9f2b59d'::uuid, 'eduardo-braga', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:39:19.693395+00:00'::timestamptz),
  ('ae28bc98-cb43-4b6e-b49e-ccd3a8452e7a'::uuid, 'beto-faro', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:39:46.97825+00:00'::timestamptz),
  ('1197da8f-199d-41b9-86a4-227a43c5f90e'::uuid, 'confucio-moura', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'ausente', false, null, '2026-03-31T15:40:14.498163+00:00'::timestamptz),
  ('4adec437-e4bb-479c-9ca7-f149444eca7b'::uuid, 'professora-dorinha', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'não', false, null, '2026-03-31T15:40:27.37564+00:00'::timestamptz),
  ('6b14e540-6732-4e6c-86f4-c6f66ae367bb'::uuid, 'sergio-moro-gov-pr', 'a145eff6-be34-4550-a7d3-8394a899262b'::uuid, 'sim', false, null, '2026-04-01T23:34:44.39582+00:00'::timestamptz),
  ('f5bbe49a-4151-470e-a293-e092d21ad2e1'::uuid, 'simone-tebet', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-29T22:55:02.229184+00:00'::timestamptz),
  ('1ebdcc8e-9df9-4aba-90d5-37d6e374b3f9'::uuid, 'flavio-bolsonaro', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-29T22:55:15.154919+00:00'::timestamptz),
  ('67854b44-acdd-4d71-a975-e749cfdd69c5'::uuid, 'jorginho-mello', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'ausente', false, null, '2026-03-31T03:42:50.541236+00:00'::timestamptz),
  ('d3dbe127-faf3-40b3-a9c9-7de7a388ac48'::uuid, 'omar-aziz', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:38:50.987812+00:00'::timestamptz),
  ('7c2c7dd4-9e51-4d0c-9280-8763e318aeac'::uuid, 'rodrigo-pacheco', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:37:09.547746+00:00'::timestamptz),
  ('f3b2310e-d14d-41fe-9a5b-a9c0a5563746'::uuid, 'marcos-rogerio', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:39:59.818759+00:00'::timestamptz),
  ('fce2aba9-287c-4bf3-b96c-6f9f2d873ac0'::uuid, 'eduardo-girao', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:37:36.996858+00:00'::timestamptz),
  ('ba8cfd58-ac19-41d7-86c9-64e5bfbd36fc'::uuid, 'wellington-fagundes', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:41:26.482343+00:00'::timestamptz),
  ('79b39f3a-e3fa-4524-9e53-31009fb34c4f'::uuid, 'eduardo-braga', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:39:19.45027+00:00'::timestamptz),
  ('e576a28a-1517-41f3-be8d-7bd895438fbd'::uuid, 'confucio-moura', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-03-31T15:40:14.099732+00:00'::timestamptz),
  ('0beae739-76f9-4962-93e8-d37020a07bac'::uuid, 'mailza-assis', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'ausente', false, null, '2026-08-03T16:12:28.549275+00:00'::timestamptz),
  ('71d32c8d-ddcc-44f4-adf8-bbecc4e27b14'::uuid, 'jayme-campos', 'a8b40599-746f-418a-810e-4bbaa1894847'::uuid, 'sim', false, null, '2026-05-30T20:41:54.787003+00:00'::timestamptz),
  ('394fc7e4-dab5-4502-8172-ca3e59149ea5'::uuid, 'flavio-bolsonaro', 'b3dce7a7-bb51-4d96-8aa2-ee0240f76cf0'::uuid, 'sim', false, null, '2026-04-01T19:04:32.990104+00:00'::timestamptz),
  ('dd6e373e-94d2-4e59-9692-5f4aeba213e4'::uuid, 'cleitinho', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-13T12:33:40.449105+00:00'::timestamptz),
  ('1299e15a-5ced-4a7d-9e98-f5a00efd7986'::uuid, 'wilder-morais', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-13T12:34:40.76221+00:00'::timestamptz),
  ('e764df55-48c1-4db3-a980-e3329f318c77'::uuid, 'magno-malta', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-05-30T20:42:01.436676+00:00'::timestamptz),
  ('daee4c62-5f15-4b70-9893-b0a02a7ea092'::uuid, 'omar-aziz', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-13T12:34:13.115715+00:00'::timestamptz),
  ('ae6a257b-b129-493b-a58d-02a1b382a690'::uuid, 'eduardo-girao', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-13T12:33:56.174733+00:00'::timestamptz),
  ('adc749a5-a0b5-4d14-a848-7283a0239a99'::uuid, 'eduardo-braga', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-13T12:34:29.067499+00:00'::timestamptz),
  ('5b488835-813c-452e-bb38-3f46eb43dafc'::uuid, 'renan-filho', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-04-11T17:45:21.283162+00:00'::timestamptz),
  ('a8c391a4-877f-4eb7-b53e-3a4a0cd66256'::uuid, 'jayme-campos', 'baa22462-3a16-4f2b-9c4b-9a1ad9e54ee6'::uuid, 'sim', false, null, '2026-05-30T20:41:54.109589+00:00'::timestamptz),
  ('5e6bdc35-f9b7-4497-a329-c00e2b99379d'::uuid, 'jorginho-mello', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T03:42:50.752421+00:00'::timestamptz),
  ('d21b9ee7-5054-472e-824a-ef92677527f1'::uuid, 'flavio-bolsonaro', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-03-29T22:55:14.210243+00:00'::timestamptz),
  ('5d127209-6fe8-4572-8b62-4180c80772a2'::uuid, 'cleitinho', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-03-31T15:36:53.225364+00:00'::timestamptz),
  ('6c62e604-2fae-490e-9e8c-801c5a36e963'::uuid, 'omar-aziz', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:38:51.136146+00:00'::timestamptz),
  ('1d0bf727-04e6-436b-9220-4de99bb7b63f'::uuid, 'rodrigo-pacheco', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'ausente', false, null, '2026-03-31T15:37:09.686051+00:00'::timestamptz),
  ('d7504025-4036-427e-aab5-86ab7f2d138c'::uuid, 'magno-malta', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-05-30T20:42:01.222501+00:00'::timestamptz),
  ('d1aed31f-19a6-4778-87da-cdf3d483af4b'::uuid, 'marcos-rogerio', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'ausente', false, null, '2026-03-31T15:39:59.908389+00:00'::timestamptz),
  ('306a1dfe-abad-4677-89e3-743def0d7139'::uuid, 'eduardo-girao', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-03-31T15:37:37.07133+00:00'::timestamptz),
  ('2ce5adda-560f-4753-ae5f-e74c4842aff5'::uuid, 'jayme-campos', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-05-30T20:41:53.70414+00:00'::timestamptz),
  ('9a2e876e-74e2-4898-b323-5d3cb96cb896'::uuid, 'efraim-filho', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:38:02.493466+00:00'::timestamptz),
  ('284e9b5a-5465-4d6a-92ac-f18dd56cc74f'::uuid, 'wellington-fagundes', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-03-31T15:41:26.575323+00:00'::timestamptz),
  ('27da4717-4319-43e4-9ade-f7f52fdd1a5c'::uuid, 'alan-rick', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:38:37.377938+00:00'::timestamptz),
  ('017a44d3-d20c-47f7-b04d-bee0b19983e2'::uuid, 'eduardo-braga', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:39:19.520288+00:00'::timestamptz),
  ('078be2fa-0bad-4f93-990a-9d9303b37418'::uuid, 'confucio-moura', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:40:14.198942+00:00'::timestamptz),
  ('e235b506-7799-490b-9e9b-6b31c061ef87'::uuid, 'beto-faro', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:39:46.742871+00:00'::timestamptz),
  ('a4e56de0-f008-4353-8f95-d055e62504a4'::uuid, 'professora-dorinha', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'sim', false, null, '2026-03-31T15:40:27.105457+00:00'::timestamptz),
  ('4b6f9aef-9692-4963-8218-1973b4b942bd'::uuid, 'wilder-morais', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-03-31T15:41:13.270331+00:00'::timestamptz),
  ('5aa3fd99-cc91-4f23-88ad-a093fab34c4a'::uuid, 'sergio-moro-gov-pr', 'e473c35a-fe74-4bd0-b3e9-02604fbe2e9f'::uuid, 'não', false, null, '2026-04-01T23:34:44.023286+00:00'::timestamptz),
  ('c05a432b-ad06-4ef8-aed6-2787b1cbbf28'::uuid, 'mailza-assis', 'e586da0e-3d1e-4f4c-93cd-3c696417f627'::uuid, 'sim', false, null, '2026-08-03T16:12:28.549275+00:00'::timestamptz)
)
insert into public.votos_candidato
  (id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at)
select a.id,c.id,a.votacao_id,a.voto,a.contradicao,a.contradicao_descricao,a.created_at
from antigos a join public.candidatos c on c.slug=a.slug;

do $$ begin
  if (select count(*) from public.votacoes_chave where casa='Senado') <> 13 then raise exception 'rollback Senado: esperado 13 linhas'; end if;
  if (select count(*) from public.votos_candidato v join public.votacoes_chave k on k.id=v.votacao_id where k.casa='Senado') <> 81 then raise exception 'rollback Senado: esperado 81 pares'; end if;
end $$;

delete from supabase_migrations.schema_migrations
 where version = '20260811100000';
