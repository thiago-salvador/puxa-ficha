-- Correcao de identidade de candidatos publicaveis contra fonte oficial primaria.
-- Origem: auditoria de integridade de 24/07/2026 (docs/auditoria-integridade-2026-07-24.md), achado V3,
-- estendido de 4 fichas para a varredura da classe inteira.
-- Fontes verificadas por requisicao real em 25/07/2026.
--
-- O que esta migration corrige, em 44 candidatos publicaveis:
--   35 nome_completo divergente do nome civil na fonte oficial
--    5 data_nascimento errada (3 delas placeholder 01/01)
--    5 naturalidade com UF de nascimento contraditada pela fonte oficial
--    4 formacao com grau de instrucao abaixo do declarado ao TSE
--   10 wikidata_id apontando para outra pessoa (homonimo)
--
-- Fontes, em ordem de precedencia (fonte primaria oficial vence tudo):
--   1. TSE DivulgaCandContas, registro eleitoral
--      https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/{UF}/2040602022/candidato/{id}
--      municipal 2020: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/{cod}/2030402020/candidato/{id}
--   2. Senado Federal, dados abertos
--      https://legis.senado.leg.br/dadosabertos/senador/{codigo}.json
--   3. Camara dos Deputados, dados abertos
--      https://dadosabertos.camara.leg.br/api/v2/deputados/{id}
--   4. Wikidata, usada SO para derrubar wikidata_id de homonimo, nunca como fonte de nome ou data
--      https://www.wikidata.org/w/api.php?action=wbgetentities&ids={QID}
--
-- Como cada linha do banco foi amarrada ao registro oficial (nenhuma correcao usa semelhanca de nome):
--   CPF identico ao publicado pelo TSE: 63 candidatos
--   data de nascimento + nome de urna + UF de candidatura identicos: 46 candidatos
--   109 dos 195 publicaveis ficaram com pelo menos uma fonte oficial amarrada.
--
-- Idempotencia e reversibilidade: cada UPDATE e por id explicito E condicionado ao valor errado atual.
-- Rodar de novo nao muda nada. O valor anterior esta escrito no comentario acima de cada UPDATE,
-- entao a reversao e mecanica.
--
-- SELECT de validacao rodado em 25/07/2026 contra producao, somente leitura, comparando os 59 pares
-- (id, valor atual) usados aqui:
--
--   with esperado(id, campo, valor_atual) as (values (...os 59 pares abaixo...))
--   select e.campo, count(*) as total,
--          count(*) filter (where case e.campo
--            when 'nome_completo'   then c.nome_completo
--            when 'data_nascimento' then c.data_nascimento::text
--            when 'naturalidade'    then c.naturalidade
--            when 'formacao'        then c.formacao
--            when 'wikidata_id'     then c.wikidata_id end is not distinct from e.valor_atual) as confere
--     from esperado e join public.candidatos c on c.id = e.id
--    group by e.campo order by e.campo;
--
-- Resultado observado:
--   data_nascimento  total 5   confere 5
--   formacao         total 4   confere 4
--   naturalidade     total 5   confere 5
--   nome_completo    total 35  confere 35
--   wikidata_id      total 10  confere 10
-- Ou seja, os 59 valores atuais sao exatamente os que esta migration espera encontrar.

begin;

-- ==================================================================================================
-- 1. nome_completo divergente do nome civil oficial (35 candidatos)
-- ==================================================================================================

-- alan-rick
--   valor atual : Alan Rick Pereira da Silva
--   valor certo : Alan Rick Miranda
--   fonte       : TSE DivulgaCandContas 2022 (id 10001714547, vinculo por CPF identico)
--   trecho      : ALAN RICK MIRANDA
update public.candidatos
   set nome_completo = 'Alan Rick Miranda',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 10001714547']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 10001714547'] end,
       ultima_atualizacao = now()
 where id = 'c7e3a004-99ba-426b-af65-206e3066c496'::uuid
   and nome_completo = 'Alan Rick Pereira da Silva';

-- amelio-cayres
--   valor atual : Amélio Antunes Cayres
--   valor certo : Amelio Cayres de Almeida
--   fonte       : TSE DivulgaCandContas 2022 (id 270001654140, vinculo por CPF identico)
--   trecho      : AMELIO CAYRES DE ALMEIDA
--   ATENCAO     : o valor proposto e literalmente o que o TSE registra, inclusive sem acento.
--                 Acentuar (Amelio -> Amelio com agudo, Jose -> Jose com agudo, Avila -> Avila com agudo)
--                 seria decisao editorial de grafia, sem lastro na fonte. Deixado como esta, para o revisor decidir.
update public.candidatos
   set nome_completo = 'Amelio Cayres de Almeida',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 270001654140']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 270001654140'] end,
       ultima_atualizacao = now()
 where id = '75d2da17-ddd3-45f2-9bde-07ed8655034a'::uuid
   and nome_completo = 'Amélio Antunes Cayres';

