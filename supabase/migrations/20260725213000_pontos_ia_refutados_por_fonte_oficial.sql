-- =====================================================================
-- Quatro pontos gerados por IA que ja estao ocultos passam a ficar REFUTADOS,
-- com motivo rastreavel e fonte oficial que os desmente.
--
-- A DIFERENCA ENTRE OCULTO E REFUTADO, E POR QUE ELA IMPORTA
--
-- Os quatro pontos abaixo estao com visivel = false, entao nao ha dano ao
-- vivo hoje. Mas nenhum deles tem motivo gravado: para quem ler a tabela, sao
-- indistinguiveis de conteudo escondido por cautela, que poderia voltar. Tres
-- deles afirmam sobre pessoa nomeada algo que a fonte oficial desmente. Se
-- voltarem, voltam errados.
--
-- Este arquivo nao muda a visibilidade de nada. Ele grava, em coluna propria
-- (despublicacao_motivo, criada em 20260725153000) e em dados_relacionados, a
-- prova de que a afirmacao e falsa, para que a proxima revisao editorial nao
-- precise refazer a pesquisa e nao republique por engano.
--
-- NENHUMA LINHA E DELETADA. A regra do projeto e explicita: despublicacao e
-- visivel = false com motivo, nunca DELETE.
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25.
--
-- R1  https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PB/2040602022/candidato/150001613756
--     TSE DivulgaCandContas, registro de lucas-ribeiro em 2022.
--     HTTP 200, 7170 bytes. Trechos literais:
--       "nomeCompleto":"LUCAS RIBEIRO NOVAIS DE ARAÚJO"
--       cargo: "Vice-governador"
--       "descricaoSituacao":"Deferido"
--       "descricaoTotalizacao":"Eleito"
--
-- R2  https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001609848
--     TSE DivulgaCandContas, registro de gabriel-souza em 2022.
--     HTTP 200, 8343 bytes. Trechos literais:
--       "nomeCompleto":"GABRIEL VIEIRA DE SOUZA"
--       cargo: "Vice-governador"
--       "descricaoTotalizacao":"Eleito"
--
-- R3  https://vicegovernador.rs.gov.br/o-vice-governador
--     Governo do Rio Grande do Sul, Gabinete do Vice-Governador.
--     HTTP 200, 43395 bytes. Trechos literais:
--       "foi deputado estadual por dois mandatos na Assembleia Legislativa do
--        Rio Grande do Sul, onde exerceu funções como presidente do Parlamento,
--        líder do governo e líder da bancada"
--       "Atualmente, é vice-governador do Estado, ao lado do governador
--        Eduardo Leite."
--
-- R4  https://www.tse.jus.br/comunicacao/noticias/2026/Abril/tse-cassa-mandato-do-governador-e-determina-eleicoes-diretas-em-roraima
--     Tribunal Superior Eleitoral, 30/04/2026. HTTP 200, 133106 bytes.
--     Trecho literal:
--       "O Tribunal Superior Eleitoral (TSE) determinou, na sessão desta
--        quinta-feira (30), a cassação do mandato do atual governador de
--        Roraima, Edilson Damião (União Brasil)"
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select p.id, c.slug, p.titulo, p.descricao, p.visivel, p.verificado,
--          p.gerado_por, p.despublicacao_motivo
--     from pontos_atencao p join candidatos c on c.id = p.candidato_id
--    where p.id in ('3569e398-4ea7-4452-b78f-ea28c00d3de4',
--                   '26d84fd1-442a-4a19-8dbd-f6ba37df0102',
--                   '22967495-f8db-4ddb-8efa-3cbac74c895c',
--                   'a623e29e-dc57-49b1-b9ab-aef763fefdbd');
--
--   VALORES ATUAIS OBSERVADOS (os quatro com visivel = false, verificado = false,
--   gerado_por = 'ia', despublicacao_motivo NULL):
--
--   3569e398 | lucas-ribeiro  | 'Sem histórico de mandato eletivo registrado'
--            | 'Lucas Ribeiro (PP) não possui mandato eletivo federal ou estadual
--               registrado nas bases do TSE, Câmara ou Senado. Pode ter atuação em
--               nível municipal ou ser estreante na política.'
--   26d84fd1 | gabriel-souza  | 'Sem histórico de mandato eletivo registrado'
--            | 'Gabriel Souza (MDB) não possui mandato eletivo federal ou estadual
--               registrado nas bases do TSE, Câmara ou Senado. (...)'
--   22967495 | gabriel-souza  | 'Governador(a) em exercício de RS'
--            | 'Gabriel Souza (MDB) atualmente exerce o cargo de governador(a) de RS.'
--   a623e29e | edilson-damiao | 'Sem histórico de mandato eletivo registrado'
--            | 'Edilson Damiao da Silva (PP) não possui mandato eletivo federal ou
--               estadual registrado nas bases do TSE, Câmara ou Senado. (...)'
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO:
--     select count(*) from pontos_atencao
--      where id in ('3569e398-4ea7-4452-b78f-ea28c00d3de4',
--                   '26d84fd1-442a-4a19-8dbd-f6ba37df0102',
--                   '22967495-f8db-4ddb-8efa-3cbac74c895c',
--                   'a623e29e-dc57-49b1-b9ab-aef763fefdbd')
--        and visivel = false
--        and despublicacao_motivo is not null
--        and dados_relacionados -> 'refutacao_2026_07_25' ? 'fonte';
--     -- esperado: 4
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- lucas-ribeiro | 'Sem histórico de mandato eletivo registrado'
-- Refutado por R1: eleito vice-governador da Paraiba em 2022.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set despublicacao_motivo = 'REFUTADO por fonte oficial: o TSE registra Lucas Ribeiro Novais de Araujo como ELEITO vice-governador da Paraiba em 2022 (DivulgaCandContas, registro 150001613756, "descricaoTotalizacao":"Eleito"). A afirmacao de que nao ha mandato eletivo registrado e falsa. Texto gerado por IA, verificado = false. Nao republicar. Auditoria de integridade de 2026-07-25.',
       despublicado_em = coalesce(despublicado_em, timestamptz '2026-07-25 00:00:00-03'),
       dados_relacionados = coalesce(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
         'refutacao_2026_07_25', jsonb_build_object(
           'fonte', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PB/2040602022/candidato/150001613756',
           'trecho', '"descricaoTotalizacao":"Eleito" para o cargo "Vice-governador" na PB em 2022',
           'status', 'refutado',
           'reversivel', true
         )
       )
 where id = '3569e398-4ea7-4452-b78f-ea28c00d3de4'::uuid
   and despublicacao_motivo is null;

