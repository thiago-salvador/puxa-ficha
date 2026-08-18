-- =====================================================================
-- Enriquecimento: decisoes de tribunal de contas sobre contas de governo e de
-- prefeitura, com fonte primaria institucional. Tres candidatos publicaveis.
--
-- O QUE ENTRA
--   rafael-fonteles  TCE-PI, contas do Executivo estadual, exercicio 2023
--                    (1 ponto positivo + 1 ponto de atencao, mesma decisao)
--   jorginho-mello   TCE-SC, contas do Governo do Estado, exercicios 2024 e 2025
--                    (1 ponto positivo + 1 ponto de atencao)
--   acm-neto         TCM-BA, contas da Prefeitura de Salvador, exercicios 2013 e 2017
--                    (2 pontos positivos + 2 pontos de atencao)
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Nenhum dos tres tem hoje qualquer informacao de controle externo na ficha.
-- Estado medido em 2026-07-25:
--   rafael-fonteles: 1 ponto visivel (MP Eleitoral), 0 processos, 0 sancoes
--   jorginho-mello : 3 pontos visiveis, 2 deles gerados por IA
--   acm-neto       : 0 pontos visiveis, 551 noticias associadas. E a ficha com
--                    maior visibilidade e menor lastro documental do conjunto.
--
-- EQUILIBRIO EDITORIAL, EXPLICITO
--
-- Toda decisao de contas aqui tem duas faces e as duas sao publicadas a partir
-- da MESMA fonte: o resultado favoravel e as ressalvas ou irregularidades
-- apontadas pela area tecnica. Publicar so a aprovacao seria propaganda;
-- publicar so a ressalva seria acusacao. O projeto ja separa as duas coisas em
-- categorias distintas desde
-- 20260403121500_split_positive_points_from_alerts.sql, onde
-- categoria = 'feito_positivo' fica fora da contagem de alertas das views
-- v_ficha_candidato e v_comparador. Este arquivo respeita essa separacao:
-- cada par entra com um lado em cada categoria.
--
-- Nenhum ponto de atencao foi criado a partir de formula generica. Onde a
-- fonte diz apenas "com ressalvas" sem listar quais (caso do TCE-MS, tratado
-- em 20260725203000), a ressalva ficou dentro da descricao do ponto positivo,
-- nao virou ponto separado.
--
-- GRAVIDADE: todos em 'baixa' ou 'media'. Nenhum e 'alta' ou 'critica', entao
-- nenhum passa pelo gate estrito de 20260725160000. Mesmo assim, todos entram
-- com fonte de URL com caminho e verificado = true, que e o que aquele gate
-- exigiria se fossem graves.
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25. Status e tamanho observados nesta sessao, nao herdados.
--
-- C1  https://www.tcepi.tc.br/tce-pi-aprova-contas-de-governo-do-poder-executivo-estadual-no-exercicio-2023/
--     Tribunal de Contas do Estado do Piaui. HTTP 200, 113415 bytes.
--     Trechos literais:
--       "Por unanimidade dos membros da Corte, as contas do Governo do Estado
--        referentes a 2023, cujo gestor responsável foi Rafael Tajra Fonteles,
--        foram julgadas regulares."
--       "Entre os achados, a equipe técnica da Diretoria de Fiscalização de
--        Gestão e Contas Públicas (DFCONTAS) constatou ineficiência no
--        planejamento da concessão de renúncia de receitas, descumprimento das
--        condições estabelecidas para concessão ou ampliação do benefício de
--        natureza tributária, ausência de transparência na política pública de
--        renúncia, ausência dos registros da renúncia no Sistema Integrado de
--        Administração Financeira do Estado (SIAFE), início indevido de novos
--        projetos antes de atendidos os que estavam em andamento, pagamentos
--        sem prévio empenho, inconsistências no balanço financeiro e
--        patrimonial, além do envio fora do prazo, e de forma incompleta,
--        alguns documentos da prestação de contas."
--       "O Ministério Público de Contas do Piauí (MPC-PI) recomendou a aprovação
--        das contas do Poder Executivo Estadual e acolheu as determinações
--        propostas pela equipe técnica."
--
-- C2  https://www.tcesc.tc.br/tcesc-emite-parecer-previo-pela-aprovacao-das-contas-de-2024-do-governador-do-estado
--     Tribunal de Contas de Santa Catarina, decisao de 04/06/2025.
--     HTTP 200, 216654 bytes. Trechos literais:
--       "o Tribunal de Contas de Santa Catarina (TCE/SC) emitiu, em sessão
--        extraordinária híbrida do Pleno desta quarta-feira (4/6), parecer
--        prévio pela aprovação das contas do Governo do Estado relativas ao
--        exercício de 2024, de reponsabilidade do governador Jorginho Mello.
--        Houve duas ressalvas e 16 recomendações."   [sic "reponsabilidade"]
--       "O exercício de 2024 foi marcado pelo amplo cumprimento dos limites
--        constitucionais e fiscais, com superávit financeiro, elevada
--        disponibilidade de caixa e investimentos recordes na Saúde"
--        (voto do relator, conselheiro Luiz Eduardo Cherem, Processo @24/00590502)
--
-- C3  https://www.tcesc.tc.br/tcesc-emite-parecer-previo-pela-aprovacao-das-contas2025-do-governo-do-estado-mas-faz-ressalva
--     Tribunal de Contas de Santa Catarina, decisao de 03/06/2026, pagina
--     atualizada em 08/06/2026. HTTP 200, 225102 bytes. Trechos literais:
--       "parecer prévio pela aprovação das contas do Governo do Estado relativas
--        ao exercício de 2025. Por unanimidade, foi aprovado o voto do relator
--        do processo ( PCG 25/00148666 ), conselheiro Luiz Roberto Herbst, que
--        fez uma ressalva ao Executivo, diante da realização de despesa sem
--        prévio empenho, no valor de R$ 227,02 milhões, e 21 recomendações"
--       "o secretário, Cleverson Siewert, que representou o governador Jorginho Mello"
--     RESSALVA METODOLOGICA DECLARADA: nesta materia de 2026, a frase que
--     descreve o parecer fala em "Governo do Estado", nao no nome do
--     governador. Jorginho Mello aparece nomeado na mesma pagina, mas em outro
--     trecho. Por isso a descricao do ponto de atencao correspondente fala em
--     contas do Governo do Estado sob a gestao dele, e nao em conduta pessoal.
--
-- C4  https://www.tcm.ba.gov.br/tcm-aprova-com-ressalvas-contas-da-prefeitura-de-salvador/
--     Tribunal de Contas dos Municipios da Bahia, 03/12/2014.
--     HTTP 200, 248911 bytes. Trecho literal:
--       "Na sessão desta quarta-feira (03/12), o Tribunal de Contas dos
--        Municípios aprovou com ressalvas as contas do prefeito de Salvador,
--        Antônio Carlos Peixoto de Magalhães Neto, referentes ao exercício de
--        2013, com recomendação ao gestor que promova a contratação de pessoal
--        mediante a realização do necessário do concurso público e que adote
--        medidas com vistas à recuperação da Dívida Ativa Municipal,
--        considerando que a sua cobrança no exercício revelou-se pouco
--        significativa, equivalente ao percentual de 0,73% do seu total."
--
-- C5  https://www.tcm.ba.gov.br/tcm-aprova-contas-da-prefeitura-de-salvador/
--     Tribunal de Contas dos Municipios da Bahia, 19/12/2018.
--     HTTP 200, 246386 bytes. Trechos literais:
--       "O Tribunal de Contas dos Municípios aprovou com ressalvas, na sessão
--        desta quarta-feira (19/12), as contas do prefeito de Salvador, Antônio
--        Carlos Magalhães Neto, relativas ao exercício de 2017. O parecer do
--        conselheiro Raimundo Moreira foi aprovado por unanimidade"
--       "indicou irregularidades na prorrogação de quatro contratos, através de
--        termos aditivos, vez que a duração desses contratos está superior à
--        vigência dos respectivos créditos orçamentários. Esse achado está sendo
--        analisado em termo de ocorrência específico – Processo TCM nº 26.551/17"
--       "irregularidades na contratação direta, por dispensa de licitação
--        fundamentada em caso de emergência ou de calamidade pública, de
--        serviços de limpeza urbana e manejo de resíduos sólidos. Os gastos
--        alcançaram o montante de R$333.019.088,87."
--       "No exercício, as despesas com publicidade alcançaram o montante de
--        R$17.565.073,67, que corresponde a 0,32% da receita arrecadada pelo
--        município. Houve um decréscimo nesses gastos em comparação com os
--        exercícios de 2014, 2015 e 2016, que registraram percentuais de 1,20%,
--        1,30% e 0,95%, respectivamente."
--
-- ---------------------------------------------------------------------
-- SELECTS DE VERIFICACAO RODADOS CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select id, slug from candidatos
--    where slug in ('rafael-fonteles','jorginho-mello','acm-neto');
--   VALOR ATUAL OBSERVADO:
--     57b743d5-db7b-4048-862d-9378a9fff366 | rafael-fonteles
--     d62ecbf0-98ab-41f9-8684-f3c7bd46251a | jorginho-mello
--     1d083d19-96c3-4a41-9d75-6abffacc4a3a | acm-neto
--
--   select count(*) from pontos_atencao
--    where id in ('7ce00002-0725-4a00-8e01-000000000002',
--                 '7ce00003-0725-4a00-8e01-000000000003',
--                 '7ce00004-0725-4a00-8e01-000000000004',
--                 '7ce00005-0725-4a00-8e01-000000000005',
--                 '7ce00006-0725-4a00-8e01-000000000006',
--                 '7ce00007-0725-4a00-8e01-000000000007',
--                 '7ce00008-0725-4a00-8e01-000000000008',
--                 '7ce00009-0725-4a00-8e01-000000000009');
--   VALOR ATUAL OBSERVADO: 0  (os ids sao novos, nao colidem)
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO (mesmo count): 8
--
--   E o balanco por candidato:
--     select c.slug,
--            count(*) filter (where p.categoria =  'feito_positivo') as positivos,
--            count(*) filter (where p.categoria <> 'feito_positivo') as atencao
--       from pontos_atencao p join candidatos c on c.id = p.candidato_id
--      where p.id like '7ce0000%' group by c.slug order by c.slug;
--     -- esperado: acm-neto 2/2 | jorginho-mello 1/1 | rafael-fonteles 1/1
--
-- IDEMPOTENTE: todos os inserts sao por id fixo com on conflict do nothing.
-- NADA E DELETADO E NENHUMA LINHA EXISTENTE E ALTERADA POR ESTE ARQUIVO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- rafael-fonteles | TCE-PI | contas do Executivo estadual, exercicio 2023
-- Fonte C1. O par positivo/atencao sai da MESMA decisao.
-- ---------------------------------------------------------------------
insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00002-0725-4a00-8e01-000000000002'::uuid,
  '57b743d5-db7b-4048-862d-9378a9fff366'::uuid,
  'feito_positivo',
  'TCE-PI julgou regulares, por unanimidade, as contas de governo de 2023',
  'O Tribunal de Contas do Estado do Piauí julgou regulares, por unanimidade dos membros da Corte, as contas do Governo do Estado referentes ao exercício de 2023, cujo gestor responsável foi Rafael Tajra Fonteles. O Ministério Público de Contas do Piauí recomendou a aprovação e acolheu as determinações propostas pela equipe técnica.',
  '[{"url":"https://www.tcepi.tc.br/tce-pi-aprova-contas-de-governo-do-poder-executivo-estadual-no-exercicio-2023/","data":"2026-07-25","titulo":"TCE-PI aprova contas de governo do Poder Executivo estadual no exercício 2023"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  null
)
on conflict (id) do nothing;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00003-0725-4a00-8e01-000000000003'::uuid,
  '57b743d5-db7b-4048-862d-9378a9fff366'::uuid,
  'perfil',
  'Achados da área técnica do TCE-PI nas contas de 2023',
  'Na mesma decisão que julgou as contas regulares, a Diretoria de Fiscalização de Gestão e Contas Públicas do TCE-PI constatou ineficiência no planejamento da concessão de renúncia de receitas, descumprimento das condições para concessão ou ampliação de benefício de natureza tributária, ausência de transparência na política pública de renúncia, ausência de registro da renúncia no SIAFE, início indevido de novos projetos antes de concluídos os que estavam em andamento, pagamentos sem prévio empenho e inconsistências no balanço financeiro e patrimonial. Os achados são da equipe técnica e não alteraram o resultado do julgamento.',
  '[{"url":"https://www.tcepi.tc.br/tce-pi-aprova-contas-de-governo-do-poder-executivo-estadual-no-exercicio-2023/","data":"2026-07-25","titulo":"TCE-PI aprova contas de governo do Poder Executivo estadual no exercício 2023"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  null
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- jorginho-mello | TCE-SC | contas do Governo do Estado, 2024 e 2025
-- Fontes C2 (positivo) e C3 (atencao).
-- ---------------------------------------------------------------------
insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00004-0725-4a00-8e01-000000000004'::uuid,
  'd62ecbf0-98ab-41f9-8684-f3c7bd46251a'::uuid,
  'feito_positivo',
  'TCE-SC recomendou por unanimidade a aprovação das contas de 2024',
  'Em 4 de junho de 2025, o Tribunal de Contas de Santa Catarina emitiu, por decisão unânime, parecer prévio pela aprovação das contas do Governo do Estado relativas ao exercício de 2024, de responsabilidade do governador Jorginho Mello, com duas ressalvas e 16 recomendações. No voto, o relator registrou que o exercício foi marcado pelo amplo cumprimento dos limites constitucionais e fiscais, com superávit financeiro, elevada disponibilidade de caixa e investimentos recordes na Saúde.',
  '[{"url":"https://www.tcesc.tc.br/tcesc-emite-parecer-previo-pela-aprovacao-das-contas-de-2024-do-governador-do-estado","data":"2025-06-04","titulo":"TCE/SC emite parecer prévio pela aprovação das contas de 2024 do governador do Estado"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2025-06-04'
)
on conflict (id) do nothing;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00005-0725-4a00-8e01-000000000005'::uuid,
  'd62ecbf0-98ab-41f9-8684-f3c7bd46251a'::uuid,
  'perfil',
  'Ressalva do TCE-SC por R$ 227,02 milhões em despesa sem prévio empenho em 2025',
  'Em 3 de junho de 2026, o Tribunal de Contas de Santa Catarina manteve o parecer prévio pela aprovação das contas do Governo do Estado, agora do exercício de 2025, mas com ressalva ao Executivo pela realização de despesa sem prévio empenho no valor de R$ 227,02 milhões, além de 21 recomendações, sendo 16 reiteradas e 5 novas. A decisão foi unânime e o processo segue para julgamento na Assembleia Legislativa. A fonte trata das contas do Governo do Estado, sob a gestão de Jorginho Mello, e não imputa conduta pessoal a ele.',
  '[{"url":"https://www.tcesc.tc.br/tcesc-emite-parecer-previo-pela-aprovacao-das-contas2025-do-governo-do-estado-mas-faz-ressalva","data":"2026-06-03","titulo":"TCE/SC emite parecer prévio pela aprovação das Contas/2025 do Governo do Estado, mas faz ressalva sobre despesas sem prévio empenho"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2026-06-03'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- acm-neto | TCM-BA | contas da Prefeitura de Salvador, 2013 e 2017
