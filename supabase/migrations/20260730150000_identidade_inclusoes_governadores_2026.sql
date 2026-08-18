-- =====================================================================
-- Identidade das 6 fichas criadas em 30/07/2026 por
-- 20260730130000_roster_governadores_inclusoes_2026.sql.
--
-- O PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- Aquela migration publicou 6 candidatos com nome, partido, UF e cargo, e
-- nada mais. Sao 6 fichas no ar sem data de nascimento, naturalidade,
-- formacao e profissao, e sem idade (public.candidatos_publico deriva idade
-- de data_nascimento desde 20260725170000, entao data_nascimento nulo =
-- ficha sem idade).
--
-- DE ONDE VEM O DADO, E POR QUE NAO E O REGISTRO DE 2026
--
-- O registro de candidaturas de 2026 NAO serve ainda. Em 30/07/2026 o pacote
-- https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
-- ja existe (HTTP 200, Last-Modified 2026-07-30 11:35), mas esta praticamente
-- vazio: 1.828 linhas no pais inteiro, so 10 registros de GOVERNADOR, 8 UFs
-- com arquivo de cabecalho e zero linha (entre elas TO), e 100% das linhas com
-- DS_SITUACAO_CANDIDATURA = '#NE'. NENHUM dos 6 aparece la. Conferido linha a
-- linha nos 29 CSVs do pacote.
--
-- A fonte usada aqui e o registro eleitoral do TSE de anos ANTERIORES, pela
-- mesma rota primaria ja usada em 20260725193000 e 20260725150000:
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/{ano}/{UF}/{cdEleicao}/candidato/{sq}
--   cdEleicao: 2014 -> 680, 2018 -> 2022802018, 2022 -> 2040602022
--
-- Os SQ_CANDIDATO correspondentes foram gravados em data/candidatos.json no
-- mesmo commit e passam em `npm run audit:seed-sq-identity:gate` (626 pares
-- conferidos, 0 divergencia).
--
-- CPF NAO E ESCRITO AQUI, nem como dado nem em comentario, pela mesma politica
-- de 20260725150000_cpf_invalido_guto_silva.sql. O vinculo de identidade e
-- ancorado em SQ_CANDIDATO, que e identificador publico.
--
-- ---------------------------------------------------------------------
-- FONTES, REQUISITADAS E LIDAS POR MIM EM 2026-07-30
--
-- T1  TSE 2022 MG sq 130001607244 (patrus-ananias). HTTP 200.
--     "nomeCompleto":"PATRUS ANANIAS DE SOUSA" "dataDeNascimento":"1952-01-26"
--     "sgUfNascimento":"MG" "nomeMunicipioNascimento":"BOCAIÚVA"
--     "grauInstrucao":"Superior completo" "ocupacao":"Advogado"
--
-- T2  TSE 2022 RJ sq 190001603420 (coronel-busnello). HTTP 200.
--     "nomeCompleto":"JOÃO JACQUES SOARES BUSNELLO" "dataDeNascimento":"1970-08-06"
--     "sgUfNascimento":"RS" "nomeMunicipioNascimento":"IRAÍ"
--     "grauInstrucao":"Superior completo" "ocupacao":"Policial Militar"
--     Mesmo nome e mesma data em 2018 RJ sq 190000626280.
--
-- T3  TSE 2014 SC sq 240000000204 (marcus-sodre). HTTP 200.
--     "nomeCompleto":"MARCUS ALEXANDRE SODRÉ" "dataDeNascimento":"1972-01-26"
--     "sgUfNascimento":"SP" "nomeMunicipioNascimento":"CUBATÃO"
--     "grauInstrucao":"Superior completo" "ocupacao":"Professor de Ensino Médio"
--
-- T4  TSE 2018 PE sq 170000607399 (jeremias-cosmo). HTTP 200.
--     "nomeCompleto":"JEREMIAS COSMO SILVA DOS SANTOS" "nomeUrna":"PROFESSOR JEREMIAS DO BANCO"
--     "dataDeNascimento":"1980-03-27" "sgUfNascimento":"PE"
--     "nomeMunicipioNascimento":"PALMARES" "grauInstrucao":"Superior completo"
--     "ocupacao":"Bancário e Economiário"
--
-- T5  TSE 2018 SC sq 240000609728 (marcelo-brigadeiro). HTTP 200.
--     "nomeCompleto":"MARCELO MARCEL FRANCO JOSÉ DA SILVA" "dataDeNascimento":"1982-05-04"
--     "sgUfNascimento":"RJ" "nomeMunicipioNascimento":"RIO DE JANEIRO"
--     "grauInstrucao":"Superior completo" "ocupacao":"Empresário"
--     Este SQ ja estava no seed antes desta sessao, o que fecha o vinculo.
--
-- T6  CSV oficial consulta_cand_2024_PE, sq 170002143292 (jeremias-cosmo).
--     NM_CANDIDATO "JEREMIAS COSMO SILVA DOS SANTOS", DT_NASCIMENTO 27/03/1980,
--     NM_UE "RIBEIRÃO", DS_CARGO "VICE-PREFEITO",
--     DS_OCUPACAO "PROFESSOR DE ENSINO MÉDIO".
--
-- T7  https://www.maisjaboatao.blog/post/democrata-lanca-jeremias-cosmo-como-candidato-ao-governo-de-pernambuco
--     "Jeremias Cosmo nasceu em Palmares, na Zona da Mata Sul, em 1980.
--      Formou-se em contabilidade e, posteriormente, concluiu licenciatura em
--      Letras. Em 2008, tomou posse como professor da rede estadual de
--      Pernambuco". Tambem: bancario do Banco do Brasil na agencia de Ribeirao
--      e diretor do Sindicato dos Bancarios da Zona da Mata Sul.
--
-- T8  https://gazetadocerrado.com.br/... (witer-naves), verbatim:
--     "Com 54 anos, Witer Naves é geógrafo e servidor público. Ele nasceu em
--      Goiânia e está no Tocantins há 31 anos."
--
-- ---------------------------------------------------------------------
-- O VINCULO DE IDENTIDADE DO jeremias-cosmo, QUE E O CASO DELICADO
--
-- A imprensa so escreve "Jeremias Cosmo". O nome civil completo vem do TSE
-- (T4/T6). Ligar os dois e afirmacao sobre pessoa real, entao o vinculo esta
-- explicitado aqui em vez de presumido. Cinco atributos independentes batem:
--
--   1. municipio de nascimento : T4 PALMARES        = T7 "nasceu em Palmares"
--   2. ano de nascimento       : T4 1980            = T7 "em 1980"
--   3. profissao bancario      : T4 "Bancário e Economiário" = T7 Banco do Brasil
--   4. profissao professor     : T6 "PROFESSOR DE ENSINO MÉDIO" = T7 professor
--                                da rede estadual desde 2008
--   5. municipio de atuacao    : T6 RIBEIRÃO        = T7 agencia de Ribeirao
--
-- O nome de urna reforca: o TSE registra "PROFESSOR JEREMIAS DO BANCO" em
-- 2018 e 2020, que e literalmente professor + banco, e o nome_urna atual da
-- ficha e "Professor Jeremias".
--
-- ---------------------------------------------------------------------
-- CAMPOS QUE FICAM NULOS DE PROPOSITO
--
-- witer-naves    data_nascimento : T8 da a IDADE (54), nao a data. Idade nao
--                                  determina data de nascimento. Fica nulo.
--                formacao        : T8 diz "geógrafo", que e profissao. Grau de
--                                  instrucao nao aparece em fonte nenhuma.
--                                  Deduzir "Superior completo" de "geografo"
--                                  seria inferencia, nao leitura. Fica nulo.
-- Ele nao tem NENHUM registro no TSE em 2014, 2016, 2018, 2020, 2022 nem 2026
-- (varredura por nome nos CSVs dos seis anos), entao nao ha rota oficial pra
-- esses dois campos hoje. Desbloqueia no registro de 2026.
--
-- profissao_declarada usa sempre a declaracao TSE MAIS RECENTE do candidato.
-- Por isso patrus-ananias entra como "Advogado" (2022) e nao "Deputado"
-- (2018, que e mandato e nao profissao), e jeremias-cosmo entra como
-- "Professor de Ensino Médio" (2024) e nao "Bancário e Economiário" (2018).
--
-- DIVERGENCIA REGISTRADA, NAO CORRIGIDA: o TSE grafa o sobrenome do
-- patrus-ananias como "DE SOUSA" em 2014 e 2022 e como "DE SOUZA" em 2018. A
-- API da Camara (nomeCivil, id 74160) diz "SOUZA". O banco e o seed usam
-- "Souza", que e a grafia de 2 das 3 fontes. Esta migration NAO mexe no
-- nome_completo dele: trocar grafia de nome civil por maioria simples nao e
-- correcao, e chute. Fica anotado pra decisao de curadoria.
--
-- ---------------------------------------------------------------------
-- IDEMPOTENCIA
--
-- Todo UPDATE tem `and <campo> is null` (ou o valor antigo exato, no caso do
-- nome_completo). Rodar duas vezes nao muda nada na segunda. Nenhum campo ja
-- preenchido por curadoria e sobrescrito: se alguem ja tiver posto valor
-- diferente, o predicado nao casa e a linha e ignorada de proposito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- patrus-ananias (PT-MG) -- fonte T1
-- ---------------------------------------------------------------------
update public.candidatos
   set data_nascimento     = coalesce(data_nascimento, date '1952-01-26'),
       naturalidade        = coalesce(naturalidade, 'Bocaiúva/MG'),
       formacao            = coalesce(formacao, 'Superior completo'),
       profissao_declarada = coalesce(profissao_declarada, 'Advogado'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 130001607244']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 130001607244'] end,
       ultima_atualizacao = now()
 where slug = 'patrus-ananias'
   and (data_nascimento is null or naturalidade is null
        or formacao is null or profissao_declarada is null);

