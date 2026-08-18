-- =====================================================================
-- Achado A13 da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md).
--
-- O QUE ESTA MIGRATION CORRIGE
-- O candidato guto-silva (publicavel = true) tem cpf = '-4', uma string de dois
-- caracteres que nao e CPF nenhum. O valor nao vaza para o publico (o papel
-- anon recebe 42501 permission denied na coluna, e src/lib/api.ts ja exclui cpf
-- das colunas publicas), mas contamina qualquer cruzamento por identificador
-- unico, que e justamente o metodo usado na etapa 1C para amarrar candidato a
-- registro oficial sem cair em comparacao por nome.
--
-- VARREDURA DA COLUNA, NAO CORRECAO PONTUAL
-- O laudo sugeria varrer a integridade da coluna inteira. Feito:
--
--   select count(*) filter (where cpf is not null) as com_cpf,
--          count(*) filter (where cpf is not null and cpf !~ '^[0-9]{11}$')
--            as fora_do_formato,
--          string_agg(distinct case when cpf is not null
--            and cpf !~ '^[0-9]{11}$' then slug end, ', ') as slugs_fora
--   from public.candidatos;
--
-- Resultado observado em 2026-07-25: com_cpf = 125, fora_do_formato = 1,
-- slugs_fora = 'guto-silva'. E um caso unico, nao um padrao. As outras 124
-- linhas com CPF estao no formato de 11 digitos.
--
-- POR QUE ANULAR EM VEZ DE ESCREVER O VALOR CERTO
-- O valor correto existe e foi verificado por requisicao real nesta etapa, em
-- fonte primaria oficial:
--
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/PR/2022802018/candidato/160000619860
--
-- que responde 200 e traz, no mesmo objeto, "nomeUrna":"GUTO SILVA",
-- "nomeCompleto":"LUIZ AUGUSTO SILVA", "dataDeNascimento":"1977-02-11" e o
-- campo "cpf" com 11 digitos. O vinculo e seguro: o proprio seed do projeto
-- (data/candidatos.json) declara para este slug
-- ids.tse_sq_candidato["2018"] = "160000619860", e nome_completo e estado
-- (PR) batem exatamente com o registro do TSE.
--
-- O valor NAO e escrito aqui de proposito, pela mesma politica adotada em
-- 20260725123000_identidade_candidatos_fonte_oficial.sql para os CPFs de
-- dr-fernando-maximo e renan-filho: este repositorio e publico e o proprio
-- projeto trata cpf como dado sensivel. Anular remove o dado invalido sem
-- publicar dado pessoal em arquivo versionado. Quem for aplicar o valor real
-- le do endpoint acima e roda o UPDATE fora do versionamento.
--
-- Uma alternativa foi considerada e descartada: manter '-4' ate ter o valor
-- certo. Descartada porque '-4' e afirmacao falsa sobre pessoa real dentro do
-- banco, e NULL e a representacao honesta de "nao sabemos".
--
-- Idempotente (condicionada ao valor invalido atual) e reversivel: o valor
-- anterior era a string '-4' e esta escrito aqui.
--
-- SELECT DE VALIDACAO EXECUTADO ANTES (producao, somente leitura, 2026-07-25)
--   select id, slug, cpf, length(cpf) as len, nome_completo, publicavel
--   from public.candidatos where slug = 'guto-silva';
--   -- 1 linha: id d0947366-428b-4ffc-b303-5a421d1cf2da, cpf '-4', len 2,
--   --          nome_completo 'Luiz Augusto Silva', publicavel true.
--
-- SELECT QUE PROVA O RESULTADO ESPERADO DEPOIS
--   select count(*) from public.candidatos
--   where cpf is not null and cpf !~ '^[0-9]{11}$';
--   -- esperado: 0
-- =====================================================================

BEGIN;

-- guto-silva
--   valor atual : '-4' (string de 2 caracteres, CPF invalido)
--   valor novo  : NULL
--   fonte       : TSE DivulgaCandContas 2018/PR, id de candidatura 160000619860,
--                 declarado no proprio seed do projeto em data/candidatos.json.
--                 O CPF real esta nesse endpoint e nao e transcrito aqui por
--                 ser dado sensivel em repositorio publico.
UPDATE public.candidatos
   SET cpf = NULL,
       fonte_dados = CASE WHEN COALESCE(fonte_dados, '{}'::text[]) @> ARRAY['auditoria-integridade-20260725']
                          THEN fonte_dados
                          ELSE COALESCE(fonte_dados, '{}'::text[]) || ARRAY['auditoria-integridade-20260725'] END,
       ultima_atualizacao = now()
 WHERE id = 'd0947366-428b-4ffc-b303-5a421d1cf2da'::uuid
   AND cpf = '-4';

COMMIT;
