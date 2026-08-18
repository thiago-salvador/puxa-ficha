-- =====================================================================
-- Etapa 1D da auditoria de integridade (docs/auditoria-integridade-2026-07-24.md,
-- achado V5). Item 7 do patch-list priorizado do laudo.
--
-- O QUE ESTA MIGRATION CORRIGE
-- 16 registros de patrimonio declarado com valor errado, todos da rota
-- "TSE Dados Abertos bem_candidato":
--   15 linhas com valor EXATAMENTE 2,0000 vezes o real (patrimonio inflado
--      visivel em producao);
--    1 linha subcontada em R$ 4.441,40 (izalci-lucas 2022), corrigida para cima.
--
-- CAUSA RAIZ, COM RETRATACAO REGISTRADA
-- Nao e bug de codigo em execucao. Os valores sao literais digitados a mao em
-- blocos VALUES de 13 migrations ja aplicadas, todas parte do commit fbe7197
-- (2026-07-22), ancestral do HEAD desta branch. Uma versao anterior deste
-- diagnostico afirmou que o caminho de escrita "nao tinha rastro em codigo";
-- isso e falso e esta retratado: `grep -rl "total agregado" supabase/migrations/*.sql`
-- lista as 13 migrations, e `git rev-list --all | git grep -l "total agregado"`
-- as encontra no historico.
--
-- MECANISMO DA DUPLICACAO, CONFIRMADO CONTRA O CSV OFICIAL DO TSE
-- Padrao A (14 casos): o TSE publica a MESMA lista de bens do mesmo
--   SQ_CANDIDATO no arquivo estadual (_UF) e no nacional (_BRASIL). Somar os
--   dois sem deduplicar produz exatamente 2x. Em todos os 14, a soma isolada do
--   arquivo da UF e igual a soma isolada do arquivo BRASIL e igual a metade
--   exata do valor gravado.
-- Padrao B (1 caso): vera-lucia e candidata a Presidente, sem arquivo estadual.
--   So para 2022 o TSE publica dois arquivos nacionais que se sobrepoem,
--   bem_candidato_2022_BR.csv e bem_candidato_2022_BRASIL.csv, ambos com o mesmo
--   item de R$ 8.805,00 para o SQ 280001607831.
-- Verificacao: soma de VR_BEM_CANDIDATO por SQ_CANDIDATO nos zips oficiais
--   cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_<ano>.zip
--   (anos 2008, 2010, 2014, 2016, 2018, 2020, 2022, 2024), acesso 2026-07-25.
--   As 27 linhas dessa rota foram verificadas uma a uma: 15 dobradas,
--   11 corretas (nao tocadas), 1 subcontada. Zero linhas sem verificacao.
--
-- SINAL COLATERAL EM orleans-brandao
-- A anotacao "(N bens)" da fonte dele traz o DOBRO exato da contagem real de
-- itens unicos do TSE: 20 onde ha 10, 24 onde ha 12, 8 onde ha 4, 14 onde ha 7.
-- Quem escreveu a migration contou os itens dos dois arquivos como distintos,
-- entao nao so o valor, tambem a contagem foi duplicada. Por isso a anotacao
-- "(N bens)" sozinha nao serve de atestado de correcao: magno-malta tem a mesma
-- anotacao e esta CORRETO, porque a fonte dele cita um unico arquivo (_ES.csv).
--
-- O CASO SUBCONTADO, MECANISMO EXATO
-- izalci-lucas 2022 esta com R$ 8.701.004,63 e fonte "(17 bens deduplicados)".
-- O arquivo DF de 2022 traz 19 itens somando R$ 8.705.446,03. A diferenca de
-- R$ 4.441,40 e exatamente 2 x R$ 2.220,70: a lista real tem TRES itens
-- "Linha telefonica" de R$ 2.220,70 cada, e a deduplicacao manual tratou os
-- tres como duplicata entre si e descartou dois. Sao tres linhas telefonicas
-- distintas e legitimas. E o mesmo risco que src/lib/tse-patrimonio-dedupe.ts,
-- linhas 23-28, documenta para o fallback por tipo+descricao+valor, repetido
-- na mao.
--
-- PREVENCAO (nao aplicada aqui, e recomendacao de processo)
-- Migration futura que insira patrimonio.valor_total a partir de bem_candidato
-- deve usar UM UNICO arquivo por candidato (o _UF do estado dele, que ja tem a
-- lista completa) ou, se combinar arquivos, rodar dedupeTsePatrimonioRows
-- (src/lib/tse-patrimonio-dedupe.ts) antes de somar. Nunca deduplicar por
-- tipo+valor na mao.
--
-- Cada UPDATE e por id explicito e condicionado ao valor errado atual, o que
-- torna a migration idempotente e a reversao mecanica. A fonte original e
-- preservada e apenas recebe um sufixo de correcao, para nao apagar a evidencia
-- do que foi publicado.
--
-- ---------------------------------------------------------------------
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (producao, somente leitura, 2026-07-25)
--
--   select p.id, c.slug, p.ano_eleicao, p.valor_total, p.fonte
--   from public.patrimonio p
--   join public.candidatos c on c.id = p.candidato_id
--   where p.id in (<os 16 ids abaixo>)
--   order by c.slug, p.ano_eleicao;
--
-- Resultado observado: 16 linhas, com valor_total exatamente igual ao "atual"
-- citado no comentario de cada UPDATE, e fonte contendo
-- "TSE Dados Abertos bem_candidato_<ano> SQ <numero>".
--
-- SELECT QUE PROVA O RESULTADO ESPERADO DEPOIS
--
--   select c.slug, p.ano_eleicao, p.valor_total
--   from public.patrimonio p
--   join public.candidatos c on c.id = p.candidato_id
--   where p.id in (<os 16 ids abaixo>)
--   order by c.slug, p.ano_eleicao;
--   -- esperado: os 16 valores "certo" listados nos comentarios, e nenhuma
--   -- linha com fonte ilike '%Dados Abertos%bem_candidato%' mantendo razao
--   -- 2,0000 contra a soma de um unico arquivo do TSE.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BLOCO 1: valor dobrado, dividir por 2 (15 linhas)
-- Fator 2,0000 exato confirmado em todas contra o CSV oficial do TSE.
-- ---------------------------------------------------------------------