-- ---------------------------------------------------------------------
-- coronel-busnello (MISSAO-RJ) -- fonte T2
-- ---------------------------------------------------------------------
update public.candidatos
   set data_nascimento     = coalesce(data_nascimento, date '1970-08-06'),
       naturalidade        = coalesce(naturalidade, 'Iraí/RS'),
       formacao            = coalesce(formacao, 'Superior completo'),
       profissao_declarada = coalesce(profissao_declarada, 'Policial Militar'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 190001603420']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 190001603420'] end,
       ultima_atualizacao = now()
 where slug = 'coronel-busnello'
   and (data_nascimento is null or naturalidade is null
        or formacao is null or profissao_declarada is null);

-- ---------------------------------------------------------------------
-- marcus-sodre (PSTU-SC) -- fonte T3
-- ---------------------------------------------------------------------
update public.candidatos
   set data_nascimento     = coalesce(data_nascimento, date '1972-01-26'),
       naturalidade        = coalesce(naturalidade, 'Cubatão/SP'),
       formacao            = coalesce(formacao, 'Superior completo'),
       profissao_declarada = coalesce(profissao_declarada, 'Professor de Ensino Médio'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2014 id 240000000204']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2014 id 240000000204'] end,
       ultima_atualizacao = now()
 where slug = 'marcus-sodre'
   and (data_nascimento is null or naturalidade is null
        or formacao is null or profissao_declarada is null);