-- anderson-ferreira
--   valor atual : Anderson Ferreira de Alencar
--   valor certo : Anderson Ferreira Rodrigues
--   fonte       : TSE DivulgaCandContas 2022 (id 170001602587, vinculo por CPF identico)
--   trecho      : ANDERSON FERREIRA RODRIGUES
update public.candidatos
   set nome_completo = 'Anderson Ferreira Rodrigues',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 170001602587']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 170001602587'] end,
       ultima_atualizacao = now()
 where id = '3721c0c9-3b8b-4258-b453-6350b51dc0c8'::uuid
   and nome_completo = 'Anderson Ferreira de Alencar';

-- ataides-oliveira
--   valor atual : Ataídes de Oliveira Leite
--   valor certo : Ataídes de Oliveira
--   fonte       : Senado dados abertos cod 5164 e TSE 2018 id 270000602793
--   trecho      : Ataídes de Oliveira
update public.candidatos
   set nome_completo = 'Ataídes de Oliveira',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Senado dados abertos cod 5164']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Senado dados abertos cod 5164'] end,
       ultima_atualizacao = now()
 where id = '131fa6ef-ec83-40fc-8cb8-d01c79dd30cd'::uuid
   and nome_completo = 'Ataídes de Oliveira Leite';

-- celina-leao
--   valor atual : Celina Leao Rocha de Siqueira Campos
--   valor certo : Celina Leão Hizim Ferreira
--   fonte       : TSE DivulgaCandContas 2022 (id 70001651045, vinculo por CPF identico)
--   trecho      : CELINA LEÃO HIZIM FERREIRA
update public.candidatos
   set nome_completo = 'Celina Leão Hizim Ferreira',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 70001651045']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 70001651045'] end,
       ultima_atualizacao = now()
 where id = '91dc9c87-6811-494c-8c51-1bccfdf08c29'::uuid
   and nome_completo = 'Celina Leao Rocha de Siqueira Campos';

-- daniel-vilela
--   valor atual : Daniel Goulart Vilela
--   valor certo : Daniel Elias Carvalho Vilela
--   fonte       : TSE DivulgaCandContas 2022 (id 90001646327, vinculo por CPF identico)
--   trecho      : DANIEL ELIAS CARVALHO VILELA
update public.candidatos
   set nome_completo = 'Daniel Elias Carvalho Vilela',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 90001646327']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 90001646327'] end,
       ultima_atualizacao = now()
 where id = 'd80384f6-147b-40ef-8fa5-ae0b2be5a1f5'::uuid
   and nome_completo = 'Daniel Goulart Vilela';

-- delegado-eder-mauro
--   valor atual : Eder Braga Mauro
--   valor certo : Eder Mauro Cardoso Barra
--   fonte       : TSE DivulgaCandContas 2022 (id 140001598311, vinculo por CPF identico)
--   trecho      : EDER MAURO CARDOSO BARRA
update public.candidatos
   set nome_completo = 'Eder Mauro Cardoso Barra',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 140001598311']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 140001598311'] end,
       ultima_atualizacao = now()
 where id = '6d89f284-e148-454e-85e1-c77996c132b5'::uuid
   and nome_completo = 'Eder Braga Mauro';

-- dr-fernando-maximo
--   valor atual : Fernando Máximo de Oliveira
--   valor certo : Fernando Rodrigues Máximo
--   fonte       : TSE DivulgaCandContas 2022 (id 220001600708, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : FERNANDO RODRIGUES MÁXIMO
update public.candidatos
   set nome_completo = 'Fernando Rodrigues Máximo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 220001600708']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 220001600708'] end,
       ultima_atualizacao = now()
 where id = 'e617ca2f-52b2-474c-a138-055898daced2'::uuid
   and nome_completo = 'Fernando Máximo de Oliveira';

-- edegar-pretto
--   valor atual : Edegar Pretto
--   valor certo : João Edegar Pretto
--   fonte       : TSE DivulgaCandContas 2022 (id 210001604469, vinculo por CPF identico)
--   trecho      : JOÃO EDEGAR PRETTO
update public.candidatos
   set nome_completo = 'João Edegar Pretto',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001604469']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001604469'] end,
       ultima_atualizacao = now()
 where id = 'c2787afe-44e4-48c6-9e64-250eacb1ad0d'::uuid
   and nome_completo = 'Edegar Pretto';