-- araceli-lemos | 2018 | PA
--   atual : 319441.40   certo : 159720.70
--   soma do arquivo PA = soma do arquivo BRASIL = 159720.70
UPDATE public.patrimonio
   SET valor_total = 159720.70,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 319441.40]'
 WHERE id = '10e4aa40-fcfc-4ead-aab3-b37a689259be'::uuid
   AND valor_total = 319441.40;

-- cintia-dias | 2024 | GO
--   atual : 1021677.68   certo : 510838.84
UPDATE public.patrimonio
   SET valor_total = 510838.84,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 1021677.68]'
 WHERE id = '98c0508b-37e8-4f45-bf80-aa2531d3c858'::uuid
   AND valor_total = 1021677.68;

-- dario-barbosa | 2022 | RN
--   atual : 340000.00   certo : 170000.00
UPDATE public.patrimonio
   SET valor_total = 170000.00,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 340000.00]'
 WHERE id = 'eaadec56-9d17-48e0-a52a-670c68feebe4'::uuid
   AND valor_total = 340000.00;

-- jeferson-bezerra | 2016 | MS
--   atual : 20000.00   certo : 10000.00
UPDATE public.patrimonio
   SET valor_total = 10000.00,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 20000.00]'
 WHERE id = 'ebf82e1e-1ade-4cee-9666-e27405a07f7d'::uuid
   AND valor_total = 20000.00;

-- jose-roberto-arruda | 2022 | DF
--   atual : 1580750.80   certo : 790375.40
--   nota: a linha de 2014 do mesmo candidato esta CORRETA e nao e tocada
UPDATE public.patrimonio
   SET valor_total = 790375.40,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 1580750.80]'
 WHERE id = 'e302d607-0f70-4ce2-b026-1db2ce70b09c'::uuid
   AND valor_total = 1580750.80;

-- orleans-brandao | 2010 | MA
--   atual : 582009.70   certo : 291004.85
--   a fonte anota "20 bens"; o TSE tem 10 itens unicos
UPDATE public.patrimonio
   SET valor_total = 291004.85,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 582009.70; a contagem "20 bens" tambem esta dobrada, o TSE traz 10 itens unicos]'
 WHERE id = '0ef1b4c7-225c-4bd7-abfb-a3afaea86300'::uuid
   AND valor_total = 582009.70;

-- orleans-brandao | 2014 | MA
--   atual : 552853.14   certo : 276426.57
--   a fonte anota "24 bens"; o TSE tem 12 itens unicos
UPDATE public.patrimonio
   SET valor_total = 276426.57,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 552853.14; a contagem "24 bens" tambem esta dobrada, o TSE traz 12 itens unicos]'
 WHERE id = '55cd9a71-f71f-4502-abdd-0dd51cc165f3'::uuid
   AND valor_total = 552853.14;

-- orleans-brandao | 2018 | MA
--   atual : 139372.34   certo : 69686.17
--   a fonte anota "8 bens"; o TSE tem 4 itens unicos
UPDATE public.patrimonio
   SET valor_total = 69686.17,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 139372.34; a contagem "8 bens" tambem esta dobrada, o TSE traz 4 itens unicos]'
 WHERE id = '2116850b-7de8-4a43-8ed1-229e96033d6d'::uuid
   AND valor_total = 139372.34;