-- Fontes C4 e C5. Dois pares, um por exercicio.
-- ---------------------------------------------------------------------
insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00006-0725-4a00-8e01-000000000006'::uuid,
  '1d083d19-96c3-4a41-9d75-6abffacc4a3a'::uuid,
  'feito_positivo',
  'TCM-BA aprovou com ressalvas as contas de 2013 da Prefeitura de Salvador',
  'Em 3 de dezembro de 2014, o Tribunal de Contas dos Municípios da Bahia aprovou com ressalvas as contas do prefeito de Salvador, Antônio Carlos Peixoto de Magalhães Neto, referentes ao exercício de 2013, a primeira prestação de contas da sua gestão na prefeitura.',
  '[{"url":"https://www.tcm.ba.gov.br/tcm-aprova-com-ressalvas-contas-da-prefeitura-de-salvador/","data":"2014-12-03","titulo":"TCM aprova com ressalvas contas da Prefeitura de Salvador"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2014-12-03'
)
on conflict (id) do nothing;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00007-0725-4a00-8e01-000000000007'::uuid,
  '1d083d19-96c3-4a41-9d75-6abffacc4a3a'::uuid,
  'perfil',
  'Ressalvas do TCM-BA nas contas de 2013: concurso público e cobrança da Dívida Ativa',
  'Ao aprovar as contas de 2013, o TCM-BA recomendou ao gestor que promovesse a contratação de pessoal mediante concurso público e que adotasse medidas para recuperar a Dívida Ativa Municipal, registrando que a cobrança no exercício foi pouco significativa, equivalente a 0,73% do total.',
  '[{"url":"https://www.tcm.ba.gov.br/tcm-aprova-com-ressalvas-contas-da-prefeitura-de-salvador/","data":"2014-12-03","titulo":"TCM aprova com ressalvas contas da Prefeitura de Salvador"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2014-12-03'
)
on conflict (id) do nothing;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00008-0725-4a00-8e01-000000000008'::uuid,
  '1d083d19-96c3-4a41-9d75-6abffacc4a3a'::uuid,
  'feito_positivo',
  'TCM-BA aprovou por unanimidade as contas de 2017, com queda no gasto com publicidade',
  'Em 19 de dezembro de 2018, o TCM-BA aprovou com ressalvas, por unanimidade, as contas do prefeito de Salvador relativas ao exercício de 2017. No mesmo relatório, o tribunal registrou que as despesas com publicidade e propaganda somaram R$ 17.565.073,67, equivalentes a 0,32% da receita arrecadada pelo município, contra 1,20% em 2014, 1,30% em 2015 e 0,95% em 2016.',
  '[{"url":"https://www.tcm.ba.gov.br/tcm-aprova-contas-da-prefeitura-de-salvador/","data":"2018-12-19","titulo":"TCM aprova contas da Prefeitura de Salvador (exercício de 2017)"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  date '2018-12-19'
)
on conflict (id) do nothing;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce00009-0725-4a00-8e01-000000000009'::uuid,
  '1d083d19-96c3-4a41-9d75-6abffacc4a3a'::uuid,
  'perfil',
  'Irregularidades apontadas pelo TCM-BA nas contas de 2017 de Salvador',
  'No acompanhamento técnico das contas de 2017, o TCM-BA indicou irregularidades na prorrogação de quatro contratos por termos aditivos, com duração superior à vigência dos respectivos créditos orçamentários, achado analisado em termo de ocorrência específico (Processo TCM nº 26.551/17). O relatório também apontou irregularidades na contratação direta, por dispensa de licitação fundamentada em emergência ou calamidade pública, de serviços de limpeza urbana e manejo de resíduos sólidos, cujos gastos alcançaram R$ 333.019.088,87. As contas foram aprovadas com ressalvas apesar desses achados.',
  '[{"url":"https://www.tcm.ba.gov.br/tcm-aprova-contas-da-prefeitura-de-salvador/","data":"2018-12-19","titulo":"TCM aprova contas da Prefeitura de Salvador (exercício de 2017)"}]'::jsonb,
  'media',
  true,
  'curadoria',
  true,
  date '2018-12-19'
)
on conflict (id) do nothing;

commit;