-- eduardo-braga
--   valor atual : Eduardo Braga Granata
--   valor certo : Carlos Eduardo de Souza Braga
--   fonte       : TSE DivulgaCandContas 2022 (id 40001610345, vinculo por CPF identico)
--   trecho      : CARLOS EDUARDO DE SOUZA BRAGA
update public.candidatos
   set nome_completo = 'Carlos Eduardo de Souza Braga',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 40001610345']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 40001610345'] end,
       ultima_atualizacao = now()
 where id = '96dd2cb2-3ae8-44fc-b169-93a722247f9d'::uuid
   and nome_completo = 'Eduardo Braga Granata';

-- eduardo-braide
--   valor atual : Eduardo Costa Braide
--   valor certo : Eduardo Salim Braide
--   fonte       : Camara dados abertos
--   trecho      : EDUARDO SALIM BRAIDE
update public.candidatos
   set nome_completo = 'Eduardo Salim Braide',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Camara dados abertos']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Camara dados abertos'] end,
       ultima_atualizacao = now()
 where id = '3c885bab-cc3e-4fcf-aa1a-7b9c0ebf38e9'::uuid
   and nome_completo = 'Eduardo Costa Braide';

-- enilton-rodrigues
--   valor atual : Enilton Rodrigues
--   valor certo : Enilton Silva Rodrigues
--   fonte       : TSE DivulgaCandContas 2022 (id 100001713289, vinculo por CPF identico)
--   trecho      : ENILTON SILVA RODRIGUES
update public.candidatos
   set nome_completo = 'Enilton Silva Rodrigues',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 100001713289']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 100001713289'] end,
       ultima_atualizacao = now()
 where id = '17fa576f-b79d-4177-8814-29f5236f8def'::uuid
   and nome_completo = 'Enilton Rodrigues';

-- fabio-trad
--   valor atual : Fabio Trad
--   valor certo : Fábio Ricardo Trad
--   fonte       : TSE DivulgaCandContas 2022 (id 120001650734, vinculo por CPF identico)
--   trecho      : FÁBIO RICARDO TRAD
update public.candidatos
   set nome_completo = 'Fábio Ricardo Trad',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 120001650734']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 120001650734'] end,
       ultima_atualizacao = now()
 where id = 'e10f4186-0132-48f3-be4c-5397642eecd4'::uuid
   and nome_completo = 'Fabio Trad';

-- gabriel-souza
--   valor atual : Gabriel Souza
--   valor certo : Gabriel Vieira de Souza
--   fonte       : TSE DivulgaCandContas 2022 (id 210001609848, vinculo por CPF identico)
--   trecho      : GABRIEL VIEIRA DE SOUZA
update public.candidatos
   set nome_completo = 'Gabriel Vieira de Souza',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001609848']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001609848'] end,
       ultima_atualizacao = now()
 where id = 'b01d3b26-32d0-48c3-9242-6c6b324b249d'::uuid
   and nome_completo = 'Gabriel Souza';

-- indira-xavier
--   valor atual : Indira Xavier
--   valor certo : Indira Ivanise Xavier
--   fonte       : TSE DivulgaCandContas 2022 (id 130001693598, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : INDIRA IVANISE XAVIER
update public.candidatos
   set nome_completo = 'Indira Ivanise Xavier',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 130001693598']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 130001693598'] end,
       ultima_atualizacao = now()
 where id = 'b423fdbb-b7b8-48c8-9236-efac480e7017'::uuid
   and nome_completo = 'Indira Xavier';

-- ivan-moraes
--   valor atual : Ivan Moraes Filho
--   valor certo : Ivan Vasconcellos de Moraes Filho
--   fonte       : TSE DivulgaCandContas 2022 (id 170001618403, vinculo por CPF identico)
--   trecho      : IVAN VASCONCELLOS DE MORAES FILHO
update public.candidatos
   set nome_completo = 'Ivan Vasconcellos de Moraes Filho',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 170001618403']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 170001618403'] end,
       ultima_atualizacao = now()
 where id = '8a59da03-a2ad-4385-9516-eb738f970df0'::uuid
   and nome_completo = 'Ivan Moraes Filho';

-- janaina-riva
--   valor atual : Janaina Riva
--   valor certo : Janaína Greyce Riva Fagundes
--   fonte       : TSE DivulgaCandContas 2022 (id 110001623186, vinculo por CPF identico)
--   trecho      : JANAÍNA GREYCE RIVA FAGUNDES
update public.candidatos
   set nome_completo = 'Janaína Greyce Riva Fagundes',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 110001623186']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 110001623186'] end,
       ultima_atualizacao = now()
 where id = 'e8f8c25c-e121-4b7a-8049-b5b68a8ec7f0'::uuid
   and nome_completo = 'Janaina Riva';

