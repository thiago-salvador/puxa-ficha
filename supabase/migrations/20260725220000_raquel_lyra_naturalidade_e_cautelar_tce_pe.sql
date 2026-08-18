-- =====================================================================
-- raquel-lyra: corrige a naturalidade contra o TSE e publica a cautelar do
-- TCE-PE sobre a licitacao de publicidade da Secom estadual.
--
-- SITUACAO ATUAL DA FICHA (medida em 2026-07-25)
--
-- ZERO pontos de atencao visiveis. O unico registro existente
-- (8e8db2cc-7163-45ed-af6a-0909812f22ac) foi ocultado em 2026-07-08 com o
-- motivo "ponto gerado por IA sem verificacao suficiente no fechamento PE
-- Governador" e continua oculto. Este arquivo nao o republica: ele continua
-- fora do ar, e no lugar entra material com fonte primaria de tribunal de
-- contas.
--
-- E naturalidade = 'Recife', enquanto o TSE registra Caruaru. O erro nao e
-- cosmetico: ela foi prefeita de Caruaru, o que torna a cidade natal um dado
-- editorialmente relevante da ficha, e nao mero cadastro.
--
-- POR QUE A NATURALIDADE NAO SAIU NA MIGRATION 20260725123000
--
-- Aquela migration corrige naturalidade em 5 candidatos (joel-rodrigues,
-- lucas-ribeiro, mailza-assis, marcos-vieira, priscila-voigt). raquel-lyra nao
-- esta entre eles, e nao esta em nenhuma outra migration desta serie
-- (verificado por grep do slug em supabase/migrations/2026072512*.sql e
-- 2026072513*.sql a 2026072518*.sql: nenhuma ocorrencia).
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25. Status e tamanho observados nesta sessao.
--
-- L1  https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PE/2040602022/candidato/170001604087
--     TSE DivulgaCandContas, registro de 2022. HTTP 200, 7824 bytes.
--     Trechos literais:
--       "nomeCompleto":"RAQUEL TEIXEIRA LYRA LUCENA"
--       "dataDeNascimento":"1978-12-02"
--       "nomeMunicipioNascimento":"CARUARU"
--       "sgUfNascimento":"PE"
--       "descricaoNaturalidade":"PE-CARUARU"
--       "grauInstrucao":"Superior completo"
--       "ocupacao":"Advogado"
--       "totalDeBens":340576.99
--
-- L2  https://www.tcepe.tc.br/internet/index.php/noticias/481-2025/junho/8018-tce-pe-suspende-pagamentos-por-contrato-de-publicidade-do-governo-estadual
--     Tribunal de Contas do Estado de Pernambuco, junho de 2025.
--     HTTP 200, 84982 bytes. Trechos literais:
--       "O conselheiro Eduardo Porto concedeu uma medida cautelar determinando
--        que a Secretaria de Comunicação de Pernambuco suspenda quaisquer
--        pagamentos decorrentes da licitação 1360.2024.0001, que visa à
--        contratação de quatro agências de publicidade institucional. O valor do
--        contrato é de R$120 milhões."
--       "O pedido de medida cautelar foi feito por um advogado, sob a alegação
--        que a subcomissão técnica (responsável por avaliar as propostas) não
--        apresentou as notas individualizadas de cada julgador – conforme
--        determina a lei nº 12.232/2010."
--
-- L3  https://www.tcepe.tc.br/internet/index.php/noticias/482-2025/julho/8025-primeira-camara-aprecia-cautelar-sobre-contrato-de-publicidade-do-governo-estadual
--     Tribunal de Contas do Estado de Pernambuco, julho de 2025.
--     HTTP 200, 85482 bytes. Trechos literais:
--       "Por unanimidade, a Primeira Câmara do Tribunal de Contas de Pernambuco
--        (TCE-PE) confirmou uma medida cautelar emitida pelo conselheiro Eduardo
--        Porto, determinando que o governo estadual suspenda os pagamentos
--        decorrentes da licitação que contratou agências de publicidade
--        institucional."
--       "No entanto, o colegiado modulou a decisão para permitir o pagamento dos
--        serviços já prestados até a data da decisão monocrática (19/06/2025).
--        Também autorizou a realização de campanhas referentes a ações
--        emergenciais até o julgamento da auditoria especial (nº 25101126-4)
--        instaurada."
--       "Processo TC nº 25101035-1 Data da decisão: 1/7/2025 Modalidade: Medida
--        cautelar Órgão: Secretaria de Comunicação de Pernambuco (SECOM)
--        Relator: Eduardo Porto Exercício: 2025"
--
-- ---------------------------------------------------------------------
-- NOTA EDITORIAL OBRIGATORIA, ESCRITA NO PROPRIO TEXTO PUBLICADO
--
-- A decisao do TCE-PE recai sobre ato da SECRETARIA DE COMUNICACAO do governo
-- estadual, nao sobre a governadora pessoalmente, e nao ha imputacao pessoal
-- na fonte. A descricao diz isso com essas palavras. Tambem registra a
-- modulacao (o pagamento de servicos ja prestados ate 19/06/2025 foi liberado)
-- e que a auditoria especial ainda corria na data da fonte. Sem essas tres
-- coisas, o item vira acusacao pessoal que a fonte nao sustenta.
--
-- Gravidade 'media': e cautelar administrativa confirmada por colegiado, com
-- auditoria em curso, nao decisao de merito nem condenacao.
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select id, slug, nome_completo, naturalidade, partido_sigla
--     from candidatos where slug = 'raquel-lyra';
--   VALOR ATUAL OBSERVADO:
--     022d27e8-2832-4156-9bc7-7eac817ac901 | raquel-lyra |
--     Raquel Teixeira Lyra Lucena | Recife | PSD
--
--   select id, titulo, visivel from pontos_atencao
--    where candidato_id = '022d27e8-2832-4156-9bc7-7eac817ac901';
--   VALOR ATUAL OBSERVADO: 1 linha, 8e8db2cc..., visivel = false.
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO:
--     select naturalidade from candidatos where slug = 'raquel-lyra';
--     -- esperado: 'Caruaru/PE'
--
--     select id, titulo, categoria, gravidade, visivel, verificado
--       from pontos_atencao
--      where candidato_id = '022d27e8-2832-4156-9bc7-7eac817ac901'
--      order by visivel desc;
--     -- esperado: 2 linhas
--     --   7ce0000a-... | 'TCE-PE suspendeu pagamentos de licitação de publicidade
--     --                   de R$ 120 milhões da Secom estadual'
--     --                | perfil | media | true  | true
--     --   8e8db2cc-... | 'Carreira política: 4 mandato(s) registrado(s)'
--     --                | feito_positivo | baixa | false | false
--
-- IDEMPOTENTE. NADA E DELETADO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. naturalidade
--    valor atual : Recife
--    valor certo : Caruaru/PE
--    fonte       : L1, trecho "descricaoNaturalidade":"PE-CARUARU"
-- ---------------------------------------------------------------------
update public.candidatos
   set naturalidade = 'Caruaru/PE',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 170001604087']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 170001604087'] end,
       ultima_atualizacao = now()
 where id = '022d27e8-2832-4156-9bc7-7eac817ac901'::uuid
   and naturalidade = 'Recife';

