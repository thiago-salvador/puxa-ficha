-- =====================================================================
-- gabriel-souza: primeiro ponto visivel da ficha, com fonte oficial.
--
-- SITUACAO ATUAL DA FICHA (medida em 2026-07-25)
--
-- ZERO pontos de atencao visiveis. Existem dois registros, ambos com
-- visivel = false, ambos gerados por IA e ambos factualmente falsos
-- (26d84fd1 "Sem historico de mandato eletivo registrado" e 22967495
-- "Governador(a) em exercicio de RS"). Os dois sao marcados como refutados em
-- 20260725213000_pontos_ia_refutados_por_fonte_oficial.sql e continuam fora do
-- ar.
--
-- Resultado: a ficha do vice-governador do Rio Grande do Sul, com 192 noticias
-- associadas, nao exibe nenhum conteudo alem dos dados cadastrais. A
-- presidencia da Assembleia Legislativa do estado, que e o cargo mais alto que
-- ele ocupou no Legislativo, nao aparece em lugar nenhum da base: nao esta em
-- pontos_atencao e nao esta em historico_politico (verificado por SELECT).
--
-- POR QUE ENTRA COMO feito_positivo E NAO COMO perfil
--
-- E fato de trajetoria favoravel ao candidato, e a separacao criada em
-- 20260403121500_split_positive_points_from_alerts.sql existe justamente para
-- que fato favoravel nao entre na contagem de alertas das views
-- v_ficha_candidato e v_comparador. Classificar como 'perfil' inflaria o lado
-- negativo da ficha com um fato positivo.
--
-- O QUE NAO ENTRA, E POR QUE
--   O numero exato de mandatos de deputado estadual (dois) esta na fonte e
--   entra. Os ANOS de cada mandato nao entram: a fonte oficial nao os informa,
--   e nao vou deduzi-los das linhas de historico_politico, que sao justamente
--   o bloco que a auditoria encontrou inflado pelo bug V4.
--
--   A formacao academica detalhada (mestrado na Unicuritiba, especializacao na
--   UCDB, doutorado em curso) esta na mesma fonte e e verificavel, mas e
--   conteudo de biografia, nao de ponto de atencao. Fica registrada aqui como
--   material disponivel para a curadoria, sem virar claim estruturada.
--
-- ---------------------------------------------------------------------
-- FONTE, TESTADA POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25.
--
-- G1  https://vicegovernador.rs.gov.br/o-vice-governador
--     Governo do Estado do Rio Grande do Sul, Gabinete do Vice-Governador.
--     HTTP 200, 43395 bytes. Trechos literais:
--       "Com mais de 20 anos de atuação na vida pública, foi deputado estadual
--        por dois mandatos na Assembleia Legislativa do Rio Grande do Sul, onde
--        exerceu funções como presidente do Parlamento, líder do governo e líder
--        da bancada."
--       "Atualmente, é vice-governador do Estado, ao lado do governador
--        Eduardo Leite."
--       "Nascido em Porto Alegre, em 2 de janeiro de 1984, Gabriel cresceu em
--        Tramandaí, no Litoral Norte, onde iniciou sua trajetória na vida pública
--        ainda na adolescência, como líder estudantil."
--
--     Esta URL ja consta em candidatos.fonte_dados de gabriel-souza, mas nunca
--     havia sido usada como fonte de nenhum ponto.
--
-- CORROBORACAO (cargo atual, nao a presidencia):
-- G2  https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001609848
--     TSE DivulgaCandContas. HTTP 200, 8343 bytes.
--     "nomeCompleto":"GABRIEL VIEIRA DE SOUZA", cargo "Vice-governador",
--     "descricaoTotalizacao":"Eleito"
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select p.id, p.titulo, p.visivel from pontos_atencao p
--     join candidatos c on c.id = p.candidato_id where c.slug = 'gabriel-souza';
--   VALOR ATUAL OBSERVADO: 2 linhas, as duas com visivel = false
--     26d84fd1-442a-4a19-8dbd-f6ba37df0102 | 'Sem histórico de mandato eletivo registrado'
--     22967495-f8db-4ddb-8efa-3cbac74c895c | 'Governador(a) em exercício de RS'
--
--   select count(*) from historico_politico h join candidatos c on c.id = h.candidato_id
--    where c.slug = 'gabriel-souza' and h.cargo ilike '%presidente%';
--   VALOR ATUAL OBSERVADO: 0
--
--   select count(*) from pontos_atencao
--    where id = '7ce0000b-0725-4a00-8e01-00000000000b';
--   VALOR ATUAL OBSERVADO: 0
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO:
--     select p.id, p.titulo, p.categoria, p.gravidade, p.visivel, p.verificado,
--            p.gerado_por
--       from pontos_atencao p join candidatos c on c.id = p.candidato_id
--      where c.slug = 'gabriel-souza' order by p.visivel desc;
--     -- 3 linhas, exatamente uma com visivel = true:
--     --   7ce0000b-... | 'Presidiu a Assembleia Legislativa do Rio Grande do Sul'
--     --                | feito_positivo | baixa | true | true | curadoria
--
-- IDEMPOTENTE (id fixo, on conflict do nothing). NADA E DELETADO.
-- =====================================================================

begin;

insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce0000b-0725-4a00-8e01-00000000000b'::uuid,
  'b01d3b26-32d0-48c3-9242-6c6b324b249d'::uuid,
  'feito_positivo',
  'Presidiu a Assembleia Legislativa do Rio Grande do Sul',
  'Segundo o Gabinete do Vice-Governador do Rio Grande do Sul, Gabriel Souza foi deputado estadual por dois mandatos na Assembleia Legislativa do estado, onde exerceu as funções de presidente do Parlamento, líder do governo e líder da bancada. Atualmente é vice-governador, ao lado do governador Eduardo Leite.',
  '[{"url":"https://vicegovernador.rs.gov.br/o-vice-governador","data":"2026-07-25","titulo":"Governo do RS, Gabinete do Vice-Governador: trajetória de Gabriel Souza"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  null
)
on conflict (id) do nothing;

commit;