-- jeferson-bezerra
--   valor atual : Jeferson Bezerra
--   valor certo : Jeferson Jose Bezerra
--   fonte       : TSE DivulgaCandContas 2022 (id 120001611531, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : JEFERSON JOSE BEZERRA
--   ATENCAO     : o valor proposto e literalmente o que o TSE registra, inclusive sem acento.
--                 Acentuar (Amelio -> Amelio com agudo, Jose -> Jose com agudo, Avila -> Avila com agudo)
--                 seria decisao editorial de grafia, sem lastro na fonte. Deixado como esta, para o revisor decidir.
update public.candidatos
   set nome_completo = 'Jeferson Jose Bezerra',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 120001611531']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 120001611531'] end,
       ultima_atualizacao = now()
 where id = '10874c20-5864-42f9-a83e-0610502381c6'::uuid
   and nome_completo = 'Jeferson Bezerra';

-- jhc
--   valor atual : Joao Henrique Caldas
--   valor certo : João Henrique Holanda Caldas
--   fonte       : TSE DivulgaCandContas 2020, Maceió/AL, id 20000842791
--   trecho      : JOAO HENRIQUE HOLANDA  CALDAS
update public.candidatos
   set nome_completo = 'João Henrique Holanda Caldas',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2020 id 20000842791']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2020 id 20000842791'] end,
       ultima_atualizacao = now()
 where id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
   and nome_completo = 'Joao Henrique Caldas';

-- joel-rodrigues
--   valor atual : Joel Rodrigues de Castro
--   valor certo : Joel Rodrigues da Silva
--   fonte       : TSE DivulgaCandContas 2022 (id 180001600654, vinculo por CPF identico)
--   trecho      : JOEL RODRIGUES DA SILVA
update public.candidatos
   set nome_completo = 'Joel Rodrigues da Silva',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001600654']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001600654'] end,
       ultima_atualizacao = now()
 where id = '63de6cc4-aebc-49f6-88ab-25c93dde0a58'::uuid
   and nome_completo = 'Joel Rodrigues de Castro';

-- juliana-brizola
--   valor atual : Juliana Daudt Brizola
--   valor certo : Juliana Brizola
--   fonte       : TSE 2022 id 210001621265 e TSE 2018 id 210000604676
--   trecho      : JULIANA BRIZOLA
update public.candidatos
   set nome_completo = 'Juliana Brizola',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001621265']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001621265'] end,
       ultima_atualizacao = now()
 where id = '7a6a6475-0691-4823-9104-5055ca589405'::uuid
   and nome_completo = 'Juliana Daudt Brizola';

-- leandro-grass
--   valor atual : Leandro Grass Peixoto
--   valor certo : Leandro Antônio Grass Peixoto
--   fonte       : TSE DivulgaCandContas 2022 (id 70001597108, vinculo por CPF identico)
--   trecho      : LEANDRO ANTÔNIO GRASS PEIXOTO
update public.candidatos
   set nome_completo = 'Leandro Antônio Grass Peixoto',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 70001597108']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 70001597108'] end,
       ultima_atualizacao = now()
 where id = '3b724874-8769-44f3-aab3-06c0155dc155'::uuid
   and nome_completo = 'Leandro Grass Peixoto';

-- lucas-ribeiro
--   valor atual : Lucas Ribeiro
--   valor certo : Lucas Ribeiro Novais de Araújo
--   fonte       : TSE DivulgaCandContas 2022 (id 150001613756, vinculo por CPF identico)
--   trecho      : LUCAS RIBEIRO NOVAIS DE ARAÚJO
update public.candidatos
   set nome_completo = 'Lucas Ribeiro Novais de Araújo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 150001613756']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 150001613756'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and nome_completo = 'Lucas Ribeiro';

-- mailza-assis
--   valor atual : Mailza Gomes Assis
--   valor certo : Mailza Assis da Silva
--   fonte       : Senado dados abertos
--   trecho      : Mailza Assis da Silva
update public.candidatos
   set nome_completo = 'Mailza Assis da Silva',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Senado dados abertos']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Senado dados abertos'] end,
       ultima_atualizacao = now()
 where id = '4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid
   and nome_completo = 'Mailza Gomes Assis';

-- marcos-vieira
--   valor atual : Marcos Vieira
--   valor certo : Marcos Luiz Vieira
--   fonte       : TSE DivulgaCandContas 2022 (id 240001612502, vinculo por CPF identico)
--   trecho      : MARCOS LUIZ VIEIRA
update public.candidatos
   set nome_completo = 'Marcos Luiz Vieira',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 240001612502']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 240001612502'] end,
       ultima_atualizacao = now()
 where id = '0394c7a4-6311-4eeb-a0aa-9d3b996b4aae'::uuid
   and nome_completo = 'Marcos Vieira';