-- orleans-brandao | 2022 | MA
--   atual : 957451.88   certo : 478725.94
--   a fonte anota "14 bens"; o TSE tem 7 itens unicos
UPDATE public.patrimonio
   SET valor_total = 478725.94,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 957451.88; a contagem "14 bens" tambem esta dobrada, o TSE traz 7 itens unicos]'
 WHERE id = '10d936dd-31b2-4d55-a261-b91d1dfac4e0'::uuid
   AND valor_total = 957451.88;

-- paulo-serra | 2020 | SP
--   atual : 3459987.72   certo : 1729993.86
UPDATE public.patrimonio
   SET valor_total = 1729993.86,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 3459987.72]'
 WHERE id = '93377f2e-5e7d-4b1d-a787-b6aa70169f73'::uuid
   AND valor_total = 3459987.72;

-- priscila-voigt | 2024 | RS
--   atual : 800.00   certo : 400.00
UPDATE public.patrimonio
   SET valor_total = 400.00,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 800.00]'
 WHERE id = '336fbf3a-67a7-4430-b9fb-de52e7fe7e15'::uuid
   AND valor_total = 800.00;

-- roberio-paulino | 2024 | RN
--   atual : 4299369.56   certo : 2149684.78
UPDATE public.patrimonio
   SET valor_total = 2149684.78,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 4299369.56]'
 WHERE id = '50d69320-0f94-429c-9e7c-1b2b56e1387e'::uuid
   AND valor_total = 4299369.56;

-- sergio-goncalves | 2022 | RO
--   atual : 1140000.00   certo : 570000.00
UPDATE public.patrimonio
   SET valor_total = 570000.00,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 1140000.00]'
 WHERE id = '9b4b85c9-6ef9-4f25-ac30-14d0d7f7157b'::uuid
   AND valor_total = 1140000.00;

-- telemaco-brandao | 2022 | GO
--   atual : 8355315.54   certo : 4177657.77
UPDATE public.patrimonio
   SET valor_total = 4177657.77,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma de arquivo _UF + _BRASIL; era 8355315.54]'
 WHERE id = 'aff04226-1fba-4690-9808-ea899de790ce'::uuid
   AND valor_total = 8355315.54;

-- vera-lucia | 2022 | candidata a Presidente (padrao B)
--   atual : 17610.00   certo : 8805.00
--   o mesmo item de R$ 8.805,00 aparece em bem_candidato_2022_BR.csv e em
--   bem_candidato_2022_BRASIL.csv para o SQ 280001607831
UPDATE public.patrimonio
   SET valor_total = 8805.00,
       fonte = fonte || ' [corrigido 2026-07-25: valor dobrado por soma dos dois arquivos nacionais de 2022 (_BR e _BRASIL); era 17610.00]'
 WHERE id = 'd65396be-e9c7-48c9-999a-728d50419783'::uuid
   AND valor_total = 17610.00;

-- ---------------------------------------------------------------------
-- BLOCO 2: valor subcontado, corrigir para cima (1 linha)
-- ---------------------------------------------------------------------

-- izalci-lucas | 2022 | DF
--   atual : 8701004.63 ("17 bens deduplicados")
--   certo : 8705446.03 (19 itens no arquivo DF de 2022)
--   diferenca de 4441.40 = 2 x 2220.70, os dois itens "Linha telefonica"
--   descartados por engano na deduplicacao manual
UPDATE public.patrimonio
   SET valor_total = 8705446.03,
       fonte = fonte || ' [corrigido 2026-07-25: subcontagem; a deduplicacao manual descartou 2 dos 3 itens legitimos "Linha telefonica" de R$ 2.220,70; 19 itens no arquivo DF de 2022; era 8701004.63]'
 WHERE id = 'be282b5a-4418-4821-aedc-f540cffe3210'::uuid
   AND valor_total = 8701004.63;

-- ---------------------------------------------------------------------
-- NAO TOCADAS DE PROPOSITO (11 linhas verificadas e corretas)
--   thor-dantas 2022 (AC), magno-malta 2010/2018/2022 (ES, fonte cita _ES.csv),
--   izalci-lucas 2010/2014/2018 (DF), jose-roberto-arruda 2014 (DF),
--   jarbas-soares 2008/2020 (MG), renato-gomes 2008 (MS).
-- Em todas, a soma do arquivo da UF bate exatamente com o valor gravado.
-- Os dois casos que uma verificacao anterior chamou de "SQ ambiguo"
-- (jarbas-soares 2008 e renato-gomes 2008) foram resolvidos usando o campo
-- candidatos.estado para desambiguar o SQ_CANDIDATO, e batem sem duplicacao.
-- ---------------------------------------------------------------------

COMMIT;
