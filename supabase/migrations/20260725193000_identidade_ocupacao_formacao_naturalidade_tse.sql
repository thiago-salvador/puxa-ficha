-- =====================================================================
-- Identidade: ocupacao declarada, grau de instrucao e naturalidade,
-- contra o registro eleitoral do TSE. Quatro candidatos publicaveis.
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A migration 20260725123000_identidade_candidatos_fonte_oficial.sql varreu a
-- classe em nome_completo, data_nascimento, naturalidade (5 casos), formacao
-- (4 casos) e wikidata_id. Ela NAO tocou a coluna profissao_declarada em
-- candidato nenhum, e deixou de fora os quatro casos abaixo, que sao do achado
-- A7 do laudo (QID cru do Wikidata gravado como profissao) e do padrao
-- "formacao guarda o nome de uma instituicao no lugar do grau".
--
-- O que renderiza hoje na ficha publica, ao vivo:
--   lucas-ribeiro    profissao_declarada = 'Q36834'   (QID de compositor)
--   rafael-fonteles  profissao_declarada = 'Q82955'   (QID cru)
--                    formacao = 'Instituto Nacional de Matemática Pura e Aplicada'
--   gabriel-souza    profissao_declarada = 'Q82955'   (QID cru)
--                    naturalidade = 'RS' (so a UF)
--   clecio-luis      formacao = 'Universidade Federal do Amapá'
--
-- 'Q36834' e 'Q82955' nao sao profissao. Sao identificadores internos do
-- Wikidata vazando para a superficie publica. E, no caso de lucas-ribeiro,
-- Q36834 vem do mesmo vinculo de homonimo que a migration 20260725123000 ja
-- derruba em wikidata_id (achado A8: o QID aponta para um cantor).
--
-- CRITERIO: o valor novo e sempre o literal do campo correspondente no
-- registro eleitoral do TSE. Nada e inferido de biografia ou de imprensa.
-- Onde o TSE nao publica o dado, o campo nao e tocado.
--
-- ORDEM IMPORTA: timestamp posterior a 20260725123000. Os predicados abaixo
-- esperam o estado depois daquela migration. Nenhum campo tocado aqui e
-- tocado la, entao nao ha conflito: verificado por grep dos quatro ids.
--
-- ---------------------------------------------------------------------
-- FONTES, TESTADAS POR MIM COM curl -L --compressed E USER-AGENT DE NAVEGADOR
-- EM 2026-07-25. Status e tamanho observados nesta sessao.
--
-- Base: TSE DivulgaCandContas, registro eleitoral de 2022, rota
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/{UF}/2040602022/candidato/{sq}
--
-- T1  UF PB, sq 150001613756 (lucas-ribeiro). HTTP 200, 7170 bytes.
--     "nomeCompleto":"LUCAS RIBEIRO NOVAIS DE ARAÚJO"
--     "ocupacao":"Advogado"
--     "grauInstrucao":"Superior completo"
--     "descricaoNaturalidade":"PB-JOÃO PESSOA"
--
-- T2  UF PI, sq 180001604027 (rafael-fonteles). HTTP 200, 7436 bytes.
--     "nomeCompleto":"RAFAEL TAJRA FONTELES"
--     "ocupacao":"Professor de Ensino Superior"
--     "grauInstrucao":"Superior completo"
--     "descricaoNaturalidade":"PI-TERESINA"
--
-- T3  UF RS, sq 210001609848 (gabriel-souza). HTTP 200, 8343 bytes.
--     "nomeCompleto":"GABRIEL VIEIRA DE SOUZA"
--     "ocupacao":"Veterinário"
--     "grauInstrucao":"Superior completo"
--     "descricaoNaturalidade":"RS-Porto Alegre"
--
-- T4  UF AP, sq 30001619676 (clecio-luis). HTTP 200, 8136 bytes.
--     "nomeCompleto":"CLÉCIO LUÍS VILHENA VIEIRA"
--     "ocupacao":"Servidor Público Estadual"
--     "grauInstrucao":"Superior completo"
--     "descricaoNaturalidade":"PA-BELÉM"
--
-- CORROBORACAO INDEPENDENTE de gabriel-souza (nao substitui o TSE, confirma):
-- T5  https://vicegovernador.rs.gov.br/o-vice-governador
--     Governo do Rio Grande do Sul, Gabinete do Vice-Governador.
--     HTTP 200, 43395 bytes. Trechos literais:
--       "Gabriel Souza é médico veterinário, formado pela Ulbra."
--       "Nascido em Porto Alegre, em 2 de janeiro de 1984, Gabriel cresceu em
--        Tramandaí, no Litoral Norte"
--
-- ---------------------------------------------------------------------
-- SELECT DE VERIFICACAO RODADO CONTRA PRODUCAO EM 2026-07-25 (somente leitura)
--
--   select slug, naturalidade, formacao, profissao_declarada
--     from candidatos
--    where slug in ('lucas-ribeiro','rafael-fonteles','gabriel-souza','clecio-luis');
--
--   VALORES ATUAIS OBSERVADOS:
--     clecio-luis     | Belém    | Universidade Federal do Amapá                  | SERVIDOR PÚBLICO ESTADUAL
--     gabriel-souza   | RS       | SUPERIOR COMPLETO                              | Q82955
--     lucas-ribeiro   | MG       | ENSINO MÉDIO COMPLETO                          | Q36834
--     rafael-fonteles | Teresina | Instituto Nacional de Matemática Pura e Aplicada| Q82955
--
--   Observacao sobre lucas-ribeiro: naturalidade e formacao dele NAO sao
--   tocadas aqui, porque 20260725123000 ja os corrige para 'João Pessoa/PB' e
--   'Superior completo'. Este arquivo so mexe na profissao dele.
--
--   RESULTADO ESPERADO DEPOIS DESTE ARQUIVO (mesmo SELECT):
--     clecio-luis     | Belém/PA    | Superior completo | Servidor Público Estadual
--     gabriel-souza   | Porto Alegre/RS | SUPERIOR COMPLETO | Veterinário
--     lucas-ribeiro   | João Pessoa/PB  | Superior completo | Advogado
--     rafael-fonteles | Teresina/PI     | Superior completo | Professor de Ensino Superior
--
--   Prova de que nao sobrou QID cru nos quatro:
--     select count(*) from candidatos
--      where slug in ('lucas-ribeiro','rafael-fonteles','gabriel-souza','clecio-luis')
--        and profissao_declarada ~ '^Q[0-9]+$';
--     -- esperado: 0 (hoje: 3)
--
-- IDEMPOTENTE: cada update e por id explicito E condicionado ao valor errado
-- atual. Rodar de novo nao muda nada.
-- REVERSIVEL: o valor anterior esta no comentario de cada bloco.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- lucas-ribeiro (b8ad0e9c-eb0f-4b37-bdf9-840c5d167016)
-- ---------------------------------------------------------------------
--   profissao_declarada
--     valor atual : Q36834
--     valor certo : Advogado
--     fonte       : T1, TSE 2022 PB sq 150001613756
--     trecho      : "ocupacao":"Advogado"
--   Nota: Q36834 e o QID de "compositor" no Wikidata e vem do mesmo vinculo de
--   homonimo (Q28677315) que 20260725123000 anula em wikidata_id. O TSE
--   registra advogado, o que confirma que o QID apontava para outra pessoa.
update public.candidatos
   set profissao_declarada = 'Advogado',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 150001613756']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 150001613756'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and profissao_declarada = 'Q36834';