-- maria-da-consolacao
--   valor atual : Maria da Consolação Soares
--   valor certo : Maria da Consolação Rocha
--   fonte       : TSE DivulgaCandContas 2022 (id 130001615215, vinculo por CPF identico)
--   trecho      : MARIA DA CONSOLAÇÃO ROCHA
update public.candidatos
   set nome_completo = 'Maria da Consolação Rocha',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 130001615215']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 130001615215'] end,
       ultima_atualizacao = now()
 where id = '92699f1a-6206-44fd-b761-5d86f9fd2c37'::uuid
   and nome_completo = 'Maria da Consolação Soares';

-- otaviano-pivetta
--   valor atual : Otaviano Pivetta
--   valor certo : Otaviano Olavo Pivetta
--   fonte       : TSE DivulgaCandContas 2022 (id 110001643542, vinculo por CPF identico)
--   trecho      : OTAVIANO OLAVO PIVETTA
update public.candidatos
   set nome_completo = 'Otaviano Olavo Pivetta',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 110001643542']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 110001643542'] end,
       ultima_atualizacao = now()
 where id = 'a8a86164-4000-4bbe-ac11-c02b90955ea5'::uuid
   and nome_completo = 'Otaviano Pivetta';

-- paula-belmonte
--   valor atual : Paula Francinete Belmonte da Silva
--   valor certo : Paula Moreno Paro Belmonte
--   fonte       : Camara dados abertos
--   trecho      : PAULA MORENO PARO BELMONTE
update public.candidatos
   set nome_completo = 'Paula Moreno Paro Belmonte',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Camara dados abertos']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Camara dados abertos'] end,
       ultima_atualizacao = now()
 where id = '17472d91-6cfc-453d-8481-4fac47d07f36'::uuid
   and nome_completo = 'Paula Francinete Belmonte da Silva';

-- rafael-duda
--   valor atual : Rafael Duda
--   valor certo : Rafael Ribeiro de Avila
--   fonte       : TSE DivulgaCandContas 2022 (id 130001644584, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : RAFAEL RIBEIRO DE AVILA
--   ATENCAO     : o valor proposto e literalmente o que o TSE registra, inclusive sem acento.
--                 Acentuar (Amelio -> Amelio com agudo, Jose -> Jose com agudo, Avila -> Avila com agudo)
--                 seria decisao editorial de grafia, sem lastro na fonte. Deixado como esta, para o revisor decidir.
update public.candidatos
   set nome_completo = 'Rafael Ribeiro de Avila',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 130001644584']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 130001644584'] end,
       ultima_atualizacao = now()
 where id = '1eb75804-f098-4956-a1df-fd18d16c5f1d'::uuid
   and nome_completo = 'Rafael Duda';

-- renan-filho
--   valor atual : Renan Calheiros Filho
--   valor certo : José Renan Vasconcelos Calheiros Filho
--   fonte       : TSE DivulgaCandContas 2022 (id 20001698127, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : JOSÉ RENAN VASCONCELOS CALHEIROS FILHO
update public.candidatos
   set nome_completo = 'José Renan Vasconcelos Calheiros Filho',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 20001698127']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 20001698127'] end,
       ultima_atualizacao = now()
 where id = '81e00cd6-ea5b-4c19-8bff-a116fb73e5a7'::uuid
   and nome_completo = 'Renan Calheiros Filho';

-- ronaldo-mansur
--   valor atual : Ronaldo Mansur
--   valor certo : Ronaldo Mansur Santos Silva
--   fonte       : TSE DivulgaCandContas 2022 (id 50001600528, vinculo por CPF identico)
--   trecho      : RONALDO MANSUR SANTOS SILVA
update public.candidatos
   set nome_completo = 'Ronaldo Mansur Santos Silva',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 50001600528']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 50001600528'] end,
       ultima_atualizacao = now()
 where id = 'd5ece407-2e2a-4e76-91a9-c2b7db826430'::uuid
   and nome_completo = 'Ronaldo Mansur';

-- serley-leal
--   valor atual : Serley Leal
--   valor certo : Serley de Sousa Leal
--   fonte       : TSE DivulgaCandContas 2022 (id 60001634109, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : SERLEY DE SOUSA LEAL
update public.candidatos
   set nome_completo = 'Serley de Sousa Leal',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 60001634109']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 60001634109'] end,
       ultima_atualizacao = now()
 where id = '38149b1c-1a82-482f-bb46-a9c7fea3afa6'::uuid
   and nome_completo = 'Serley Leal';