-- ---------------------------------------------------------------------
-- 2. Ponto de atencao novo, com as duas decisoes do TCE-PE
-- ---------------------------------------------------------------------
insert into public.pontos_atencao
  (id, candidato_id, categoria, titulo, descricao, fontes, gravidade,
   verificado, gerado_por, visivel, data_referencia)
values (
  '7ce0000a-0725-4a00-8e01-00000000000a'::uuid,
  '022d27e8-2832-4156-9bc7-7eac817ac901'::uuid,
  'perfil',
  'TCE-PE suspendeu pagamentos de licitação de publicidade de R$ 120 milhões da Secom estadual',
  'Em junho de 2025, o conselheiro Eduardo Porto, do TCE-PE, concedeu medida cautelar determinando que a Secretaria de Comunicação de Pernambuco suspendesse os pagamentos decorrentes da licitação 1360.2024.0001, de contratação de quatro agências de publicidade institucional, no valor de R$ 120 milhões. O fundamento foi a alegação de que a subcomissão técnica não apresentou as notas individualizadas de cada julgador, como exige a Lei 12.232/2010. Em 1º de julho de 2025, a Primeira Câmara confirmou a cautelar por unanimidade (Processo TC nº 25101035-1), mas modulou a decisão para liberar o pagamento dos serviços já prestados até 19/06/2025 e autorizar campanhas de ações emergenciais até o julgamento da auditoria especial nº 25101126-4, então em curso. A decisão recai sobre ato da Secretaria de Comunicação do governo estadual; a fonte não imputa conduta pessoal à governadora.',
  '[{"url":"https://www.tcepe.tc.br/internet/index.php/noticias/481-2025/junho/8018-tce-pe-suspende-pagamentos-por-contrato-de-publicidade-do-governo-estadual","data":"2025-06","titulo":"TCE-PE suspende pagamentos por contrato de publicidade do governo estadual"},{"url":"https://www.tcepe.tc.br/internet/index.php/noticias/482-2025/julho/8025-primeira-camara-aprecia-cautelar-sobre-contrato-de-publicidade-do-governo-estadual","data":"2025-07-01","titulo":"Primeira Câmara aprecia cautelar sobre contrato de publicidade do governo estadual (Processo TC nº 25101035-1)"}]'::jsonb,
  'media',
  true,
  'curadoria',
  true,
  date '2025-07-01'
)
on conflict (id) do nothing;

commit;