-- ---------------------------------------------------------------------
-- witer-naves (PSOL-TO) -- fonte T8. So dois campos: os outros dois nao tem
-- fonte e ficam nulos de proposito (ver cabecalho).
-- ---------------------------------------------------------------------
update public.candidatos
   set naturalidade        = coalesce(naturalidade, 'Goiânia/GO'),
       profissao_declarada = coalesce(profissao_declarada, 'Geógrafo'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['Gazeta do Cerrado 2026-07-20 (convencao PSOL/REDE TO)']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['Gazeta do Cerrado 2026-07-20 (convencao PSOL/REDE TO)'] end,
       ultima_atualizacao = now()
 where slug = 'witer-naves'
   and (naturalidade is null or profissao_declarada is null);

-- ---------------------------------------------------------------------
-- jeremias-cosmo (D35-PE) -- fontes T4, T6, T7
-- ---------------------------------------------------------------------
-- Nome civil completo. O valor atual e o nome abreviado que a imprensa usa.
update public.candidatos
   set nome_completo = 'Jeremias Cosmo Silva dos Santos',
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2018 id 170000607399']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2018 id 170000607399'] end,
       ultima_atualizacao = now()
 where slug = 'jeremias-cosmo'
   and nome_completo = 'Jeremias Cosmo';

update public.candidatos
   set data_nascimento     = coalesce(data_nascimento, date '1980-03-27'),
       naturalidade        = coalesce(naturalidade, 'Palmares/PE'),
       formacao            = coalesce(formacao, 'Superior completo'),
       profissao_declarada = coalesce(profissao_declarada, 'Professor de Ensino Médio'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2018 id 170000607399']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2018 id 170000607399'] end,
       ultima_atualizacao = now()
 where slug = 'jeremias-cosmo'
   and (data_nascimento is null or naturalidade is null
        or formacao is null or profissao_declarada is null);

-- ---------------------------------------------------------------------
-- marcelo-brigadeiro (MISSAO-SC) -- fonte T5
-- ---------------------------------------------------------------------
update public.candidatos
   set data_nascimento     = coalesce(data_nascimento, date '1982-05-04'),
       naturalidade        = coalesce(naturalidade, 'Rio de Janeiro/RJ'),
       formacao            = coalesce(formacao, 'Superior completo'),
       profissao_declarada = coalesce(profissao_declarada, 'Empresário'),
       fonte_dados = case
         when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2018 id 240000609728']
         then fonte_dados
         else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2018 id 240000609728'] end,
       ultima_atualizacao = now()
 where slug = 'marcelo-brigadeiro'
   and (data_nascimento is null or naturalidade is null
        or formacao is null or profissao_declarada is null);

-- =====================================================================
-- CONFERENCIA APOS APLICAR
--
--   select slug, nome_completo, data_nascimento, naturalidade, formacao,
--          profissao_declarada
--     from public.candidatos
--    where slug in ('patrus-ananias','coronel-busnello','marcus-sodre',
--                   'witer-naves','jeremias-cosmo','marcelo-brigadeiro')
--    order by slug;
--
-- Esperado: witer-naves com data_nascimento e formacao nulos, e os outros
-- cinco com os quatro campos preenchidos.
-- =====================================================================