-- wellington-fagundes
--   valor atual : Wellington Fagundes
--   valor certo : Wellington Antônio Fagundes
--   fonte       : TSE DivulgaCandContas 2022 (id 110001676176, vinculo por CPF identico)
--   trecho      : WELLINGTON ANTÔNIO FAGUNDES
update public.candidatos
   set nome_completo = 'Wellington Antônio Fagundes',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 110001676176']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 110001676176'] end,
       ultima_atualizacao = now()
 where id = 'febc4a12-c352-448a-99dc-671c77e8d57d'::uuid
   and nome_completo = 'Wellington Fagundes';

-- wilder-morais
--   valor atual : Wilder Gomes de Morais
--   valor certo : Wilder Pedro de Morais
--   fonte       : TSE DivulgaCandContas 2022 (id 90001652051, vinculo por CPF identico)
--   trecho      : WILDER PEDRO DE MORAIS
update public.candidatos
   set nome_completo = 'Wilder Pedro de Morais',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 90001652051']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 90001652051'] end,
       ultima_atualizacao = now()
 where id = 'af18411e-e979-4a30-9a1c-c64927b50442'::uuid
   and nome_completo = 'Wilder Gomes de Morais';

-- wilson-witzel
--   valor atual : Wilson Witzel
--   valor certo : Wilson José Witzel
--   fonte       : TSE DivulgaCandContas 2022 (id 190001714872, vinculo por data de nascimento + nome de urna + UF)
--   trecho      : WILSON JOSÉ WITZEL
update public.candidatos
   set nome_completo = 'Wilson José Witzel',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 190001714872']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 190001714872'] end,
       ultima_atualizacao = now()
 where id = '85551bd4-860e-4abd-b9ed-463c1691e929'::uuid
   and nome_completo = 'Wilson Witzel';

-- ==================================================================================================
-- 2. data_nascimento errada (5 candidatos)
-- ==================================================================================================

-- douglas-ruas
--   valor atual : 1989-01-01
--   valor certo : 1989-01-17
--   fonte       : TSE 2022 id 190001596741
--   trecho      : "dataDeNascimento":"1989-01-17"
update public.candidatos
   set data_nascimento = '1989-01-17',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 190001596741']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 190001596741'] end,
       ultima_atualizacao = now()
 where id = '097dc8d0-d05d-42cb-91a0-0582dd561f76'::uuid
   and data_nascimento = '1989-01-01';

-- joel-rodrigues
--   valor atual : 1954-03-04
--   valor certo : 1969-12-09
--   fonte       : TSE 2022 id 180001600654
--   trecho      : "dataDeNascimento":"1969-12-09"
update public.candidatos
   set data_nascimento = '1969-12-09',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001600654']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001600654'] end,
       ultima_atualizacao = now()
 where id = '63de6cc4-aebc-49f6-88ab-25c93dde0a58'::uuid
   and data_nascimento = '1954-03-04';

-- leandro-grass
--   valor atual : 1985-01-01
--   valor certo : 1985-06-15
--   fonte       : TSE 2022 id 70001597108
--   trecho      : "dataDeNascimento":"1985-06-15"
update public.candidatos
   set data_nascimento = '1985-06-15',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 70001597108']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 70001597108'] end,
       ultima_atualizacao = now()
 where id = '3b724874-8769-44f3-aab3-06c0155dc155'::uuid
   and data_nascimento = '1985-01-01';

-- lucas-ribeiro
--   valor atual : 1983-07-08
--   valor certo : 1989-08-15
--   fonte       : TSE 2022 id 150001613756
--   trecho      : "dataDeNascimento":"1989-08-15"
update public.candidatos
   set data_nascimento = '1989-08-15',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 150001613756']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 150001613756'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and data_nascimento = '1983-07-08';

-- mailza-assis
--   valor atual : 1976-01-01
--   valor certo : 1976-12-10
--   fonte       : Senado dados abertos cod 5557
--   trecho      : "DataNascimento":"1976-12-10"
update public.candidatos
   set data_nascimento = '1976-12-10',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Senado dados abertos cod 5557']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Senado dados abertos cod 5557'] end,
       ultima_atualizacao = now()
 where id = '4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid
   and data_nascimento = '1976-01-01';

-- ==================================================================================================
-- 3. naturalidade com UF de nascimento contraditada (5 candidatos)
-- ==================================================================================================

-- joel-rodrigues
--   valor atual : SP
--   valor certo : Floriano/PI
--   fonte       : TSE 2022 id 180001600654
--   trecho      : "nomeMunicipioNascimento":"FLORIANO","sgUfNascimento":"PI"
update public.candidatos
   set naturalidade = 'Floriano/PI',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001600654']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001600654'] end,
       ultima_atualizacao = now()
 where id = '63de6cc4-aebc-49f6-88ab-25c93dde0a58'::uuid
   and naturalidade = 'SP';