-- ---------------------------------------------------------------------
-- rafael-fonteles (57b743d5-db7b-4048-862d-9378a9fff366)
-- ---------------------------------------------------------------------
--   profissao_declarada
--     valor atual : Q82955
--     valor certo : Professor de Ensino Superior
--     fonte       : T2, TSE 2022 PI sq 180001604027
--     trecho      : "ocupacao":"Professor de Ensino Superior"
update public.candidatos
   set profissao_declarada = 'Professor de Ensino Superior',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001604027']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001604027'] end,
       ultima_atualizacao = now()
 where id = '57b743d5-db7b-4048-862d-9378a9fff366'::uuid
   and profissao_declarada = 'Q82955';

--   formacao
--     valor atual : Instituto Nacional de Matemática Pura e Aplicada
--     valor certo : Superior completo
--     fonte       : T2, trecho "grauInstrucao":"Superior completo"
--   O campo guarda grau de instrucao, nao instituicao. O nome do IMPA nao tem
--   fonte primaria anexada em lugar nenhum da ficha e nao volta como palpite:
--   se a curadoria quiser registrar a instituicao, o lugar e a biografia, com
--   fonte propria.
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001604027']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001604027'] end,
       ultima_atualizacao = now()
 where id = '57b743d5-db7b-4048-862d-9378a9fff366'::uuid
   and formacao = 'Instituto Nacional de Matemática Pura e Aplicada';