-- ---------------------------------------------------------------------
-- gabriel-souza | 'Sem histórico de mandato eletivo registrado'
-- Refutado por R2 (eleito vice-governador do RS em 2022) e por R3
-- (dois mandatos de deputado estadual e presidencia da Assembleia).
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set despublicacao_motivo = 'REFUTADO por duas fontes oficiais: o TSE registra Gabriel Vieira de Souza como ELEITO vice-governador do Rio Grande do Sul em 2022 (DivulgaCandContas, registro 210001609848), e o Gabinete do Vice-Governador do RS informa que ele "foi deputado estadual por dois mandatos na Assembleia Legislativa do Rio Grande do Sul, onde exerceu funcoes como presidente do Parlamento". A afirmacao de que nao ha mandato eletivo registrado e falsa. Texto gerado por IA, verificado = false. Nao republicar. Auditoria de integridade de 2026-07-25.',
       despublicado_em = coalesce(despublicado_em, timestamptz '2026-07-25 00:00:00-03'),
       dados_relacionados = coalesce(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
         'refutacao_2026_07_25', jsonb_build_object(
           'fonte', 'https://vicegovernador.rs.gov.br/o-vice-governador',
           'fonte_2', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001609848',
           'trecho', 'foi deputado estadual por dois mandatos na Assembleia Legislativa do Rio Grande do Sul, onde exerceu funcoes como presidente do Parlamento',
           'status', 'refutado',
           'reversivel', true
         )
       )
 where id = '26d84fd1-442a-4a19-8dbd-f6ba37df0102'::uuid
   and despublicacao_motivo is null;

-- ---------------------------------------------------------------------
-- gabriel-souza | 'Governador(a) em exercício de RS'
-- Refutado por R3: ele e vice-governador, o governador e Eduardo Leite.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set despublicacao_motivo = 'REFUTADO por fonte oficial: o Gabinete do Vice-Governador do Rio Grande do Sul afirma que "Atualmente, e vice-governador do Estado, ao lado do governador Eduardo Leite". A afirmacao de que ele exerce o cargo de governador do RS e falsa. Texto gerado por IA, verificado = false. Nao republicar. Auditoria de integridade de 2026-07-25.',
       despublicado_em = coalesce(despublicado_em, timestamptz '2026-07-25 00:00:00-03'),
       dados_relacionados = coalesce(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
         'refutacao_2026_07_25', jsonb_build_object(
           'fonte', 'https://vicegovernador.rs.gov.br/o-vice-governador',
           'trecho', 'Atualmente, e vice-governador do Estado, ao lado do governador Eduardo Leite.',
           'status', 'refutado',
           'reversivel', true
         )
       )
 where id = '22967495-f8db-4ddb-8efa-3cbac74c895c'::uuid
   and despublicacao_motivo is null;

-- ---------------------------------------------------------------------
-- edilson-damiao | 'Sem histórico de mandato eletivo registrado'
-- Refutado por R4, e com erro adicional de identidade: o texto nomeia
-- "Edilson Damiao da Silva (PP)", enquanto a ficha e de "Edilson Damiao Lima",
-- do Uniao Brasil. Colisao de homonimo capturada na geracao por IA.
-- ---------------------------------------------------------------------
update public.pontos_atencao
   set despublicacao_motivo = 'REFUTADO por fonte oficial e com identidade errada. O TSE, ao noticiar a decisao de 30/04/2026, escreve "a cassacao do mandato do atual governador de Roraima, Edilson Damiao (Uniao Brasil)": havia mandato eletivo em exercicio na data. Alem disso, o texto do ponto nomeia "Edilson Damiao da Silva (PP)", nome e partido que nao correspondem ao candidato desta ficha (Edilson Damiao Lima, Uniao Brasil), provavel colisao de homonimo na geracao por IA. Texto gerado por IA, verificado = false. Nao republicar. Auditoria de integridade de 2026-07-25.',
       despublicado_em = coalesce(despublicado_em, timestamptz '2026-07-25 00:00:00-03'),
       dados_relacionados = coalesce(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
         'refutacao_2026_07_25', jsonb_build_object(
           'fonte', 'https://www.tse.jus.br/comunicacao/noticias/2026/Abril/tse-cassa-mandato-do-governador-e-determina-eleicoes-diretas-em-roraima',
           'trecho', 'a cassacao do mandato do atual governador de Roraima, Edilson Damiao (Uniao Brasil)',
           'status', 'refutado',
           'erro_adicional', 'nome e partido do texto nao correspondem ao candidato da ficha',
           'reversivel', true
         )
       )
 where id = 'a623e29e-dc57-49b1-b9ab-aef763fefdbd'::uuid
   and despublicacao_motivo is null;

commit;