-- lucas-ribeiro
--   valor atual : MG
--   valor certo : João Pessoa/PB
--   fonte       : TSE 2022 id 150001613756
--   trecho      : "nomeMunicipioNascimento":"JOÃO PESSOA","sgUfNascimento":"PB"
update public.candidatos
   set naturalidade = 'João Pessoa/PB',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 150001613756']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 150001613756'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and naturalidade = 'MG';

-- mailza-assis
--   valor atual : Mundo Novo
--   valor certo : Mundo Novo/MS
--   fonte       : Senado dados abertos cod 5557
--   trecho      : "Naturalidade":"Mundo Novo","UfNaturalidade":"MS"
update public.candidatos
   set naturalidade = 'Mundo Novo/MS',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['Senado dados abertos cod 5557']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['Senado dados abertos cod 5557'] end,
       ultima_atualizacao = now()
 where id = '4e3828f3-33c9-4206-9aff-7b869a466baa'::uuid
   and naturalidade = 'Mundo Novo';

-- marcos-vieira
--   valor atual : SP
--   valor certo : Florianópolis/SC
--   fonte       : TSE 2022 id 240001612502
--   trecho      : "nomeMunicipioNascimento":"FLORIANÓPOLIS","sgUfNascimento":"SC"
update public.candidatos
   set naturalidade = 'Florianópolis/SC',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 240001612502']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 240001612502'] end,
       ultima_atualizacao = now()
 where id = '0394c7a4-6311-4eeb-a0aa-9d3b996b4aae'::uuid
   and naturalidade = 'SP';

-- priscila-voigt
--   valor atual : Porto Alegre (RS)
--   valor certo : Florianópolis/SC
--   fonte       : TSE 2022 id 210001597514
--   trecho      : "nomeMunicipioNascimento":"FLORIANÓPOLIS","sgUfNascimento":"SC"
update public.candidatos
   set naturalidade = 'Florianópolis/SC',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 210001597514']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 210001597514'] end,
       ultima_atualizacao = now()
 where id = '25b8bb92-4c1e-43c0-a4eb-d3c65ac5867b'::uuid
   and naturalidade = 'Porto Alegre (RS)';

-- ==================================================================================================
-- 4. formacao com grau abaixo do declarado ao TSE (4 candidatos)
-- ==================================================================================================

-- jeferson-bezerra
--   valor atual : Ensino médio completo
--   valor certo : Superior completo
--   fonte       : TSE 2022 id 120001611531
--   trecho      : "grauInstrucao":"Superior completo"
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 120001611531']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 120001611531'] end,
       ultima_atualizacao = now()
 where id = '10874c20-5864-42f9-a83e-0610502381c6'::uuid
   and formacao = 'Ensino médio completo';

-- joel-rodrigues
--   valor atual : ENSINO MÉDIO COMPLETO
--   valor certo : Superior completo
--   fonte       : TSE 2022 id 180001600654
--   trecho      : "grauInstrucao":"Superior completo"
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 180001600654']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 180001600654'] end,
       ultima_atualizacao = now()
 where id = '63de6cc4-aebc-49f6-88ab-25c93dde0a58'::uuid
   and formacao = 'ENSINO MÉDIO COMPLETO';

-- lucas-ribeiro
--   valor atual : ENSINO MÉDIO COMPLETO
--   valor certo : Superior completo
--   fonte       : TSE 2022 id 150001613756
--   trecho      : "grauInstrucao":"Superior completo"
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 150001613756']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 150001613756'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and formacao = 'ENSINO MÉDIO COMPLETO';

-- marcos-vieira
--   valor atual : ENSINO FUNDAMENTAL COMPLETO
--   valor certo : Superior completo
--   fonte       : TSE 2022 id 240001612502
--   trecho      : "grauInstrucao":"Superior completo"
update public.candidatos
   set formacao = 'Superior completo',
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['TSE DivulgaCandContas 2022 id 240001612502']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['TSE DivulgaCandContas 2022 id 240001612502'] end,
       ultima_atualizacao = now()
 where id = '0394c7a4-6311-4eeb-a0aa-9d3b996b4aae'::uuid
   and formacao = 'ENSINO FUNDAMENTAL COMPLETO';

-- ==================================================================================================
-- 5. wikidata_id de outra pessoa (10 candidatos)
-- ==================================================================================================

-- anderson-ferreira
--   valor atual : Q4754063
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : futebolista, nasc. 1985-05-09; o politico nasceu 1972-12-10 (TSE)
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = '3721c0c9-3b8b-4258-b453-6350b51dc0c8'::uuid
   and wikidata_id = 'Q4754063';

-- arthur-henrique
--   valor atual : Q709767
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : futebolista Arthur Henrique Bernhardt, nasc. 1982-08-27; banco 1981-08-19
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = '049a5051-e7c9-4729-8853-14753d2993e1'::uuid
   and wikidata_id = 'Q709767';

