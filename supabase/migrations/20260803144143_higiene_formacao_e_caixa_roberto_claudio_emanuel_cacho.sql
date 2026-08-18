-- Dois defeitos de campo achados ao montar a tabela de conferencia de 03/08.
-- Nenhum dos dois nasceu hoje: sao curadoria anterior. Decisao do Thiago.
--
-- 1. roberto-claudio tinha `formacao` = 'Universidade do Arizona'. Isso e
--    INSTITUICAO, nao grau de instrucao, e o campo aparece na ficha ao lado da
--    idade. O registro de candidatura de 2026 (SQ 60002531352) declara
--    'SUPERIOR COMPLETO'. A informacao sobre o Arizona nao e descartada por
--    aqui: ela continua na biografia, que e o lugar dela.
--    `naturalidade` era 'Fortaleza', sem UF, fora do padrao 'Municipio/UF' do
--    resto do banco. O registro traz SG_UF_NASCIMENTO = CE, o que fecha o par
--    sem inventar municipio.
--
-- 2. emanuel-cacho tinha `formacao` e `profissao_declarada` em CAIXA ALTA,
--    herdadas cruas do TSE. O padrao das fichas curadas e sentenca para grau de
--    instrucao e Title Case para ocupacao. Nao muda o dado, so a forma.
--
-- NAO E LIMPEZA GERAL. O banco tem outras linhas em caixa alta e ate 40 com
-- 'Q82955' (id do Wikidata) no lugar da profissao. Isso e varredura propria de
-- higiene de campo, nao carona nesta migration.

UPDATE public.candidatos
SET formacao = 'Superior completo',
    profissao_declarada = 'Médico',
    naturalidade = 'Fortaleza/CE',
    ultima_atualizacao = NOW()
WHERE slug = 'roberto-claudio';

UPDATE public.candidatos
SET formacao = 'Superior completo',
    profissao_declarada = 'Advogado',
    ultima_atualizacao = NOW()
WHERE slug = 'emanuel-cacho';;