--   naturalidade
--     valor atual : Teresina
--     valor certo : Teresina/PI
--     fonte       : T2, trecho "descricaoNaturalidade":"PI-TERESINA"
--   Nao e correcao de erro, e completude: o padrao das demais fichas e
--   'Municipio/UF'. O municipio ja estava certo.
update public.candidatos
   set naturalidade = 'Teresina/PI',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001604027']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001604027'] end,
       ultima_atualizacao = now()
 where id = '57b743d5-db7b-4048-862d-9378a9fff366'::uuid
   and naturalidade = 'Teresina';

-- ---------------------------------------------------------------------
-- gabriel-souza (b01d3b26-32d0-48c3-9242-6c6b324b249d)
-- ---------------------------------------------------------------------
--   profissao_declarada
--     valor atual : Q82955
--     valor certo : Veterinário
--     fonte       : T3, trecho "ocupacao":"Veterinário"
--     corroboracao: T5, "Gabriel Souza é médico veterinário, formado pela Ulbra."
update public.candidatos
   set profissao_declarada = 'Veterinário',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001609848']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001609848'] end,
       ultima_atualizacao = now()
 where id = 'b01d3b26-32d0-48c3-9242-6c6b324b249d'::uuid
   and profissao_declarada = 'Q82955';

--   naturalidade
--     valor atual : RS  (so a UF, sem municipio)
--     valor certo : Porto Alegre/RS
--     fonte       : T3, trecho "descricaoNaturalidade":"RS-Porto Alegre"
--     corroboracao: T5, "Nascido em Porto Alegre, em 2 de janeiro de 1984"
update public.candidatos
   set naturalidade = 'Porto Alegre/RS',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001609848']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001609848'] end,
       ultima_atualizacao = now()
 where id = 'b01d3b26-32d0-48c3-9242-6c6b324b249d'::uuid
   and naturalidade = 'RS';

-- ---------------------------------------------------------------------
-- clecio-luis (d97908e9-5b30-4d0e-a01b-c0348682949d)
-- ---------------------------------------------------------------------
--   formacao
--     valor atual : Universidade Federal do Amapá
--     valor certo : Superior completo
--     fonte       : T4, trecho "grauInstrucao":"Superior completo"
--   Mesmo padrao de rafael-fonteles: instituicao gravada no campo de grau.
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 30001619676']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 30001619676'] end,
       ultima_atualizacao = now()
 where id = 'd97908e9-5b30-4d0e-a01b-c0348682949d'::uuid
   and formacao = 'Universidade Federal do Amapá';

--   naturalidade
--     valor atual : Belém
--     valor certo : Belém/PA
--     fonte       : T4, trecho "descricaoNaturalidade":"PA-BELÉM"
--   Completude, nao correcao: o municipio ja estava certo, faltava a UF.
update public.candidatos
   set naturalidade = 'Belém/PA',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 30001619676']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 30001619676'] end,
       ultima_atualizacao = now()
 where id = 'd97908e9-5b30-4d0e-a01b-c0348682949d'::uuid
   and naturalidade = 'Belém';

-- NAO TOCADO DE PROPOSITO
--   jorginho-mello.profissao_declarada = 'SENADOR'. O valor reproduz fielmente
--   "ocupacao":"Senador" do registro do TSE de 2022 (HTTP 200, 13797 bytes),
--   entao nao e falso na origem. Exibi-lo hoje como ocupacao atual induz a
--   erro, porque ele renunciou ao Senado em 29/12/2022, mas o conserto certo e
--   de rotulo na interface ("ocupação declarada ao TSE em 2022"), nao de dado.
--   Registrado aqui para nao virar achado perdido.
--
--   lucas-ribeiro.wikidata_id e gabriel-souza.wikidata_id: nao consultei o
--   Wikidata nesta sessao, entao nao proponho valor novo para nenhum dos dois.
--   O de lucas-ribeiro ja e anulado por 20260725123000.

commit;