-- dr-daniel
--   valor atual : Q61879560
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : Daniel Almeida de Lima, nasc. 1978-08-03; banco Daniel Barbosa Santos 1979-02-16
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'dcc4a93e-4114-43e9-b067-4581ed12cfd5'::uuid
   and wikidata_id = 'Q61879560';

-- jeronimo
--   valor atual : Q7938213
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : futebolista Vlademir Jeronimo Barreto, nasc. 1979-10-01; banco Jeronimo Rodrigues Souza 1976-01-20
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'db711ee0-fcfa-47f7-85d2-a3686956cf06'::uuid
   and wikidata_id = 'Q7938213';

-- joao-campos
--   valor atual : Q64850011
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : Joao Campos de Abreu, nasc. 1956-04-05; banco 1993-11-26
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'cc2dbc88-aae0-4c75-a112-bcc6bfc3189b'::uuid
   and wikidata_id = 'Q64850011';

-- joao-rodrigues
--   valor atual : Q5946896
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : botanico Joao Rodrigues de Mattos, nasc. 1926; banco 1967-03-23
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'a5fa816e-9e3b-40ae-8679-71568bed63da'::uuid
   and wikidata_id = 'Q5946896';

-- joel-rodrigues
--   valor atual : Q64861413
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : Joel Rodrigues Sobrinho, nasc. 1954-03-04, natural de Sao Joao de Meriti/RJ, PSC; o candidato do banco nasceu 1969-12-09 em Floriano/PI (TSE)
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = '63de6cc4-aebc-49f6-88ab-25c93dde0a58'::uuid
   and wikidata_id = 'Q64861413';

-- lucas-ribeiro
--   valor atual : Q28677315
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : cantor e produtor musical; sem cargo publico
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'b8ad0e9c-eb0f-4b37-bdf9-840c5d167016'::uuid
   and wikidata_id = 'Q28677315';

-- marcos-rogerio
--   valor atual : Q4282225
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : futebolista "Para", nasc. 1986-02-14; banco 1978-07-07 (TSE confirma 1978-07-07)
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'a9ce3c0b-9fa4-4e28-9c2e-809b1fa5e639'::uuid
   and wikidata_id = 'Q4282225';

-- tadeu-de-souza
--   valor atual : Q109792447
--   valor certo : NULL (vinculo removido)
--   fonte       : Wikidata API wbgetentities
--   trecho      : registro do Museu da Pessoa, nasc. 1951-02-13; banco 1972-05-13 (TSE confirma 1972-05-13)
update public.candidatos
   set wikidata_id = null,
       fonte_dados = case when coalesce(fonte_dados, '{}'::text[]) @> array['auditoria-identidade-20260725']
                          then fonte_dados
                          else coalesce(fonte_dados, '{}'::text[]) || array['auditoria-identidade-20260725'] end,
       ultima_atualizacao = now()
 where id = 'fabb0b69-5157-496d-89ab-d90c4bcc54ec'::uuid
   and wikidata_id = 'Q109792447';

-- ====================================================================================================
-- Fora desta migration de proposito
-- ====================================================================================================
--
-- a) CPF de dr-fernando-maximo e de renan-filho.
--    Nos dois casos o CPF gravado no banco contradiz o CPF que TSE e Camara publicam para a mesma
--    pessoa, e as duas fontes oficiais concordam entre si (nome civil, data de nascimento e municipio
--    de nascimento batem). O valor certo NAO foi escrito aqui porque este repositorio e publico e a
--    coluna cpf ja e tratada como dado sensivel (excluida das colunas publicas em src/lib/api.ts).
--    Correcao sugerida: aplicar fora do versionamento, lendo o campo "cpf" das respostas
--      https://dadosabertos.camara.leg.br/api/v2/deputados/220610  (dr-fernando-maximo)
--      https://dadosabertos.camara.leg.br/api/v2/deputados/160623  (renan-filho)
--
-- b) 22 candidatos cuja naturalidade guarda so a sigla da UF quando a fonte oficial traz o municipio
--    (ex.: 'RJ' onde o TSE diz 'SAO GONCALO/RJ'). Nao e dado errado, e dado pobre. Vale um
--    enriquecimento separado.
--
-- c) 9 candidatos com nome_completo correto porem sem acentuacao
--    (cicero-lucena, clecio-luis, efraim-filho, flavio-bolsonaro, jayme-campos, joao-campos, lula,
--     marconi-perillo, omar-aziz). E normalizacao de grafia, nao correcao de fato.
--
-- d) 86 dos 195 publicaveis nao tem no seed id de Camara ou Senado nem CPF que feche com o TSE 2022.
--    Para eles a identidade nao foi verificavel nesta passada e nada foi alterado.

commit;
